"use client";
import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

/* ── Sistema Liquid Glass ──
   Primitivos reutilizables. El MATERIAL vive en globals.css (keyed por
   data-theme="glass"); estos componentes sólo agregan la clase marcadora
   y reenvían todas las props/animaciones. En modo Clásico 2D no agregan
   ningún estilo, así que el look queda idéntico al actual. */

export type GlassTint = "navy" | "ocre" | "red";
const tintClass = (t?: GlassTint) => (t ? `glass-tint-${t}` : "");
const cx = (...xs: (string | false | undefined | null)[]) => xs.filter(Boolean).join(" ");

export function GlassCard({ className, tint, ...props }: HTMLMotionProps<"div"> & { tint?: GlassTint }) {
  return <motion.div className={cx("glass-card", tintClass(tint), className)} {...props} />;
}

export function GlassPanel({ className, ...props }: HTMLMotionProps<"div">) {
  return <motion.div className={cx("glass-panel", className)} {...props} />;
}

export function GlassButton({ className, tint, ...props }: HTMLMotionProps<"button"> & { tint?: GlassTint }) {
  return <motion.button className={cx("glass-button", tintClass(tint), className)} {...props} />;
}

export const GlassInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function GlassInput({ className, ...props }, ref) {
    return <input ref={ref} className={cx("glass-input", className)} {...props} />;
  });

export const GlassSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { children?: ReactNode }>(
  function GlassSelect({ className, children, ...props }, ref) {
    return <select ref={ref} className={cx("glass-input", className)} {...props}>{children}</select>;
  });

export const GlassTextarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function GlassTextarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cx("glass-input", className)} {...props} />;
  });

export function GlassModal({ className, ...props }: HTMLMotionProps<"div">) {
  return <motion.div className={cx("glass-modal", className)} {...props} />;
}

/* Segmented control de vidrio (tabs). Mantiene el look de pills navy actual. */
export function GlassTabs<T extends string>({
  options, value, onChange, disabled, className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("glass-tab inline-flex gap-1 p-1 rounded-full bg-navy/6", className)}>
      {options.map(o => (
        <button key={o.value} type="button" disabled={disabled}
          onClick={() => { if (!disabled) onChange(o.value); }}
          className={cx(
            "px-5 py-2 rounded-full text-sm font-semibold transition-all capitalize",
            value === o.value ? "bg-navy text-canvas shadow-sm" : "text-navy/50 hover:text-navy",
            disabled && "disabled:cursor-not-allowed",
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
