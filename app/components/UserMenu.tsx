"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerfil, iniciales, nombreCorto, limpiarPerfilCache } from "../lib/perfil";

/* Menú de cuenta (6.17): el nombre/avatar en la esquina superior derecha abre
   un desplegable — Configuración (/cuenta), Ayuda y Cerrar sesión. No es una
   pestaña más del nav. */

function Avatar({ fotoUrl, letras }: { fotoUrl: string | null; letras: string }) {
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border border-navy/10" />;
  }
  return (
    <span className="w-7 h-7 rounded-full bg-navy text-canvas text-[11px] font-bold flex items-center justify-center shrink-0 glass-solid">
      {letras}
    </span>
  );
}

export default function UserMenu() {
  const { perfil } = usePerfil();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar con click afuera / Escape
  useEffect(() => {
    if (!abierto) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  async function salir() {
    if (saliendo) return;
    setSaliendo(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    limpiarPerfilCache();
    // Navegación completa: limpia el cache en memoria y pasa por el middleware
    window.location.assign("/login");
  }

  const nombre = nombreCorto(perfil);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setAbierto(a => !a)}
        aria-haspopup="menu" aria-expanded={abierto}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-navy/8 transition-colors">
        <Avatar fotoUrl={perfil?.fotoUrl ?? null} letras={iniciales(perfil)} />
        <span className="hidden sm:block text-sm font-medium max-w-[10rem] truncate"
          style={{ color: "rgb(var(--navy-rgb) / 0.7)" }}>
          {nombre || "Cuenta"}
        </span>
        <span className="text-[9px]" style={{ color: "rgb(var(--navy-rgb) / 0.35)" }}>▼</span>
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.14 }}
            // rounded-[16px] (= rounded-2xl visual) a propósito: NO matchea los
            // selectores del material Vidrio, así el menú queda sólido y bien
            // encuadrado igual que en 2D (en Vidrio se volvía translúcido/cortado).
            className="absolute right-0 mt-2 w-52 rounded-[16px] border border-navy/10 bg-white shadow-xl overflow-hidden py-1.5 z-50">
            {perfil?.email && (
              <div className="px-4 pt-2 pb-2.5 border-b border-navy/8">
                <p className="text-navy text-sm font-semibold truncate">{nombre || "Tu cuenta"}</p>
                <p className="text-navy/40 text-xs truncate">{perfil.email}</p>
              </div>
            )}
            <Link href="/cuenta" role="menuitem" onClick={() => setAbierto(false)}
              className="block px-4 py-2.5 text-sm text-navy/70 hover:bg-navy/5 hover:text-navy transition-colors">
              Configuración
            </Link>
            <a href="mailto:soporte.stuniv@gmail.com" role="menuitem" onClick={() => setAbierto(false)}
              className="block px-4 py-2.5 text-sm text-navy/70 hover:bg-navy/5 hover:text-navy transition-colors">
              Ayuda
            </a>
            <div className="my-1 h-px bg-navy/8" />
            <button role="menuitem" onClick={salir} disabled={saliendo}
              className="w-full text-left px-4 py-2.5 text-sm text-navy/70 hover:bg-navy/5 hover:text-navy transition-colors disabled:opacity-50">
              {saliendo ? "Saliendo…" : "Cerrar sesión"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
