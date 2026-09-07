import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Nav from "./components/Nav";
import MotionProvider from "./components/MotionProvider";

// Google Analytics 4 (v10.6). Carga con lazyOnload (v10.14): gtag.js son ~100 kB
// de JavaScript de terceros y con afterInteractive competían por el hilo
// principal justo mientras React hidrataba la app — o sea, el usuario esperaba
// a que se cargara la analítica para poder tocar la pantalla. Ahora arranca
// después del load, cuando la app ya responde. La "medición mejorada" del
// stream (activada por defecto en GA4) registra los cambios de ruta del App
// Router como page_view vía History API; los eventos custom se emiten con
// track() de app/lib/analytics.ts, que es fire-and-forget y nunca rompe si
// gtag todavía no llegó.
const GA_ID = "G-MY3QS6JTZP";

// Inter self-hosteada (next/font): se descarga UNA vez en el build y se sirve
// desde el propio dominio con cache inmutable — sin round-trip a Google Fonts
// en cada visita (menos latencia de primer paint) y una dependencia externa
// menos en la CSP. Variable font: cubre los mismos pesos 300–900 que antes.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: "stuniv",
  description: "Tu semestre, organizado.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        {/* Un solo script inline, lo primero que corre en la página:
            1) aplica tema (Clásico/Vidrio) y paleta guardados antes del primer
               paint (evita el parpadeo), y
            2) LARGA LOS PEDIDOS DE DATOS (v10.14). Antes /api/db y el perfil
               salían recién cuando React terminaba de hidratar: la espera de la
               red arrancaba después de descargar y parsear todo el bundle, una
               atrás de la otra. Disparándolos acá viajan EN PARALELO con el JS
               y, cuando la app hidrata, la respuesta suele estar lista.
               Son exactamente los mismos requests de siempre —mismo endpoint,
               mismas cookies HttpOnly, mismo 401 manejado por app/lib/api.ts—
               sólo que largados antes; el resultado queda en una promesa que
               api.ts / perfil.ts consumen (window.__stunivPre).
               No se largan en las pantallas públicas (no hay sesión que pedir). */}
        <script dangerouslySetInnerHTML={{ __html:
          `try{if(localStorage.getItem('uca_theme')==='glass')document.documentElement.setAttribute('data-theme','glass');var p=localStorage.getItem('uca_palette');if(p&&['bordo','negro','verde','dorado'].indexOf(p)>-1)document.documentElement.setAttribute('data-palette',p)}catch(e){}` +
          `try{var r=location.pathname;if(r!=='/login'&&r!=='/registro'&&r!=='/recuperar'&&r.indexOf('/auth/')!==0){var f=r==='/semestre';if(!f&&location.search.indexOf('bienvenida=1')<0){try{var g=JSON.parse(localStorage.getItem('stuniv_db_v1')||'null');f=!!(g&&g.full)}catch(e){}}var q=function(u){return fetch(u,{cache:'no-store'}).catch(function(){return null})};window.__stunivPre={dbFull:f,db:q('/api/db'+(f?'?full=1':'')),perfil:q('/api/account/profile')}}}catch(e){}`
        }} />
      </head>
      <body className="min-h-screen flex flex-col bg-canvas">
        {/* Ver components/MotionProvider.tsx: habilita `m.*` en toda la app con
            sólo el subconjunto de framer-motion que stuniv realmente usa. */}
        <MotionProvider>
          <Nav />
          <main className="flex-1 flex flex-col">{children}</main>
        </MotionProvider>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="lazyOnload" />
        <Script id="ga4-init" strategy="lazyOnload" dangerouslySetInnerHTML={{ __html:
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`
        }} />
      </body>
    </html>
  );
}
