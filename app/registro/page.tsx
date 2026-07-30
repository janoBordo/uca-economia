"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthCard, AuthError, inputCls, labelCls, btnCls } from "../components/AuthCard";
import { GlassButton } from "../components/glass";
import Turnstile from "../components/Turnstile";
import { UNIVERSIDADES, UNIVERSIDAD_OTRA } from "../lib/paleta";
import { passwordValida, PASSWORD_MSG, PASSWORD_HINT } from "../lib/password";
import { track } from "../lib/analytics";

/* Crear cuenta (6.1): datos de perfil (nombre, apellido, universidad, carrera)
   + email dos veces (guardia anti-typo), contraseña con política real (8+ con
   mayúscula/minúscula/número), CAPTCHA. La paleta NO se toca acá (v10.10): la
   app arranca azul y se personaliza adentro, en /cuenta. La cuenta no queda
   operativa hasta confirmar el email (sale de soporte.stuniv@gmail.com).
   La pantalla post-registro tiene reenvío del mail con cooldown de 60s y
   máximo 3 reenvíos (como las apps grandes), aviso de SPAM bien visible y
   contacto de soporte si sigue sin llegar. */

const SOPORTE = "soporte.stuniv@gmail.com";
const MAX_REENVIOS = 3;
const COOLDOWN_S = 60;

export default function RegistroPage() {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [uniSel, setUniSel] = useState("");
  const [uniOtra, setUniOtra] = useState("");
  const [carrera, setCarrera] = useState("");
  const [email, setEmail] = useState("");
  const [email2, setEmail2] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  // Estado del reenvío del mail de confirmación (pantalla "Revisá tu casilla")
  const [reenvios, setReenvios] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [reenviando, setReenviando] = useState(false);
  const [msgReenvio, setMsgReenvio] = useState<string | null>(null);
  const [captchaR, setCaptchaR] = useState<string | null>(null);
  const [resetKeyR, setResetKeyR] = useState(0);

  // Contador regresivo del cooldown de reenvío.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const emailsDistintos =
    email2.length > 0 && email.trim().toLowerCase() !== email2.trim().toLowerCase();

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const universidad = (uniSel === UNIVERSIDAD_OTRA ? uniOtra : uniSel).trim();
    if (emailsDistintos) { setError("Los dos emails no coinciden."); return; }
    if (!passwordValida(password)) { setError(PASSWORD_MSG); return; }
    if (!captcha) { setError("Esperá a que cargue la verificación anti-bot."); return; }
    setEnviando(true); setError(null);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, emailConfirm: email2, password, captchaToken: captcha,
          nombre: nombre.trim(), apellido: apellido.trim(), universidad, carrera: carrera.trim(),
        }),
      });
      if (r.ok) { track("sign_up"); setCooldown(COOLDOWN_S); setListo(true); return; }
      const d = await r.json().catch(() => null);
      setError(d?.error ?? "No se pudo crear la cuenta. Probá de nuevo.");
      setResetKey(k => k + 1);
    } catch {
      setError("No se pudo crear la cuenta. Revisá tu conexión.");
      setResetKey(k => k + 1);
    } finally {
      setEnviando(false);
    }
  }

  async function reenviar() {
    if (reenviando || cooldown > 0 || reenvios >= MAX_REENVIOS || !captchaR) return;
    setReenviando(true); setMsgReenvio(null);
    try {
      const r = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), captchaToken: captchaR }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setReenvios(n => n + 1);
        setCooldown(COOLDOWN_S);
        setMsgReenvio("Mail reenviado. Puede tardar un par de minutos en aparecer.");
      } else {
        setMsgReenvio(d?.error ?? "No se pudo reenviar. Probá de nuevo en un rato.");
      }
    } catch {
      setMsgReenvio("No se pudo reenviar. Revisá tu conexión.");
    } finally {
      setResetKeyR(k => k + 1); // el token del captcha es de un solo uso
      setReenviando(false);
    }
  }

  if (listo) {
    const sinReenvios = reenvios >= MAX_REENVIOS;
    const mailtoSoporte =
      `mailto:${SOPORTE}?subject=${encodeURIComponent("No me llega el mail de confirmación")}` +
      `&body=${encodeURIComponent(`Hola, me registré en stuniv con ${email.trim()} y no me llega el mail de confirmación.`)}`;
    return (
      <AuthCard title="Revisá tu casilla" subtitle={`Te mandamos un mail a ${email.trim()}`}>
        <p className="text-sm text-navy/60 leading-relaxed">
          Tocá el link del mail para activar tu cuenta y entrar.
        </p>

        {/* Aviso de SPAM bien visible (v10.10) */}
        <div className="mt-4 rounded-xl border border-ocre/40 bg-ocre/10 p-4">
          <p className="text-sm text-navy leading-relaxed">
            <span className="font-bold">¿No aparece? Revisá la carpeta de SPAM / correo no deseado.</span>{" "}
            El mail sale de <span className="font-semibold whitespace-nowrap">{SOPORTE}</span> — si está
            en spam, marcalo como &quot;No es spam&quot; para que el link funcione bien.
          </p>
        </div>

        {/* Reenvío con cooldown y tope, como las apps grandes */}
        <div className="mt-5">
          {!sinReenvios ? (
            <>
              <Turnstile onToken={setCaptchaR} resetKey={resetKeyR} />
              <GlassButton type="button" tint="navy" onClick={reenviar}
                disabled={reenviando || cooldown > 0 || !captchaR}
                className={btnCls} whileTap={{ scale: 0.98 }}>
                {reenviando ? "Reenviando…"
                  : cooldown > 0 ? `Reenviar mail (esperá ${cooldown}s)`
                  : "Reenviar mail de confirmación"}
              </GlassButton>
              {msgReenvio && (
                <p className="mt-2 text-xs text-navy/60 text-center">{msgReenvio}</p>
              )}
              {reenvios > 0 && (
                <p className="mt-2 text-xs text-navy/40 text-center">
                  Reenvíos usados: {reenvios} de {MAX_REENVIOS}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-navy/60 leading-relaxed">
              Ya se reenvió {MAX_REENVIOS} veces. Si sigue sin llegar (mirá SPAM otra vez),
              escribinos a{" "}
              <a href={mailtoSoporte} className="font-bold text-navy hover:text-ocre underline">
                {SOPORTE}
              </a>{" "}
              y lo resolvemos.
            </p>
          )}
        </div>

        <p className="mt-6 text-sm text-navy/50 text-center">
          <Link href="/login?entrar=1" className="font-bold text-navy hover:text-ocre">Volver a iniciar sesión</Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Crear cuenta" subtitle="Gratis. Solo necesitás un email.">
      <form onSubmit={crear} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="nombre" className={labelCls}>Nombre</label>
            <input id="nombre" type="text" autoComplete="given-name" required maxLength={60}
              className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div>
            <label htmlFor="apellido" className={labelCls}>Apellido</label>
            <input id="apellido" type="text" autoComplete="family-name" required maxLength={60}
              className={inputCls} value={apellido} onChange={e => setApellido(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="universidad" className={labelCls}>Universidad</label>
          <select id="universidad" required className={inputCls} value={uniSel} onChange={e => setUniSel(e.target.value)}>
            <option value="">— Elegir —</option>
            {UNIVERSIDADES.map(u => <option key={u.nombre} value={u.nombre}>{u.nombre}</option>)}
            <option value={UNIVERSIDAD_OTRA}>{UNIVERSIDAD_OTRA}</option>
          </select>
        </div>
        {uniSel === UNIVERSIDAD_OTRA && (
          <div>
            <label htmlFor="uniOtra" className={labelCls}>Nombre de tu universidad</label>
            <input id="uniOtra" type="text" required maxLength={80} autoComplete="off"
              placeholder="Ej. Universidad Nacional de Cuyo"
              className={inputCls} value={uniOtra} onChange={e => setUniOtra(e.target.value)} />
          </div>
        )}
        <div>
          <label htmlFor="carrera" className={labelCls}>Carrera</label>
          <input id="carrera" type="text" required maxLength={80} autoComplete="off"
            placeholder="Ej. Economía"
            className={inputCls} value={carrera} onChange={e => setCarrera(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>Email</label>
          <input id="email" type="email" autoComplete="email" required maxLength={255}
            className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email2" className={labelCls}>Repetí el email</label>
          <input id="email2" type="email" autoComplete="email" required maxLength={255}
            className={inputCls} value={email2} onChange={e => setEmail2(e.target.value)} />
          {emailsDistintos && (
            <p className="mt-1.5 text-xs text-red-600 font-medium">Los emails no coinciden.</p>
          )}
        </div>
        <div>
          <label htmlFor="password" className={labelCls}>Contraseña</label>
          <input id="password" type="password" autoComplete="new-password" required
            minLength={8} maxLength={72}
            className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
          <p className={`mt-1.5 text-xs ${password.length > 0 && !passwordValida(password) ? "text-red-600 font-medium" : "text-navy/40"}`}>
            {PASSWORD_HINT}
          </p>
        </div>
        <Turnstile onToken={setCaptcha} resetKey={resetKey} />
        <AuthError msg={error} />
        <GlassButton type="submit" tint="navy" disabled={enviando || !captcha || emailsDistintos}
          className={btnCls} whileTap={{ scale: 0.98 }}>
          {enviando ? "Creando…" : "Crear cuenta"}
        </GlassButton>
      </form>
      <p className="mt-6 text-sm text-navy/50 text-center">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login?entrar=1" className="font-bold text-navy hover:text-ocre">Iniciá sesión</Link>
      </p>
    </AuthCard>
  );
}
