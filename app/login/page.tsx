"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard, AuthError, inputCls, labelCls, btnCls } from "../components/AuthCard";
import { GlassButton } from "../components/glass";
import Turnstile from "../components/Turnstile";
import { track } from "../lib/analytics";

/* Puerta de entrada de la app (6.1). Nada de Supabase en el navegador:
   el form le pega a POST /api/auth/login y la sesión queda en cookies
   HttpOnly que este código ni puede leer. */

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(
    params.get("error") === "confirmacion"
      ? "El link de confirmación no sirve o ya venció. Si ya habías confirmado, iniciá sesión. Si no, registrate de nuevo con el mismo email: te llega un mail nuevo."
      : null
  );
  const [enviando, setEnviando] = useState(false);

  /* Portada de mobile (v10.12): se muestra al entrar "de cero", pero NO cuando
     hay algo que leer/hacer ya mismo — un error de confirmación, o una vuelta
     explícita desde /registro o /recuperar (?entrar=1). En xl no cambia nada. */
  const conPortada = params.get("entrar") !== "1" && params.get("error") === null;

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!captcha) { setError("Esperá a que cargue la verificación anti-bot."); return; }
    setEnviando(true); setError(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, captchaToken: captcha }),
      });
      if (r.ok) { track("login"); window.location.assign("/"); return; }
      const d = await r.json().catch(() => null);
      setError(d?.error ?? "No se pudo iniciar sesión. Probá de nuevo.");
      setResetKey(k => k + 1); // el token del captcha es de un solo uso
    } catch {
      setError("No se pudo iniciar sesión. Revisá tu conexión.");
      setResetKey(k => k + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthCard title="Iniciar sesión" subtitle="Tu semestre, organizado." intro={conPortada}>
      <form onSubmit={entrar} className="space-y-4">
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input id="email" type="email" autoComplete="email" required maxLength={255}
            className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={labelCls}>Contraseña</label>
          <input id="password" type="password" autoComplete="current-password" required maxLength={72}
            className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
          <div className="mt-1.5 text-right">
            <Link href="/recuperar" className="text-xs text-navy/50 hover:text-ocre font-medium">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>
        <Turnstile onToken={setCaptcha} resetKey={resetKey} />
        <AuthError msg={error} />
        <GlassButton type="submit" tint="navy" disabled={enviando || !captcha} className={btnCls}
          whileTap={{ scale: 0.98 }}>
          {enviando ? "Entrando…" : "Entrar"}
        </GlassButton>
      </form>
      <p className="mt-6 text-sm text-navy/50 text-center">
        ¿No tenés cuenta?{" "}
        <Link href="/registro" className="font-bold text-navy hover:text-ocre">Creá una</Link>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
