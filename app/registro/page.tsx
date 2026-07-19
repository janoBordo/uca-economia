"use client";
import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthError, inputCls, labelCls, btnCls } from "../components/AuthCard";
import { GlassButton } from "../components/glass";
import Turnstile from "../components/Turnstile";
import { UNIVERSIDADES, UNIVERSIDAD_OTRA, paletaSugerida, aplicarPaleta } from "../lib/paleta";
import { track } from "../lib/analytics";

/* Crear cuenta (6.1): datos de perfil (nombre, apellido, universidad, carrera)
   + email dos veces (guardia anti-typo), contraseña ≥8, CAPTCHA. Al elegir la
   universidad se previsualiza su paleta al instante y se guarda en el perfil,
   así al confirmar el mail y entrar la app ya arranca con esos colores. La
   cuenta no queda operativa hasta confirmar el email (sale de
   soporte.stuniv@gmail.com vía SendGrid). */

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

  const emailsDistintos =
    email2.length > 0 && email.trim().toLowerCase() !== email2.trim().toLowerCase();

  // Vista previa de la paleta al elegir universidad (como en /cuenta).
  function elegirUniversidad(e: React.ChangeEvent<HTMLSelectElement>) {
    const u = e.target.value;
    setUniSel(u);
    const pal = paletaSugerida(u);
    if (pal) aplicarPaleta(pal);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const universidad = (uniSel === UNIVERSIDAD_OTRA ? uniOtra : uniSel).trim();
    if (emailsDistintos) { setError("Los dos emails no coinciden."); return; }
    if (password.length < 8) { setError("La contraseña necesita al menos 8 caracteres."); return; }
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
      if (r.ok) { track("sign_up"); setListo(true); return; }
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

  if (listo) {
    return (
      <AuthCard title="Revisá tu casilla" subtitle={`Te mandamos un mail a ${email.trim()}`}>
        <p className="text-sm text-navy/60 leading-relaxed">
          Tocá el link del mail para activar tu cuenta y entrar. Si no aparece,
          mirá en spam — sale de <span className="font-semibold">soporte.stuniv@gmail.com</span>.
        </p>
        <p className="mt-6 text-sm text-navy/50 text-center">
          <Link href="/login" className="font-bold text-navy hover:text-ocre">Volver a iniciar sesión</Link>
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
          <select id="universidad" required className={inputCls} value={uniSel} onChange={elegirUniversidad}>
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
          <label htmlFor="password" className={labelCls}>Contraseña (mínimo 8 caracteres)</label>
          <input id="password" type="password" autoComplete="new-password" required
            minLength={8} maxLength={72}
            className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
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
        <Link href="/login" className="font-bold text-navy hover:text-ocre">Iniciá sesión</Link>
      </p>
    </AuthCard>
  );
}
