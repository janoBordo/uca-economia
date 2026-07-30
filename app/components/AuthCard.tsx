"use client";
import { useState, type ReactNode } from "react";
import { GlassCard } from "./glass";
import AuthShowcase from "./AuthShowcase";
import AuthIntro from "./AuthIntro";

/* Marco compartido de las pantallas de entrada (/login, /registro, /recuperar).
   Misma identidad que el resto de la app: Inter, navy/ocre/canvas, card con
   el material Glass en modo Vidrio.

   Desde xl (≥1280px) la card se corre a la derecha y el espacio que sobraba lo
   ocupa la vitrina de capturas (v10.11).

   Abajo de xl, con `intro` (sólo /login, v10.12), la pantalla abre en la
   PORTADA — las mismas capturas y rótulos, apilados para pantalla angosta — y
   la card aparece recién al tocar "Ya tengo cuenta". El corte es puramente por
   CSS (`xl:hidden` / `hidden xl:flex`): en ≥1280px la card se muestra siempre,
   sin importar el estado, así que la versión de PC queda intacta y no hay
   detección de viewport en JS (ni riesgo de mismatch de hidratación). */

export { inputCls, labelCls, btnCls } from "./authStyles";

export function AuthCard({ title, subtitle, intro = false, children }: {
  title: string;
  subtitle?: string;
  /** Muestra la portada de mobile antes del form (sólo /login). */
  intro?: boolean;
  children: ReactNode;
}) {
  const [verForm, setVerForm] = useState(false);
  const portada = intro && !verForm;

  return (
    <>
      {portada && <AuthIntro onEntrar={() => setVerForm(true)} />}
      <div className={`flex-1 ${portada ? "hidden xl:flex" : "flex"} items-start sm:items-center justify-center px-4 xl:px-0 py-10 sm:py-12`}>
        {/* En xl el padding pasa adentro del max-w-7xl para que la vitrina arranque
            exactamente en la misma línea que el logo del nav (mismo contenedor). */}
        <div className="w-full max-w-md xl:max-w-7xl xl:px-8 xl:flex xl:items-center xl:gap-12 2xl:gap-16">
          <AuthShowcase />
          <div className="xl:w-[25rem] xl:shrink-0">
            {/* Vuelta a la portada: sólo existe si se llegó acá desde ella. */}
            {intro && verForm && (
              <button type="button" onClick={() => setVerForm(false)}
                className="xl:hidden mb-3 -mt-1 text-sm text-navy/45 hover:text-navy font-medium">
                ← Volver
              </button>
            )}
            <GlassCard
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="w-full rounded-3xl bg-white border border-navy/8 shadow-sm p-6 sm:p-8">
              <h1 className="text-2xl font-black text-navy">{title}</h1>
              {subtitle && <p className="text-sm text-navy/50 mt-1">{subtitle}</p>}
              <div className="mt-6">{children}</div>
            </GlassCard>
          </div>
        </div>
      </div>
    </>
  );
}

export function AuthError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="text-sm text-red-600 font-medium" role="alert">{msg}</p>;
}
