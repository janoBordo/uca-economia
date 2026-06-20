"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useData } from "../lib/useData";
import { addMinutos } from "../lib/api";

type Modo = "pomodoro" | "cronometro";

const TIMER_KEY = "uca_timer_v2";

type TimerSnap = {
  modo:        Modo;
  matId:       string;
  customMins:  number;
  corriendo:   boolean;
  startedAt:   number;   // Date.now() cuando arrancó el tick actual
  acumSecs:    number;   // segundos acumulados antes del tick actual
};

function playAlarm() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [0, 0.3, 0.6].forEach(offset => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = "sine";
      gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
      osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.25);
    });
  } catch { /* sin audio */ }
}

function saveSnap(s: TimerSnap | null) {
  if (!s) localStorage.removeItem(TIMER_KEY);
  else localStorage.setItem(TIMER_KEY, JSON.stringify(s));
}
function loadSnap(): TimerSnap | null {
  try { const r = localStorage.getItem(TIMER_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

export default function Timer() {
  const { data } = useData();
  const materias = data.materias;

  const [matId,      setMatId]      = useState("");
  const [modo,       setModo]       = useState<Modo>("pomodoro");
  const [customMins, setCustomMins] = useState(25);
  const [corriendo,  setCorriendo]  = useState(false);
  const [restante,   setRestante]   = useState(25 * 60);
  const [elapsed,    setElapsed]    = useState(0);
  const [sesiones,   setSesiones]   = useState(0);
  const [toast,      setToast]      = useState<string | null>(null);
  const [guardando,  setGuardando]  = useState(false);

  const acumRef    = useRef(0);   // segundos acumulados antes del tick actual
  const startedRef = useRef(0);   // Date.now() cuando arrancó el tick actual
  const ivRef      = useRef<ReturnType<typeof setInterval>>();

  const totalSecs = customMins * 60;

  // ── Restaurar estado al montar ──
  useEffect(() => {
    const snap = loadSnap();
    if (!snap) return;
    setModo(snap.modo);
    setMatId(snap.matId);
    setCustomMins(snap.customMins);
    acumRef.current    = snap.acumSecs;
    startedRef.current = snap.startedAt;
    if (snap.corriendo) {
      const delta = Math.floor((Date.now() - snap.startedAt) / 1000) + snap.acumSecs;
      const total = snap.customMins * 60;
      if (snap.modo === "pomodoro") setRestante(Math.max(0, total - delta));
      else setElapsed(delta);
      setCorriendo(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Materia default
  useEffect(() => { if (!matId && materias.length) setMatId(materias[0].id); }, [materias, matId]);

  // Reset al cambiar modo/duración (solo si no corre)
  useEffect(() => {
    if (corriendo) return;
    setRestante(totalSecs); setElapsed(0); acumRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, customMins]);

  // ── Tick ──
  useEffect(() => {
    if (!corriendo) return;
    ivRef.current = setInterval(() => {
      const delta = Math.floor((Date.now() - startedRef.current) / 1000) + acumRef.current;
      if (modo === "pomodoro") {
        const r = Math.max(0, totalSecs - delta);
        setRestante(r);
        if (r === 0) frenar(true);
      } else {
        setElapsed(delta);
      }
    }, 500);
    return () => clearInterval(ivRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corriendo, modo, totalSecs]);

  // ── Persistir en localStorage cuando cambia el estado ──
  useEffect(() => {
    if (!matId) return;
    if (corriendo) {
      saveSnap({ modo, matId, customMins, corriendo: true, startedAt: startedRef.current, acumSecs: acumRef.current });
    } else {
      saveSnap(null);
    }
  }, [corriendo, modo, matId, customMins]);

  function arrancar() {
    startedRef.current = Date.now();
    setCorriendo(true);
  }

  function pausar() {
    clearInterval(ivRef.current);
    acumRef.current += Math.floor((Date.now() - startedRef.current) / 1000);
    setCorriendo(false);
  }

  async function frenar(completo = false) {
    clearInterval(ivRef.current);
    setCorriendo(false);
    if (completo) playAlarm();

    const segsTransc = completo ? totalSecs
      : modo === "pomodoro"
        ? totalSecs - restante
        : elapsed + Math.floor((Date.now() - startedRef.current) / 1000);

    const mins = Math.max(0, Math.round(segsTransc / 60));
    acumRef.current = 0;
    saveSnap(null);

    if (mins > 0 && matId) {
      setGuardando(true);
      await addMinutos(matId, mins);
      setGuardando(false);
      setSesiones(s => s + 1);
      const nombre = materias.find(m => m.id === matId)?.nombre ?? "";
      showToast(`+${mins} min guardados en ${nombre}`);
    }
    setRestante(totalSecs); setElapsed(0);
  }

  function reset() {
    clearInterval(ivRef.current);
    setCorriendo(false);
    acumRef.current = 0;
    saveSnap(null);
    setRestante(totalSecs); setElapsed(0);
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  const display  = modo === "pomodoro" ? restante : elapsed;
  const mm       = String(Math.floor(display / 60)).padStart(2, "0");
  const ss       = String(display % 60).padStart(2, "0");
  const progreso = modo === "pomodoro" ? 1 - restante / totalSecs : 0;
  const R = 130; const circum = 2 * Math.PI * R;

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
      {/* Modo */}
      <div className="flex gap-1 p-1 rounded-full bg-navy/6 mb-8">
        {(["pomodoro","cronometro"] as Modo[]).map(m => (
          <button key={m} onClick={() => { if (!corriendo) setModo(m); }} disabled={corriendo}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all capitalize ${
              modo===m ? "bg-navy text-canvas shadow-sm" : "text-navy/50 hover:text-navy"
            } disabled:cursor-not-allowed`}>
            {m==="pomodoro" ? "Pomodoro" : "Cronómetro"}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {modo==="pomodoro" && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}
            className="mb-8 flex items-center gap-3">
            <span className="text-navy/50 text-sm">Duración:</span>
            <input type="number" min={1} max={180} value={customMins} disabled={corriendo}
              onChange={e => { if (!corriendo) setCustomMins(Math.max(1,+e.target.value)); }}
              className="w-20 text-center bg-transparent border-b-2 border-navy/20 focus:border-ocre text-navy font-bold text-lg focus:outline-none disabled:opacity-40" />
            <span className="text-navy/50 text-sm">min</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Materia */}
      <div className="mb-10">
        <select value={matId} onChange={e => setMatId(e.target.value)} disabled={corriendo}
          className="bg-transparent text-navy font-semibold text-base border-b-2 border-navy/15 pb-2 px-2 focus:outline-none focus:border-ocre appearance-none cursor-pointer disabled:opacity-40 text-center">
          {materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      </div>

      {/* Círculo */}
      <div className="relative" style={{ width:300, height:300 }}>
        <svg width="300" height="300" style={{ transform:"rotate(-90deg)" }}>
          <circle cx="150" cy="150" r={R} fill="none" stroke="rgba(11,31,77,0.07)" strokeWidth="10" />
          {modo==="pomodoro" && (
            <motion.circle cx="150" cy="150" r={R} fill="none"
              stroke={corriendo?"#C9A227":"#0B1F4D"} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circum} animate={{ strokeDashoffset: circum*(1-progreso) }}
              transition={{ ease:"linear", duration:0.4 }} />
          )}
          {modo==="cronometro" && corriendo && (
            <circle cx="150" cy="150" r={R} fill="none" stroke="#C9A227" strokeWidth="10"
              strokeDasharray="12 8" strokeLinecap="round" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular-nums font-black text-navy leading-none" style={{ fontSize:64, letterSpacing:"-0.04em" }}>{mm}:{ss}</span>
          <span className="text-navy/35 text-xs uppercase tracking-widest mt-2 font-medium">
            {guardando ? "guardando…" : corriendo ? (modo==="cronometro"?"registrando":"concentrado") : "listo"}
          </span>
          {sesiones>0 && (
            <div className="flex gap-1 mt-3">
              {Array.from({ length:Math.min(sesiones,8) }).map((_,i) => <div key={i} className="w-1.5 h-1.5 rounded-full bg-ocre"/>)}
            </div>
          )}
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-4 mt-10">
        <button onClick={reset} className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/40 hover:border-navy/40 hover:text-navy transition-colors text-lg">↺</button>
        <button onClick={() => corriendo ? pausar() : arrancar()}
          className={`w-20 h-20 rounded-full font-bold text-xl shadow-lg transition-all active:scale-95 ${
            corriendo ? "bg-ocre text-navy hover:bg-ocre-light shadow-ocre/30" : "bg-navy text-canvas hover:bg-navy-soft shadow-navy/20"
          }`}>
          {corriendo ? "⏸" : "▶"}
        </button>
        <button onClick={() => frenar(false)} className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/40 hover:border-ocre/60 hover:text-ocre transition-colors text-lg font-bold">✓</button>
      </div>
      <p className="mt-4 text-navy/30 text-xs text-center">
        {modo==="pomodoro" ? "▶ arrancar · ⏸ pausar · ✓ guardar · ↺ reiniciar — alarma al terminar"
          : "▶ arrancar · ⏸ pausar · ✓ guardar tiempo · ↺ reiniciar"}
      </p>
      {corriendo && (
        <p className="mt-2 text-ocre/60 text-xs text-center">El timer sigue aunque cambies de página</p>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity:0, y:20, x:"-50%" }} animate={{ opacity:1, y:0, x:"-50%" }} exit={{ opacity:0, y:10, x:"-50%" }}
            className="fixed bottom-8 left-1/2 px-6 py-3 rounded-full bg-navy text-canvas text-sm font-medium shadow-xl whitespace-nowrap">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
