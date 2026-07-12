"use client";
import { useEffect, useRef } from "react";

/* Widget de Cloudflare Turnstile (CAPTCHA de signup/login/recuperación).
   Sin dependencias nuevas: carga el script oficial (ya permitido en la CSP)
   y renderiza el widget explícito. El token que emite es de un solo uso —
   tras un submit fallido, subí `resetKey` para pedir uno nuevo. */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function Turnstile({
  onToken, resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelado = false;
    const render = () => {
      if (cancelado || !holder.current || !window.turnstile || widgetId.current !== null) return;
      widgetId.current = window.turnstile.render(holder.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        callback: (t: string) => onTokenRef.current(t),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
        theme: "light",
        language: "es",
      });
    };
    if (window.turnstile) {
      render();
    } else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
      if (!s) {
        s = document.createElement("script");
        s.src = SRC;
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", render);
    }
    return () => {
      cancelado = true;
      if (widgetId.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch {}
        widgetId.current = null;
      }
    };
  }, []);

  // Token consumido (submit fallido) → widget nuevo para el próximo intento.
  useEffect(() => {
    if (resetKey > 0 && widgetId.current !== null && window.turnstile) {
      onTokenRef.current(null);
      try { window.turnstile.reset(widgetId.current); } catch {}
    }
  }, [resetKey]);

  return <div ref={holder} className="min-h-[65px]" />;
}
