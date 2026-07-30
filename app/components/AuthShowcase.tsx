"use client";
import { motion } from "framer-motion";

/* Vitrina de las pantallas de entrada (v10.11): capturas reales de la app al
   costado del form de /login, /registro y /recuperar — antes la página era
   sólo la card y quedaban dos tercios vacíos.

   Reglas que se respetan (es un cambio MERAMENTE visual):
   - Sólo se muestra desde xl (≥1280px). Abajo de eso no se renderiza y, al
     estar en display:none con loading="lazy", el navegador ni descarga los
     .webp → el peso de la página en mobile/tablet no cambia en nada.
   - Las 6 capturas están recortadas y comprimidas a WebP: ~90KB EN TOTAL,
     con width/height fijos (cero layout shift) y decorativas (aria-hidden),
     así que no agregan nada al árbol de accesibilidad ni al foco del form.
   - Cero JS nuevo más allá de un fade del contenedor (un solo motion.div). */

// Exportados: la portada de mobile (AuthIntro, v10.12) usa exactamente los
// mismos rótulos y capturas — un solo idioma visual para las dos versiones.
export function Titulo({ children }: { children: string }) {
  // Mismo idioma editorial que el hero de la home (v10.8): label ocre + hairline.
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-ocre text-[11px] font-semibold uppercase tracking-widest whitespace-nowrap">
        {children}
      </span>
      <span className="flex-1 h-px bg-ocre/25" />
    </div>
  );
}

// El ancho lo pone cada uso (className) — así una captura puede salirse de la
// grilla sin pelearse con un w-full de base. `eager` sólo para la primera
// captura de la portada de mobile (la única sobre el pliegue).
export function Captura({ src, w, h, className = "w-full", eager = false }: {
  src: string; w: number; h: number; className?: string; eager?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt="" width={w} height={h} loading={eager ? "eager" : "lazy"} decoding="async"
      className={`h-auto select-none pointer-events-none ${className}`}
      style={{ filter: "drop-shadow(0 14px 28px rgb(var(--navy-rgb) / 0.10))" }}
    />
  );
}

export default function AuthShowcase() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ delay: 0.15, duration: 0.7, ease: "easeOut" }}
      aria-hidden
      className="hidden xl:grid flex-1 min-w-0 grid-cols-2 gap-x-8 2xl:gap-x-10 items-start">

      {/* Columna izquierda */}
      <div className="space-y-9">
        <div>
          <Titulo>Organizá tu semestre</Titulo>
          <Captura src="/showcase/inicio.webp" w={820} h={412} />
        </div>
        <div className="pl-7">
          <Titulo>Planificá cada día</Titulo>
          <Captura src="/showcase/calendario.webp" w={820} h={422} />
        </div>
        <div>
          <Titulo>Tus apuntes, en audiolibros</Titulo>
          <Captura src="/showcase/lectura.webp" w={820} h={424} />
        </div>
      </div>

      {/* Columna derecha, corrida hacia abajo para romper la simetría */}
      <div className="space-y-12 mt-24">
        <div>
          <Titulo>Métricas reales</Titulo>
          <Captura src="/showcase/metricas.webp" w={760} h={377} />
          {/* La card ocre del semestre monta sobre la esquina de métricas */}
          <Captura src="/showcase/semestre.webp" w={620} h={259}
            className="relative w-[86%] -mt-10 -ml-6 rounded-md" />
        </div>
        <div className="pr-5">
          <Titulo>Personalizá la app</Titulo>
          <Captura src="/showcase/cuenta.webp" w={820} h={416} />
        </div>
      </div>
    </motion.div>
  );
}
