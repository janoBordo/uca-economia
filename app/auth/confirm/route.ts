import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../lib/supabase/server";
import { rlAuth, checkLimit, clientIp, tooMany } from "../../lib/ratelimit";

// Callback del link de confirmación de email. El template de Supabase apunta
// acá con token_hash (flow recomendado para SSR): el token se verifica
// server-side y la sesión queda en cookies HttpOnly — nunca viajan tokens de
// sesión en la URL ni en el fragment (a diferencia del flow implícito).
// El token_hash es de un solo uso y se consume en esta verificación.

export const runtime = "nodejs";

const TIPOS = new Set(["signup", "email", "email_change", "magiclink"] as const);
type Tipo = typeof TIPOS extends Set<infer T> ? T : never;

export async function GET(req: Request) {
  const lim = await checkLimit(rlAuth, `confirm:${clientIp(req)}`, true);
  if (!lim.ok) return tooMany(lim.retryAfter);

  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const irA = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (!tokenHash || tokenHash.length > 512 || !TIPOS.has(type as Tipo))
    return irA("/login?error=confirmacion");

  const supabase = supabaseForRequest(req);
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as Tipo,
  });
  if (error) {
    console.error("auth/confirm:", error.code ?? error.message);
    return irA("/login?error=confirmacion");
  }
  // `bienvenida=1`: marca de "sesión nueva en este navegador". El cache
  // persistente del cliente (v10.14) lo lee ANTES del primer render y tira el
  // espejo del usuario anterior — misma limpieza que hace el form de /login,
  // pero para el camino que entra por el link del mail.
  return irA("/?bienvenida=1");
}
