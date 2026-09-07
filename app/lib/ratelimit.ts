import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Rate limiting server-side con Upstash Redis (sección 6.5 de la migración).
// Cada endpoint tiene su propio límite y prefijo. Los límites de escritura
// sensibles (contraseña, borrar cuenta) FALLAN CERRADO si Redis no responde;
// los de lectura general fallan abierto para no tumbar la app.
//
// Los limiters EN MEMORIA (rlDb, rlDbIp, rlTts, rlTtsLote) y los helpers
// compartidos viven en ratelimit-local.ts desde v10.14 y se reexportan acá para
// que nada de lo que ya importaba de este módulo cambie. Las rutas que SOLO
// usan limiters locales (/api/db, /api/auth/me, /api/tts) importan directo del
// módulo local y así no arrastran el SDK de Upstash a su bundle serverless.

export {
  rlDb, rlDbIp, rlTts, rlTtsLote,
  clientIp, checkLimit, tooMany,
} from "./ratelimit-local";
export type { Limiter, LimitResult } from "./ratelimit-local";

const redis = Redis.fromEnv();

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
