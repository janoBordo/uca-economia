"use client";
import type { ReactNode } from "react";
import { GlassCard } from "./glass";

/* Marco compartido de las pantallas de entrada (/login, /registro, /recuperar).
   Misma identidad que el resto de la app: Inter, navy/ocre/canvas, card con
   el material Glass en modo Vidrio. */

export const inputCls =
  "w-full min-w-0 appearance-none bg-canvas rounded-xl px-4 py-2.5 text-navy text-sm " +
  "border border-navy/12 focus:outline-none focus:ring-2 focus:ring-ocre/40";
export const labelCls = "block text-xs text-navy/40 uppercase tracking-wider mb-1.5";
export const btnCls =
  "w-full py-3 rounded-2xl bg-navy text-canvas font-bold text-sm " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export function AuthCard({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-10 sm:py-12">
      <GlassCard
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl bg-white border border-navy/8 shadow-sm p-6 sm:p-8">
        <h1 className="text-2xl font-black text-navy">{title}</h1>
        {subtitle && <p className="text-sm text-navy/50 mt-1">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </GlassCard>
    </div>
  );
}

export function AuthError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="text-sm text-red-600 font-medium" role="alert">{msg}</p>;
}
