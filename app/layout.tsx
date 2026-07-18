import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "./components/Nav";

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
      </body>
    </html>
  );
}
