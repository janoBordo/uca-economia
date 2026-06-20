"use client";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { useData } from "../lib/useData";
import { savePreparacion } from "../lib/api";

export default function Metricas() {
  const { data } = useData();
  const { materias, sesiones, preparacion: prepInit } = data;
  const [prep, setPrep] = useState<Record<string,number>>({});
  const prepReal = { ...prepInit, ...prep };

  const ahora = Date.now();

  // Para el gráfico: si el examen ya pasó, solo mostrar horas estudiadas (sin meta)
  const chartData = materias.map(m => {
    const horas    = +((sesiones[m.id]||0)/60).toFixed(1);
    const rendida  = new Date(m.examen).getTime() < ahora;
    return {
      id:      m.id,
      corto:   m.nombre.split(" ")[0],
      horas,
      // Si ya rendida: meta = 0 para no mostrar barra de meta
      meta:    rendida ? 0 : m.metaHoras,
      rendida,
      pct:     rendida ? 100 : Math.min(100, Math.round(horas / m.metaHoras * 100)),
    };
  });

  const totalHoras = chartData.reduce((a,d) => a+d.horas, 0);
  const totalMeta  = materias.reduce((a,m) => {
    const rendida = new Date(m.examen).getTime() < ahora;
    return rendida ? a : a + m.metaHoras;
  }, 0);
  const avgPrep = materias.length
    ? Math.round(materias.reduce((a,m) => a+(prepReal[m.id]||0),0)/materias.length)
    : 0;

  async function cambiarPrep(id: string, v: number) {
    const next = { ...prepReal, [id]: v };
    setPrep(next);
    await savePreparacion(next);
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active||!payload?.length) return null;
    const item = chartData.find(d => d.corto === label);
    return (
      <div className="bg-navy text-canvas px-4 py-3 rounded-xl shadow-xl text-sm">
        <p className="font-semibold mb-1">{label}</p>
        <p className="text-ocre">{payload[0]?.value || payload[1]?.value}h estudiado</p>
        {!item?.rendida && <p className="text-canvas/50">Meta: {item?.meta}h</p>}
        {item?.rendida && <p className="text-canvas/40 text-xs">Examen rendido</p>}
      </div>
    );
  };

  return (
    <section className="flex-1 w-full max-w-4xl mx-auto px-6 sm:px-8 py-16 flex flex-col gap-20">

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
            <motion.div key={k.label} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
              transition={{ delay:i*0.07 }}
              className="rounded-2xl p-3 sm:p-6 flex flex-col gap-1 min-w-0"
              style={{ background:"rgba(11,31,77,0.04)", border:"1px solid rgba(11,31,77,0.07)" }}>
              {/* Label — más chico en mobile para que entre */}
              <span className="text-navy/40 text-[10px] sm:text-xs uppercase tracking-wide font-medium leading-tight">{k.label}</span>
              <span className="font-black text-navy text-lg sm:text-3xl leading-tight" style={{ letterSpacing:"-0.03em" }}>{k.val}</span>
              <span className="text-navy/40 text-[10px] sm:text-xs leading-tight">{k.sub}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Gráfico */}
      <div>
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
          <h3 className="font-bold text-navy text-xl sm:text-2xl" style={{ letterSpacing:"-0.03em" }}>Horas por materia</h3>
          <div className="flex items-center gap-4 text-xs text-navy/40">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-ocre inline-block"/>Estudiado</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block" style={{ background:"rgba(11,31,77,0.15)" }}/>Meta pendiente</span>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top:0, right:0, left:-24, bottom:40 }} barGap={2}>
              <XAxis dataKey="corto" angle={-35} textAnchor="end" interval={0}
                tick={{ fill:"rgba(11,31,77,0.4)", fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:"rgba(11,31,77,0.3)", fontSize:10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:"rgba(11,31,77,0.03)" }} />
              {/* Meta solo si no está rendida */}
              <Bar dataKey="meta" fill="rgba(11,31,77,0.1)" radius={[6,6,0,0]} maxBarSize={36} />
              <Bar dataKey="horas" radius={[6,6,0,0]} maxBarSize={36}>
                {chartData.map((d,i) => (
                  <Cell key={i} fill={d.rendida ? "rgba(11,31,77,0.3)" : d.pct>=100 ? "#0B1F4D" : "#C9A227"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sliders preparación */}
      <div>
        <h3 className="font-bold text-navy text-xl sm:text-2xl mb-2" style={{ letterSpacing:"-0.03em" }}>Preparación subjetiva</h3>
        <p className="text-navy/45 text-sm mb-10">¿Qué tan listo te sentís? Sin mentirte.</p>
        <div className="flex flex-col gap-8">
          {materias.map((m,i) => {
            const v     = prepReal[m.id] ?? 0;
            const color = v<35 ? "#C9A227" : v<70 ? "#0B1F4D" : "#1B335F";
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
