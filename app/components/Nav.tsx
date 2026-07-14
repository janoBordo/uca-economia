"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import UserMenu from "./UserMenu";
import { usePerfil } from "../lib/perfil";

const LINKS = [
  { href:"/timer",      label:"Pomodoro",   short:"Timer"  },
  { href:"/metricas",   label:"Métricas",   short:"Stats"  },
  { href:"/calendario", label:"Calendario", short:"Cal"    },
  { href:"/semestre",   label:"Semestres",  short:"Sem"    },
  { href:"/tts",        label:"Lectura",    short:"TTS"    },
];

// Pantallas de entrada: solo el logo, sin tabs ni menú de cuenta (no hay sesión).
const AUTH_PATHS = new Set(["/login", "/registro", "/recuperar"]);

// Identidad académica al lado del logo — te "acompaña" en todo el sitio.
// El color de la paleta SÍ se aplica acá (es texto de acento, no el logo).
function Identidad() {
  const { perfil } = usePerfil();
  if (!perfil || (!perfil.carrera && !perfil.universidad)) return null;
  return (
    <div className="hidden lg:flex flex-col justify-center min-w-0 border-l border-navy/10 pl-3 ml-1 leading-tight">
      {perfil.carrera && (
        <span className="text-[13px] font-semibold truncate max-w-[15rem]" style={{ color:"rgb(var(--navy-rgb) / 0.75)" }}>
          {perfil.carrera}
        </span>
      )}
      {perfil.universidad && (
        <span className="text-[11px] truncate max-w-[15rem]" style={{ color:"rgb(var(--navy-rgb) / 0.4)" }}>
          {perfil.universidad}
        </span>
      )}
    </div>
  );
}

export default function Nav() {
  const path = usePathname();
  const esAuth = AUTH_PATHS.has(path);
  return (
    <header className="sticky top-0 z-50 border-b border-navy/10"
      style={{ background:"rgba(245,244,240,0.85)", backdropFilter:"blur(16px)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center min-w-0 shrink">
          <Link href="/" className="flex items-center shrink-0" aria-label="stuniv — inicio">
            {/* Logo SIEMPRE azul + punto celeste, sin importar la paleta elegida */}
            {/* Mobile: isotipo s. */}
            <span className="sm:hidden font-extrabold text-2xl leading-none tracking-tight" style={{ color:"#0B1F4D" }}>s<span style={{ color:"#009CDE" }}>.</span></span>
            {/* Desktop: logotipo completo */}
            <span className="hidden sm:block font-extrabold text-2xl leading-none tracking-tight" style={{ color:"#0B1F4D" }}>stuniv<span style={{ color:"#009CDE" }}>.</span></span>
          </Link>
          {!esAuth && <Identidad />}
        </div>
        {!esAuth && <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <nav className="flex items-center gap-0.5">
            {LINKS.map(l => {
              const active = path === l.href || (l.href === "/semestre" && path === "/configuracion");
              return (
                <Link key={l.href} href={l.href}
                  className="relative px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                  style={{ color: active ? "rgb(var(--navy-rgb))" : "rgb(var(--navy-rgb) / 0.45)" }}>
                  {active && (
                    <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-navy/8"
                      transition={{ type:"spring", stiffness:400, damping:35 }} />
                  )}
                  <span className="relative hidden sm:block">{l.label}</span>
                  <span className="relative sm:hidden">{l.short}</span>
                </Link>
              );
            })}
          </nav>
          {/* Cuenta: menú desplegable desde el nombre/avatar (6.17) — no es una pestaña */}
          <UserMenu />
        </div>}
      </div>
    </header>
  );
}
