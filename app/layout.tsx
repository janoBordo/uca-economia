import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Nav from "./components/Nav";

// Google Analytics 4 (v10.6). Carga diferida (afterInteractive): no bloquea el
// primer paint. La "medición mejorada" del stream (activada por defecto en GA4)
// registra los cambios de ruta del App Router como page_view vía History API.
// Los eventos custom se emiten con track() de app/lib/analytics.ts.
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
        {/* Aplica tema (Clásico/Vidrio) y paleta de color guardados antes del primer paint (evita parpadeo) */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('uca_theme')==='glass')document.documentElement.setAttribute('data-theme','glass');var p=localStorage.getItem('uca_palette');if(p&&['bordo','negro','verde','dorado'].indexOf(p)>-1)document.documentElement.setAttribute('data-palette',p)}catch(e){}` }} />
      </head>
      <body className="min-h-screen flex flex-col bg-canvas">
        <Nav />
        <main className="flex-1 flex flex-col">{children}</main>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html:
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}');`
        }} />
      </body>
    </html>
  );
}
