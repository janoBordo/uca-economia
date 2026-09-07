"use client";
import { LazyMotion, domAnimation } from "framer-motion";

/* Proveedor de animaciones (v10.14).

   framer-motion trae dos formas de usarse: `m.div`, que arrastra TODAS las
   features de la librería al bundle (~34 kB comprimidos, en la primera carga de
   cada pantalla), y `m.div` + LazyMotion, que carga sólo el subconjunto que la
   app realmente usa. stuniv anima opacidad, desplazamientos, escalas, hover/tap
   y entradas/salidas con AnimatePresence — todo eso es exactamente
   `domAnimation`, así que el resto era peso muerto que igual había que
   descargar, parsear y ejecutar antes de que la pantalla respondiera.

   Las vistas usan `m.*` en lugar de `m.*`; la API y las props son
   idénticas. Lo único que quedó afuera de domAnimation son las animaciones de
   layout (`layoutId`), que se usaban en una sola cosa —la pastilla que se
   desliza entre las pestañas del Nav— y ahora se resuelve con CSS puro.

   Envuelve a TODA la app (Nav incluido) desde el layout raíz. */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
