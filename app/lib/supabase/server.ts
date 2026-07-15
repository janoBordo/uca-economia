import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// SOLO para uso en servidor (API routes / server components).
// La única key que puede llegar al navegador es NEXT_PUBLIC_SUPABASE_ANON_KEY
// (publishable, diseñada para eso). SUPABASE_SECRET_KEY jamás sale del server.

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Atributos endurecidos para las cookies de sesión (6.7): HttpOnly (ni un XSS
 * puede leerlas — posible porque NO usamos supabase-js en el navegador: todo
 * el auth pasa por /api/auth/*), Secure y SameSite=Lax (mitiga CSRF).
 * Compartido con middleware.ts — cualquier cookie de sesión sale con esto.
 */
// ~400 días: tope que aceptan los navegadores modernos para maxAge.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export function hardenCookie<T extends object | undefined>(options: T) {
  const o = { ...options, httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" } as Record<string, unknown>;
  // Persistente: sin maxAge/expires, @supabase/ssr deja cookies de SESIÓN que el
  // navegador borra al cerrarse (en mobile pasa seguido → pedía login cada vez;
  // la PC las "restaura" y por eso ahí sí recordaba). Le damos vida propia. Ojo:
  // no pisar maxAge:0 / expires que Supabase manda para BORRAR en el logout.
  if (o.maxAge == null && o.expires == null) o.maxAge = COOKIE_MAX_AGE;
  return o;
}

/**
 * Cliente ligado a la sesión del usuario que hace el request.
 * Lee la sesión de las cookies (@supabase/ssr) o, si no hay, del header
 * Authorization: Bearer <access_token>. Todas las queries pasan por RLS.
 */
export function supabaseForRequest(req: Request): SupabaseClient {
  const bearer = req.headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    return createClient(URL_, ANON, {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  const store = cookies();
  return createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, hardenCookie(options)));
        } catch {
          // Route handlers de solo-lectura pueden no permitir set — no es fatal.
        }
      },
    },
  });
}

/**
 * Cliente admin (secret key, bypasea RLS). Usar únicamente para operaciones
 * administrativas puntuales server-side (cambiar contraseña verificada,
 * soft-delete de cuenta). Nunca para lecturas de datos de usuario normales.
 */
export function supabaseAdmin(): SupabaseClient {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY no configurada");
  return createClient(URL_, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
