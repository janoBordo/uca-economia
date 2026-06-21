"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useData } from "./lib/useData";
import { materiasPorProximidad } from "./lib/api";
import type { Materia } from "./lib/types";
import ThemeToggle from "./components/ThemeToggle";

function useDiff(target: string) {
  const calc = useCallback(() => {
    const ms = new Date(target).getTime() - Date.now();
    const neg = ms < 0; const abs = Math.abs(ms);
    return { neg, dias:Math.floor(abs/86400000), horas:Math.floor((abs%86400000)/3600000), mins:Math.floor((abs%3600000)/60000), segs:Math.floor((abs%60000)/1000) };
  }, [target]);
  const [d, setD] = useState(calc);
  useEffect(() => { const i = setInterval(() => setD(calc()), 1000); return () => clearInterval(i); }, [calc]);
  return d;
}

function CountdownHero({ materia }: { materia: Materia }) {
  const d = useDiff(materia.examen);
  return (
    <div className="flex gap-6 sm:gap-10 md:gap-14">
      {[{v:d.dias,l:"días"},{v:d.horas,l:"horas"},{v:d.mins,l:"min"},{v:d.segs,l:"seg"}].map(({v,l}) => (
        <div key={l} className="flex flex-col items-center">
          <span className="tabular-nums font-black text-navy leading-none" style={{ fontSize:"clamp(3rem,10vw,7rem)", letterSpacing:"-0.04em" }}>
            {String(v).padStart(2,"0")}
          </span>
          <span className="text-navy/40 uppercase tracking-widest text-[10px] sm:text-xs mt-2 font-medium">{l}</span>
        </div>
      ))}
    </div>
  );
}

function RowItem({ m, index }: { m: Materia; index: number }) {
  const d = useDiff(m.examen);
  const fecha = new Date(m.examen).toLocaleDateString("es-AR", { day:"2-digit", month:"short" });
  return (
    <motion.li initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} transition={{ delay:0.4+index*0.05 }}
      className="flex items-center justify-between py-4 border-b border-navy/8 group">
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-1.5 rounded-full bg-ocre shrink-0" />
        <span className="text-navy/75 text-base sm:text-lg font-medium group-hover:text-navy transition-colors">{m.nombre}</span>
      </div>
      <div className="flex items-center gap-3 sm:gap-5 shrink-0">
        <span className="text-navy/35 text-sm hidden sm:block">{fecha}</span>
        <span className="tabular-nums text-navy/60 text-sm font-medium">
          {d.neg ? <span className="text-navy/25">rendido</span> : `${d.dias}d ${d.horas}h ${d.mins}m`}
        </span>
      </div>
    </motion.li>
  );
}

export default function Inicio() {
  const { data } = useData();
  const orden = materiasPorProximidad(data);
  if (!orden.length) return null;

  const ahora = Date.now();
  const proximo = orden.find(m => new Date(m.examen).getTime() > ahora);
  const todoRendido = !proximo;
  const resto = todoRendido ? orden : orden.filter(m => m.id !== proximo!.id);
  const fechaProximo = proximo
    ? new Date(proximo.examen).toLocaleDateString("es-AR", { weekday:"long", day:"numeric", month:"long" })
    : "";

  return (
    <section className="flex-1 w-full max-w-4xl mx-auto px-6 sm:px-8 py-16 sm:py-24 flex flex-col">

      {todoRendido ? (
        <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} className="mb-16">
          <h1 className="font-black text-navy leading-[0.9] mb-6" style={{ fontSize:"clamp(2.5rem,8vw,5.5rem)", letterSpacing:"-0.04em" }}>
            Sin exámenes<br/>próximos
          </h1>
          <p className="text-navy/40 text-base">Anotá nuevas fechas cuando las tengas.</p>
        </motion.div>
      ) : (
        <>
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="flex items-center gap-3 mb-8">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-ocre/40 bg-ocre/8">
              <div className="w-1.5 h-1.5 rounded-full bg-ocre animate-pulse" />
              <span className="text-ocre text-xs font-semibold uppercase tracking-widest">Próximo examen</span>
            </div>
            <span className="text-navy/40 text-sm capitalize">{fechaProximo}</span>
          </motion.div>

          <motion.h1 initial={{ opacity:0, y:24 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1, duration:0.6, ease:[0.22,1,0.36,1] }}
            className="font-black text-navy leading-[0.9] mb-12" style={{ fontSize:"clamp(2.5rem,8vw,5.5rem)", letterSpacing:"-0.04em" }}>
            {proximo!.nombre}
          </motion.h1>

          <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }}>
            <CountdownHero materia={proximo!} />
          </motion.div>

          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.35 }} className="flex gap-3 mt-10">
            <Link href="/timer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-navy text-canvas text-sm font-semibold hover:bg-navy-soft transition-colors">
              <span>▶</span> Iniciar foco
            </Link>
            <Link href="/configuracion" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-navy/20 text-navy/60 text-sm font-medium hover:border-navy/40 hover:text-navy transition-colors">
              Editar fechas
            </Link>
          </motion.div>
        </>
      )}

      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.4 }} className="mt-16 mb-2 flex items-center gap-3">
        <span className="text-navy/30 text-xs uppercase tracking-widest font-medium">Todas las materias</span>
        <div className="flex-1 h-px bg-navy/8" />
      </motion.div>

      <ul>{resto.map((m,i) => <RowItem key={m.id} m={m} index={i} />)}</ul>

      <ThemeToggle />
    </section>
  );
}
