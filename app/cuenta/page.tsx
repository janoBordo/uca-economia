"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton, GlassInput, GlassSelect } from "../components/glass";
import ThemeToggle from "../components/ThemeToggle";
import Turnstile from "../components/Turnstile";
import { usePerfil, guardarPerfil, subirFoto, quitarFoto, iniciales, limpiarPerfilCache, type Perfil } from "../lib/perfil";
import { PALETAS, UNIVERSIDADES, UNIVERSIDAD_OTRA, aplicarPaleta, paletaSugerida, type Paleta } from "../lib/paleta";

/* Pantalla de Cuenta / Configuración (6.17). Se llega desde el menú
   desplegable del nombre en el Nav. Secciones: Perfil (foto, nombre, apellido,
   apodo, universidad, carrera — guardado explícito), Apariencia (toggle
   Clásico/Vidrio reubicado + tema de color por universidad, persistido en el
   perfil), Cambiar contraseña y Eliminar cuenta (endpoints de Fase 1, con
   confirmación inline — regla fija de acciones destructivas). */

const MAX_FOTO_ORIGEN = 8 * 1024 * 1024; // 8MB de origen; se reduce a 256px antes de subir

/** Reduce la imagen a un cuadrado de 256px (JPEG) client-side: sube liviano
    (≤400KB que exige el server) y descarta metadata EXIF de paso. */
async function reducirFoto(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const S = 256;
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    if (!lado) return null;
    const canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img,
      (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado,
      0, 0, S, S);
    return await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.85));
  } catch { return null; }
  finally { URL.revokeObjectURL(url); }
}

function Seccion({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <GlassCard initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
      className={`p-6 sm:p-8 rounded-3xl ${className}`}
      style={{ background:"#fff", border:"1px solid rgb(var(--navy-rgb) / 0.08)", boxShadow:"0 2px 12px rgb(var(--navy-rgb) / 0.06)" }}>
      <h3 className="font-bold text-navy text-xl sm:text-2xl mb-6" style={{ letterSpacing:"-0.03em" }}>{titulo}</h3>
      {children}
    </GlassCard>
  );
}

const inputCls = "w-full min-w-0 appearance-none bg-canvas rounded-xl px-4 py-2.5 text-navy text-sm border border-navy/12 focus:outline-none focus:ring-2 focus:ring-ocre/40";
const labelCls = "block text-xs text-navy/40 uppercase tracking-wider mb-1.5";

/* ── Perfil ── */
function SeccionPerfil({ perfil }: { perfil: Perfil }) {
  const esFija = (u: string) => u === "" || UNIVERSIDADES.some(x => x.nombre === u);
  const [form, setForm] = useState({
    nombre: perfil.nombre, apellido: perfil.apellido, apodo: perfil.apodo,
    uniSel: esFija(perfil.universidad) ? perfil.universidad : UNIVERSIDAD_OTRA,
    uniOtra: esFija(perfil.universidad) ? "" : perfil.universidad,
    carrera: perfil.carrera,
  });
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<"" | "ok" | "error">("");
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState("");
  const [confirmQuitar, setConfirmQuitar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value })); setEstado("");
  };

  async function guardar() {
    setGuardando(true); setEstado("");
    const universidad = (form.uniSel === UNIVERSIDAD_OTRA ? form.uniOtra : form.uniSel).trim().slice(0, 80);
    const p = await guardarPerfil({
      nombre: form.nombre.trim().slice(0, 60),
      apellido: form.apellido.trim().slice(0, 60),
      apodo: form.apodo.trim().slice(0, 40),
      universidad,
      carrera: form.carrera.trim().slice(0, 80),
    });
    setGuardando(false);
    setEstado(p ? "ok" : "error");
    if (p) setTimeout(() => setEstado(""), 2500);
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErrorFoto("");
    if (file.size > MAX_FOTO_ORIGEN) { setErrorFoto("La imagen es demasiado grande (máx. 8MB)."); return; }
    setSubiendo(true);
    const blob = await reducirFoto(file);
    const url = blob ? await subirFoto(blob) : null;
    setSubiendo(false);
    if (!url) setErrorFoto("No se pudo subir la foto. Probá con otra imagen.");
  }

  const sugerida = form.uniSel !== UNIVERSIDAD_OTRA ? paletaSugerida(form.uniSel) : null;

  return (
    <Seccion titulo="Perfil">
      {/* Foto */}
      <div className="flex items-center gap-5 mb-8 flex-wrap">
        {perfil.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={perfil.fotoUrl} alt="Foto de perfil" className="w-20 h-20 rounded-full object-cover border border-navy/10" />
        ) : (
          <span className="w-20 h-20 rounded-full bg-navy text-canvas text-2xl font-black flex items-center justify-center glass-solid">
            {iniciales(perfil)}
          </span>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFoto} />
            <GlassButton onClick={() => fileRef.current?.click()} disabled={subiendo}
              className="px-5 py-2 rounded-full border border-navy/20 text-navy/70 text-sm font-medium hover:border-navy/40 hover:text-navy transition-colors disabled:opacity-50">
              {subiendo ? "Subiendo…" : perfil.fotoUrl ? "Cambiar foto" : "Subir foto"}
            </GlassButton>
            {perfil.fotoUrl && !confirmQuitar && (
              <button onClick={() => setConfirmQuitar(true)}
                className="text-navy/40 text-sm hover:text-navy transition-colors">Quitar</button>
            )}
            {confirmQuitar && (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-navy/60">¿Quitar la foto?</span>
                <button onClick={async () => { await quitarFoto(); setConfirmQuitar(false); }}
                  className="px-3 py-1 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors">Sí</button>
                <button onClick={() => setConfirmQuitar(false)}
                  className="px-3 py-1 rounded-full text-navy/50 text-xs font-medium hover:text-navy transition-colors">No</button>
              </span>
            )}
          </div>
          <p className="text-navy/30 text-xs">JPG, PNG o WebP. Se recorta al centro y se reduce a 256px.</p>
          {errorFoto && <p className="text-red-500 text-xs">{errorFoto}</p>}
        </div>
      </div>

      {/* Campos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="min-w-0">
          <label className={labelCls}>Nombre</label>
          <GlassInput value={form.nombre} onChange={set("nombre")} maxLength={60} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Apellido</label>
          <GlassInput value={form.apellido} onChange={set("apellido")} maxLength={60} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Apodo <span className="normal-case">(visible en la app)</span></label>
          <GlassInput value={form.apodo} onChange={set("apodo")} maxLength={40} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Email</label>
          <GlassInput value={perfil.email ?? ""} disabled className={`${inputCls} opacity-60`} />
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Universidad</label>
          <GlassSelect value={form.uniSel} onChange={set("uniSel")} className={inputCls}>
            <option value="">— Elegir —</option>
            {UNIVERSIDADES.map(u => <option key={u.nombre} value={u.nombre}>{u.nombre}</option>)}
            <option value={UNIVERSIDAD_OTRA}>{UNIVERSIDAD_OTRA}</option>
          </GlassSelect>
          {sugerida && (
            <p className="text-navy/30 text-xs mt-1.5">
              Sugiere la paleta {PALETAS.find(p => p.id === sugerida)?.label} (se elige abajo, en Apariencia).
            </p>
          )}
        </div>
        {form.uniSel === UNIVERSIDAD_OTRA && (
          <div className="min-w-0">
            <label className={labelCls}>Nombre de tu universidad</label>
            <GlassInput value={form.uniOtra} onChange={set("uniOtra")} maxLength={80}
              placeholder="Ej. Universidad Nacional de Cuyo" className={inputCls} />
          </div>
        )}
        <div className="min-w-0">
          <label className={labelCls}>Carrera</label>
          <GlassInput value={form.carrera} onChange={set("carrera")} maxLength={80}
            placeholder="Ej. Economía" className={inputCls} />
        </div>
      </div>

      {/* Guardado explícito, no autoguardado (6.17) */}
      <div className="flex items-center gap-4 flex-wrap">
        <GlassButton onClick={guardar} disabled={guardando}
          className="px-8 py-3 rounded-full bg-navy text-canvas font-semibold text-sm hover:bg-navy-soft transition-colors disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar cambios"}
        </GlassButton>
        <AnimatePresence>
          {estado === "ok" && (
            <motion.span initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0 }}
              className="text-sm text-navy/50 flex items-center gap-2"><span className="text-ocre">✓</span> Guardado</motion.span>
          )}
        </AnimatePresence>
        {estado === "error" && <span className="text-sm text-red-500">No se pudo guardar. Probá de nuevo.</span>}
      </div>
    </Seccion>
  );
}

/* ── Apariencia ── */
function SeccionApariencia({ perfil }: { perfil: Perfil }) {
  const [elegida, setElegida] = useState<Paleta>(perfil.temaColor);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<"" | "ok" | "error">("");
  const sucia = elegida !== perfil.temaColor;

  function previsualizar(p: Paleta) {
    setElegida(p); setEstado("");
    aplicarPaleta(p);   // vista previa inmediata; persiste recién con Guardar
  }
  async function guardar() {
    setGuardando(true); setEstado("");
    const p = await guardarPerfil({ temaColor: elegida });
    setGuardando(false);
    setEstado(p ? "ok" : "error");
    if (p) setTimeout(() => setEstado(""), 2500);
  }

  return (
    <Seccion titulo="Apariencia">
      <div className="mb-8">
        <p className="text-navy/50 text-sm font-semibold mb-3">Estilo visual</p>
        <ThemeToggle />
      </div>
      <div className="h-px bg-navy/8 mb-8" />
      <p className="text-navy/50 text-sm font-semibold mb-1">Tema de color</p>
      <p className="text-navy/35 text-xs mb-4">
        Se sugiere según tu universidad, pero podés elegir el que quieras. Se guarda en tu cuenta y viaja entre dispositivos.
      </p>
      <div className="flex flex-wrap gap-3 mb-6">
        {PALETAS.map(p => (
          <button key={p.id} onClick={() => previsualizar(p.id)}
            aria-pressed={elegida === p.id}
            className={`flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-full border transition-colors text-sm font-medium ${
              elegida === p.id ? "border-navy/50 bg-navy/5 text-navy" : "border-navy/12 text-navy/50 hover:border-navy/30"
            }`}>
            <span className="relative w-6 h-6 shrink-0">
              <span className="absolute inset-0 rounded-full" style={{ background: p.primario }} />
              <span className="absolute right-0 bottom-0 w-3 h-3 rounded-full border-2 border-white" style={{ background: p.acento }} />
            </span>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <GlassButton onClick={guardar} disabled={guardando || !sucia}
          className="px-8 py-3 rounded-full bg-navy text-canvas font-semibold text-sm hover:bg-navy-soft transition-colors disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar apariencia"}
        </GlassButton>
        <AnimatePresence>
          {estado === "ok" && (
            <motion.span initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0 }}
              className="text-sm text-navy/50 flex items-center gap-2"><span className="text-ocre">✓</span> Guardado</motion.span>
          )}
        </AnimatePresence>
        {estado === "error" && <span className="text-sm text-red-500">No se pudo guardar. Probá de nuevo.</span>}
        {sucia && estado === "" && <span className="text-navy/35 text-xs">Vista previa — todavía no está guardado.</span>}
      </div>
    </Seccion>
  );
}

/* ── Cambiar contraseña ── */
function SeccionPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const valido = actual.length > 0 && nueva.length >= 8 && nueva === repetir && nueva !== actual;

  function pedirConfirmacion() {
    setMsg(null);
    if (nueva.length < 8) { setMsg({ tipo:"error", texto:"La contraseña nueva tiene que tener al menos 8 caracteres." }); return; }
    if (nueva !== repetir) { setMsg({ tipo:"error", texto:"Las contraseñas nuevas no coinciden." }); return; }
    if (nueva === actual) { setMsg({ tipo:"error", texto:"La contraseña nueva tiene que ser distinta de la actual." }); return; }
    setConfirmando(true);
  }

  async function cambiar() {
    setEnviando(true); setMsg(null);
    try {
      const r = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: actual, newPassword: nueva, ...(captcha ? { captchaToken: captcha } : {}) }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        setMsg({ tipo:"ok", texto:"Contraseña actualizada. Se cerró la sesión en tus otros dispositivos." });
        setActual(""); setNueva(""); setRepetir("");
      } else {
        setMsg({ tipo:"error", texto: d?.error ?? "No se pudo cambiar la contraseña." });
      }
    } catch {
      setMsg({ tipo:"error", texto:"No se pudo cambiar la contraseña. Probá de nuevo." });
    }
    setEnviando(false); setConfirmando(false);
    setResetKey(k => k + 1);   // el token de Turnstile es de un solo uso
  }

  return (
    <Seccion titulo="Cambiar contraseña">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="min-w-0">
          <label className={labelCls}>Contraseña actual</label>
          <GlassInput type="password" autoComplete="current-password" value={actual}
            onChange={e => { setActual(e.target.value); setMsg(null); setConfirmando(false); }} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Contraseña nueva</label>
          <GlassInput type="password" autoComplete="new-password" value={nueva}
            onChange={e => { setNueva(e.target.value); setMsg(null); setConfirmando(false); }} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label className={labelCls}>Repetir la nueva</label>
          <GlassInput type="password" autoComplete="new-password" value={repetir}
            onChange={e => { setRepetir(e.target.value); setMsg(null); setConfirmando(false); }} className={inputCls} />
        </div>
      </div>
      <p className="text-navy/30 text-xs mb-4">Mínimo 8 caracteres. Al confirmar se cierra la sesión en todos tus otros dispositivos.</p>
      <Turnstile onToken={setCaptcha} resetKey={resetKey} />
      <div className="flex items-center gap-4 flex-wrap mt-2">
        <AnimatePresence mode="wait">
          {!confirmando ? (
            <GlassButton key="btn" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              onClick={pedirConfirmacion} disabled={!valido || enviando}
              className="px-8 py-3 rounded-full bg-navy text-canvas font-semibold text-sm hover:bg-navy-soft transition-colors disabled:opacity-50">
              Cambiar contraseña
            </GlassButton>
          ) : (
            <motion.div key="confirm" initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-navy/20 bg-navy/5 flex-wrap">
              <span className="text-navy text-xs font-medium">¿Confirmás el cambio de contraseña?</span>
              <button onClick={cambiar} disabled={enviando}
                className="px-4 py-1.5 rounded-full bg-navy text-canvas text-xs font-semibold hover:bg-navy-soft transition-colors disabled:opacity-50">
                {enviando ? "…" : "Sí, cambiar"}
              </button>
              <button onClick={() => setConfirmando(false)} disabled={enviando}
                className="px-4 py-1.5 rounded-full border border-navy/20 text-navy/50 text-xs hover:border-navy/40 transition-colors">
                Cancelar
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {msg && (
          <span className={`text-sm ${msg.tipo === "ok" ? "text-navy/60" : "text-red-500"}`}>
            {msg.tipo === "ok" && <span className="text-ocre">✓ </span>}{msg.texto}
          </span>
        )}
      </div>
    </Seccion>
  );
}

/* ── Eliminar cuenta ── */
function SeccionEliminar() {
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function eliminar() {
    setEnviando(true); setError("");
    try {
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: "ELIMINAR MI CUENTA" }),
      });
      if (r.ok) {
        limpiarPerfilCache();
        window.location.assign("/login");
        return;
      }
      const d = await r.json().catch(() => null);
      setError(d?.error ?? "No se pudo eliminar la cuenta.");
    } catch { setError("No se pudo eliminar la cuenta. Probá de nuevo."); }
    setEnviando(false); setConfirmando(false);
  }

  return (
    <GlassCard initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
      className="p-6 sm:p-8 rounded-3xl border border-red-200"
      style={{ background:"#fff", boxShadow:"0 2px 12px rgb(var(--navy-rgb) / 0.06)" }}>
      <h3 className="font-bold text-navy text-xl sm:text-2xl mb-2" style={{ letterSpacing:"-0.03em" }}>Eliminar cuenta</h3>
      <p className="text-navy/45 text-sm mb-6">
        Tu cuenta se desactiva al instante y se borra definitivamente, con todos tus datos, a los 30 días.
        Se cierra la sesión en todos tus dispositivos.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <AnimatePresence mode="wait">
          {!confirmando ? (
            <motion.button key="btn" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              onClick={() => setConfirmando(true)}
              className="px-5 py-2.5 rounded-full border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 hover:border-red-400 transition-colors">
              Eliminar mi cuenta
            </motion.button>
          ) : (
            <motion.div key="confirm" initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-red-200 bg-red-50 flex-wrap">
              <span className="text-navy/70 text-sm">¿Eliminar tu cuenta y todos tus datos?</span>
              <button onClick={eliminar} disabled={enviando}
                className="px-4 py-1.5 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
                {enviando ? "…" : "Sí, eliminar"}
              </button>
              <button onClick={() => setConfirmando(false)} disabled={enviando}
                className="px-4 py-1.5 rounded-full text-navy/50 text-xs font-medium hover:text-navy transition-colors">
                No
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </GlassCard>
  );
}

export default function Cuenta() {
  const { perfil, loading } = usePerfil();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    if (saliendo) return;
    setSaliendo(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    limpiarPerfilCache();
    window.location.assign("/login");
  }

  return (
    <section className="flex-1 w-full max-w-3xl mx-auto px-6 sm:px-8 py-16 flex flex-col gap-8">
      <div>
        <motion.h2 initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          className="font-black text-navy mb-2" style={{ fontSize:"clamp(2rem,6vw,3.5rem)", letterSpacing:"-0.04em" }}>
          Configuración
        </motion.h2>
        <p className="text-navy/45 text-base">Tu perfil, la apariencia de la app y la seguridad de tu cuenta.</p>
      </div>

      {loading || !perfil ? (
        <div className="py-16 text-center text-navy/30 text-sm">Cargando…</div>
      ) : (
        <>
          <SeccionPerfil perfil={perfil} />
          <SeccionApariencia perfil={perfil} />
          <SeccionPassword />
          <SeccionEliminar />
          <div className="flex justify-center pt-2 pb-6">
            <button onClick={salir} disabled={saliendo}
              className="px-6 py-2.5 rounded-full border border-navy/15 text-navy/50 text-sm font-medium hover:border-navy/40 hover:text-navy transition-colors disabled:opacity-50">
              {saliendo ? "Saliendo…" : "Cerrar sesión"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
