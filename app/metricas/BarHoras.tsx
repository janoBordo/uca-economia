"use client";
import { memo } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { rgbVar } from "../lib/paleta";

export type BarDatum = {
  id: string; corto: string; horas: number; meta: number;
  resto: number; rendida: boolean; pct: number;
};

const CustomTooltip = ({ active, payload, label, data }: any) => {
  if (!active || !payload?.length) return null;
  const item = data.find((d: BarDatum) => d.corto === label);
  return (
    <div className="bg-navy text-canvas px-4 py-3 rounded-xl shadow-xl text-sm">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-ocre">{item?.horas}h estudiado</p>
      {!item?.rendida && <p className="text-canvas/50">Meta: {item?.meta}h</p>}
      {item?.rendida && <p className="text-canvas/40 text-xs">Examen rendido</p>}
    </div>
  );
};

function BarHoras({ data }: { data: BarDatum[] }) {
  // Recharts pasa fill/stroke como atributos SVG (var() no aplica ahí):
  // se resuelven los colores de la paleta activa al montar.
  const navy = rgbVar("--navy-rgb"), ocre = rgbVar("--ocre-rgb");
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top:0, right:0, left:-24, bottom:40 }} barGap={2}>
        <XAxis dataKey="corto" angle={-35} textAnchor="end" interval={0}
          tick={{ fill:rgbVar("--navy-rgb",0.4), fontSize:11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill:rgbVar("--navy-rgb",0.3), fontSize:10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip data={data} />} cursor={{ fill:rgbVar("--navy-rgb",0.03) }} />
        {/* Horas estudiadas (abajo) + resto hasta meta (arriba) apilados */}
        <Bar dataKey="horas" stackId="a" radius={[4,4,0,0]} maxBarSize={36}>
          {data.map((d,i) => (
            <Cell key={i} fill={d.rendida ? rgbVar("--navy-rgb",0.3) : d.pct>=100 ? navy : ocre} />
          ))}
        </Bar>
        <Bar dataKey="resto" stackId="a" fill={rgbVar("--navy-rgb",0.1)} radius={[6,6,0,0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(BarHoras);
