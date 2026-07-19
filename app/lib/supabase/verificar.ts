import type { SupabaseClient } from "@supabase/supabase-js";
import type { JWK } from "@supabase/auth-js";

/* Verificación de sesión con firma verificada LOCALMENTE (v10.5).
   El proyecto firma los JWT con clave asimétrica ES256 (activa desde el
   2026-07-11) y publica la clave pública en el endpoint JWKS. getClaims()
   verifica la firma con WebCrypto sin round-trip al Auth server; el JWKS se
   cachea acá a nivel módulo para no re-pedirlo por request.

   IMPORTANTE — qué garantiza y qué NO:
   - Garantiza que el token es auténtico (firma + expiración + claims).
   - NO garantiza que la sesión siga viva (logout/revocación). Por eso SOLO
     se usa en rutas donde la revocación se valida en el MISMO round-trip de
     datos (GET /api/db → RPC get_app_data, que chequea auth.sessions y
     lanza 'sesion_revocada'). Las demás rutas siguen con getUser().
   - Ante CUALQUIER duda (JWKS caído, algoritmo viejo, error inesperado) cae
     en fallback a getUser() contra el Auth server — nunca menos seguro.

   Módulo edge-safe: sin next/headers (importable desde middleware si algún
   día hiciera falta). */

export type UsuarioSesion = { id: string; email: string | null };

type Jwks = { keys: JWK[] };
let jwksCache: Jwks | null = null;
let jwksHasta = 0;
const JWKS_TTL_MS = 15 * 60 * 1000;

async function jwksCacheada(): Promise<Jwks | undefined> {
  if (jwksCache && Date.now() < jwksHasta) return jwksCache;
  try {
    const r = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      { cache: "no-store" }
    );
    if (r.ok) {
      const j = (await r.json()) as Jwks;
      if (Array.isArray(j?.keys) && j.keys.length > 0) {
        jwksCache = j;
        jwksHasta = Date.now() + JWKS_TTL_MS;
        return j;
      }
    }
  } catch {
    /* getClaims tiene su propio fetch de JWKS como respaldo */
  }
  return undefined;
}

/**
 * Devuelve el usuario del request con el JWT verificado criptográficamente
 * en local (ES256 + JWKS), o null si no hay sesión válida. Acepta cookies
 * (el cliente ya viene atado a ellas) o Authorization: Bearer.
 */
export async function usuarioVerificado(
  sb: SupabaseClient,
  req: Request
): Promise<UsuarioSesion | null> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7) : undefined;
  try {
    const { data, error } = await sb.auth.getClaims(bearer, { jwks: await jwksCacheada() });
    if (data?.claims) {
      const c = data.claims as Record<string, unknown>;
      // Solo tokens de usuario real: rol authenticated, sub y sesión presentes
      // (un token anon firmado por el proyecto no pasa este filtro).
      if (c.role === "authenticated" && typeof c.sub === "string" && typeof c.session_id === "string") {
        return { id: c.sub, email: typeof c.email === "string" ? c.email : null };
      }
      return null;
    }
    if (!error) return null; // sin sesión en cookies/header: certero, sin fallback
  } catch {
    /* cae al fallback de red */
  }
  // Fallback: verificación contra el Auth server (el comportamiento previo).
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}
