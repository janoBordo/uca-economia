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

  // Reubicado en /cuenta → Apariencia (6.17); antes vivía al final de la home.
  return (
    <div className="flex flex-col gap-3">
      <GlassTabs
        options={[{ value: "normal", label: "Clásico 2D" }, { value: "glass", label: "Vidrio 3D" }]}
        value={theme}
        onChange={aplicar}
      />
      <p className="text-navy/30 text-xs">Cambia el estilo visual de toda la app en este dispositivo.</p>
    </div>
  );
}
