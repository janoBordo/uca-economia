import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limiting server-side con Upstash Redis (sección 6.5 de la migración).
// Cada endpoint tiene su propio límite y prefijo. Los límites de escritura
// sensibles (contraseña, borrar cuenta) FALLAN CERRADO si Redis no responde;
// los de lectura general fallan abierto para no tumbar la app.

const redis = Redis.fromEnv();

export const rlDb = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, "1 m"),
  prefix: "rl:db",
});

export const rlTts = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "rl:tts",
});

export const rlPassword = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:pwd",
});

export const rlDeleteAccount = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 h"),
  prefix: "rl:del",
});

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
  rl: Ratelimit,
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
