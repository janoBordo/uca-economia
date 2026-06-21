# UCA · Economía — Estado del proyecto

Este es el ÚNICO documento de contexto. Cada vez que se hace un cambio (nueva versión: 6.3, 6.4, 7.0, lo que sea), se agrega una entrada nueva ARRIBA DE TODO, debajo de este encabezado, con el formato de abajo. La entrada más reciente = el estado actual de la app. Nunca se borran entradas viejas — quedan como historia debajo.

**Regla para Claude Code**: al terminar cualquier cambio que el usuario pida, ANTES de dar la tarea por terminada, agregar una entrada nueva acá arriba con el changelog de qué cambió Y, si corresponde, actualizar la sección "ESTADO ACTUAL" más abajo para que siga reflejando la realidad (stack, hosting, servicios externos, modelo de datos). Esto incluye cambios de infraestructura: si se migra de Vercel a otro hosting, de Vercel KV a Supabase, se compra un dominio, se agrega login, etc. — todo eso se documenta acá, no solo cambios visuales.

---

## Versión actual: v8
Ver changelog completo abajo. Cambios clave: **rebrand a stuniv** (logo, favicon, título), nav sin "Inicio" (logo → home), fix TTS en iPhone, fix legibilidad confirmaciones rojas en Vidrio, fix overflow mobile al agregar materia, y **performance** (cache cliente con TTL + menos re-renders). Cambios clave: **sistema Liquid Glass completo** (material centralizado + primitivos React `Glass*` en todas las vistas, toggle Clásico 2D ↔ Vidrio en Inicio), Matriz de Confianza (radar) en Métricas, y **feedback de hover** en ambos modos (escala/elevación/brillo en botones, "encendido" del cristal en cards).

---

## Versión 6.2 — (última conocida al migrar a Claude Code)
Ver detalle completo de v2 a v6.2 en la sección "Historia completa" al final de este archivo.

---

# ESTADO ACTUAL (se reescribe cada vez que algo de esto cambia)

## Qué es
**stuniv** (marca de la app web; el repo sigue llamándose `uca-economia`). App personal de Jano (estudiante de Economía, UCA Buenos Aires, primer año) para gestionar el semestre: fechas de examen, horas de estudio, plan diario, lectura de apuntes en voz. El claim "Tu futuro. Tu camino." del manual de marca NO se usa en la app.

## Infraestructura (ESTO PUEDE CAMBIAR — mantener actualizado)
- **Hosting**: Vercel
- **Repo**: GitHub `janoBordo/uca-economia`, branch `main`
- **Base de datos**: Vercel KV (Upstash Redis), una sola key `uca_data`
- **Dominio**: el que da Vercel por defecto (sin dominio propio comprado)
- **Auth/login**: no tiene — uso personal de un solo usuario, sin cuentas
- **Servicios externos pagos**: ninguno

## Stack técnico
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Framer Motion (animaciones)
- Recharts (gráfico de barras de métricas + radar "Matriz de Confianza")
- pdfjs-dist + mammoth (lectura PDF/Word en TTS)
- Web Speech API nativa del navegador (TTS, sin servidor ni costo)

## Temas visuales (desde v7 / sistema Liquid Glass en v7.1)
- Dos modos: **Clásico 2D** (default, look de siempre) y **Vidrio 3D / Liquid Glass**.
- Se cambia con el toggle al final de la home (`app/components/ThemeToggle.tsx`, usa `GlassTabs`).
- Preferencia guardada en `localStorage` key `uca_theme` ("normal" | "glass") — NO va a la DB.
- Script anti-flash en `layout.tsx` aplica el tema antes del primer paint.
- **Sistema de material** (v7.1): el material Liquid Glass vive centralizado en `globals.css` bajo `html[data-theme="glass"]` (tokens `--gl-*` + cobertura de cards, botones, inputs, selects, textarea, tabs, paneles, modales y header). Transparencia real, blur fuerte, borde de cristal, reflejo gloss (`::before`), glow de color y profundidad flotante. Calibrado ~70% de las referencias.
- **Primitivos React** (`app/components/glass.tsx`): `GlassCard`, `GlassPanel`, `GlassButton`, `GlassInput`, `GlassSelect`, `GlassTextarea`, `GlassModal`, `GlassTabs`. Son wrappers finos sobre `framer-motion` que sólo agregan la clase marcadora `.glass-*` y reenvían props/animaciones/ref. En modo Clásico no agregan estilos → look idéntico al actual. Todas las vistas usan estos primitivos.

## Modelo de datos (`app/lib/types.ts` → `AppData`)
```ts
type AppData = {
  materias: Materia[];                    // nombre, examen (ISO), metaHoras
  sesiones: Record<string, number>;       // materiaId -> minutos estudiados
  preparacion: Record<string, number>;    // materiaId -> 0..100
  semestres: SemestreArchivado[];         // historial archivado
  planEstudio: Record<string, string[]>;  // "YYYY-MM-DD" -> materiaId[]
  notas: string[];                        // notas rápidas del calendario
}
```
Todo pasa por `/api/db` (GET trae todo, POST hace merge parcial). **Cache cliente** (`app/lib/api.ts`): cache en memoria con TTL de 15s + dedupe de requests concurrentes, así navegar entre páginas no re-pega a `/api/db` cada vez (las escrituras refrescan el cache al instante). El nav NO tiene "Inicio" — al inicio se llega tocando el logo.

## Rutas actuales
- `/` — countdown próximo examen + lista de materias
- `/timer` — Pomodoro + Cronómetro, persiste en localStorage al navegar
- `/metricas` — horas vs meta + sliders de preparación
- `/calendario` — grilla mensual, exámenes, plan de estudio, notas rápidas
- `/semestre` — config de materias + cierre/archivo de semestres + historial
- `/tts` — lectura de texto/PDF/Word por voz
- `/configuracion` — redirect a `/semestre` (legacy)

## Reglas de diseño fijas
- Paleta: navy `#0B1F4D`, ocre `#C9A227`, canvas `#F5F4F0`
- 8 colores fijos para materias: `#6B9FD4 #7BC47F #E07B6B #B088C9 #E8A838 #5BB8B0 #D4956A #8FA86E`
- Tipografía Inter, títulos `font-black`, un foco visual por vista, sin dashboards saturados
- Mobile: fechas SIEMPRE como `type="date"` + `type="time"` separados (nunca `datetime-local`)
- Acciones destructivas: SIEMPRE confirmación inline (Sí/No)

## Cómo le gusta trabajar a Jano
Directo, sin relleno. Decisiones técnicas en una línea, no preguntar de más. Evitar servicios pagos o API keys nuevas si hay alternativa gratis. Avisar antes de cambios grandes de infraestructura (cambiar de hosting, de DB, agregar login) — eso no se decide solo.

---

# Historia completa (de vieja a nueva, no se borra nunca)

### v2
Rediseño completo: tipografía Inter Black, paleta navy/ocre/canvas. Countdown en vivo, timer Pomodoro con anillo SVG, métricas con Recharts, calendario custom, configuración de fechas. Persistencia en localStorage.

### v3
Persistencia en la nube: localStorage → Vercel KV (Upstash). API `/api/db` unificada. Fix bug: sumar minutos sin pisar otras materias.

### v4
Timer con 4 modos + alarma sonora + guardado automático. Agregar/quitar materias desde la UI. Página de semestres con archivo histórico. TTS con soporte PDF/Word y descarga MP3 (ElevenLabs).

### v5
Configuración fusionada en Semestres. Grid 3 columnas desktop. Semestre activo con 3 KPIs. Numeración automática de semestres. Calendario: barras de plan de estudio por materia (8 colores fijos), modal con checkboxes.

### v5.1
Reordenado `/semestre`: Materias y fechas → Guardar → Zona peligrosa → Semestre activo → Historial. Dots de examen restaurados en calendario. Barras de plan con ancho fijo.

### v5.2
Zona peligrosa con 2 botones separados (borrar horas / limpiar plan) con confirmación inline. Eliminar materia con confirmación. Redirect `/configuracion` → `/semestre`.

### v6
Exámenes pasados semitransparentes en calendario. TTS reemplazado: ElevenLabs → Web Speech API (gratis, sin límite, sin servidor). Pausa/reanuda/detiene, selector voz, velocidad, grabación MP3 en Chrome. Tarjetas de materias con sombra y profundidad.

### v6.1
Timer persiste al navegar entre páginas (localStorage). Fix bug métricas: materias rendidas no muestran meta invertida. KPIs mobile más chicos (iPhone 13). Nota Safari en TTS.

### v6.2
Fecha examen en mobile: `datetime-local` → `date` + `time` separados (fix iOS). Confirmación inline para cerrar semestre. Favicon con la U navy/ocre. Notas rápidas en calendario (máx 144 chars, efecto inset sutil).

### Migración a Claude Code
Se migró el desarrollo de claude.ai (chat web) a Claude Code, trabajando directo sobre el repo local conectado a GitHub/Vercel. Este archivo (`PROYECTO.md`) reemplaza la necesidad de releer conversaciones pasadas — es la fuente de verdad única y acumulativa.

<!-- A partir de acá, cada nueva versión agrega su entrada DEBAJO de esta línea, en orden cronológico -->

### v8 — Rebrand stuniv + fixes + performance
**Branding**
- Rebrand de "UCA · Economía" a **stuniv** (la marca de la app web; el repo sigue siendo `uca-economia`). Nav: logo isotipo "s." (s blanca + punto azul `#009CDE`) y texto "stuniv."; `<title>` → "stuniv". Favicon (`app/icon.svg`) cambiado al isotipo stuniv. El claim "Tu futuro. Tu camino." nunca va en la app.
- **Nav sin "Inicio"**: se quitó el link; a la home se llega tocando el logo (que ya linkea a `/`).

**Bug fixes**
- **TTS no sonaba en iPhone**: workarounds de iOS Safari en `hablar()` — voz robusta (sólo se asigna si existe en la lista; si no, default del sistema), estado `leyendo` optimista (en iOS `onstart` puede no dispararse), y `speechSynthesis.resume()` tras `speak()` (iOS lo deja en "pausado"). Nota agregada sobre el switch de silencio del iPhone. En compu seguía andando; esto apunta a mobile.
- **Confirmaciones rojas ilegibles en Vidrio**: el "Sí" (`bg-red-500 text-white`) lo pisaba el material glass (fondo blanco translúcido → texto blanco invisible). Se exceptuaron `.bg-red-500/600` como tinte rojo legible (`--gl-red` 0.30 → 0.82) + text-shadow. Afecta "borrar materia", "borrar horas", "limpiar plan".
- **Overflow mobile al agregar materia**: los inputs `date`/`time` nativos de iOS no respetaban `width:100%` y reventaban el card. Fix: `appearance-none` + `min-w-0` en los inputs y `min-w-0` en los items del grid (evita el blowout del grid).

**Performance** (sin tocar nada visual ni de uso)
- **Cache cliente con TTL** (`app/lib/api.ts`): cache en memoria 15s + dedupe de requests concurrentes (`inFlight`). Navegar entre páginas sirve del cache en vez de pegarle a `/api/db` cada vez → se va la sensación "dial-up". Las escrituras (`patch`) refrescan el cache al instante.
- **Menos re-renders en la home**: las filas de "Todas las materias" tickeaban cada 1s (9 timers, 9 re-render/seg) pero sólo muestran minutos → pasaron a 60s. El countdown grande sigue a 1s. Cero cambio visual.
- **Lo que NO se hizo (y por qué)**: paginación, auth, colas en background, load testing → son de backends multiusuario con base relacional grande; stuniv es de un solo usuario con una sola key en Vercel KV, no aplican. Skeleton loaders → implicarían UI nueva (el pedido era no cambiar nada visual). **Race condition celu↔compu** (modificar el mismo dato en 2 dispositivos a la vez): real, pero la solución de fondo (migrar a Supabase/Postgres con updates atómicos por fila) es un cambio grande de infraestructura → queda como recomendación pendiente, no se decide solo.

### v7.2.1 — Calibración de color en Vidrio 3D
Los botones navy en modo Vidrio se veían demasiado "slate gris" / apagados. Causa: a 0.60 de opacidad, el fondo claro atravesaba el tinte y lo desaturaba, sumado al gloss blanco fuerte encima.
- **Tinte navy 0.60 → 0.74** (ocre 0.62 → 0.70): recupera color sin perder la translucidez del vidrio.
- **Gloss más tenue sobre cristal de color** (`::before` con menos blanco en `.bg-navy`/`.bg-ocre`): el velo blanco fuerte los grisaba; con menos blanco el navy/ocre se leen más vivos.

### v7.2 — Hover interactivo + botones más "liquid glass"
- **Feedback de hover en ambos modos** (`@media (hover:hover)`, sólo con mouse real para no dejar estados pegados en touch): botones/pills (`.rounded-full`) crecen (`scale 1.06`), se elevan y se aclaran (`brightness`), y se hunden al click (`scale .95`). En modo Vidrio, las cards se "encienden" al pasar el mouse (borde más brillante, más saturación, sombra más profunda); los botones de acento navy/ocre intensifican su glow de color. En Clásico 2D las cards ganan sombra/borde. El `scale` se limita a pills y al primitivo `GlassButton` (vía `whileHover`) para no recortar botones full-width ni pelear con el `transform` inline de framer-motion.
- **Botones de vidrio más translúcidos (liquid glass real)**: los tintes pasaron de opacidad alta (navy 0.88 / ocre 0.80, que se veían como "navy opaco 3D") a translúcidos (`--gl-navy 0.60`, `--gl-ocre 0.62`) con más frost (blur 16px) y gloss. Para no perder legibilidad (la razón por la que en v7.1 estaban tan opacos), se agregó `text-shadow` sutil al texto sobre cristal de color.

### v7.1 — Sistema Liquid Glass completo
Se reemplazó el glass "pegado" por un **sistema de material coherente** aplicado a TODA la UI (cards, botones, inputs, selects, textarea, tabs, paneles, modales, métricas, header).
- **Material centralizado** en `globals.css` (`html[data-theme="glass"]`, tokens `--gl-*`): transparencia real (los sólidos navy/ocre pasan a tintes translúcidos), backdrop-blur fuerte (22px), borde de cristal brillante, reflejo especular (gloss `::before` detrás del texto), glow de color con la paleta y profundidad flotante. Calibrado ~70% de las referencias de Pinterest.
- **Primitivos React reutilizables** (`app/components/glass.tsx`): `GlassCard`, `GlassPanel`, `GlassButton`, `GlassInput`, `GlassSelect`, `GlassTextarea`, `GlassModal`, `GlassTabs`. Wrappers finos sobre `framer-motion` que conservan props/animaciones/ref; el modo Clásico 2D queda idéntico.
- **Migración de las 7 vistas** a los primitivos: Inicio/ThemeToggle, Timer, Métricas, Calendario, Semestres, Lectura.
- Mantiene paleta, layout, estructura y funcionalidad: sólo cambia el material visual.
- **Fixes de legibilidad/performance**: el selector maestro del material usa `:where()` (especificidad 0) para que los tintes navy/ocre SIEMPRE ganen — esto arregla el blanco-sobre-blanco en botones y hace que los días de examen se vean dorados glass. Barras de "materias a estudiar" del calendario como varillas de vidrio (`.glass-plan-bar`). Logo U navy sólido y nítido (`.glass-solid`). Inputs más redondeados (14/18px). Performance: blur bajado a 12px, celdas del calendario sin `backdrop-filter` (lo caro cuando hay ~35), sin `background-attachment:fixed`.

### v7
Dos cambios grandes.
- **Modo Vidrio 3D (liquid glass)**: nuevo toggle "Clásico 2D / Vidrio 3D" al final de Inicio. El modo Vidrio hace los fondos **semitransparentes** (los sólidos `bg-navy`/`bg-ocre` pasan a 0.80 para verse "de vidrio" conservando el tono) y agrega frost (blur), borde brillante (rim), reflejo gloss diagonal (pseudo-elemento `::before` detrás del texto con `isolation`+`z-index:-1`), gloss superior/inferior, halo de color bajo botones de acento y sombra flotante 3D. Aplica a cards (`rounded-2xl/3xl`) y botones/pills (`rounded-full`) de TODAS las páginas. Clave: el `backdrop-filter` sólo se ve si el fondo es translúcido — por eso la versión sólida no se veía de vidrio. Implementado con `data-theme="glass"` en `<html>` + CSS global scopeado en `globals.css`, preferencia en `localStorage` (`uca_theme`), y script anti-flash en el layout. Nuevo componente `app/components/ThemeToggle.tsx`. Mantiene paleta y formas.
- **Matriz de Confianza (radar) en Métricas**: gráfico de radar minimalista que muestra la preparación subjetiva por materia (mismos datos que los sliders). Polígono navy = confianza actual; polígono punteado = umbral "sólido" (70). Puntos de color por materia en cada eje + tooltip con nombre completo. Va arriba de los sliders de Preparación subjetiva.

### v6.3
- **Timer**: círculo del cronómetro era una cadena de puntos (`strokeDasharray="12 8"`) → ahora es círculo sólido dorado igual al Pomodoro.
- **Métricas**: barras del gráfico cambiadas de agrupadas (lado a lado) a apiladas (`stackId="a"`): horas estudiadas abajo (ocre/navy) + restante hasta meta arriba (gris). Elimina la mezcla visual entre ambas. Esquinas de barras con radio sutil `[4,4,0,0]`.
- **Tooltip métricas**: corregido para mostrar horas reales estudiadas (antes tomaba `payload[0]` que era el campo `meta`).
- **Home**: cuando todos los exámenes ya pasaron ya no cae en `orden[0]` mostrando un examen rendido como próximo — muestra "Sin exámenes próximos / Anotá nuevas fechas cuando las tengas" y la lista de materias abajo.
