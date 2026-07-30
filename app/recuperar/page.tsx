"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthError, inputCls, labelCls, btnCls } from "../components/AuthCard";
import { GlassButton } from "../components/glass";
import Turnstile from "../components/Turnstile";
import { passwordValida, PASSWORD_MSG, PASSWORD_HINT } from "../lib/password";

/* Recuperar contraseña por código OTP (6.1/6.16), en dos pasos contra el
   backend ya existente: 1) email (+CAPTCHA) → llega un código de 6 dígitos
   (vence en 10 min, un solo uso); 2) código + contraseña nueva. Al confirmar
   se cierran las sesiones en todos los dispositivos y se vuelve a /login. */

type Paso = "email" | "codigo" | "listo";

export default function RecuperarPage() {
  const [paso, setPaso] = useState<Paso>("email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function pedirCodigo(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!captcha) { setError("Esperá a que cargue la verificación anti-bot."); return; }
    setEnviando(true); setError(null);
    try {
      const r = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captchaToken: captcha }),
      });
      if (r.ok) { setPaso("codigo"); return; }
      const d = await r.json().catch(() => null);
      setError(d?.error ?? "No se pudo pedir el código. Probá de nuevo.");
      setResetKey(k => k + 1);
    } catch {
      setError("No se pudo pedir el código. Revisá tu conexión.");
      setResetKey(k => k + 1);
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!passwordValida(password)) { setError(PASSWORD_MSG); return; }
    setEnviando(true); setError(null);
    try {
      const r = await fetch("/api/auth/recover/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: codigo, newPassword: password }),
      });
      if (r.ok) { setPaso("listo"); return; }
      const d = await r.json().catch(() => null);
      setError(d?.error ?? "No se pudo cambiar la contraseña. Probá de nuevo.");
    } catch {
      setError("No se pudo cambiar la contraseña. Revisá tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  if (paso === "listo") {
    return (
      <AuthCard title="Contraseña actualizada" subtitle="Se cerró la sesión en todos tus dispositivos.">
        <p className="text-sm text-navy/60 leading-relaxed">
          Ya podés entrar con tu contraseña nueva.
        </p>
        <div className="mt-6">
          <Link href="/login?entrar=1" className={btnCls + " block text-center"}>Iniciar sesión</Link>
        </div>
      </AuthCard>
    );
  }

  if (paso === "codigo") {
    return (
      <AuthCard title="Ingresá el código" subtitle={`Si ${email.trim()} está registrado, te mandamos un código de 6 dígitos.`}>
        <form onSubmit={confirmar} className="space-y-4">
          <div>
            <label htmlFor="codigo" className={labelCls}>Código (6 dígitos)</label>
            <input id="codigo" inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code"
              required maxLength={6}
              className={inputCls + " text-center tracking-[0.5em] font-bold text-lg"}
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <p className="mt-1.5 text-xs text-navy/40">
              Vence en 10 minutos y sirve una sola vez. Si no aparece,{" "}
              <span className="font-bold text-navy/60">revisá SPAM</span> (sale de soporte.stuniv@gmail.com).
            </p>
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>Contraseña nueva</label>
            <input id="password" type="password" autoComplete="new-password" required
              minLength={8} maxLength={72}
              className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
            <p className={`mt-1.5 text-xs ${password.length > 0 && !passwordValida(password) ? "text-red-600 font-medium" : "text-navy/40"}`}>
              {PASSWORD_HINT}
            </p>
          </div>
          <AuthError msg={error} />
          <GlassButton type="submit" tint="navy" disabled={enviando || codigo.length !== 6}
            className={btnCls} whileTap={{ scale: 0.98 }}>
            {enviando ? "Confirmando…" : "Cambiar contraseña"}
          </GlassButton>
        </form>
        <p className="mt-6 text-sm text-navy/50 text-center">
          ¿No te llegó?{" "}
          <button type="button" className="font-bold text-navy hover:text-ocre"
            onClick={() => { setPaso("email"); setCodigo(""); setError(null); setResetKey(k => k + 1); }}>
            Pedir otro código
          </button>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te mandamos un código por email para definir una nueva.">
      <form onSubmit={pedirCodigo} className="space-y-4">
        <div>
          <label htmlFor="email" className={labelCls}>Email de tu cuenta</label>
          <input id="email" type="email" autoComplete="email" required maxLength={255}
            className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <Turnstile onToken={setCaptcha} resetKey={resetKey} />
        <AuthError msg={error} />
        <GlassButton type="submit" tint="navy" disabled={enviando || !captcha}
          className={btnCls} whileTap={{ scale: 0.98 }}>
          {enviando ? "Enviando…" : "Enviar código"}
        </GlassButton>
      </form>
      <p className="mt-6 text-sm text-navy/50 text-center">
        <Link href="/login?entrar=1" className="font-bold text-navy hover:text-ocre">Volver a iniciar sesión</Link>
      </p>
    </AuthCard>
  );
}
