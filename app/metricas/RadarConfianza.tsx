"use client";
import { memo } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { rgbVar } from "../lib/paleta";

export type RadarDatum = {
  materia: string; full: string; valor: number; ref: number; color: string;
};

function RadarConfianza({ data, umbral }: { data: RadarDatum[]; umbral: number }) {
  // Etiqueta de eje: punto de color + nombre de la materia
  const RadarTick = ({ payload, x, y, cx, cy }: any) => {
    const item   = data.find(d => d.materia === payload.value);
    const center = Math.abs(x - cx) < 14;           // ejes arriba/abajo
    const right  = x >= cx;
    const anchor = center ? "middle" : right ? "start" : "end";
    const tx     = center ? x : x + (right ? 14 : -14);
    const dotY   = center ? y - (y < cy ? 13 : -13) : y;
    return (
      <g>
        <circle cx={center ? x : tx + (right ? -8 : 8)} cy={dotY} r={4} fill={item?.color} />
        <text x={tx} y={y} dy={center ? (y < cy ? -2 : 4) : 0}
          textAnchor={anchor} dominantBaseline="central"
          fill={rgbVar("--navy-rgb",0.7)} fontSize={12} fontWeight={600}>{payload.value}</text>
      </g>
    );
  };

  const RadarTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-navy text-canvas px-4 py-3 rounded-xl shadow-xl text-sm">
        <p className="font-semibold mb-1 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background:d.color }} />{d.full}
        </p>
        <p className="text-ocre">Confianza: {d.valor}/100</p>
        <p className="text-canvas/40 text-xs">Umbral sólido: {umbral}</p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="70%" margin={{ top:20, right:60, bottom:20, left:60 }}>
        <PolarGrid stroke={rgbVar("--navy-rgb",0.10)} />
        <PolarAngleAxis dataKey="materia" tick={<RadarTick />} />
        <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} />
        <Radar name="Umbral" dataKey="ref" stroke={rgbVar("--navy-rgb",0.35)} strokeWidth={1.5}
          strokeDasharray="4 4" fill="none" isAnimationActive={false} />
        <Radar name="Confianza" dataKey="valor" stroke={rgbVar("--navy-rgb")} strokeWidth={2}
          fill={rgbVar("--navy-rgb")} fillOpacity={0.10} />
        <Tooltip content={<RadarTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export default memo(RadarConfianza);
