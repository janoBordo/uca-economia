import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limiting server-side con Upstash Redis (sección 6.5 de la migración).
// Cada endpoint tiene su propio límite y prefijo. Los límites de escritura
// sensibles (contraseña, borrar cuenta) FALLAN CERRADO si Redis no responde;
// los de lectura general fallan abierto para no tumbar la app.

const redis = Redis.fromEnv();

/** Interfaz mínima común entre Upstash Ratelimit y el limiter local. */
type Limiter = { limit(key: string): Promise<{ success: boolean; reset: number }> };

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

export const rlDb: Limiter = new LocalRatelimit(120, 60_000);

export const rlTts: Limiter = new LocalRatelimit(60, 60_000);

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

// ── Fase 2: endpoints de autenticación (siempre fail-closed) ──

// Login y confirmación de email: 10 por 15 min (por IP y por email).
export const rlAuth = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "15 m"),
  prefix: "rl:auth",
});

// Crear cuenta: 8 por hora por IP.
export const rlSignup = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(8, "1 h"),
  prefix: "rl:signup",
});

// Pedir código de recuperación: 5 por hora (por IP y por email).
export const rlRecover = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),
  prefix: "rl:recover",
});

// Reenviar el mail de confirmación: 3 por hora POR EMAIL (la UI además impone
// un cooldown de 60s y Supabase otro entre mails al mismo destinatario) y
// 10 por hora por IP. Fail-closed: manda mails reales, superficie sensible.
export const rlResend = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 h"),
  prefix: "rl:resend",
});
export const rlResendIp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:resendip",
});

// Verificar el código OTP: 5 intentos por 15 min POR EMAIL (6.1: un código de
// 6 dígitos es adivinable por fuerza bruta sin este límite; además el código
// vence a los 10 min y es de un solo uso).
export const rlOtp = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  prefix: "rl:otp",
});

// ── Fase 3: pantalla de Cuenta ──

// Guardar perfil/apariencia: 30 por 15 min (por usuario y por IP), fail-closed.
export const rlProfile = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "15 m"),
  prefix: "rl:profile",
});

// Subir/borrar foto de perfil: 10 por hora, fail-closed (uploads = superficie
// sensible, 6.4).
export const rlAvatar = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:avatar",
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
