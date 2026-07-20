// Copia el worker de pdf.js del paquete instalado a public/ (v10.9).
// Corre solo vía predev/prebuild (npm) — así el worker es SELF-HOSTED
// (sin unpkg.com en la CSP) y SIEMPRE de la misma versión que pdfjs-dist
// (la API de pdf.js exige que lib y worker coincidan). El archivo copiado
// está gitignoreado: no se commitea, se regenera en cada build.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destino = join(raiz, "public", "pdf.worker.min.mjs");

mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origen, destino);
console.log("pdf.worker.min.mjs copiado a public/ (self-hosted)");
