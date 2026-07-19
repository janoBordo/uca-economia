"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useData } from "../lib/useData";
import { archivarSemestre, saveMaterias, resetHoras, clearPlanEstudio } from "../lib/api";
import { type Materia, type SemestreArchivado } from "../lib/types";
import { GlassCard, GlassButton } from "../components/glass";
import { track } from "../lib/analytics";

// Los ids de materias son uuid (PK real en la base)
function uid() { return crypto.randomUUID(); }

// Fecha de examen como texto (las fechas se cargan desde el calendario).
function fechaExamenTexto(examen: string): string {
  if (!examen) return "Sin fecha";
  const d = new Date(examen);
  if (isNaN(d.getTime())) return "Sin fecha";
  const dia  = d.toLocaleDateString("es-AR", { day:"2-digit", month:"short" });
  const hora = d.toLocaleTimeString("es-AR", { hour:"2-digit", minute:"2-digit" });
  return d.getTime() < Date.now() ? `Rendido · ${dia}` : `${dia} · ${hora}`;
}

/* Resumen del semestre archivado (v10.7): horas POR EXAMEN, por materia y en
   total. Solo se listan los exámenes RENDIDOS (filas con fecha); las filas que
   quedaron sin fecha (examen quitado) no aparecen como examen, pero sus horas
   sí suman al total de su materia. El 2º examen de una misma materia se rotula
   "Materia 2", el 3º "Materia 3", etc. (orden cronológico). */
type ExamenResumen = { id: string; label: string; mins: number };
type GrupoResumen  = { key: string; nombre: string; mins: number; examenes: ExamenResumen[] };

function resumenGrupos(sem: SemestreArchivado): GrupoResumen[] {
  const map = new Map<string, { nombre: string; rows: Materia[] }>();
  for (const m of sem.materias) {
    const k = m.nombre.trim().toLowerCase();
    const g = map.get(k);
    if (g) g.rows.push(m); else map.set(k, { nombre: m.nombre, rows: [m] });
  }
  const grupos: GrupoResumen[] = [];
  for (const [key, g] of Array.from(map.entries())) {
    const mins = g.rows.reduce((a, r) => a + (sem.sesiones[r.id] || 0), 0);
    const rendidos = g.rows
      .filter(r => r.examen && !isNaN(new Date(r.examen).getTime()))
      .sort((a, b) => new Date(a.examen).getTime() - new Date(b.examen).getTime());
    // Fila fantasma (examen quitado y sin horas): no aparece en el resumen.
    if (mins <= 0 && rendidos.length === 0) continue;
    grupos.push({
      key, nombre: g.nombre, mins,
      examenes: rendidos.map((r, i) => ({
        id: r.id,
        label: i === 0 ? g.nombre : `${g.nombre} ${i + 1}`,
        mins: sem.sesiones[r.id] || 0,
      })),
    });
  }
  return grupos;
}

function SemestreCard({ sem, open, onToggle }: { sem: SemestreArchivado; open: boolean; onToggle: () => void }) {
  const totalMins  = Object.values(sem.sesiones).reduce((a, v) => a + v, 0);
  const totalHoras = (totalMins / 60).toFixed(1);
  const grupos     = resumenGrupos(sem);
  const fecha      = new Date(sem.archivedAt).toLocaleDateString("es-AR", { day:"2-digit", month:"short", year:"numeric" });
  return (
    <GlassCard layout className="rounded-2xl border border-navy/10 overflow-hidden" style={{ background:"rgba(11,31,77,0.025)" }}>
      <button onClick={onToggle} className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-navy/3 transition-colors">
        <div>
          <p className="font-semibold text-navy text-base">{sem.nombre}</p>
          <p className="text-navy/40 text-xs mt-0.5">Archivado el {fecha}</p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-navy/50 text-sm tabular-nums">{totalHoras}h</span>
          <span className="text-navy/30">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }}>
            <div className="px-6 pb-6 border-t border-navy/8">
              <div className="grid grid-cols-3 gap-4 my-5">
                {[
                  { label:"Horas totales", val:`${totalHoras}h` },
                  { label:"Materias",      val:`${grupos.length}` },
                  { label:"Hs/materia",    val:`${grupos.length ? (totalMins/60/grupos.length).toFixed(1) : "0"}h` },
                ].map(k => (
                  <div key={k.label}>
                    <span className="text-navy/40 text-xs block mb-0.5">{k.label}</span>
                    <span className="font-black text-navy text-xl" style={{ letterSpacing:"-0.03em" }}>{k.val}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                {grupos.map(g => {
                  const pctDe = (mins: number) => totalMins > 0 ? Math.round(mins / totalMins * 100) : 0;
                  // Una sola fila cuando la materia tuvo un examen (o ninguno):
                  // materia y examen coinciden. Con varios exámenes: una fila
                  // por examen ("Filosofía", "Filosofía 2") + subtotal materia.
                  if (g.examenes.length <= 1) {
                    return (
                      <div key={g.key} className="flex items-center justify-between py-2 border-b border-navy/6">
                        <span className="text-navy/70 text-sm">{g.nombre}</span>
                        <div className="flex gap-4 text-xs text-navy/40 tabular-nums">
                          <span>{(g.mins/60).toFixed(1)}h</span>
                          <span className="w-10 text-right">{pctDe(g.mins)}%</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={g.key} className="border-b border-navy/6">
                      {g.examenes.map(e => (
                        <div key={e.id} className="flex items-center justify-between py-2">
                          <span className="text-navy/70 text-sm">{e.label}</span>
                          <div className="flex gap-4 text-xs text-navy/40 tabular-nums">
                            <span>{(e.mins/60).toFixed(1)}h</span>
                            <span className="w-10 text-right">{pctDe(e.mins)}%</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pb-2">
                        <span className="text-navy/45 text-xs font-semibold">{g.nombre} · total</span>
                        <div className="flex gap-4 text-xs text-navy/50 font-semibold tabular-nums">
                          <span>{(g.mins/60).toFixed(1)}h</span>
                          <span className="w-10 text-right">{pctDe(g.mins)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

function BtnEliminar({ onConfirm }: { onConfirm: () => void }) {
  const [p, setP] = useState(false);
  if (!p) return (
    <button onClick={() => setP(true)} className="w-7 h-7 rounded-full border border-red-200 text-red-400 hover:bg-red-50 hover:border-red-400 transition-colors text-xs shrink-0 flex items-center justify-center">×</button>
  );
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={onConfirm} className="px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors">Sí</button>
      <button onClick={() => setP(false)} className="px-2 py-0.5 rounded-full border border-navy/20 text-navy/40 text-xs hover:border-navy/40 transition-colors">No</button>
    </div>
  );
}

export default function Semestre() {
  const { data } = useData({ full: true });   // única vista que necesita el historial archivado
  const [confirmCerrar, setConfirmCerrar] = useState(false);
  const [guardandoCierre, setGuardandoCierre] = useState(false);
  const [expandido,     setExpandido]     = useState<string | null>(null);
  const [local,         setLocal]         = useState<Materia[]>([]);
  const [guardado,      setGuardado]      = useState(false);
  const [guardando,     setGuardando]     = useState(false);
  const [agregando,     setAgregando]     = useState(false);
  const [nueva,         setNueva]         = useState({ nombre:"" });
  const [confirmHoras,  setConfirmHoras]  = useState(false);
  const [confirmPlan,   setConfirmPlan]   = useState(false);
  const [ejHoras,       setEjHoras]       = useState(false);
  const [ejPlan,        setEjPlan]        = useState(false);

  useEffect(() => { if (data.materias.length) setLocal(data.materias); }, [data.materias]);

  const totalMins    = Object.values(data.sesiones).reduce((a, v) => a + v, 0);
  const totalHoras   = (totalMins / 60).toFixed(1);
  // Agrupado por nombre: cada materia cuenta UNA vez aunque tenga varias fechas.
  const porNombre = data.materias.reduce((acc, m) => {
    const k = m.nombre.trim().toLowerCase();
    const cur = acc.get(k) ?? { nombre: m.nombre, mins: 0 };
    cur.mins += data.sesiones[m.id] || 0;
    acc.set(k, cur);
    return acc;
  }, new Map<string, { nombre: string; mins: number }>());
  const cantMat = porNombre.size;
  const masEstudiada = Array.from(porNombre.values()).reduce(
    (best, v) => (v.mins > best.mins ? v : best),
    { nombre: "—", mins: 0 }
  );
  const nextNumero = data.semestres.length + 1;

  // Filas agrupadas por materia (nombre) para las cards: una card = una materia,
  // con todas sus fechas de examen adentro. La key usa el id de la 1ª fila (estable
  // al renombrar → el input no pierde el foco).
  const grupos = (() => {
    const map = new Map<string, { key: string; nombre: string; rows: Materia[] }>();
    for (const m of local) {
      const k = m.nombre.trim().toLowerCase();
      const g = map.get(k);
      if (g) g.rows.push(m);
      else map.set(k, { key: m.id, nombre: m.nombre, rows: [m] });
    }
    return Array.from(map.values());
  })();

  // Renombrar/eliminar afecta a TODAS las filas de esa materia.
  function renombrarGrupo(ids: string[], nombre: string) {
    setLocal(ms => ms.map(m => ids.includes(m.id) ? { ...m, nombre } : m));
  }
  function quitarGrupo(ids: string[]) {
    setLocal(ms => ms.filter(m => !ids.includes(m.id)));
  }
  function agregar() {
    const nombre = nueva.nombre.trim();
    if (!nombre) return;
    // Sin fecha ni horas: se cargan después desde el calendario (examen vacío).
    setLocal(ms => [...ms, { id: uid(), nombre, examen: "", metaHoras: 15 }]);
    setNueva({ nombre:"" }); setAgregando(false);
  }
  async function guardar() {
    setGuardando(true);
    try {
      await saveMaterias(local);
      setGuardado(true); setTimeout(() => setGuardado(false), 2500);
    } catch (e) {
      console.error("semestre: no se pudieron guardar las materias", e);
    } finally {
      setGuardando(false);
    }
  }
  async function doResetHoras() {
    setEjHoras(true);
    try { await resetHoras(); }
    catch (e) { console.error("semestre: no se pudieron borrar las horas", e); }
    finally { setEjHoras(false); setConfirmHoras(false); }
  }
  async function doClearPlan() {
    setEjPlan(true);
    try { await clearPlanEstudio(); }
    catch (e) { console.error("semestre: no se pudo limpiar el plan", e); }
    finally { setEjPlan(false); setConfirmPlan(false); }
  }
  async function cerrarSemestre() {
    setGuardandoCierre(true);
    try {
      // El semestre nuevo arranca vacío: cada uno carga sus materias nuevas
      await archivarSemestre(`Semestre ${nextNumero}`, []);
      track("semestre_archivado");
      setLocal([]); // solo se vacía la lista local si el cierre se concretó
    } catch (e) {
      console.error("semestre: no se pudo cerrar el semestre", e);
    } finally {
      setGuardandoCierre(false); setConfirmCerrar(false);
    }
  }

  return (
    <section className="flex-1 w-full max-w-6xl xl:max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-16 flex flex-col gap-16">

      {/* ── MATERIAS Y FECHAS ── */}
      <div>
        <motion.h2 initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          className="font-black text-navy mb-2" style={{ fontSize:"clamp(2rem,6vw,3.5rem)", letterSpacing:"-0.04em" }}>
          Materias
        </motion.h2>
        <p className="text-navy/45 text-base mb-8">Agregá y renombrá las materias del semestre. Las fechas de examen y las horas se cargan desde el calendario.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          <AnimatePresence>
            {grupos.map((g, i) => {
              const ids = g.rows.map(r => r.id);
              const totalMins = g.rows.reduce((a, r) => a + (data.sesiones[r.id] || 0), 0);
              const horasEstudiadas = (totalMins / 60).toFixed(1);
              // Todas las fechas de examen de la materia (ordenadas de más próxima a más lejana).
              const fechas = g.rows.filter(r => r.examen)
                .sort((a, b) => new Date(a.examen).getTime() - new Date(b.examen).getTime());
              return (
                <GlassCard key={g.key}
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, scale:0.96 }}
                  transition={{ delay: i * 0.02 }}
                  className="p-5 rounded-2xl flex flex-col gap-4"
                  style={{ background:"#fff", border:"1px solid rgba(11,31,77,0.08)", boxShadow:"0 2px 12px rgba(11,31,77,0.06), 0 1px 3px rgba(11,31,77,0.04)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <input value={g.nombre} onChange={e => renombrarGrupo(ids, e.target.value)}
                      className="font-semibold text-navy bg-transparent border-b border-transparent hover:border-navy/20 focus:border-ocre focus:outline-none text-sm w-full pb-0.5" />
                    <BtnEliminar onConfirm={() => quitarGrupo(ids)} />
                  </div>
                  <div className="h-px bg-navy/6" />
                  {/* Todas las fechas de examen + total estudiado (se cargan desde el calendario) */}
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-navy/35 text-xs uppercase tracking-wider shrink-0 pt-0.5">{fechas.length > 1 ? "Exámenes" : "Examen"}</span>
                      {fechas.length === 0 ? (
                        <span className="text-navy/30 text-xs font-medium">Sin fecha</span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5 min-w-0">
                          {fechas.map(r => (
                            <span key={r.id} className="text-navy/70 text-xs font-medium text-right">{fechaExamenTexto(r.examen)}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-navy/35 text-xs uppercase tracking-wider">Estudiado</span>
                      <span className="text-navy/70 text-xs font-medium tabular-nums">{horasEstudiadas}h</span>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Agregar */}
        <div className="mt-5">
          <AnimatePresence>
            {agregando ? (
              <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                className="p-5 rounded-2xl border-2 border-ocre/30 bg-ocre/5">
                <p className="font-semibold text-navy mb-4 text-sm uppercase tracking-wider">Nueva materia</p>
                <div className="mb-4">
                  <label className="block text-xs text-navy/40 uppercase tracking-wider mb-1.5">Nombre</label>
                  <input value={nueva.nombre} autoFocus
                    onChange={e => setNueva({ nombre: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") agregar(); }}
                    placeholder="Ej. Macroeconomía"
                    className="w-full min-w-0 appearance-none bg-canvas rounded-xl px-4 py-2.5 text-navy text-sm border border-navy/12 focus:outline-none focus:ring-2 focus:ring-ocre/40" />
                  <p className="text-navy/35 text-xs mt-2">La fecha de examen y las horas a estudiar se cargan después desde el calendario.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={agregar} className="px-6 py-2.5 rounded-full bg-navy text-canvas text-sm font-semibold hover:bg-navy-soft transition-colors">Agregar</button>
                  <button onClick={() => setAgregando(false)} className="px-6 py-2.5 rounded-full border border-navy/15 text-navy/50 text-sm hover:border-navy/30 transition-colors">Cancelar</button>
                </div>
              </motion.div>
            ) : (
              <GlassButton initial={{ opacity:0 }} animate={{ opacity:1 }} onClick={() => setAgregando(true)}
                className="w-full py-4 rounded-2xl border-2 border-dashed border-navy/15 text-navy/40 hover:border-ocre/40 hover:text-ocre transition-colors text-sm font-medium flex items-center justify-center gap-2">
                <span className="text-xl leading-none">+</span> Agregar materia
              </GlassButton>
            )}
          </AnimatePresence>
        </div>

        {/* Guardar */}
        <div className="flex items-center gap-4 flex-wrap mt-6">
          <GlassButton onClick={guardar} disabled={guardando}
            className="px-8 py-3.5 rounded-full bg-navy text-canvas font-semibold hover:bg-navy-soft transition-colors disabled:opacity-60 flex items-center gap-2">
            {guardando && <span className="animate-spin text-ocre">◌</span>}
            {guardando ? "Guardando…" : "Guardar en la nube"}
          </GlassButton>
          <AnimatePresence>
            {guardado && (
              <motion.span initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0 }} className="text-sm text-navy/50 flex items-center gap-2">
                <span className="text-ocre">✓</span> Guardado y sincronizado
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Reiniciar datos — botones con borde + hover, tipografía de la página */}
        <div className="pt-6 mt-6 border-t border-navy/8">
          <h4 className="text-navy/50 text-sm font-semibold mb-3">Reiniciar datos</h4>
          <div className="flex flex-wrap gap-3">
            {/* Horas y preparación */}
            <AnimatePresence mode="wait">
              {!confirmHoras ? (
                <motion.button key="bh" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                  onClick={() => setConfirmHoras(true)}
                  className="px-4 py-2 rounded-full border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 hover:border-red-400 transition-colors">
                  Borrar horas y preparación
                </motion.button>
              ) : (
                <motion.div key="ch" initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-red-200 bg-red-50">
                  <span className="text-navy/60 text-sm">¿Borrar las métricas? Las fechas quedan.</span>
                  <button onClick={doResetHoras} disabled={ejHoras}
                    className="px-3 py-1 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
                    {ejHoras ? "…" : "Sí"}
                  </button>
                  <button onClick={() => setConfirmHoras(false)}
                    className="px-3 py-1 rounded-full text-navy/50 text-xs font-medium hover:text-navy transition-colors">No</button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Plan de estudio */}
            <AnimatePresence mode="wait">
              {!confirmPlan ? (
                <motion.button key="bp" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                  onClick={() => setConfirmPlan(true)}
                  className="px-4 py-2 rounded-full border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 hover:border-red-400 transition-colors">
                  Limpiar plan de estudio
                </motion.button>
              ) : (
                <motion.div key="cp" initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-red-200 bg-red-50">
                  <span className="text-navy/60 text-sm">¿Borrar los días planificados?</span>
                  <button onClick={doClearPlan} disabled={ejPlan}
                    className="px-3 py-1 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
                    {ejPlan ? "…" : "Sí"}
                  </button>
                  <button onClick={() => setConfirmPlan(false)}
                    className="px-3 py-1 rounded-full text-navy/50 text-xs font-medium hover:text-navy transition-colors">No</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── SEMESTRES ── */}
      <div>
        <h2 className="font-black text-navy mb-2" style={{ fontSize:"clamp(2rem,6vw,3.5rem)", letterSpacing:"-0.04em" }}>
          Semestres
        </h2>
        <p className="text-navy/45 text-base mb-8">Guardá el historial de cada semestre antes de empezar el siguiente.</p>

        <GlassCard tint="ocre" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
          className="p-6 sm:p-8 rounded-3xl border border-ocre/30 bg-ocre/5">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <span className="text-ocre text-xs uppercase tracking-widest font-semibold">En curso</span>
              <h4 className="font-black text-navy text-2xl sm:text-3xl mt-1" style={{ letterSpacing:"-0.04em" }}>
                Semestre {nextNumero}
              </h4>
            </div>
            {/* Botón cerrar + confirmación inline */}
            <div className="flex flex-col items-end gap-2">
              <AnimatePresence mode="wait">
                {!confirmCerrar ? (
                  <GlassButton key="btn-cerrar" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    onClick={() => setConfirmCerrar(true)}
                    className="px-6 py-3 rounded-full bg-navy text-canvas font-semibold text-sm hover:bg-navy-soft transition-colors">
                    Cerrar semestre →
                  </GlassButton>
                ) : (
                  <motion.div key="confirm-cerrar" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0 }}
                    className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-navy/20 bg-navy/5">
                    <span className="text-navy text-xs font-medium">¿Cerrar Semestre {nextNumero}?</span>
                    <button onClick={cerrarSemestre} disabled={guardandoCierre}
                      className="px-4 py-1.5 rounded-full bg-navy text-canvas text-xs font-semibold hover:bg-navy-soft transition-colors disabled:opacity-50 flex items-center gap-1">
                      {guardandoCierre && <span className="animate-spin text-ocre text-xs">◌</span>}
                      {guardandoCierre ? "…" : "Sí, cerrar"}
                    </button>
                    <button onClick={() => setConfirmCerrar(false)}
                      className="px-4 py-1.5 rounded-full border border-navy/20 text-navy/50 text-xs hover:border-navy/40 transition-colors">
                      Cancelar
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <div className="min-w-0">
              <span className="text-navy/40 text-[10px] sm:text-xs font-medium block leading-tight mb-1">Horas estudiadas</span>
              <span className="font-black text-navy text-xl sm:text-2xl" style={{ letterSpacing:"-0.03em" }}>{totalHoras}h</span>
            </div>
            <div className="min-w-0">
              <span className="text-navy/40 text-[10px] sm:text-xs font-medium block leading-tight mb-1">Más estudiada</span>
              <span className="font-black text-navy text-sm leading-tight break-words" style={{ letterSpacing:"-0.02em" }}>
                {masEstudiada.mins > 0 ? masEstudiada.nombre.split(" ")[0] : "—"}
              </span>
            </div>
            <div className="min-w-0">
              <span className="text-navy/40 text-[10px] sm:text-xs font-medium block leading-tight mb-1">Materias</span>
              <span className="font-black text-navy text-xl sm:text-2xl" style={{ letterSpacing:"-0.03em" }}>{cantMat}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ── HISTORIAL ── */}
      <div>
        <h3 className="font-bold text-navy text-xl sm:text-2xl mb-6" style={{ letterSpacing:"-0.03em" }}>Historial</h3>
        {data.semestres.length === 0 ? (
          <div className="py-12 text-center text-navy/30 text-sm border border-dashed border-navy/12 rounded-2xl">
            Todavía no archivaste ningún semestre.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {[...data.semestres].reverse().map(sem => (
              <SemestreCard key={sem.id} sem={sem}
                open={expandido === sem.id}
                onToggle={() => setExpandido(expandido === sem.id ? null : sem.id)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
