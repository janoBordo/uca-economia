/* Clases compartidas de las pantallas de entrada (/login, /registro,
   /recuperar). Viven acá y no en AuthCard.tsx para que AuthIntro pueda usar el
   estilo del botón sin generar un import circular con AuthCard (que a su vez
   importa AuthIntro). AuthCard las re-exporta: las páginas siguen importando
   desde "./components/AuthCard" como siempre. */

export const inputCls =
  "w-full min-w-0 appearance-none bg-canvas rounded-xl px-4 py-2.5 text-navy text-sm " +
  "border border-navy/12 focus:outline-none focus:ring-2 focus:ring-ocre/40";
export const labelCls = "block text-xs text-navy/40 uppercase tracking-wider mb-1.5";
export const btnCls =
  "w-full py-3 rounded-2xl bg-navy text-canvas font-bold text-sm " +
  "disabled:opacity-50 disabled:cursor-not-allowed";
