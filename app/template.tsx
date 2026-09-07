"use client";
import { m as motion } from "framer-motion";
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    /* Transición de entrada de CADA página. Era 0.5s con 20px de recorrido: se
       sumaba a los delays internos de cada vista y hacía que una navegación
       tardara ~0.9s en asentarse aunque los datos ya estuvieran en el cache —
       "lento" puramente por animación. 0.28s y 8px conservan el fundido pero
       la app responde al toque (v10.14). */
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      transition={{ duration:0.28, ease:[0.22,1,0.36,1] }} className="flex-1 flex flex-col">
      {children}
    </motion.div>
  );
}
