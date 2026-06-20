# UCA · Economía — Contexto del proyecto

App web académica personal para gestionar el primer semestre de Economía (UCA Buenos Aires). Next.js 14 App Router, deployada en Vercel, datos persistidos en Vercel KV (Upstash Redis).

## Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Framer Motion (animaciones/transiciones)
- Recharts (gráfico de métricas)
- Vercel KV / Upstash Redis (persistencia, vía `@vercel/kv`)
- pdfjs-dist + mammoth (lectura de PDF/Word en TTS, client-side)
- Web Speech API nativa del navegador (TTS — sin servidor, sin costo, sin límite)

## Arquitectura de datos
Una sola key en KV: `uca_data`, tipo `AppData` (`app/lib/types.ts`):
```ts
type AppData = {
  materias: Materia[];              // nombre, examen (ISO), metaHoras
  sesiones: Record<string, number>; // materiaId -> minutos estudiados
  preparacion: Record<string, number>; // materiaId -> 0..100
  semestres: SemestreArchivado[];   // historial archivado
  planEstudio: Record<string, string[]>; // "YYYY-MM-DD" -> materiaId[]
  notas: string[];                  // notas rápidas del calendario
}
```

Todo pasa por `/api/db` (GET trae todo, POST hace merge parcial). El cliente (`app/lib/api.ts`) tiene funciones específicas: `saveMaterias`, `addMinutos` (suma delta, no reemplaza), `savePreparacion`, `resetHoras`, `clearPlanEstudio`, `savePlanEstudio`, `saveNotas`, `archivarSemestre`.

`app/lib/useData.ts` es el hook reactivo: todas las páginas lo usan, se sincronizan vía evento pub/sub interno (`subscribe`/`notify` en `api.ts`) — al guardar algo en cualquier página, todas las demás se actualizan sin recargar.

## Rutas
- `/` — countdown del próximo examen + lista de materias
- `/timer` — Pomodoro (custom) + Cronómetro. Persiste en localStorage (`uca_timer_v2`) para sobrevivir navegación entre páginas. Alarma sonora (Web Audio API) al completar pomodoro
- `/metricas` — gráfico horas vs meta (Recharts) + sliders de preparación subjetiva. Materias con examen rendido no muestran barra de meta (solo horas reales)
- `/calendario` — grilla mensual, exámenes en dorado (semitransparente si ya pasaron), plan de estudio como barras de color de ancho fijo (10px) por materia en el borde izquierdo de cada celda, notas rápidas al final (máx 144 chars)
- `/semestre` — fusiona configuración de materias (agregar/quitar/editar fecha y meta) + cierre de semestre (archiva y numera automático) + historial expandible
- `/tts` — lectura de texto/PDF/Word vía Web Speech API. Pausa/reanuda/detiene, selector de voz español, velocidad ajustable. En Chrome graba MP3 (MediaRecorder + getDisplayMedia), en Safari solo escucha
- `/configuracion` — redirect a `/semestre` (ruta vieja, mantenida por compatibilidad)

## Reglas de diseño — NO ROMPER
- Paleta: navy `#0B1F4D` (texto/estructura), ocre `#C9A227` (acentos/CTA), canvas `#F5F4F0` (fondo)
- 8 colores fijos para materias en plan de estudio (`COLORES_MATERIAS` en `types.ts`): `#6B9FD4 #7BC47F #E07B6B #B088C9 #E8A838 #5BB8B0 #D4956A #8FA86E`
- Tipografía Inter, títulos en `font-black` con `letterSpacing: -0.03em a -0.04em`, tamaños `clamp()`
- Sin layouts tipo dashboard con cards dispersas — un foco visual por vista
- Transiciones con Framer Motion, sin rebotes exagerados
- En mobile: inputs de fecha SIEMPRE separados en `type="date"` + `type="time"` (datetime-local rompe en iOS Safari)
- Acciones destructivas (zona peligrosa, eliminar materia, cerrar semestre): SIEMPRE confirmación inline (Sí/No), nunca ejecución directa

## Deploy
- Vercel, conectado a GitHub (`janoBordo/uca-economia`, branch `main`)
- Env vars en Vercel: las de Vercel KV (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc.) — auto-generadas al crear la integración Upstash desde el dashboard de Storage
- No requiere ninguna API key externa (TTS es 100% client-side con Web Speech API)

## Historial de versiones
Ver `CHANGELOG.md` en la raíz para el detalle completo v2 → v6.2.

## Preferencias del usuario (Jano)
- Respuestas directas, sin relleno, estilo informal argentino
- Prioriza simplicidad de deploy — evitar agregar servicios/API keys externas si hay alternativa gratis sin config
- Cambios de diseño: pedir que no se rompa lo que ya funciona visualmente, iterar sobre lo existente
