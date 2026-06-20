# UCA · Economía — Changelog v2 → v6.2

---

## v2 — Diseño real + interactividad completa
- Rediseño completo desde cero: tipografía Inter Black, paleta navy/ocre/canvas, espaciado real
- Countdown de inicio con segundos en vivo (tick cada 1s)
- Timer Pomodoro con anillo SVG animado y tick real basado en `Date.now()` (sin drift)
- Métricas: gráfico Recharts de horas vs meta + sliders de preparación subjetiva
- Calendario custom con días de examen resaltados en dorado y modal de edición de hora
- Página de configuración para editar fechas y metas de materias
- Persistencia con localStorage (sin DB, datos en el navegador)
- Transiciones de página con Framer Motion (fade + slide)

---

## v3 — Persistencia real en la nube (Vercel KV / Upstash)
- Reemplazado localStorage por Vercel KV (Redis): datos persisten al cerrar y entre dispositivos
- API route `/api/db` unificada (GET + POST) con merge delta para sumar minutos sin pisar datos
- Hook `useData` reactivo: escucha evento `uca_update` y re-renderiza todas las páginas al cambiar datos
- Fix bug crítico: `addMinutos` en modo delta ahora suma al acumulado sin borrar otras materias

---

## v4 — Nuevas funcionalidades
- **Timer**: modos Foco (25min custom), Corto (5min), Largo (15min), Custom libre. Alarma sonora vía Web Audio al completar. Guardado automático al cumplirse el tiempo sin tocar ✓
- **Configuración**: agregar y quitar materias desde la UI (botón + y botón × con confirmación)
- **Semestres**: nueva ruta `/semestre` para archivar el semestre actual con nombre, guardar métricas históricas y ver el historial expandible
- **TTS**: soporte para subir PDF y Word (.docx) — extracción de texto en el cliente con pdfjs-dist y mammoth. Botón de descarga MP3 del audio generado (ElevenLabs)

---

## v5 — Reorganización y Calendario de plan de estudio
- **Configuración integrada en Semestres**: eliminada página `/configuracion` separada, todo en `/semestre`
- **Grid 3 columnas**: tarjetas de materias en 3 columnas en desktop (1 en mobile, 2 en tablet)
- **Semestre activo**: card muestra solo 3 KPIs: horas estudiadas, materia más estudiada, cantidad de materias
- **Numeración automática**: semestres se nombran "Semestre 1", "Semestre 2"… sin pedirle nombre al usuario
- **Sin preparación en historial**: campo preparación media quitado del semestre archivado (no tiene sentido post-examen)
- **Calendario — plan de estudio**: barras verticales de ancho fijo (10px) en el borde izquierdo de cada celda, una franja de color por materia planeada. Fondo dorado de examen se mantiene con las barras encima. Click en cualquier día abre modal con chips/checkboxes de materias. Leyenda de 8 colores debajo del calendario
- **planEstudio** guardado en KV como `Record<YYYY-MM-DD, materiaId[]>`

---

## v5.1 — Fixes de UX y reorganización de Semestres
- Orden de secciones en `/semestre`: Materias y fechas → Guardar → Zona peligrosa → Semestre activo → Historial
- Título "Materias y fechas" con mismo peso tipográfico que "Semestres"
- Dots de examen restaurados en el calendario (w-1 h-1, pequeños en mobile)
- Fix barras de plan: ancho fijo en 10px independientemente de cuántas materias haya en ese día

---

## v5.2 — Confirmaciones y zona peligrosa mejorada
- **Zona peligrosa — 2 botones separados**: "Borrar horas estudiadas" (borra sesiones y preparación) y "Limpiar plan de estudio" (borra el calendario de plan). Cada uno con confirm inline (Sí / No) antes de ejecutar
- **Eliminar materia con confirmación**: el botón × muestra "Sí / No" inline antes de borrar
- Redirect de `/configuracion` → `/semestre` para no romper links viejos

---

## v6 — Exámenes pasados, TTS nativo y mejoras visuales
- **Calendario**: exámenes pasados con fondo dorado al 25% de opacidad y texto tenue. Día actual marcado con puntito dorado en esquina (sin marco invasivo)
- **TTS reemplazado**: eliminado ElevenLabs (limitado y de pago). Nuevo TTS con Web Speech API del navegador: gratis, sin límite de texto, sin servidor, sin API key. Funcionalidades: escuchar, pausar, reanudar, detener, barra de progreso por palabras, selector de voz en español, control de velocidad 0.5×–2×. Subir PDF o Word igual que antes. En Chrome: botón "Escuchar y grabar MP3" usando MediaRecorder. En Safari: solo escuchar (limitación del sistema)
- **Tarjetas de materias**: fondo blanco, borde sutil, sombra doble de dos capas — más aireadas y con profundidad

---

## v6.1 — Fixes de mobile y timer persistente
- **Timer persistente al navegar**: al arrancar guarda en localStorage el modo, materia, duración y `Date.now()`. Al volver a la página Timer calcula el tiempo real transcurrido y continúa. Al frenar o reiniciar borra el snapshot. Aviso "El timer sigue aunque cambies de página" mientras corre
- **Métricas — fix bug barras invertidas**: materias cuyo examen ya pasó no muestran barra de meta (que causaba confusión con valores aparentemente invertidos). Solo se muestra la barra de horas reales, en navy suave. Tooltip indica "Examen rendido"
- **Métricas mobile**: labels de KPIs en `text-[10px]` en mobile para que entren sin desbordarse en iPhone 13
- **Semestre activo mobile**: grid con `min-w-0` y `text-[10px]` en labels para que "Materias" no se superponga
- **TTS**: nota de Safari siempre visible junto a la nota de Chrome, misma tipografía
- Puntito dorado hoy solo aparece en días sin examen (para no redundar sobre el dorado)

---

## v6.2 — Fecha examen en mobile, favicon, confirmación cierre semestre y notas
- **Fecha examen en mobile**: reemplazado `datetime-local` (iOS lo renderiza mal) por dos inputs separados `type="date"` + `type="time"` con layout `flex` — encuadra bien en cualquier iPhone, tanto en tarjetas como en modal del calendario
- **Confirmación cerrar semestre**: "Cerrar semestre →" ahora muestra confirmación inline (¿Cerrar Semestre N? + Sí / No) sin modal, sin tocar el diseño del botón
- **Favicon**: `icon.svg` con la U sobre fondo navy en ocre, reconocido automáticamente por Next.js 14 para pestaña del navegador y bookmarks
- **Notas rápidas en calendario**: sección al final del calendario. Input con efecto inset sutil (sombra 3D hacia adentro). Máximo 144 chars con contador regresivo. Enter o botón + para guardar. Lista de notas una por fila con × para borrar (aparece en hover). Guardado en KV
