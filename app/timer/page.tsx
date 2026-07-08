"use client";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useData } from "../lib/useData";
import { addMinutos, materiasPorProximidad } from "../lib/api";
import { GlassTabs, GlassButton, GlassInput, GlassSelect } from "../components/glass";

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

type DispRef = React.MutableRefObject<{ restante: number; elapsed: number }>;
type NumRef  = React.MutableRefObject<number>;

// ── Nodo hoja AISLADO: es dueño del setInterval y se re-renderiza solo él ──
// El padre (tabs, select, controles) no se re-renderiza por segundo.
// El valor que tickea se escribe en dispRef para que frenar() lea exactamente
// lo mismo que antes leía del state. `version` fuerza re-render en cambios
// externos (reset/restaurar/cambio de modo) vía la comparación de memo.
type DialProps = {
  corriendo: boolean; modo: Modo; totalSecs: number;
  startedRef: NumRef; acumRef: NumRef; dispRef: DispRef;
  version: number; guardando: boolean; sesiones: number;
  onComplete: () => void;
};

const TimerDial = memo(function TimerDial(
  { corriendo, modo, totalSecs, startedRef, acumRef, dispRef, guardando, sesiones, onComplete }: DialProps
) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!corriendo) return;
    const iv = setInterval(() => {
      const delta = Math.floor((Date.now() - startedRef.current) / 1000) + acumRef.current;
      if (modo === "pomodoro") {
        const r = Math.max(0, totalSecs - delta);
        dispRef.current.restante = r;
        forceTick(t => t + 1);
        if (r === 0) onComplete();
      } else {
        dispRef.current.elapsed = delta;
        forceTick(t => t + 1);
      }
    }, 500);
    return () => clearInterval(iv);
  }, [corriendo, modo, totalSecs, startedRef, acumRef, dispRef, onComplete]);

  const display  = modo === "pomodoro" ? dispRef.current.restante : dispRef.current.elapsed;
  const mm       = String(Math.floor(display / 60)).padStart(2, "0");
  const ss       = String(display % 60).padStart(2, "0");
  const progreso = modo === "pomodoro" ? 1 - dispRef.current.restante / totalSecs : 0;
  const R = 130; const circum = 2 * Math.PI * R;

  return (
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
          <circle cx="150" cy="150" r={R} fill="none" stroke="#C9A227" strokeWidth="10" />
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
  );
});

export default function Timer() {
  const { data } = useData();
  const materias = data.materias;
  // Materia sugerida por default: la del examen más próximo (no vencido).
  const materiaProxima = materiasPorProximidad(data)[0]?.id ?? "";

  const [matId,      setMatId]      = useState("");
  const [modo,       setModo]       = useState<Modo>("pomodoro");
  const [customMins, setCustomMins] = useState(25);
  const [corriendo,  setCorriendo]  = useState(false);
  const [sesiones,   setSesiones]   = useState(0);
  const [toast,      setToast]      = useState<string | null>(null);
  const [guardando,  setGuardando]  = useState(false);
  const [dialVersion, setDialVersion] = useState(0);   // notifica al leaf en cambios externos
  const [manualOpen, setManualOpen] = useState(false);  // carga manual de horas ya estudiadas
  const [manualH,    setManualH]    = useState(1);
  const [manualM,    setManualM]    = useState(0);

  const acumRef    = useRef(0);   // segundos acumulados antes del tick actual
  const startedRef = useRef(0);   // Date.now() cuando arrancó el tick actual
  const dispRef    = useRef({ restante: 25 * 60, elapsed: 0 });   // valor mostrado (lo escribe el leaf)

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
      if (snap.modo === "pomodoro") dispRef.current.restante = Math.max(0, total - delta);
      else dispRef.current.elapsed = delta;
      setCorriendo(true);
    }
    setDialVersion(v => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Materia default: la del examen más próximo
  useEffect(() => { if (!matId && materiaProxima) setMatId(materiaProxima); }, [materiaProxima, matId]);

  // Reset al cambiar modo/duración (solo si no corre)
  useEffect(() => {
    if (corriendo) return;
    dispRef.current = { restante: totalSecs, elapsed: 0 };
    acumRef.current = 0;
    setDialVersion(v => v + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, customMins]);

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
    acumRef.current += Math.floor((Date.now() - startedRef.current) / 1000);
    setCorriendo(false);
  }

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); }, []);

  const frenar = useCallback(async (completo = false) => {
    setCorriendo(false);
    if (completo) playAlarm();

    const { restante, elapsed } = dispRef.current;
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
    dispRef.current = { restante: totalSecs, elapsed: 0 };
    setDialVersion(v => v + 1);
  }, [modo, totalSecs, matId, materias, showToast]);

  const onComplete = useCallback(() => { frenar(true); }, [frenar]);

  // Sumar horas estudiadas sin haber usado el timer (te olvidaste del pomodoro)
  async function guardarManual() {
    const mins = Math.max(0, Math.round(manualH * 60 + manualM));
    if (mins <= 0 || !matId) return;
    setGuardando(true);
    await addMinutos(matId, mins);
    setGuardando(false);
    setSesiones(s => s + 1);
    const nombre = materias.find(m => m.id === matId)?.nombre ?? "";
    const hLbl = manualH ? `${manualH}h ` : "";
    const mLbl = manualM ? `${manualM}min` : "";
    showToast(`+${(hLbl + mLbl).trim() || `${mins} min`} guardados en ${nombre}`);
    setManualOpen(false); setManualH(1); setManualM(0);
  }

  function reset() {
    setCorriendo(false);
    acumRef.current = 0;
    saveSnap(null);
    dispRef.current = { restante: totalSecs, elapsed: 0 };
    setDialVersion(v => v + 1);
  }

  return (
    <section className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
      {/* Modo */}
      <GlassTabs className="mb-8"
        options={[{ value:"pomodoro", label:"Pomodoro" }, { value:"cronometro", label:"Cronómetro" }]}
        value={modo} disabled={corriendo}
        onChange={(m) => { if (!corriendo) setModo(m); }} />

      <AnimatePresence>
        {modo==="pomodoro" && (
          <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}
            className="mb-8 flex items-center gap-3">
            <span className="text-navy/50 text-sm">Duración:</span>
            <GlassInput type="number" min={1} max={180} value={customMins} disabled={corriendo}
              onChange={e => { if (!corriendo) setCustomMins(Math.max(1,+e.target.value)); }}
              className="w-20 text-center bg-transparent border-b-2 border-navy/20 focus:border-ocre text-navy font-bold text-lg focus:outline-none disabled:opacity-40" />
            <span className="text-navy/50 text-sm">min</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Materia */}
      <div className="mb-10">
        <GlassSelect value={matId} onChange={e => setMatId(e.target.value)} disabled={corriendo}
          className="bg-transparent text-navy font-semibold text-base border-b-2 border-navy/15 pb-2 px-2 focus:outline-none focus:border-ocre appearance-none cursor-pointer disabled:opacity-40 text-center">
          {materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </GlassSelect>
      </div>

      {/* Círculo (nodo hoja aislado del tick) */}
      <TimerDial corriendo={corriendo} modo={modo} totalSecs={totalSecs}
        startedRef={startedRef} acumRef={acumRef} dispRef={dispRef}
        version={dialVersion} guardando={guardando} sesiones={sesiones} onComplete={onComplete} />

      {/* Controles */}
      <div className="flex items-center gap-4 mt-10">
        <GlassButton onClick={reset} className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/40 hover:border-navy/40 hover:text-navy transition-colors text-lg">↺</GlassButton>
        <GlassButton onClick={() => corriendo ? pausar() : arrancar()}
          className={`w-20 h-20 rounded-full font-bold text-xl shadow-lg transition-all active:scale-95 ${
            corriendo ? "bg-ocre text-navy hover:bg-ocre-light shadow-ocre/30" : "bg-navy text-canvas hover:bg-navy-soft shadow-navy/20"
          }`}>
          {corriendo ? "⏸" : "▶"}
        </GlassButton>
        <GlassButton onClick={() => frenar(false)} className="w-12 h-12 rounded-full border-2 border-navy/15 text-navy/40 hover:border-ocre/60 hover:text-ocre transition-colors text-lg font-bold">✓</GlassButton>
      </div>
      <p className="mt-4 text-navy/30 text-xs text-center">
        {modo==="pomodoro" ? "▶ arrancar · ⏸ pausar · ✓ guardar · ↺ reiniciar — alarma al terminar"
          : "▶ arrancar · ⏸ pausar · ✓ guardar tiempo · ↺ reiniciar"}
      </p>
      {corriendo && (
        <p className="mt-2 text-ocre/60 text-xs text-center">El timer sigue aunque cambies de página</p>
      )}

      {/* ── Carga manual: estudiaste y te olvidaste del pomodoro ── */}
      {!corriendo && (
        <div className="mt-8 w-full max-w-sm">
          <AnimatePresence mode="wait">
            {!manualOpen ? (
              <motion.button key="abrir" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                onClick={() => setManualOpen(true)}
                className="w-full py-3 rounded-2xl border border-dashed border-navy/15 text-navy/45 hover:border-ocre/40 hover:text-ocre transition-colors text-sm font-medium flex items-center justify-center gap-2">
                <span className="text-base leading-none">＋</span> Ya estudiaste sin el timer
              </motion.button>
            ) : (
              <motion.div key="form" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                className="p-5 rounded-2xl border border-navy/10 bg-navy/[0.02]">
                <p className="text-navy/60 text-sm font-medium text-center mb-4">
                  Sumar horas a <span className="text-navy font-semibold">{materias.find(m => m.id === matId)?.nombre ?? "—"}</span>
                </p>
                <div className="flex items-end justify-center gap-4 mb-5">
                  <label className="flex flex-col items-center gap-1.5">
                    <GlassInput type="number" min={0} max={24} value={manualH}
                      onChange={e => setManualH(Math.max(0, +e.target.value))}
                      className="w-20 text-center bg-transparent border-b-2 border-navy/20 focus:border-ocre text-navy font-bold text-2xl focus:outline-none" />
                    <span className="text-navy/40 text-xs uppercase tracking-wider">horas</span>
                  </label>
                  <label className="flex flex-col items-center gap-1.5">
                    <GlassInput type="number" min={0} max={59} value={manualM}
                      onChange={e => setManualM(Math.min(59, Math.max(0, +e.target.value)))}
                      className="w-20 text-center bg-transparent border-b-2 border-navy/20 focus:border-ocre text-navy font-bold text-2xl focus:outline-none" />
                    <span className="text-navy/40 text-xs uppercase tracking-wider">min</span>
                  </label>
                </div>
                <div className="flex gap-3 justify-center">
                  <GlassButton onClick={guardarManual} disabled={guardando || (manualH === 0 && manualM === 0)}
                    className="px-6 py-2.5 rounded-full bg-navy text-canvas text-sm font-semibold hover:bg-navy-soft transition-colors disabled:opacity-40 flex items-center gap-2">
                    {guardando && <span className="animate-spin text-ocre">◌</span>}
                    Sumar horas
                  </GlassButton>
                  <button onClick={() => setManualOpen(false)}
                    className="px-6 py-2.5 rounded-full border border-navy/15 text-navy/50 text-sm hover:border-navy/30 transition-colors">
                    Cancelar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
