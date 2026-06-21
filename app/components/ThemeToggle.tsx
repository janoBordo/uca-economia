"use client";
import { useEffect, useState } from "react";
import { GlassTabs } from "./glass";

type Theme = "normal" | "glass";

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
      <GlassTabs
        options={[{ value: "normal", label: "Clásico 2D" }, { value: "glass", label: "Vidrio 3D" }]}
        value={theme}
        onChange={aplicar}
      />
      <p className="text-navy/30 text-xs text-center">Cambia el estilo visual de toda la app.</p>
    </div>
  );
}
