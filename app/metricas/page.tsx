"use client";
import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useData } from "../lib/useData";
import { savePreparacion, materiasEfectivas } from "../lib/api";
import { COLORES_MATERIAS } from "../lib/types";
import { GlassCard, GlassPanel } from "../components/glass";

// Recharts (pesado) cargado en chunk aparte, sólo en cliente: no entra al bundle inicial.
const BarHoras       = dynamic(() => import("./BarHoras"),       { ssr: false });
const RadarConfianza = dynamic(() => import("./RadarConfianza"), { ssr: false });

const UMBRAL_SOLIDO = 70; // valor de referencia "sólido" (mismo umbral que los sliders)

export default function Metricas() {
  const { data } = useData();
  const { sesiones, preparacion: prepInit } = data;
  // Una entrada por materia (examen más próximo) — sin filas duplicadas por
  // varias fechas, y contando solo las horas del examen relevante.
  const materias = useMemo(() => materiasEfectivas(data.materias), [data.materias]);
  const [prep, setPrep] = useState<Record<string,number>>({});
  const prepReal = useMemo(() => ({ ...prepInit, ...prep }), [prepInit, prep]);

  // Fijo "ahora" una vez por montaje para que los memos no se invaliden en cada render.
  const ahora = useMemo(() => Date.now(), []);

  // Para el gráfico: si el examen ya pasó, solo mostrar horas estudiadas (sin meta)
  const chartData = useMemo(() => materias.map(m => {
    const horas   = +((sesiones[m.id]||0)/60).toFixed(1);
    const rendida = new Date(m.examen).getTime() < ahora;
    const meta    = rendida ? 0 : m.metaHoras;
    const pct     = rendida ? 100 : Math.min(100, Math.round(horas / m.metaHoras * 100));
    // Resto = lo que falta para llegar a meta (apilado encima de horas)
    const resto   = rendida ? 0 : Math.max(0, +(meta - horas).toFixed(1));
    return { id: m.id, corto: m.nombre.split(" ")[0], horas, meta, resto, rendida, pct };
  }), [materias, sesiones, ahora]);

  const totalHoras = chartData.reduce((a,d) => a+d.horas, 0);
  const totalMeta  = materias.reduce((a,m) => {
    const rendida = new Date(m.examen).getTime() < ahora;
    return rendida ? a : a + m.metaHoras;
  }, 0);
  const avgPrep = materias.length
    ? Math.round(materias.reduce((a,m) => a+(prepReal[m.id]||0),0)/materias.length)
    : 0;

  // Matriz de Confianza: preparación subjetiva por materia (gráfico de radar)
  const radarData = useMemo(() => materias.map((m,i) => ({
    materia: m.nombre.split(" ")[0],
    full:    m.nombre,
    valor:   prepReal[m.id] ?? 0,
    ref:     UMBRAL_SOLIDO,
    color:   COLORES_MATERIAS[i % COLORES_MATERIAS.length],
  })), [materias, prepReal]);

  const cambiarPrep = useCallback(async (id: string, v: number) => {
    const next = { ...prepReal, [id]: v };
    setPrep(next);
    await savePreparacion(next);
  }, [prepReal]);

  return (
    <section className="flex-1 w-full max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-16 flex flex-col gap-20">

      {/* KPIs */}
      <div>
        <motion.h2 initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
          className="font-black text-navy mb-8" style={{ fontSize:"clamp(2rem,6vw,3.5rem)", letterSpacing:"-0.04em" }}>
          Métricas
        </motion.h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label:"Horas totales",    val:`${totalHoras.toFixed(1)}h`, sub:`de ${totalMeta}h pendiente` },
            { label:"Progreso global",  val:`${totalMeta>0?Math.round(totalHoras/totalMeta*100):100}%`,  sub:"materias pendientes" },
            { label:"Prep. media",      val:`${avgPrep}/100`,            sub:"autopercibida" },
          ].map((k,i) => (
            <GlassCard key={k.label} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
              transition={{ delay:i*0.07 }}
              className="rounded-2xl p-3 sm:p-6 flex flex-col gap-1 min-w-0"
              style={{ background:"rgba(11,31,77,0.04)", border:"1px solid rgba(11,31,77,0.07)" }}>
              {/* Label — más chico en mobile para que entre */}
              <span className="text-navy/40 text-[10px] sm:text-xs uppercase tracking-wide font-medium leading-tight">{k.label}</span>
              <span className="font-black text-navy text-lg sm:text-3xl leading-tight" style={{ letterSpacing:"-0.03em" }}>{k.val}</span>
              <span className="text-navy/40 text-[10px] sm:text-xs leading-tight">{k.sub}</span>
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Gráfico + Matriz: lado a lado cuando hay ancho (xl+), apilados si no */}
      <div className="grid xl:grid-cols-2 gap-14 xl:gap-10 items-start">
      {/* Gráfico */}
      <div>
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
          <h3 className="font-bold text-navy text-xl sm:text-2xl" style={{ letterSpacing:"-0.03em" }}>Horas por materia</h3>
          <div className="flex items-center gap-4 text-xs text-navy/40">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-ocre inline-block"/>Estudiado</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block" style={{ background:"rgba(11,31,77,0.15)" }}/>Restante</span>
          </div>
        </div>
        <GlassPanel className="h-80 w-full p-4">
          <BarHoras data={chartData} />
        </GlassPanel>
      </div>

      {/* Matriz de Confianza (radar) */}
      <div>
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-x-4 gap-y-2">
          <h3 className="font-bold text-navy text-xl sm:text-2xl" style={{ letterSpacing:"-0.03em" }}>Matriz de Confianza</h3>
          <div className="flex items-center gap-4 text-xs text-navy/40">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-navy inline-block"/>Tu confianza</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0 border-t border-dashed border-navy/40 inline-block"/>Umbral sólido ({UMBRAL_SOLIDO})</span>
          </div>
        </div>
        <p className="text-navy/45 text-sm mb-4">Tu preparación subjetiva por materia.</p>
        <GlassPanel className="h-80 w-full p-2">
          <RadarConfianza data={radarData} umbral={UMBRAL_SOLIDO} />
        </GlassPanel>
      </div>
      </div>

      {/* Sliders preparación */}
      <div>
        <h3 className="font-bold text-navy text-xl sm:text-2xl mb-2" style={{ letterSpacing:"-0.03em" }}>Preparación subjetiva</h3>
        <p className="text-navy/45 text-sm mb-10">¿Qué tan listo te sentís? Sin mentirte.</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
          {materias.map((m,i) => {
            const v     = prepReal[m.id] ?? 0;
            const color = v<35 ? "rgb(var(--ocre-rgb))" : v<70 ? "rgb(var(--navy-rgb))" : "rgb(var(--navy-soft-rgb))";
            return (
              <motion.div key={m.id} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:i*0.04 }}>
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-navy/80 font-medium text-base">{m.nombre}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-navy/30">{v<35?"riesgo":v<70?"en progreso":"sólido"}</span>
                    <span className="tabular-nums font-black text-2xl shrink-0" style={{ color, letterSpacing:"-0.04em" }}>{v}</span>
                  </div>
                </div>
                <div className="relative mb-2.5 h-1 rounded-full bg-navy/8 overflow-hidden">
                  <motion.div className="absolute left-0 top-0 h-full rounded-full"
                    animate={{ width:`${v}%` }} transition={{ ease:"easeOut", duration:0.3 }}
                    style={{ background:color }} />
                </div>
                <input type="range" min={0} max={100} value={v}
                  onChange={e => cambiarPrep(m.id, +e.target.value)} className="w-full" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
