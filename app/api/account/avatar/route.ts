import { NextResponse } from "next/server";
import { supabaseForRequest, supabaseAdmin } from "../../../lib/supabase/server";
import { rlAvatar, checkLimit, clientIp, tooMany } from "../../../lib/ratelimit";

// Foto de perfil (6.17, reglas de uploads seguros de 6.4):
// - Tipo REAL validado por magic bytes (la extensión/Content-Type se falsean).
// - Tamaño máximo 400KB (el cliente ya la reduce a 256px antes de subir).
// - Bucket de Supabase Storage PRIVADO; nunca se sirve el archivo directo:
//   la UI recibe una signed URL corta (1h) generada server-side.
// - El path es SIEMPRE derivado de la sesión (<user_id>.<ext>) — jamás viene
//   del cliente: sin path traversal ni IDOR posibles.
// - El archivo nunca se ejecuta ni se sirve desde nuestro dominio.

export const runtime = "nodejs";

const MAX_BYTES = 400 * 1024;

const generico = (msg: string, status: number) =>
  NextResponse.json({ ok: false, error: msg }, { status });

/** Tipo real por magic bytes: jpeg / png / webp. */
function tipoReal(buf: Uint8Array): { ext: string; mime: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { ext: "jpg", mime: "image/jpeg" };
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return { ext: "png", mime: "image/png" };
  if (buf.length > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
    return { ext: "webp", mime: "image/webp" };
  return null;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLim = await checkLimit(rlAvatar, `ip:${ip}`, true);
  if (!ipLim.ok) return tooMany(ipLim.retryAfter);

  const sb = supabaseForRequest(req);
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return generico("No autenticado.", 401);
  const userId = auth.user.id;

  const userLim = await checkLimit(rlAvatar, `user:${userId}`, true);
  if (!userLim.ok) return tooMany(userLim.retryAfter);

  // Tamaño: corta ANTES de leer el body si el header ya se pasa, y revalida
  // sobre los bytes reales (el header también se puede mentir).
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES) return generico("La imagen no puede superar 400KB.", 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) return generico("Falta la imagen.", 400);
  if (bytes.length > MAX_BYTES) return generico("La imagen no puede superar 400KB.", 413);

  const tipo = tipoReal(bytes);
  if (!tipo) return generico("Formato no soportado (JPG, PNG o WebP).", 415);

  try {
    const admin = supabaseAdmin();
    const path = `${userId}.${tipo.ext}`;

    // Limpia variantes con otra extensión (cambio jpg→png, etc.)
    const viejas = ["jpg", "png", "webp"].filter(e => e !== tipo.ext).map(e => `${userId}.${e}`);
    await admin.storage.from("avatars").remove(viejas);

    const { error: upErr } = await admin.storage.from("avatars")
      .upload(path, bytes, { contentType: tipo.mime, upsert: true });
    if (upErr) throw new Error(upErr.message);

    // foto_url en la fila PROPIA vía RLS (el path recién derivado de la sesión)
    const { error: rowErr } = await sb.from("profiles").update({ foto_url: path }).eq("id", userId);
    if (rowErr) throw new Error(rowErr.message);

    const { data: signed, error: signErr } = await admin.storage.from("avatars").createSignedUrl(path, 3600);
    if (signErr) throw new Error(signErr.message);
    return NextResponse.json({ ok: true, fotoUrl: signed.signedUrl });
  } catch (e) {
    console.error("avatar POST:", e instanceof Error ? e.message : e);
    return generico("No se pudo subir la foto.", 500);
  }
}

export async function DELETE(req: Request) {
  const ip = clientIp(req);
  const ipLim = await checkLimit(rlAvatar, `ip:${ip}`, true);
  if (!ipLim.ok) return tooMany(ipLim.retryAfter);

  const sb = supabaseForRequest(req);
  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth.user) return generico("No autenticado.", 401);
  const userId = auth.user.id;

  try {
    const admin = supabaseAdmin();
    await admin.storage.from("avatars").remove(["jpg", "png", "webp"].map(e => `${userId}.${e}`));
    const { error } = await sb.from("profiles").update({ foto_url: null }).eq("id", userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("avatar DELETE:", e instanceof Error ? e.message : e);
    return generico("No se pudo quitar la foto.", 500);
  }
}
