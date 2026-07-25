import { NextResponse } from "next/server";
import { z } from "zod";
import { rlTts, rlTtsLote, checkLimit, clientIp, tooMany } from "../../lib/ratelimit";
import { supabaseForRequest } from "../../lib/supabase/server";

// Proxy liviano al TTS gratuito de Google Translate.
// - No usa API key ni servicios pagos (nada de ElevenLabs).
// - No toca la base de datos (Vercel KV): sólo reenvía audio.
// - Devuelve MP3 real; el cliente concatena y arma el archivo.
//
// GET  = un trozo (≤200 chars, el límite del TTS de Google). Sin cambios.
// POST = LOTE de hasta 8 trozos en un solo request (v10.11.2). Google sigue
//        recibiendo un pedido por trozo (su límite no se puede evitar), pero
//        del lado nuestro pasa a ser UNA invocación cada 8 → una descarga de
//        un PDF de 10 páginas baja de ~100 invocaciones a ~13. Además arregla
//        un techo real: con el endpoint de a uno, esa misma descarga superaba
//        los 60 req/min de rlTts y se cortaba con "el servicio no respondió".

export const runtime = "edge";

const MAX_LOTE = 8;
const TL_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

/** Código de idioma con forma válida o "es" — nada libre en la URL upstream. */
const idioma = (v: string | null | undefined) => (v && TL_RE.test(v) ? v : "es");

const urlTts = (q: string, tl: string) =>
  `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob` +
  `&tl=${encodeURIComponent(tl)}&total=1&idx=0&textlen=${q.length}` +
  `&q=${encodeURIComponent(q)}`;

const UPSTREAM_HEADERS = {
  // Sin un User-Agent de navegador, Google responde 403.
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Referer: "https://translate.google.com/",
};

export async function GET(req: Request) {
  // Rate limit por IP (6.5): sin esto, un bot puede spamear el proxy de TTS.
  const lim = await checkLimit(rlTts, clientIp(req), false);
  if (!lim.ok) return tooMany(lim.retryAfter);

  // Fase 2: sesión obligatoria (verificada server-side) — el proxy no queda
  // abierto a cualquiera con la URL.
  const { data: userData, error: userError } = await supabaseForRequest(req).auth.getUser();
  if (userError || !userData.user)
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q  = (searchParams.get("q") ?? "").slice(0, 200);
  const tl = idioma(searchParams.get("tl"));
  if (!q.trim()) return NextResponse.json({ error: "Texto vacío." }, { status: 400 });

  try {
    const r = await fetch(urlTts(q, tl), { headers: UPSTREAM_HEADERS });
    if (!r.ok) return NextResponse.json({ error: "TTS no disponible." }, { status: 502 });
    return new Response(r.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Error contactando el TTS." }, { status: 502 });
  }
}

// ── Lote: hasta 8 trozos en una invocación (v10.11.2) ──
// Mismas garantías que el GET: sesión obligatoria verificada server-side, tl
// validado, cada trozo acotado a 200 chars por Zod y encodeado en la URL
// upstream. El array está topeado, así que el fan-out por request es fijo.
const LoteSchema = z.object({
  tl: z.string().max(10).optional(),
  q: z.array(z.string().min(1).max(200)).min(1).max(MAX_LOTE),
});

export async function POST(req: Request) {
  const lim = await checkLimit(rlTtsLote, clientIp(req), false);
  if (!lim.ok) return tooMany(lim.retryAfter);

  const { data: userData, error: userError } = await supabaseForRequest(req).auth.getUser();
  if (userError || !userData.user)
    return NextResponse.json({ ok: false, error: "No autenticado." }, { status: 401 });

  let body: z.infer<typeof LoteSchema>;
  try {
    const parsed = LoteSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const tl = idioma(body.tl);
  try {
    // Secuencial a propósito: Google corta si le llegan muchos pedidos en
    // paralelo desde la misma IP (la de la función, no la del usuario).
    const partes: Uint8Array[] = [];
    let total = 0;
    for (const q of body.q) {
      const r = await fetch(urlTts(q, tl), { headers: UPSTREAM_HEADERS });
      if (!r.ok) return NextResponse.json({ error: "TTS no disponible." }, { status: 502 });
      const buf = new Uint8Array(await r.arrayBuffer());
      partes.push(buf);
      total += buf.length;
    }
    // Los frames MP3 se concatenan tal cual (es lo que ya hacía el cliente).
    const mp3 = new Uint8Array(total);
    let off = 0;
    for (const p of partes) { mp3.set(p, off); off += p.length; }
    return new Response(mp3, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Error contactando el TTS." }, { status: 502 });
  }
}
