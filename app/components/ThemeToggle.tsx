"use client";
import { useEffect, useState } from "react";

type Theme = "normal" | "glass";

const OPCIONES: { k: Theme; label: string }[] = [
  { k: "normal", label: "Clásico 2D" },
  { k: "glass",  label: "Vidrio 3D" },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("normal");

  // Sincronizar con lo que ya aplicó el script anti-flash
  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("uca_theme")) as Theme | null;
    setTheme(saved === "glass" ? "glass" : "normal");
  }, []);

  function aplicar(t: Theme) {
    setTheme(t);
    try { localStorage.setItem("uca_theme", t); } catch { /* ignore */ }
    if (t === "glass") document.documentElement.setAttribute("data-theme", "glass");
    else document.documentElement.removeAttribute("data-theme");
  }

  return (
    <div className="mt-20 flex flex-col items-center gap-3">
      <span className="text-navy/30 text-xs uppercase tracking-widest font-medium">Apariencia</span>
      <div className="flex gap-1 p-1 rounded-full bg-navy/6">
        {OPCIONES.map(o => (
          <button key={o.k} onClick={() => aplicar(o.k)}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
              theme === o.k ? "bg-navy text-canvas shadow-sm" : "text-navy/50 hover:text-navy"
            }`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-navy/30 text-xs text-center">Cambia el estilo visual de toda la app.</p>
    </div>
  );
}
