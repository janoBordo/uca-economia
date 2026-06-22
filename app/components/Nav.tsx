"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const LINKS = [
  { href:"/timer",      label:"Pomodoro",   short:"Timer"  },
  { href:"/metricas",   label:"Métricas",   short:"Stats"  },
  { href:"/calendario", label:"Calendario", short:"Cal"    },
  { href:"/semestre",   label:"Semestres",  short:"Sem"    },
  { href:"/tts",        label:"Lectura",    short:"TTS"    },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-navy/10"
      style={{ background:"rgba(245,244,240,0.85)", backdropFilter:"blur(16px)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center shrink-0" aria-label="stuniv — inicio">
          {/* Mobile: isotipo s. */}
          <span className="sm:hidden font-extrabold text-navy text-2xl leading-none tracking-tight">s<span style={{ color:"#009CDE" }}>.</span></span>
          {/* Desktop: logotipo completo */}
          <span className="hidden sm:block font-extrabold text-navy text-2xl leading-none tracking-tight">stuniv<span style={{ color:"#009CDE" }}>.</span></span>
        </Link>
        <nav className="flex items-center gap-0.5">
          {LINKS.map(l => {
            const active = path === l.href || (l.href === "/semestre" && path === "/configuracion");
            return (
              <Link key={l.href} href={l.href}
                className="relative px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                style={{ color: active ? "#0B1F4D" : "rgba(11,31,77,0.45)" }}>
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
      </div>
    </header>
  );
}
