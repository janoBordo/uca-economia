"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import UserMenu from "./UserMenu";
import { usePerfil } from "../lib/perfil";
import { logoUniversidad } from "../lib/paleta";

const LINKS = [
  { href:"/timer",      label:"Pomodoro"   },
  { href:"/metricas",   label:"Métricas"   },
  { href:"/calendario", label:"Calendario" },
  { href:"/semestre",   label:"Semestres"  },
  { href:"/tts",        label:"Lectura"    },
];

// Pantallas de entrada: solo el logo, sin tabs ni menú de cuenta (no hay sesión).
const AUTH_PATHS = new Set(["/login", "/registro", "/recuperar"]);

function esActivo(path: string, href: string) {
  return path === href || (href === "/semestre" && path === "/configuracion");
}

// Identidad académica al lado del logo — "acompaña" en todo el sitio, también
// en mobile (junto a la 's.'). El color de la paleta se aplica al texto (es
// acento, no el logo). El logo de la universidad aparece desde sm+ (en mobile
// el espacio es más justo).
function Identidad() {
  const { perfil } = usePerfil();
  if (!perfil || (!perfil.carrera && !perfil.universidad)) return null;
  const logo = perfil.universidad ? logoUniversidad(perfil.universidad) : null;
  return (
    <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 border-l border-navy/10 pl-2.5 ml-1.5">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" aria-hidden className="hidden sm:block h-6 w-auto max-w-[2.25rem] object-contain shrink-0" style={{ opacity:0.9 }} />
      )}
      <div className="flex flex-col justify-center min-w-0 leading-tight">
        {perfil.carrera && (
          <span className="text-[12px] lg:text-[13px] font-semibold truncate max-w-[7.5rem] sm:max-w-[15rem]" style={{ color:"rgb(var(--navy-rgb) / 0.75)" }}>
            {perfil.carrera}
          </span>
        )}
        {perfil.universidad && (
          <span className="text-[10px] lg:text-[11px] truncate max-w-[7.5rem] sm:max-w-[15rem]" style={{ color:"rgb(var(--navy-rgb) / 0.4)" }}>
            {perfil.universidad}
          </span>
        )}
      </div>
    </div>
  );
}

// Menú hamburguesa (mobile / < lg): las páginas dejan de estar en la barra y
// pasan a un desplegable minimalista. El ícono se transforma en X al abrir.
function MobileMenu({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", click);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", esc); };
  }, [open]);

  const bar = "absolute left-0 right-0 h-[1.75px] rounded-full bg-navy/90";
  return (
    <div className="relative lg:hidden" ref={ref}>
      {/* v10.7: la hamburguesa (la puerta a las páginas en mobile) gana borde y
          tamaño — es el control principal de navegación, no un ícono más. */}
      <button onClick={() => setOpen(o => !o)} aria-label="Menú" aria-haspopup="menu" aria-expanded={open}
        className="w-10 h-10 rounded-full border border-navy/15 flex items-center justify-center hover:bg-navy/8 hover:border-navy/30 transition-colors">
        <span className="relative block w-[18px] h-[12px]">
          <motion.span className={bar} style={{ top:0 }} animate={open ? { rotate:45, top:5.25 } : { rotate:0, top:0 }} transition={{ duration:0.2 }} />
          <motion.span className={bar} style={{ top:5.25 }} animate={{ opacity: open ? 0 : 1 }} transition={{ duration:0.15 }} />
          <motion.span className={bar} style={{ top:10.5 }} animate={open ? { rotate:-45, top:5.25 } : { rotate:0, top:10.5 }} transition={{ duration:0.2 }} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.nav role="menu"
            initial={{ opacity:0, y:-6, scale:0.98 }} animate={{ opacity:1, y:0, scale:1 }}
            exit={{ opacity:0, y:-6, scale:0.98 }} transition={{ duration:0.14 }}
            /* rounded-[16px] (no rounded-2xl) para que no herede el material Vidrio */
            className="absolute right-0 mt-2 w-52 rounded-[16px] border border-navy/10 bg-white shadow-xl overflow-hidden py-1.5 z-50">
            {LINKS.map(l => {
              const active = esActivo(path, l.href);
              return (
                <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)}
                  className={`block px-5 py-3 text-base transition-colors ${active ? "text-navy font-bold bg-navy/5" : "text-navy/75 font-medium hover:bg-navy/5 hover:text-navy"}`}>
                  {l.label}
                </Link>
              );
            })}
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Nav() {
  const path = usePathname();
  const esAuth = AUTH_PATHS.has(path);
  return (
    <header className="sticky top-0 z-50 border-b border-navy/10"
      style={{ background:"rgba(245,244,240,0.85)", backdropFilter:"blur(16px)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center min-w-0 shrink">
          <Link href="/" className="flex items-center shrink-0" aria-label="stuniv — inicio">
            {/* Logo SIEMPRE azul + punto celeste, sin importar la paleta elegida */}
            <span className="sm:hidden font-extrabold text-2xl leading-none tracking-tight" style={{ color:"#0B1F4D" }}>s<span style={{ color:"#009CDE" }}>.</span></span>
            <span className="hidden sm:block font-extrabold text-2xl leading-none tracking-tight" style={{ color:"#0B1F4D" }}>stuniv<span style={{ color:"#009CDE" }}>.</span></span>
          </Link>
          {!esAuth && <Identidad />}
        </div>
        {!esAuth && <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Desktop (lg+): pestañas inline */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {LINKS.map(l => {
              const active = esActivo(path, l.href);
              return (
                <Link key={l.href} href={l.href}
                  className={`relative px-4 py-2.5 rounded-lg text-base font-semibold transition-colors ${
                    active ? "text-navy" : "text-navy/60 hover:text-navy"
                  }`}>
                  {active && (
                    <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-navy/8"
                      transition={{ type:"spring", stiffness:400, damping:35 }} />
                  )}
                  <span className="relative">{l.label}</span>
                </Link>
              );
            })}
          </nav>
          {/* Mobile / tablet (< lg): hamburguesa */}
          <MobileMenu path={path} />
          {/* Cuenta: menú desplegable desde el nombre/avatar (6.17) */}
          <UserMenu />
        </div>}
      </div>
    </header>
  );
}
