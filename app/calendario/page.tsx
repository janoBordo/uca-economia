"use client";
import { useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useData } from "../lib/useData";
import { saveMaterias, savePlanEstudio, saveNotas, materiasEfectivas } from "../lib/api";
import type { Materia } from "../lib/types";
import { COLORES_MATERIAS } from "../lib/types";
import { GlassButton, GlassInput, GlassModal } from "../components/glass";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS  = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const BAR_W = 10;
const MAX_NOTA = 144;

function isoKey(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

/* Quitar examen: × con confirmación inline (regla de acciones destructivas). */
function BtnQuitarExamen({ onConfirm }: { onConfirm: () => void }) {
  const [c, setC] = useState(false);
  if (!c) return (
    <button onClick={() => setC(true)} aria-label="Quitar examen"
      className="w-6 h-6 rounded-full text-navy/30 hover:text-red-500 hover:bg-red-50 transition-colors text-base leading-none shrink-0 flex items-center justify-center">×</button>
  );
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={onConfirm} className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[11px] font-semibold hover:bg-red-600 transition-colors">Sí</button>
      <button onClick={() => setC(false)} className="px-2 py-0.5 rounded-full border border-navy/20 text-navy/40 text-[11px] hover:border-navy/40 transition-colors">No</button>
    </div>
  );
}

export default function Calendario() {
  const hoy = new Date();
  const { data } = useData();
  const materias    = data.materias;
  const planEstudio = data.planEstudio ?? {};
  const notas       = data.notas ?? [];

  const [vista, setVista] = useState({ y: hoy.getFullYear(), m: hoy.getMonth() });
  const [modal, setModal] = useState<{ dia: number; key: string } | null>(null);
  const [planLocal, setPlanLocal] = useState<string[]>([]);
  const [guardandoPlan, setGuardandoPlan] = useState(false);

  // Alta de examen desde el día seleccionado
  const [addExam, setAddExam] = useState(false);
  const [exSel, setExSel] = useState("");
  const [exHoras, setExHoras] = useState(15);
  const [exHora, setExHora] = useState("09:00");

  // notas
  const [notaInput, setNotaInput] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Una entrada por materia (sin duplicar por varias fechas de examen): se usa
  // para la leyenda, los chips de "Estudiar ese día" y el alta de examen.
  const materiasUnicas = useMemo(() => materiasEfectivas(materias), [materias]);

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    materiasUnicas.forEach((mat, i) => {
      const c = COLORES_MATERIAS[i % COLORES_MATERIAS.length];
      const k = mat.nombre.trim().toLowerCase();
      // Todas las filas de esa materia (fechas extra incluidas) comparten color.
      materias.forEach(x => { if (x.nombre.trim().toLowerCase() === k) m[x.id] = c; });
    });
    return m;
  }, [materias, materiasUnicas]);

  const examMap = useMemo(() => {
    const m: Record<string, Materia[]> = {};
    materias.forEach(mat => {
      const d = new Date(mat.examen);
      const k = isoKey(d.getFullYear(), d.getMonth(), d.getDate());
      (m[k] ||= []).push(mat);
    });
    return m;
  }, [materias]);

  const primerDia = new Date(vista.y, vista.m, 1);
  const offset    = (primerDia.getDay() + 6) % 7;
  const totalDias = new Date(vista.y, vista.m + 1, 0).getDate();
  const celdas: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: totalDias }, (_, i) => i + 1)];

  function mover(d: number) {
    setVista(v => { const nm = v.m + d; return { y: v.y + Math.floor(nm/12), m: ((nm%12)+12)%12 }; });
  }

  function abrirModal(dia: number) {
    const key = isoKey(vista.y, vista.m, dia);
    setPlanLocal(planEstudio[key] ?? []);
    setModal({ dia, key });
    cancelAddExam();
  }

  function toggleMateria(id: string) {
    setPlanLocal(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function guardarModal() {
    if (!modal) return;
    setGuardandoPlan(true);
    const next = { ...planEstudio, [modal.key]: planLocal };
    if (planLocal.length === 0) delete next[modal.key];
    await savePlanEstudio(next);
    setGuardandoPlan(false);
    setModal(null);
  }

  function cancelAddExam() { setAddExam(false); setExSel(""); setExHoras(15); setExHora("09:00"); }

  // Asigna un examen a este día: setea examen (día + hora) y las horas a estudiar
  // (metaHoras) de la materia elegida. Se puede repetir para varias materias.
  async function agregarExamen() {
    if (!modal || !exSel) return;
    const examen = `${modal.key}T${exHora || "09:00"}`;
    const m = materias.find(x => x.id === exSel);
    let updated: Materia[];
    if (m && m.examen) {
      // La materia YA tiene examen en otra fecha: agrego una entrada nueva (misma
      // materia, otra fecha) en vez de pisar la anterior — puede rendir varias veces.
      updated = [...materias, { id: crypto.randomUUID(), nombre: m.nombre, examen, metaHoras: exHoras || m.metaHoras }];
    } else {
      // Primera fecha de la materia: se la asigno directamente.
      updated = materias.map(x => x.id === exSel ? { ...x, examen, metaHoras: exHoras || x.metaHoras } : x);
    }
    await saveMaterias(updated);
    cancelAddExam();
  }
  // Quitar el examen de una materia (vuelve a "sin fecha"; la materia no se borra)
  async function eliminarExamen(id: string) {
    const updated = materias.map(m => m.id === id ? { ...m, examen: "" } : m);
    await saveMaterias(updated);
  }
  // Al elegir la materia, prefill de las horas con su valor actual
  function elegirMateriaExamen(id: string) {
    setExSel(id);
    const m = materias.find(x => x.id === id);
    if (m) setExHoras(m.metaHoras || 15);
  }

  async function agregarNota() {
    const texto = notaInput.trim().slice(0, MAX_NOTA);
    if (!texto) return;
    setGuardandoNota(true);
    await saveNotas([texto, ...notas]);
    setGuardandoNota(false);
    setNotaInput("");
    inputRef.current?.focus();
  }

  async function borrarNota(idx: number) {
    const next = notas.filter((_, i) => i !== idx);
    await saveNotas(next);
  }

  const hoyStr  = isoKey(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const materiasMes = materias.filter(m => {
    const d = new Date(m.examen);
    return d.getFullYear() === vista.y && d.getMonth() === vista.m;
  });

  // Exámenes del día abierto (live) + materias que todavía no rinden ese día
  const modalExams = modal ? (examMap[modal.key] ?? []) : [];
  // Materias (una por nombre) que todavía no rinden ese día — para el alta.
  const materiasSinDia = modal
    ? materiasUnicas.filter(m => !modalExams.some(e => e.nombre.trim().toLowerCase() === m.nombre.trim().toLowerCase()))
    : [];

  return (
    <section className="flex-1 w-full max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 py-12 flex flex-col gap-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-navy leading-none" style={{ fontSize:"clamp(2rem,6vw,3.5rem)", letterSpacing:"-0.04em" }}>{MESES[vista.m]}</h2>
          <span className="text-navy/35 font-medium text-lg">{vista.y}</span>
        </div>
        <div className="flex items-center gap-2">
          <GlassButton onClick={() => mover(-1)} className="w-10 h-10 rounded-full border border-navy/15 text-navy/50 hover:bg-navy hover:text-canvas transition-all flex items-center justify-center text-lg">‹</GlassButton>
          <GlassButton onClick={() => setVista({ y:hoy.getFullYear(), m:hoy.getMonth() })} className="px-4 h-10 rounded-full border border-navy/15 text-navy/50 hover:bg-navy hover:text-canvas transition-all text-sm font-medium">Hoy</GlassButton>
          <GlassButton onClick={() => mover(1)} className="w-10 h-10 rounded-full border border-navy/15 text-navy/50 hover:bg-navy hover:text-canvas transition-all flex items-center justify-center text-lg">›</GlassButton>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-7 mb-2">
            {DIAS.map(d => <div key={d} className="text-center text-navy/30 text-xs font-semibold uppercase tracking-wider py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {celdas.map((dia, i) => {
              if (dia === null) return <div key={i} />;
              const key        = isoKey(vista.y, vista.m, dia);
              const exams      = examMap[key];
              const plan       = planEstudio[key] ?? [];
              const esHoy      = key === hoyStr;
              const tieneExamen = !!exams?.length;
              const examPasado = tieneExamen && exams.every(ex => new Date(ex.examen).getTime() < Date.now());

              return (
                <motion.button key={i} onClick={() => abrirModal(dia)}
                  whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
                  initial={{ opacity:0, scale:0.94 }} animate={{ opacity:1, scale:1 }}
                  transition={{ delay: i * 0.004 }}
                  className={`aspect-square rounded-xl flex flex-col items-center justify-center relative overflow-hidden text-sm font-semibold transition-all ${
                    tieneExamen
                      ? examPasado ? "text-navy/50" : "bg-ocre text-navy shadow-sm shadow-ocre/20"
                      : esHoy ? "bg-navy/8 text-navy" : "text-navy/60 hover:bg-navy/5"
                  }`}
                  style={tieneExamen && examPasado ? { background:"rgba(201,162,39,0.25)" } : undefined}>

                  {/* Puntito hoy */}
                  {esHoy && !tieneExamen && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-ocre" />
                  )}

                  {/* Barras plan */}
                  {plan.length > 0 && (
                    <div className="absolute left-0 top-0 bottom-0 flex flex-col" style={{ width: BAR_W }}>
                      {plan.map(mid => (
                        <div key={mid} className="glass-plan-bar flex-1 min-h-0"
                          style={{ background: colorMap[mid] ?? "#aaa", opacity: tieneExamen ? 0.75 : 1 }} />
                      ))}
                    </div>
                  )}

                  <span className="relative z-10 leading-none">{dia}</span>

                  {tieneExamen && (
                    <div className="relative z-10 flex gap-0.5 mt-0.5">
                      {exams.map((_, j) => <div key={j} className={`w-1 h-1 rounded-full ${examPasado?"bg-navy/20":"bg-navy/35"}`} />)}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Panel lateral */}
        <div className="hidden lg:flex flex-col w-56 shrink-0">
          <h4 className="text-navy/40 text-xs uppercase tracking-widest font-semibold mb-4">Este mes</h4>
          {!materiasMes.length && <p className="text-navy/30 text-sm">Sin exámenes este mes.</p>}
          <div className="flex flex-col gap-3">
            {[...materiasMes].sort((a,b) => new Date(a.examen).getTime()-new Date(b.examen).getTime()).map(m => {
              const d = new Date(m.examen); const pasado = d.getTime() < Date.now();
              return (
                <button key={m.id} onClick={() => abrirModal(d.getDate())}
                  className={`text-left p-3 rounded-xl hover:bg-navy/5 transition-colors ${pasado?"opacity-40":""}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-lg bg-ocre/15 flex items-center justify-center text-ocre text-xs font-bold">{d.getDate()}</div>
                    <span className="text-navy/40 text-xs">{d.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                  <p className="text-navy/80 text-sm font-medium leading-tight">{m.nombre}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
        <span className="flex items-center gap-1.5 text-xs text-navy/35">
          <span className="w-3 h-3 rounded bg-ocre inline-block" /> Examen
        </span>
        <span className="flex items-center gap-1.5 text-xs text-navy/35">
          <span className="w-3 h-3 rounded inline-block" style={{ background:"rgba(201,162,39,0.25)", border:"1px solid rgba(201,162,39,0.4)" }} /> Rendido
        </span>
        {materiasUnicas.slice(0, 8).map((m, i) => (
          <span key={m.id} className="flex items-center gap-1.5 text-xs text-navy/50">
            <span className="inline-block rounded-sm" style={{ width: BAR_W, height: 16, background: COLORES_MATERIAS[i] }} />
            {m.nombre.split(" ")[0]}
          </span>
        ))}
      </div>

      {/* ── NOTAS RÁPIDAS ── */}
      <div className="pt-6 border-t border-navy/8">
        <h3 className="font-bold text-navy text-lg mb-4" style={{ letterSpacing:"-0.03em" }}>Notas rápidas</h3>

        {/* Input con efecto inset sutil */}
        <div className="flex gap-2 mb-5">
          <div className="flex-1 relative">
            <GlassInput
              ref={inputRef}
              value={notaInput}
              onChange={e => setNotaInput(e.target.value.slice(0, MAX_NOTA))}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); agregarNota(); } }}
              placeholder="Escribí una nota… (Enter para guardar)"
              className="w-full px-4 py-3 rounded-xl text-navy text-sm placeholder:text-navy/25 focus:outline-none"
              style={{
                background: "rgba(11,31,77,0.04)",
                border: "1px solid rgba(11,31,77,0.1)",
                boxShadow: "inset 0 2px 6px rgba(11,31,77,0.07), inset 0 1px 2px rgba(11,31,77,0.05)",
              }}
            />
            {notaInput.length > 0 && (
              <span className="absolute right-3 bottom-3 text-navy/25 text-[10px] tabular-nums">
                {MAX_NOTA - notaInput.length}
              </span>
            )}
          </div>
          <GlassButton onClick={agregarNota} disabled={guardandoNota || !notaInput.trim()}
            className="px-4 py-3 rounded-xl bg-navy text-canvas text-sm font-semibold hover:bg-navy-soft transition-colors disabled:opacity-40 shrink-0">
            {guardandoNota ? "◌" : "+"}
          </GlassButton>
        </div>

        {/* Lista notas */}
        <div className="flex flex-col gap-2">
          <AnimatePresence>
            {notas.length === 0 && (
              <motion.p initial={{ opacity:0 }} animate={{ opacity:1 }} className="text-navy/30 text-sm py-2">
                Sin notas todavía.
              </motion.p>
            )}
            {notas.map((nota, idx) => (
              <motion.div key={`${nota}-${idx}`}
                initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, height:0 }}
                transition={{ duration:0.2 }}
                className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl group"
                style={{ background:"rgba(11,31,77,0.03)", border:"1px solid rgba(11,31,77,0.07)" }}>
                <p className="text-navy/75 text-sm leading-relaxed flex-1">{nota}</p>
                <button onClick={() => borrarNota(idx)}
                  className="text-navy/20 hover:text-red-400 transition-colors text-lg leading-none shrink-0 opacity-0 group-hover:opacity-100 pt-0.5">
                  ×
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={() => setModal(null)}>
            <div className="absolute inset-0 bg-navy/30 backdrop-blur-sm" />
            <GlassModal initial={{ opacity:0, scale:0.94, y:16 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.94 }}
              onClick={e => e.stopPropagation()}
              className="relative bg-canvas rounded-3xl p-7 w-full max-w-md shadow-2xl border border-navy/10 max-h-[90vh] overflow-y-auto">

              <h3 className="font-black text-navy text-2xl mb-5" style={{ letterSpacing:"-0.04em" }}>
                {MESES[vista.m]} {modal.dia}
              </h3>

              {/* Exámenes ese día: lista + alta minimalista (materia + horas + hora) */}
              <div className="mb-6">
                <p className="text-xs text-navy/40 uppercase tracking-wider mb-3 font-semibold">Exámenes ese día</p>
                {modalExams.length > 0 && (
                  <div className="flex flex-col gap-2 mb-3">
                    {modalExams.map(ex => {
                      const t = ex.examen.split("T")[1]?.slice(0,5) ?? "";
                      return (
                        <div key={ex.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-ocre/8 border border-ocre/25">
                          <div className="min-w-0">
                            <p className="text-navy text-sm font-medium truncate">{ex.nombre}</p>
                            <p className="text-navy/40 text-xs">{t} · {ex.metaHoras}h a estudiar</p>
                          </div>
                          <BtnQuitarExamen onConfirm={() => eliminarExamen(ex.id)} />
                        </div>
                      );
                    })}
                  </div>
                )}
                <AnimatePresence mode="wait">
                  {!addExam ? (
                    <motion.button key="add" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                      onClick={() => setAddExam(true)}
                      className="flex items-center gap-2 text-navy/50 text-sm font-medium hover:text-ocre transition-colors">
                      <span className="w-6 h-6 rounded-full border border-navy/25 flex items-center justify-center text-base leading-none">+</span>
                      Agregar examen
                    </motion.button>
                  ) : (
                    <motion.div key="form" initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                      className="rounded-xl border border-ocre/30 bg-ocre/5 p-3 flex flex-col gap-3">
                      {materiasSinDia.length === 0 ? (
                        <p className="text-navy/50 text-xs">
                          {materias.length === 0
                            ? "Primero agregá materias en Semestres."
                            : "Ya asignaste todas tus materias a este día."}
                        </p>
                      ) : (
                        <>
                          <select value={exSel} onChange={e => elegirMateriaExamen(e.target.value)}
                            className="w-full appearance-none bg-canvas rounded-lg px-3 py-2 text-navy text-sm border border-navy/12 focus:outline-none focus:ring-2 focus:ring-ocre/40">
                            <option value="">— Elegí la materia —</option>
                            {materiasSinDia.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                          </select>
                          <div className="flex gap-2">
                            <div className="flex-1 min-w-0">
                              <label className="block text-[10px] text-navy/40 uppercase tracking-wider mb-1">Horas a estudiar</label>
                              <input type="number" min={1} max={200} value={exHoras} onChange={e => setExHoras(+e.target.value)}
                                className="w-full appearance-none bg-canvas rounded-lg px-3 py-2 text-navy text-sm border border-navy/12 focus:outline-none focus:ring-2 focus:ring-ocre/40" />
                            </div>
                            <div className="w-28 shrink-0">
                              <label className="block text-[10px] text-navy/40 uppercase tracking-wider mb-1">Hora</label>
                              <input type="time" value={exHora} onChange={e => setExHora(e.target.value)}
                                className="w-full appearance-none bg-canvas rounded-lg px-3 py-2 text-navy text-sm border border-navy/12 focus:outline-none focus:ring-2 focus:ring-ocre/40" />
                            </div>
                          </div>
                        </>
                      )}
                      <div className="flex gap-2">
                        <button onClick={agregarExamen} disabled={!exSel}
                          className="px-4 py-2 rounded-full bg-navy text-canvas text-xs font-semibold hover:bg-navy-soft transition-colors disabled:opacity-40">Agregar</button>
                        <button onClick={cancelAddExam}
                          className="px-4 py-2 rounded-full border border-navy/15 text-navy/50 text-xs hover:border-navy/30 transition-colors">Cancelar</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <p className="text-xs text-navy/40 uppercase tracking-wider mb-3 font-semibold">Estudiar ese día:</p>
                <div className="flex flex-wrap gap-2">
                  {materiasUnicas.map((m, i) => {
                    const sel = planLocal.includes(m.id);
                    const color = COLORES_MATERIAS[i % COLORES_MATERIAS.length];
                    return (
                      <button key={m.id} onClick={() => toggleMateria(m.id)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border"
                        style={sel
                          ? { background: color, color:"#fff", borderColor: color }
                          : { background:"transparent", color:"rgba(11,31,77,0.55)", borderColor:"rgba(11,31,77,0.15)" }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sel ? "#fff" : color }} />
                        {m.nombre.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 mt-7">
                <GlassButton onClick={guardarModal} disabled={guardandoPlan}
                  className="flex-1 py-3 rounded-xl bg-navy text-canvas font-semibold hover:bg-navy-soft transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {guardandoPlan && <span className="animate-spin text-ocre">◌</span>}
                  {guardandoPlan ? "Guardando…" : "Guardar"}
                </GlassButton>
                <GlassButton onClick={() => setModal(null)}
                  className="px-5 py-3 rounded-xl border border-navy/15 text-navy/50 hover:border-navy/30 transition-colors">
                  Cerrar
                </GlassButton>
              </div>
            </GlassModal>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
