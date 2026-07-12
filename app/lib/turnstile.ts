// Verificación server-side de Cloudflare Turnstile (sección 6.5).
// El signup/login contra Supabase Auth ya valida el CAPTCHA en el propio
// Supabase (configurado vía Management API). Este helper es para endpoints
// PROPIOS que quieran exigir CAPTCHA además del rate limit.

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("turnstile: TURNSTILE_SECRET_KEY no configurada");
    return false; // fail closed: sin secret no se puede validar
  }
  if (!token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
    });
    if (!r.ok) return false;
    const d = (await r.json()) as { success?: boolean };
    return d.success === true;
  } catch {
    return false;
  }
}
