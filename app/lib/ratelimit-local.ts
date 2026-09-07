/* Limiters EN MEMORIA + helpers compartidos de rate limiting.

   Por qué viven en su propio módulo (v10.14): `ratelimit.ts` importa
   @upstash/ratelimit + @upstash/redis en el tope, así que CUALQUIER ruta que
   pidiera un limiter —aunque fuera uno local— arrastraba todo el SDK de Upstash
   a su bundle serverless. /api/db es la ruta más caliente de la app y sólo usa
   limiters locales: cada cold start pagaba código que nunca iba a ejecutar.
   Ahora las rutas de datos importan de acá y las de seguridad siguen pidiendo
   los limiters Redis a `ratelimit.ts` (que reexporta todo esto, así nada de lo
   que ya existía cambia de nombre ni de semántica). */

/** Interfaz mínima común entre Upstash Ratelimit y el limiter local. */
export type Limiter = { limit(key: string): Promise<{ success: boolean; reset: number }> };

/**
 * Sliding window EN MEMORIA (por instancia) para los limiters de lectura
 * general que ya eran fail-open. Mismo límite y semántica que antes, pero sin
 * gastar comandos de Upstash en cada GET/POST de datos (el tier gratis es de
 * 500k comandos/mes y era el recurso más ajustado). Los límites de SEGURIDAD
 * (login, signup, OTP, contraseña, borrar cuenta, perfil, avatar) siguen en
 * Redis, compartidos entre instancias y fail-closed — esos no se tocan.
 */
class LocalRatelimit implements Limiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  async limit(key: string) {
    const now = Date.now();
    const desde = now - this.windowMs;
    // Barrido ocasional para que el Map no crezca sin techo (IPs efímeras)
    if (this.hits.size > 5000) {
      const arr = Array.from(this.hits.entries());
      for (const [k, ts] of arr) {
        if (ts[ts.length - 1] < desde) this.hits.delete(k);
      }
    }
    const ts = (this.hits.get(key) ?? []).filter(t => t > desde);
    if (ts.length >= this.max) {
      this.hits.set(key, ts);
      return { success: false, reset: ts[0] + this.windowMs };
    }
    ts.push(now);
    this.hits.set(key, ts);
    return { success: true, reset: now + this.windowMs };
  }
}

// Límite de datos POR USUARIO (v10.14). Antes se contaba por IP, y eso rompía
// justo el caso multiusuario: en el wifi de una facultad (o detrás de cualquier
// NAT compartido) todos los alumnos comparten una sola IP, así que entre varios
// llegaban al techo de 120/min y la app les empezaba a tirar 429 sin que
// ninguno estuviera haciendo nada raro. Ahora cada cuenta tiene su propio
// presupuesto y no se pisan entre sí. Sigue siendo fail-open y en memoria.
export const rlDb: Limiter = new LocalRatelimit(120, 60_000);

// Reja previa por IP, con techo alto: no está para limitar el uso normal (eso
// lo hace rlDb por usuario) sino para que una sola IP no pueda inundar el
// endpoint con requests sin sesión. 600/min ≈ 5 usuarios activos a fondo.
export const rlDbIp: Limiter = new LocalRatelimit(600, 60_000);

export const rlTts: Limiter = new LocalRatelimit(60, 60_000);

// Descarga de MP3 por LOTES (v10.11.2): un request trae hasta 8 trozos, así que
// el techo se cuenta en lotes. 15/min × 8 = 120 trozos/min contra los 60/min del
// endpoint de a uno: el doble de techo upstream (acotado a propósito), pero
// suficiente para que un PDF largo termine sin cortarse. Fail-open como rlTts.
export const rlTtsLote: Limiter = new LocalRatelimit(15, 60_000);

/** IP real del cliente detrás del proxy de Vercel. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "ip-desconocida"
  );
}

export type LimitResult = { ok: true } | { ok: false; retryAfter: number };

/**
 * Chequea el límite. `failClosed` decide qué pasa si Redis está caído:
 * true → se rechaza el request (endpoints de seguridad), false → se deja pasar.
 */
export async function checkLimit(
  rl: Limiter,
  key: string,
  failClosed: boolean
): Promise<LimitResult> {
  try {
    const r = await rl.limit(key);
    if (r.success) return { ok: true };
    return { ok: false, retryAfter: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
  } catch (e) {
    console.error("ratelimit: Redis no disponible", e instanceof Error ? e.message : e);
    return failClosed ? { ok: false, retryAfter: 60 } : { ok: true };
  }
}

export function tooMany(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ ok: false, error: "Demasiados intentos. Probá de nuevo en un rato." }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
    }
  );
}
