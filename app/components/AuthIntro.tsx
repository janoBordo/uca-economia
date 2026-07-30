"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Titulo, Captura } from "./AuthShowcase";
import { btnCls } from "./authStyles";

/* Portada de entrada para mobile/tablet (v10.12).

   Hasta v10.11 la vitrina de capturas era SÓLO desde xl (≥1280px): en el
   celular /login era la card sola en una pantalla vacía, sin una sola señal de
   qué es la app. Ahora, abajo de xl, /login abre en esta portada — las mismas
   capturas y los mismos rótulos ultra cortos que la versión de PC, apilados
   para pantalla angosta — y el form aparece recién al tocar el CTA.

   Reglas:
   - `xl:hidden`: desde 1280px no se renderiza y manda la vitrina de v10.11,
     que queda EXACTAMENTE igual que antes.
   - El CTA va en una barra `sticky bottom-0`: entrar a la app nunca queda a
     más de un toque, sin importar cuánto se scrollee el collage.
   - Las capturas siguen siendo decorativas (aria-hidden): lo que informa es el
     rótulo, que es texto real. Sólo la primera carga `eager`; las otras cinco
     son `lazy` → la primera pintura de mobile suma ~21KB, no los ~94KB del set.
   - Cero estado propio: el único JS es el fade de entrada y el callback del
     "ya tengo cuenta". */

/* En el celular cada bloque ocupa ~5/6 del ancho y se va alternando a un lado
   y al otro. Ese margen que queda libre es lo que hace que el collage "flote"
   en vez de leerse como un muro de capturas pegadas al borde: en PC ese aire
   lo da el ancho de la pantalla, acá hay que fabricarlo. Desde sm la grilla es
   de dos columnas y cada bloque vuelve a ancho completo (el aire ya está). */
const izq = "w-[84%] sm:w-full";
const der = "w-[84%] sm:w-full ml-auto sm:ml-0";

export default function AuthIntro({ onEntrar }: { onEntrar: () => void }) {
  return (
    <div className="xl:hidden flex-1 flex flex-col">
      <motion.header
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-3xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-12 sm:pb-14">
        <h1 className="text-navy font-black leading-[1.03]"
          style={{ fontSize: "clamp(2.15rem, 9.5vw, 3.4rem)", letterSpacing: "-0.035em" }}>
          Tu semestre,<br />organizado.
        </h1>
        <p className="mt-4 max-w-[20rem] sm:max-w-md text-navy/45 text-[15px] sm:text-base leading-relaxed">
          Cuenta regresiva a cada final, foco real, métricas honestas y tus
          apuntes convertidos en audio.
        </p>
      </motion.header>

      {/* Una columna en el celular; dos en tablet, donde una sola quedaría
          ridículamente angosta contra 700-1200px de ancho. */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 0.12, duration: 0.6, ease: "easeOut" }}
        aria-hidden
        className="w-full max-w-3xl mx-auto px-5 sm:px-8 grid grid-cols-1 sm:grid-cols-2 gap-x-7 gap-y-14 sm:gap-y-12">
        <div className={izq}>
          <Titulo>Organizá tu semestre</Titulo>
          <Captura src="/showcase/inicio.webp" w={820} h={412} eager />
        </div>
        <div className={der}>
          <Titulo>Planificá cada día</Titulo>
          <Captura src="/showcase/calendario.webp" w={820} h={422} />
        </div>
        <div className={izq}>
          <Titulo>Métricas reales</Titulo>
          <Captura src="/showcase/metricas.webp" w={760} h={377} />
          {/* La card ocre del semestre monta sobre la esquina, como en PC */}
          <Captura src="/showcase/semestre.webp" w={620} h={259}
            className="relative w-[78%] -mt-7 -ml-3 rounded-md" />
        </div>
        <div className={der}>
          <Titulo>Tus apuntes, en audiolibros</Titulo>
          <Captura src="/showcase/lectura.webp" w={820} h={424} />
        </div>
        <div className={`${izq} sm:col-span-2 sm:max-w-md`}>
          <Titulo>Personalizá la app</Titulo>
          <Captura src="/showcase/cuenta.webp" w={820} h={416} />
        </div>
      </motion.div>

      {/* Barra de acción pegada al fondo, con EL MISMO material que el nav
          (translúcido + blur + hairline): así funciona igual en Clásico y en
          Vidrio — un degradé opaco a canvas se vería como una banda clara
          contra el fondo del tema Vidrio (#ECEBE5 + radiales). De paso hace
          de contrapeso del header: la marca arriba, la acción abajo.
          El padding inferior respeta el área segura del iPhone. */}
      <div className="auth-cta sticky bottom-0 mt-auto pt-4 px-5 sm:px-8 border-t border-navy/10
        pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        style={{ background: "rgba(245,244,240,0.85)", backdropFilter: "blur(16px)" }}>
        <div className="w-full max-w-md mx-auto">
          <Link href="/registro"
            className={`glass-button glass-tint-navy block text-center ${btnCls}`}>
            Unirme a stuniv
          </Link>
          <button type="button" onClick={onEntrar}
            className="w-full mt-3 py-2 text-sm text-navy/55 hover:text-navy font-medium">
            Ya tengo cuenta · <span className="font-bold text-navy">Iniciar sesión</span>
          </button>
        </div>
      </div>
    </div>
  );
}
