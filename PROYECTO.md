# UCA · Economía — Estado del proyecto

Este es el ÚNICO documento de contexto. Cada vez que se hace un cambio (nueva versión: 6.3, 6.4, 7.0, lo que sea), se agrega una entrada nueva ARRIBA DE TODO, debajo de este encabezado, con el formato de abajo. La entrada más reciente = el estado actual de la app. Nunca se borran entradas viejas — quedan como historia debajo.

**Regla para Claude Code**: al terminar cualquier cambio que el usuario pida, ANTES de dar la tarea por terminada, agregar una entrada nueva acá arriba con el changelog de qué cambió Y, si corresponde, actualizar la sección "ESTADO ACTUAL" más abajo para que siga reflejando la realidad (stack, hosting, servicios externos, modelo de datos). Esto incluye cambios de infraestructura: si se migra de Vercel a otro hosting, de Vercel KV a Supabase, se compra un dominio, se agrega login, etc. — todo eso se documenta acá, no solo cambios visuales.

---

## v10.5 — GET /api/db en 1 round-trip: verificación local del JWT + revocación en la base (branch `main`)

El "escalón 4" del plan de escalado, implementado ahora que es gratis hacerlo: el endpoint más caliente de la app deja de pagar el round-trip a Supabase Auth en cada request **sin aflojar ninguna garantía auditada** (la restricción que en v10.4 hizo descartar la versión ingenua de esta idea).

**El problema**: `GET /api/db` hacía `getUser()` (ida y vuelta al Auth server, ~30-40ms en gru1 y carga sobre Auth) + 5 queries paralelas a PostgREST. Verificar el JWT localmente ahorra ese round-trip, pero abría una ventana de ≤15 min para sesiones **revocadas** (logout / cambio de contraseña / cuenta eliminada) — y la suite e2e de Fase 2 verifica explícitamente "cookies viejas post-logout → 401 inmediato" y "GET /api/db con cookies viejas → 401".

**La solución (misma garantía, cero round-trip extra)**:
- **Migración `0003_get_app_data_y_sesion_viva.sql`**: RPC `get_app_data(p_full)` (SECURITY INVOKER — todo pasa por las políticas RLS de 0001/0002) que arma el `AppData` completo en **una sola llamada** y ANTES valida: (1) que la **sesión del JWT siga viva en `auth.sessions`** — la misma tabla que consulta getUser(); logout/cambio de contraseña/delete borran esa fila, así que corta al instante — y (2) que el **perfil no esté soft-deleted** (matriz de acceso: usuario eliminado = nada). Si algo falla lanza `sesion_revocada` → la ruta lo mapea a 401. Helper `sesion_viva(uuid)` SECURITY DEFINER mínimo (uuid→boolean, `search_path` vacío) porque `authenticated` no puede leer `auth.sessions`.
- **`app/lib/supabase/verificar.ts`** (nuevo, edge-safe): `usuarioVerificado()` verifica la firma del JWT **localmente** con `getClaims()` + JWKS ES256 cacheado a nivel módulo (el proyecto ya firmaba con clave asimétrica desde el 2026-07-11). Exige `role=authenticated` + `sub` + `session_id`. Ante CUALQUIER duda (JWKS caído, algoritmo viejo, error raro) cae en **fallback a `getUser()`** — nunca menos seguro.
- **`app/api/db/route.ts`**: GET = verificación local + RPC (2 round-trips → **1**). POST **mantiene `getUser()`** (escrituras = vara máxima) y su relectura final pasa de 5 queries a 1 RPC. `sesion_revocada` → 401 en ambos.
- **`app/api/account/delete/route.ts` endurecido** (hallazgo del nuevo test): con `Authorization: Bearer` el `signOut global` del cliente no aplicaba (sin sesión en storage) y las filas de `auth.sessions` quedaban vivas (el 401 lo daba solo el ban). Ahora, si el signOut falla, se revoca por **admin** con el token del request — las sesiones mueren en la base también por esta vía.
- **Sin cambios**: middleware (la suite de Fase 2 testea "volver a / con cookies viejas → redirect a /login", así que sigue con `getUser()`), `/api/account/*`, `/api/auth/*`, `/api/tts`. Cero cambios visuales/funcionales.

**Verificación**: build en verde; suite **nueva** `scripts/test-revocacion-e2e.mjs` 7/7 PASS (logout con cookies → `/api/db` 401 INMEDIATO con token aún válido; eliminar cuenta vía Bearer → 401 INMEDIATO); suite Fase 3 re-corrida **33/33 PASS** (el RPC replica el contrato del getData viejo exacto: orden de materias, formato de examen, `?full=1`, archivar, aislación A/B). Verificación en producción al final de esta entrada.

**Impacto en capacidad**: cada GET de datos pasa de 2 round-trips + 5 queries a **1 round-trip + 1 query** → menos latencia percibida (~50-80ms → ~30-40ms por GET), ~5x menos statements sobre Postgres y sin carga sobre el Auth server en el hot path. El techo gratis sigue siendo Vercel (~1.300 activos/día — las invocaciones no cambian), pero el compute de Supabase deja de ser el próximo cuello: en los planes pagos el techo por compute sube ~3x (ver tabla de escalones en el mensaje de cierre de esta versión).

---

## v10.4.1 — Mails por Gmail SMTP (registros 90 → ~450/día) (branch `main`)

Jano configuró el SMTP custom de Supabase con **Gmail directo** (`smtp.gmail.com:587`, user `soporte.stuniv@gmail.com`, App Password de Google) reemplazando a SendGrid. Con eso los mails de confirmación/OTP salen de Gmail de verdad (SPF/DKIM alineados → inbox, no spam) y el cupo pasa de 100/día (SendGrid free) a **~500/día** (límite de Gmail para cuentas gratis).

- **Cero cambios de código**: los mails los manda Supabase server-side con el SMTP configurado; la app solo llama a `signUp`/`recover`. Verificado por Management API que la config quedó tomada (`smtp_host: smtp.gmail.com`) y **probado con un envío real** (invite admin a `janobordo+smtptest@gmail.com` → enviado OK por el SMTP nuevo; el user de prueba se borró al toque).
- **`rate_limit_email_sent` 30/h → 50/h** (vía Management API): el 30/h protegía los 100/día de SendGrid; con ~500/día de Gmail conviene aguantar picos de registro más grandes. Sigue siendo un freno anti-abuso del cupo diario (Turnstile + rate limit de signup 8/h/IP siguen igual).
- **Números de registro actualizados**: ~**450 registros/día** (~3.000/semana), dejando margen para OTP de recuperación dentro de los 500. El "Minimum interval per user" de 60s del SMTP no afecta registros distintos (es por destinatario).
- Nota: la advertencia del dashboard de Supabase ("designed for personal rather than transactional email") es esperable — es el trade-off elegido a propósito: gratis y a inbox hoy; el paso serio siguiente es dominio propio + SES/Resend (ver plan de pagos en v10.4).

---

## v10.4 — Optimización de capacidad y fluidez, todo en planes gratis (branch `main`)

Auditoría completa de consumo de los 5 servicios (Vercel Hobby, Supabase Free, Upstash free, Turnstile, SendGrid free) + optimización para aguantar la mayor cantidad de usuarios sin salir del tier gratis. **Cero cambios visuales/funcionales y la seguridad auditada intacta** (mismo `getUser()` server-side en todas las rutas, mismos rate limits de seguridad fail-closed en Redis, CSP incluso más estricta).

**Lo que encontró la auditoría (medido contra la config real por API):**
- Las funciones corrían en **iad1 (Washington DC)** con Supabase y Upstash en `sa-east-1` (São Paulo) y los usuarios en Argentina: cada API call cruzaba el continente 2-3 veces → **~400-600ms por request**. Era LA causa de la lentitud, no el código.
- El recurso gratis más ajustado no era el egress de Supabase sino los **comandos de Upstash** (500k/mes): cada GET/POST de datos gastaba comandos en el rate limit por IP → techo real ~300-550 activos/día.
- Cada GET de perfil firmaba una **signed URL nueva** del avatar → URL distinta cada vez → el navegador no podía cachear la foto (re-descarga por visita, el ítem más pesado de egress) + 1 llamada a Storage por request.
- Google Fonts como stylesheet externo render-blocking; crawlers sin robots.txt pasando por el middleware (invocación + `getUser` por hit).

**Cambios de infra/config (sin código):**
- **Región de funciones Vercel: `iad1` → `gru1` (São Paulo)** vía API. Latencia de `/api/db` estimada ~500ms → ~50-80ms (funciones al lado de Supabase/Upstash y de los usuarios).

**Cambios de código (6 quirúrgicos):**
- `app/lib/ratelimit.ts`: los limiters que ya eran **fail-open** (`rlDb`, `rlTts` — lectura/escritura general de datos) pasan a **sliding window en memoria por instancia** (mismos límites, misma semántica, verificado el 429 con 125 requests). Los de **seguridad** (login, signup, OTP, contraseña, delete, perfil, avatar) **siguen en Upstash fail-closed, intactos**. Upstash pasa de ser el recurso limitante a gastar comandos solo en flujos de auth.
- `app/lib/api.ts`: TTL del cache cliente 15s → 60s (las escrituras propias siguen refrescando el cache al instante; solo se alarga la ventana de revalidación al navegar → ~3x menos GETs).
- `app/lib/avatar-url-cache.ts` (nuevo) + rutas de perfil/avatar: la signed URL del avatar (que sigue durando 1h — el parámetro de seguridad no cambió) se **reusa ~55min** desde un cache en memoria → misma URL ⇒ el navegador cachea la imagen, menos egress de Storage y una llamada menos por GET de perfil. Se invalida al subir/quitar la foto.
- `app/layout.tsx` + `tailwind.config.ts` + `globals.css`: **Inter self-hosteada con `next/font`** (misma variable font 300-900, cero cambio visual) — sin round-trip a Google Fonts en cada visita y **CSP más estricta** (se quitaron `fonts.googleapis.com` y `fonts.gstatic.com`).
- `middleware.ts` + `public/robots.txt`: robots/sitemap fuera del matcher y robots.txt que permite solo `/login`, `/registro`, `/recuperar` (el resto está tras login igual) → los bots dejan de quemar invocaciones y `getUser`s.
- `next.config.mjs`: Cache-Control largo para `/logos/*` e `icon.svg`.

**Evaluado y DESCARTADO a propósito (por seguridad):** verificación local del JWT (`getClaims` + JWKS ES256, que el proyecto ya tiene activo) habría ahorrado el round-trip a Auth en cada request, pero abre una ventana de ≤15 min en la que una sesión **revocada** (logout, cambio de contraseña, ban) seguiría pasando — y la suite e2e de Fase 2 verifica explícitamente "cookies viejas post-logout → 401 inmediato". La regla es que la seguridad no se afloja: la latencia se resolvió por región, no bajando la vara.

**Capacidad después de esto (techo por servicio, uso mixto realista ~20-25 requests/activo/día):**
| Servicio | Límite free | Techo de usuarios |
|---|---|---|
| Vercel (1M invocaciones + 1M edge requests/mes) | ~33k/día | **~1.300-1.500 activos/día ← el limitante** |
| Supabase egress (5GB/mes) | ~166MB/día | ~4.000 activos/día |
| Upstash (500k comandos/mes) | ~16.6k/día | ya no limita (solo auth: >10.000 activos/día) |
| SendGrid (100 mails/día) | 100/día | **~90 registros/día** (~2.700/mes) ← limita el crecimiento |
| Supabase DB (500MB) / Auth (50k MAU) | — | >25.000 registrados |
| Turnstile (1M/mes) | ~33k/día | no limita |

**Resumen: ~1.300 activos/día · ~4.000 activos/semana · ~10.000 MAU · ~90 registros/día** — antes: ~300-500 activos/día con ~0.5s de latencia por request.

**Pendiente manual recomendado (gratis, lo hace Jano): mails por Gmail SMTP.** SendGrid free son 100/día y encima manda "de @gmail.com" sin SPF/DKIM alineados → spam. Con una **App Password** de `soporte.stuniv@gmail.com` (Google Account → Seguridad → verificación en 2 pasos → Contraseñas de aplicaciones) y el SMTP de Supabase apuntando a `smtp.gmail.com:587` (user = el gmail, pass = la app password), los mails salen de Gmail de verdad: **~500/día y a inbox**. Con eso el techo de registros pasa de ~90 a ~450/día. (El rate `rate_limit_email_sent` de Supabase quedó en 30/h a propósito mientras siga SendGrid: protege la cuota diaria de 100.)

**Verificación:** `npm run build` en verde (27/27, bundles idénticos); suite e2e Fase 3 **33/33 PASS** contra dev local (cubre `/api/db`, perfil y avatar — justo lo tocado); verificado en dev: robots.txt 200 sin middleware, Cache-Control de logos, 307→/login sin sesión, 401 en `/api/db` anónimo, CSP endurecida, Inter self-hosted cargando (`document.fonts`), y el limiter in-memory cortando en 429 tras ~120 req/min. **En producción post-deploy (commit `49c5c4d`)**: `/login` 200 con la CSP nueva, `/` → 307 `/login` sin sesión, `/api/db` → 401 anónimo **respondiendo desde `gru1`** (`X-Vercel-Id: gru1::gru1`), robots.txt 200, Cache-Control de logos activo y los 5 headers de seguridad presentes.

---

## v10.3.5 — Semestre: una card por materia (todas sus fechas) (branch `main`)

En Semestre cada fila de examen se mostraba como una card aparte (una materia con 2 fechas = 2 cards). Ahora `app/semestre/page.tsx` **agrupa por nombre**: una card = una materia, y adentro lista **todas sus fechas de examen** (ordenadas de más próxima a más lejana) + el **total** estudiado (suma de todas sus filas). Renombrar o eliminar afecta a todas las filas de esa materia. La key de la card usa el id de la 1ª fila (estable al renombrar → el input no pierde foco). Los KPIs de "En curso" (Materias / Más estudiada) también cuentan por materia, no por fila.

---

## v10.3.4 — Dominio `stuniv.vercel.app` (branch `main`)

El dominio de la app dejó de ser `uca-economia.vercel.app` y ahora es **`stuniv.vercel.app`**, hecho de forma **no destructiva** (nada de lo que andaba se rompió):

- **Vercel**: se **agregó** `stuniv.vercel.app` como dominio del proyecto `uca-economia` (verificado, sirviendo la misma producción). No se renombró el proyecto ni se sacó `uca-economia.vercel.app` — sigue activo. Hecho vía API con `VERCEL_TOKEN`.
- **Supabase**: `site_url` → `https://stuniv.vercel.app` (los mails de confirmación/recuperación ahora apuntan ahí). El `uri_allow_list` ya incluía ambos dominios + localhost, así que no hubo que tocarlo.
- **Turnstile**: verificado en vivo que el widget **emite token** en `stuniv.vercel.app` (el CAPTCHA acepta el dominio) → login/registro/recuperar funcionan. No hizo falta tocar Cloudflare.
- **Verificación**: en `stuniv.vercel.app` → `/login` 200, `/` 307 a `/login` del mismo host, `/api/db` 401 (protección intacta). `uca-economia.vercel.app` sigue respondiendo igual.

**Redirect (hecho):** `uca-economia.vercel.app` ahora **redirige 308** (permanente, preservando el path) a `stuniv.vercel.app` — el link posta pasa a ser stuniv. Verificado: `uca-economia.vercel.app/login` → 308 → `stuniv.vercel.app/login` (200).

---

## v10.3.3 — Fix sesión mobile + dedup en calendario + nav (branch `main`)

- **Sesión que se perdía en el celular (pedía login cada vez; en PC recordaba):** las cookies de sesión de Supabase se seteaban **sin `maxAge`** → eran cookies de SESIÓN que el navegador borra al cerrarse (la PC las restaura, el celular no). Ahora `hardenCookie` (`app/lib/supabase/server.ts`) y el `harden` del `middleware.ts` les ponen `maxAge` persistente (~400 días, tope de los navegadores) **sin pisar** el `maxAge:0`/`expires` que Supabase manda para borrarlas en el logout (se preserva con `?? `). El logout sigue funcionando.
- **Materia duplicada en el modal del calendario:** los chips de "Estudiar ese día", la leyenda y el dropdown de alta de examen usaban `data.materias` (con las filas duplicadas por varias fechas). Ahora usan `materiasEfectivas` (una por nombre). `colorMap` mapea todas las filas de una materia al mismo color. El listado de exámenes del día (`modalExams`) sigue mostrando cada examen real.
- **Nav (desktop):** las pestañas (Pomodoro, Métricas, etc.) un poco más grandes (`text-[15px]`, más padding) y en hover pasan de `navy/45` a `navy/80` (más opacas/visibles).

---

## v10.3.2 — Fix: métricas cuenta la materia una vez (examen más próximo) (branch `main`)

Corrección de los efectos colaterales de v10.3.1 (una materia con varias fechas se guarda como filas duplicadas con el mismo nombre): en Métricas la materia aparecía dos veces y sumaba las horas de TODOS sus exámenes, y el radar "Matriz de Confianza" quedaba roto (dos ejes con el mismo nombre) y no respondía a los sliders.

- Helper nuevo `materiasEfectivas(materias)` en `app/lib/api.ts`: agrupa por nombre y devuelve **una** entrada por materia = la del examen **más próximo a futuro** (si todos están rendidos, el más reciente; cuando se carga uno nuevo a futuro, pasa a mostrarse ese). Toma en cuenta solo las horas/meta de ese examen (no la suma de todos, como sí hace Semestre a propósito).
- `app/metricas/page.tsx` usa `materiasEfectivas` para el gráfico de horas, el radar y los sliders → cada materia una sola vez y el radar con ejes únicos (vuelve a responder a los sliders).
- `app/page.tsx` (home) también deduplica la lista de materias con el mismo helper.

Sin cambios en la base ni en el modelo.

---

## v10.3.1 — Fix: varios exámenes por materia (branch `main`)

Corrección del flujo de v10.3: como cada `Materia` tiene una sola fecha (`examen`), asignarle una fecha nueva desde el calendario **pisaba** la anterior. Ahora, si la materia **ya tiene un examen en otra fecha**, `agregarExamen` (`app/calendario/page.tsx`) crea una **entrada nueva** (misma materia, otra fecha) en vez de sobreescribir — así una materia puede rendir en varias fechas y conviven todas. Cada examen extra es su propia fila (aparece también en Semestres con su fecha y sus horas). Sin cambios en la base. (Si en el futuro se quiere una sola materia con varias fechas en una fila, eso sí requiere cambio de modelo.)

---

## v10.3 — Más UI + alta de exámenes desde el calendario (branch `main`)

Segunda tanda de UI sobre `main`. Seis cambios:

- **Métricas más prolijas**: en la Matriz de Confianza se quitó el texto de más ("de un vistazo. Cuanto más grande…") y la leyenda (Tu confianza / Umbral sólido) pasó a estar **al lado del título** (no debajo). El gráfico de "Horas por materia" ya no toca los bordes: se le dio padding al panel (`p-4`) y se corrigieron los márgenes del chart (`BarHoras`: `left:-24 → -6`, `top/right/bottom` con aire) para que el "24" del eje Y y las etiquetas inclinadas no queden cortados. Los dos paneles (Horas y Matriz) quedaron **del mismo alto** (`h-80`) para que se vean parejos lado a lado.
- **Apariencia como acordeón** (`app/cuenta/page.tsx`): "Estilo visual" y "Tema de color" ahora son secciones colapsables (flecha que rota), cerradas por defecto → la card queda compacta (mucho más corta que Perfil) y sigue a su lado. Nuevo helper `AccordionRow`.
- **3 universidades nuevas + todos los logos**: UNC (azul), UNR (bordó), Siglo 21 (verde) agregadas a `UNIVERSIDADES` (`app/lib/paleta.ts`) y al mirror `UNI_PALETA` del signup. Se sumaron los 9 SVG que faltaban a `public/logos/` (ITBA, Austral, UAI, UCEMA, Kennedy, USAL + las 3 nuevas) y al mapa `LOGOS` → ahora **17 universidades con logo**. (Las paletas de UNC/UNR/Siglo 21 las elegí por color de marca; se cambian a mano si Jano prefiere otra.)
- **Menú hamburguesa en mobile** (`app/components/Nav.tsx`, reescrito): en `< lg` las pestañas (Pomodoro, Métricas…) dejan de estar en la barra y pasan a un **desplegable hamburguesa** minimalista (ícono que se transforma en X). Eso libera espacio para mostrar **universidad y carrera al lado de la "s."** también en mobile (antes solo en `lg+`). En desktop las pestañas siguen inline. El dropdown usa `rounded-[16px]` (no hereda el material Vidrio).
- **Alta de exámenes movida al calendario** (cambio de flujo):
  - **Semestre** (`app/semestre/page.tsx`) queda solo para **agregar/renombrar materias**: las cards muestran la fecha de examen y las horas estudiadas **como texto** (ya no inputs), el alta pide solo el nombre, y sigue el bloque de "Guardar" + cerrar/archivar semestre. El título pasó de "Materias y fechas" a "Materias".
  - **Calendario** (`app/calendario/page.tsx`): al abrir un día, arriba de **"Estudiar ese día:"** (antes "Plan de estudio") hay un control minimalista "+ Agregar examen" que despliega: elegir materia + horas a estudiar + hora. Se pueden cargar **varios exámenes** el mismo día y cada uno tiene su **× para quitarlo** (con confirmación inline). Quitar un examen vuelve la materia a "sin fecha" (no la borra).
  - **Modelo intacto**: no hizo falta migración — `MateriaSchema.examen` ya aceptaba `""` (→ `NULL` en la base). Una materia sin fecha se maneja en toda la app: en la home la fila muestra "sin fecha" en vez de un countdown roto (`app/page.tsx`).
  - Se excluyó `/logos` del matcher del `middleware.ts` (assets públicos de marca: no deben pasar por auth ni refrescar sesión).

**Verificación**: `npm run build` en verde (27/27, sin errores de tipo ni eslint). En local (`/registro`, pública) se confirmó: las 3 universidades nuevas en el dropdown y los 17 logos sirviendo 200 (SVG). El resto (métricas, cuenta, calendario, semestre, hamburguesa mobile) vive tras el login y Turnstile solo pasa en `*.vercel.app` → **eyeball en el preview de Vercel**. Ojo especial ahí al flujo nuevo del calendario (agregar/quitar examen) y a que las materias sin fecha se vean bien.

---

## v10.2 — UI dinámica + ajustes post-prueba (branch `main`)

Tanda de UI sobre `main` tras seguir usando la app. Seis cambios:

- **Layout responsive de verdad (no "escala como imagen")**: el problema era que cada vista era una **sola columna centrada con `max-w-*` fija** y casi todos los breakpoints eran `sm:` — de 640px para arriba el layout quedaba congelado y al hacer zoom-out todo se encogía sin reacomodarse. Ahora los contenedores crecen escalonado (`max-w-4xl xl:max-w-6xl 2xl:max-w-7xl`, padding `lg:px-12`) y las grillas **suman columnas al haber ancho**: home lista las materias en 2 columnas en `xl`; métricas pone los dos gráficos (Horas por materia + Matriz de Confianza) lado a lado en `xl` y los sliders en 2 columnas desde `lg`; semestre suma `xl:grid-cols-4`; calendario ensancha el mes (celdas más grandes) manteniendo su panel lateral. **Timer y Lectura NO se tocaron** (centrado intencional: dial / lectura legible). Alcance elegido con Jano: mejora acotada y segura, no rearmado total.
- **Cuenta — Seguridad y Eliminar cuenta secundarias**: dejaron de ser cards blancas apiladas con títulos grandes. Ahora son **planas, sin chrome de tarjeta, una al lado de la otra** en una fila al pie (`border-t`, `sm:grid-cols-2`), con título tipo label y texto `text-navy/40` — integradas al fondo, claramente secundarias. Perfil y Apariencia quedan como las dos cards principales arriba. Toda la funcionalidad intacta (form de contraseña colapsable con Turnstile + confirmación inline; eliminar con confirmación inline). "Cerrar sesión" quedó como link discreto centrado.
- **Registro pide perfil + paleta automática al entrar**: el alta ahora pide **Nombre, Apellido, Universidad (mismo dropdown de `/cuenta` + "Otra") y Carrera**. Al elegir la universidad se previsualiza su paleta al instante (mismo `paletaSugerida`+`aplicarPaleta` de `/cuenta`). El backend (`/api/auth/signup`) tras el `signUp` escribe esos campos + `tema_color` en la fila `profiles` (que crea el trigger) vía **admin client** (todavía no hay sesión: falta confirmar el email) — best-effort, un fallo no invalida el alta. Así, al confirmar el mail y loguearse, la app arranca con los colores de su universidad. Mapa universidad→tema espejado server-safe en el route (el módulo `paleta.ts` es `"use client"`).
- **Menos texto de relleno**: se sacaron copys que no aportaban ("JPG, PNG o WebP. Se recorta al centro y se reduce a 256px.", "Se guarda en tu cuenta y viaja entre dispositivos.", "Se sincroniza en todos tus dispositivos.").
- **Fix menú de perfil en Vidrio 3D (PC)**: el dropdown se veía translúcido/cortado en Vidrio (en 2D estaba bien) porque su clase `rounded-2xl` lo hacía adoptar el material glass (fondo `var(--gl-bg)`, blur, `--gl-float`). Se cambió a `rounded-[16px]` (mismo radio, 1rem) que **no matchea los selectores del sistema Vidrio** → queda sólido y bien encuadrado igual que en 2D, sin tocar `globals.css`.
- **Logo de universidad en el nav**: en `Identidad` (nav, desktop), entre la línea divisoria y el texto carrera/universidad, aparece el **logo de la universidad elegida** (`opacity 0.9`). Archivos en `public/logos/` y mapa en `app/lib/paleta.ts` (`logoUniversidad`). Hay logo para UCA, UADE, Udesa, UB, UBA, UTN, UP, UNLP (las que pasó Jano); el resto (ITBA, Austral, UAI, UCEMA, Kennedy, USAL) no muestra logo, como antes.

**Verificación**: `npm run build` en verde (27/27). `/registro` probado en local: renderiza los 4 campos nuevos + dropdown de universidades. El resto (reflujo responsive, logos en el nav, menú en Vidrio 3D, layout de `/cuenta`) vive detrás del login y Turnstile solo pasa en `*.vercel.app`, así que **queda para eyeball en el preview de Vercel** (constraint conocido). El fix del menú es determinista por CSS (misma render que 2D) y la paleta de registro reusa el flujo ya probado de `/cuenta`.

---

## v10.1 — Ajustes post-prueba real de Jano (branch `migracion-v10`)

Primera prueba de la migración con usuario real (Jano se registró, confirmó email y usó la app en el preview). Ajustes que salieron de esa prueba:

- **Preview accesible desde cualquier dispositivo**: el celular mostraba "Log in to Vercel" — era la Deployment Protection de Vercel (SSO exigido en previews). Desactivada vía API (`ssoProtection: null`); verificado con curl sin sesión: `/login` responde 200. Ahora cualquiera puede registrarse desde cualquier dispositivo.
- **Mail de confirmación**: llega (SendGrid: processed/delivered/opened verificados por API) pero puede caer en SPAM — inherente a mandar desde `@gmail.com` vía SendGrid sin dominio propio (Gmail no autoriza a SendGrid para su dominio). Fix real = dominio propio, pendiente a futuro. Mientras tanto: subido el rate limit de emails de Supabase de 10/h → 30/h (con 10/h, si >10 personas se registraban en una hora, al resto no le llegaba el mail y no podían entrar; tope diario real: 100/día de SendGrid free).
- **`site_url` de Supabase apuntando temporalmente al preview** (`uca-economia-git-migracion-v10-...vercel.app`) para que el link del mail de confirmación no caiga en el 404 de producción sin migrar. **REVERTIR al dominio final antes/después del merge** (paso manual anotado abajo).
- **Cuenta — contraseña colapsada**: "Cambiar contraseña" dejó de ser una card principal; ahora es una fila compacta en "Seguridad" que se expande sólo si el usuario quiere (el widget Turnstile recién se monta ahí — no carga de más).
- **Tema automático al elegir universidad**: al seleccionar la universidad en Perfil, la paleta global cambia AL INSTANTE (y se persiste con "Guardar cambios", sólo si la universidad cambió — el override manual de Apariencia se respeta). Apariencia queda como personalización posterior, sincronizada si la paleta cambia desde afuera.
- **Re-verificación de seguridad sobre el deploy vivo** (no local): `/` sin sesión → 307 a `/login`; `/api/db`, `/api/tts`, `/api/account/*` sin sesión → 401; login sin captcha → rechazado por Zod; headers completos en producción real (CSP, HSTS, X-Frame-Options DENY, nosniff). Todo en verde.

**Segunda tanda de ajustes (UI, tras seguir probando):**
- **Logo fijo**: `stuniv.` vuelve a ser SIEMPRE `#0B1F4D` + punto `#009CDE`, sin importar la paleta de universidad elegida (antes usaba `text-navy` = variable de paleta y se teñía). El resto de la UI sí sigue la paleta.
- **Identidad académica en el nav** (`app/components/Nav.tsx` → `Identidad`): al lado del logo, en desktop (lg+), se muestra carrera (arriba) + universidad (abajo, más chica) del perfil — "te acompaña" en todo el sitio. Sutil, truncado, con color de paleta.
- **Configuración a 2 columnas** (`app/cuenta/page.tsx`): dejó de ser una sola columna angosta de cards centradas (`max-w-3xl`). Ahora `max-w-6xl` con grid `lg:grid-cols-2` (Perfil a la izquierda; Apariencia + Seguridad + Eliminar + Cerrar sesión a la derecha) — aprovecha el ancho y baja el scroll a la mitad en desktop.
- **Fix autofill Carrera**: el navegador metía el email en el input de Carrera por heurística. Se agregaron `autocomplete` correctos (nombre=given-name, apellido=family-name; apodo/universidad/carrera/email en `off`).
- **Métricas a `max-w-5xl`** para que los gráficos usen mejor el ancho. Inicio/Lectura/Timer quedan centrados a propósito (hero / lectura legible / dial).

**Esta versión pasa a ser `main`** — la migración se dio por buena tras las pruebas reales. De acá en adelante los cambios van sobre `main` (la rama `migracion-v10` cumplió su función). `site_url` de Supabase revertido al dominio de producción al mergear.

---

## v10 — Fase 3 de 3: datos por-usuario en Supabase + pantalla de Cuenta (branch `migracion-v10`, migración COMPLETA — falta solo el paso manual de Jano para mergear)

Cierre de la migración multi-usuario ([`MIGRACION-MULTIUSUARIO.md`](./MIGRACION-MULTIUSUARIO.md)). Con esta fase **se destrabó el bloqueante del merge**: `/api/db` ya no toca Vercel KV — sirve y escribe los datos POR USUARIO sobre las tablas de Supabase con RLS forzado.

**Datos por-usuario (`app/api/db/route.ts` reescrito):**
- GET arma el `AppData` del usuario desde las 6 tablas (contrato con el cliente intacto — cero cambios en las vistas). El historial de semestres archivados (lo único que crece sin techo) solo viaja con `?full=1`, que pide únicamente `/semestre` (`useData({ full: true })`); las escrituras devuelven el estado sin historial y el cliente conserva el suyo en cache.
- POST mapea el merge parcial a la base: materias = upsert + delete de las que no están (cascade limpia sesiones); minutos SIEMPRE por el RPC atómico `add_minutos` (`_delta`, 1..1440); cerrar semestre por el RPC transaccional `archivar_semestre`; preparación como columna de `materias`; plan/notas reemplazo completo acotado. Sin `_delta`, `sesiones` solo acepta el reset `{}` (hallazgo de la auditoría — ver abajo).
- Ids de materias ahora son **uuid** (PK real; `crypto.randomUUID()` en la UI). Cuentas nuevas arrancan **sin materias precargadas** (las de UCA·Economía eran el semestre personal de Jano); la home tiene estado vacío con CTA a `/semestre`, y cerrar semestre arranca el siguiente vacío.
- Migración de datos reales: `scripts/migrar-kv-a-supabase.mjs .env.local <email> [backup] [--force]` — remapea slugs→uuid (incluidas referencias en sesiones/preparación/plan) y carga el export del KV a esa cuenta. **Pendiente de correr** cuando exista la cuenta de Jano (ver pasos manuales). `@vercel/kv` eliminado del proyecto.

**Pantalla de Cuenta (6.17, completa):**
- **Menú desplegable** desde el nombre/avatar en la esquina del Nav (`app/components/UserMenu.tsx`): Configuración → `/cuenta`, Ayuda (mailto soporte), Cerrar sesión. Reemplaza al botón "Salir"; no es una pestaña más del nav.
- **`/cuenta` — Perfil**: foto (ver abajo), nombre, apellido, apodo (visible en la app), universidad (dropdown fijo: UCA/UADE/ITBA/Austral/Udesa/UAI/UCEMA/Kennedy/UB/UBA/UTN/UP/USAL/UNLP + "Otra" con texto libre), carrera (texto libre). Guardado explícito ("Guardar cambios"), nunca autoguardado.
- **Foto de perfil** (reglas de uploads seguros 6.4, sin servicios nuevos — Supabase Storage ya estaba en el stack): la UI recorta/reduce a 256px client-side (de paso descarta EXIF); `POST /api/account/avatar` valida **tipo real por magic bytes** (jpeg/png/webp), tope 400KB (header + bytes reales), y guarda en el bucket **privado** `avatars` (creado con `scripts/setup-avatars-bucket.mjs`, verificado `public:false` + límites a nivel bucket). El path es SIEMPRE `<user_id>.<ext>` derivado de la sesión (sin path traversal/IDOR); nunca se sirve directo: la UI recibe una **signed URL de 1h**.
- **Apariencia**: el toggle Clásico 2D ↔ Vidrio 3D reubicado acá (antes al final de la home) + **tema de color por universidad** (nuevo, ver "Reglas de diseño fijas"). Elegir paleta previsualiza al instante y "Guardar apariencia" la persiste en `profiles.tema_color` (viaja entre dispositivos; espejo en `localStorage.uca_palette` para el anti-flash).
- **Cambiar contraseña**: contra el endpoint de Fase 1 (re-verifica la actual, rate limit fail-closed, cierra otras sesiones). Con widget Turnstile obligatorio (la verificación pasa por el login de Supabase, que exige CAPTCHA) y **confirmación inline** antes de aplicar.
- **Eliminar cuenta**: contra el endpoint de Fase 1 (soft delete + ban + signOut global; hard delete a los 30 días). Confirmación inline explícita (regla fija de acciones destructivas). Cerrar sesión también dentro de la pantalla.
- Endpoints nuevos: `GET/POST /api/account/profile` (Zod estricto, RLS fila propia, rate limit 30/15min fail-closed en escritura; devuelve email + campos + signed URL de la foto) y `POST/DELETE /api/account/avatar` (10/h fail-closed). Cliente: `app/lib/perfil.ts` (cache + `usePerfil()` + sincronización de paleta).

**Temas de color por universidad (6.17):** navy/ocre dejaron de ser hex hardcodeados — ahora son variables CSS (`--navy-rgb`, `--ocre-rgb` + variantes) definidas en `globals.css` y consumidas por Tailwind (`rgb(var(...) / <alpha-value>)`), por todo el sistema Liquid Glass y por los charts (helper `rgbVar()` en `app/lib/paleta.ts`, porque Recharts/SVG no aceptan `var()` en atributos). 5 paletas con el mapeo exacto del documento: **Azul y Blanco** (UCA, UADE, ITBA, Austral, Udesa — la identidad navy/ocre de siempre, default), **Bordó** (UAI, UCEMA, Kennedy, UB), **Negro** (UBA, UTN, UP), **Verde** (USAL, UNLP), **Dorado** (solo manual). La asignación por universidad es solo el valor sugerido — siempre se puede elegir otra a mano.

**Auditoría de seguridad (sección 7, sobre las 3 fases juntas):** 1 hallazgo, arreglado — el reemplazo de `sesiones` sin `_delta` permitía plantar una fila con `materia_id` ajeno (el FK valida existencia, no dueño) y romperle `add_minutos` al dueño real conociendo su uuid; ahora ese camino solo acepta `{}` (+ check e2e). Verificado sin hallazgos: env vars (solo `NEXT_PUBLIC_*` públicas llegan al cliente), rate limit en todos los endpoints, admin client solo en operaciones puntuales (password ya verificada, soft-delete, storage del avatar), nada de sesión en `localStorage`, **Security Advisor de Supabase re-consultado post-cambios: 0 hallazgos**. `npm audit`: mismos 2 advisories de Fase 2 (fix = Next 16, breaking — decisión de Jano).

**Tests:** `scripts/test-fase3-e2e.mjs` — **33 checks PASS** (401 sin sesión en todo lo nuevo, cuenta nueva vacía, roundtrips, atomicidad de `add_minutos`, IDOR en `_delta`/upsert/replace, aislación A/B en datos y perfil, `?full=1`, Zod estricto, avatar: magic bytes/bucket privado probado por URL pública/signed URL/delete). Suites de Fase 1 (25 checks) y Fase 2 (32 checks) **re-corridas en verde**; la de Fase 1 se actualizó porque el CAPTCHA (obligatorio desde Fase 2) bloquea el login por contraseña de los scripts: ahora lo apaga vía Management API solo mientras corre y **verifica que quedó re-activado** al final.

**Capacidad (3.2.1, medida — no estimada):** un GET normal de `/api/db` con un semestre cargado (9 materias, plan de 30 días, 10 notas, 4 semestres archivados) pesa **5.4KB crudo / 0.75KB en el cable** (gzip, verificado que PostgREST comprime hacia el server); con `?full=1` 12.3KB/1.1KB; el perfil 157B. Contra los ~166MB/día del tier gratis de Supabase: **~1.500 usuarios activos/día sostenibles con uso mixto realista** (~60 llamadas/día los intensos con timer, ~20 los moderados; ~50-300KB/día por usuario contando el egress de Auth), con techo cercano a ~3.000/día si el uso promedio es moderado. Con el patrón viejo (blob completo siempre) eran ~400-500/día. Palancas ya activas: historial fuera del GET normal, cache cliente 15s + dedupe, escrituras que devuelven estado sin historial, respuestas comprimidas.

**Pasos manuales de Jano antes de mergear a main (en orden):**
1. Abrir el preview deploy de Vercel del branch `migracion-v10` (Turnstile solo pasa en `*.vercel.app`), registrarse en `/registro` con `janobordo@gmail.com` y confirmar el email.
2. Avisar si usó la app en producción (main) después del 12/07 — el backup migrable es de esa fecha; si hubo cambios, se re-exporta el KV antes de migrar.
3. Correr (o pedir que se corra) `node scripts/migrar-kv-a-supabase.mjs .env.local janobordo@gmail.com` y verificar sus datos entrando a la app del preview.
4. Probar en el preview lo que localmente no se puede (Turnstile real): login, cambiar contraseña en `/cuenta`, subir foto.
5. Mergear `migracion-v10` → `main` (deploy automático). A partir de ahí main deja de usar KV.
6. Post-merge: renombrar el proyecto Vercel a `stuniv` + actualizar `site_url` de Supabase (hoy `uca-economia.vercel.app`); decidir el upgrade a Next 16 (2 advisories de npm audit); **revocar los tokens de gestión amplia** (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `UPSTASH_API_KEY`, token de SendGrid si no rota mails, `SENTRY_AUTH_TOKEN`/`POSTHOG_*` si no se usan) — quedan solo las keys angostas de runtime (anon key, secret key del server, Upstash REST, Turnstile). Ojo: la suite `test-seguridad-e2e.mjs` usa `SUPABASE_ACCESS_TOKEN` para el toggle del CAPTCHA — revocarlo implica regenerarlo para volver a correrla.
7. Pendientes menores que quedaron afuera a propósito (🟡 del documento): OAuth Google/Apple, Sentry + PostHog, load testing formal, `localhost` en el widget de Turnstile para probar login local.

---

## v10 — Fase 2 de 3: login, registro, recuperación por OTP y protección total de rutas (branch `migracion-v10`)

Puerta de entrada completa sobre el backend de Fase 1 (secciones 6.1 y 6.16 de [`MIGRACION-MULTIUSUARIO.md`](./MIGRACION-MULTIUSUARIO.md)). **⚠ NO mergeable a main todavía**: `/api/db` ya exige sesión pero sigue sirviendo el blob único de Vercel KV (compartido entre cualquier usuario logueado) — la migración de datos por-usuario a Supabase sigue pendiente.

**Arquitectura de sesión (decisión de Fase 2):** NO hay supabase-js en el navegador. Todo el auth pasa por endpoints propios (`/api/auth/*`) y la sesión vive en **cookies HttpOnly + Secure + SameSite=Lax** (helper `hardenCookie()` en `app/lib/supabase/server.ts` + mismo endurecimiento en `middleware.ts`) — ni un XSS puede leer el token (6.7), y nada de sesión toca `localStorage`. El refresh de sesión (jwt 900s) lo hace el middleware en cada navegación y los route handlers en cada API call.

**Rutas/páginas nuevas:**
- `/login` — email+contraseña+Turnstile; links a `/registro` y `/recuperar`; muestra error si llega de un link de confirmación vencido (`?error=confirmacion`).
- `/registro` — email dos veces (guardia anti-typo, re-verificado server-side), contraseña ≥8, Turnstile; al crear muestra "Revisá tu casilla" (cuenta inutilizable hasta confirmar email).
- `/recuperar` — 2 pasos: email+Turnstile → código OTP 6 dígitos + contraseña nueva; al confirmar cierra sesión en TODOS los dispositivos y manda a `/login`.
- `/auth/confirm` (route handler GET) — callback del link de confirmación de email por `token_hash` (verificado server-side, sesión directa a cookies HttpOnly; **nunca viajan tokens de sesión en la URL** — se cambió el template de confirmación de Supabase de `{{ .ConfirmationURL }}` a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` vía Management API).

**Endpoints nuevos (`app/api/auth/*`, todos con validación Zod + rate limit Upstash fail-closed):**
- `POST /api/auth/signup` — `{ email, emailConfirm, password, captchaToken }`; 8/h por IP. CAPTCHA lo verifica Supabase. Email duplicado NO da error distinto (Supabase responde éxito ofuscado con confirmación activa).
- `POST /api/auth/login` — `{ email, password, captchaToken }`; 10/15min por IP **y** por email. Mensaje único "Email o contraseña incorrectos" para credenciales malas/cuenta eliminada (sin señal a atacantes); caso aparte solo para email sin confirmar.
- `POST /api/auth/logout` — signOut scope `local`: revoca el refresh token de ESA sesión en el server (logout real) + borra cookies.
- `GET /api/auth/me` — `{ id, email }` de la sesión (las cookies son HttpOnly, la UI no puede leer el JWT — este endpoint es el "quién soy").
- `POST /api/auth/recover` — pide el código OTP; 5/h por IP y por email; **respuesta idéntica exista o no el email** (anti-enumeración).
- `POST /api/auth/recover/verify` — `{ email, code, newPassword }`; **5 intentos/15min por email, fail-closed** (anti fuerza bruta del código de 6 dígitos; el código además vence a los 10 min y es de un solo uso); al éxito revoca TODAS las sesiones del usuario.

**Protección de rutas:** `middleware.ts` (raíz del repo) — toda página redirige a `/login` sin sesión (`getUser()` validado contra el servidor de Auth, nunca `getSession()`); logueado en `/login|/registro|/recuperar` redirige a `/`. Los `/api/*` NO dependen del middleware: cada handler verifica sesión por su cuenta (`/api/db` GET/POST y `/api/tts` ahora devuelven 401 sin sesión; los `/api/account/*` ya lo hacían desde Fase 1). El cliente (`app/lib/api.ts`) redirige a `/login` ante cualquier 401 (cubre "volver atrás" tras logout).

**UI de sesión:** hook `useUser()` (`app/lib/useUser.ts`, pega a `/api/auth/me`) para saber el usuario actual desde el cliente; botón "Salir" en el Nav (POST logout + navegación completa que vacía el cache en memoria); en las pantallas de auth el Nav muestra solo el logo. Componentes nuevos: `app/components/Turnstile.tsx` (widget CAPTCHA sin dependencias nuevas, script oficial ya permitido por la CSP) y `app/components/AuthCard.tsx` (marco compartido de las 3 pantallas, misma identidad visual).

**Tests:** `scripts/test-auth-fase2-e2e.mjs` — 32 checks (protección de rutas, 401 en APIs, validación, fuerza bruta OTP → 429, flujo real de recuperación con código generado por admin, cookies HttpOnly/Secure/SameSite, logout real con cookies viejas → 401, confirm con token trucho) — **32/32 PASS**. La suite de Fase 1 sigue vigente para `/api/account/*`.

**npm audit (6.14):** quedan 2 advisories (high en `next` 14.2.35 + moderate en su `postcss` interno) cuyo fix es **Next 16 (breaking major)** — no se decide solo en esta fase; ninguno de los CVEs aplica directo al setup actual (el bypass de middleware de Pages Router+i18n no aplica a App Router, y la protección no depende solo del middleware igual). Queda reportado para decidir con Jano.

### Resumen estructurado de Fase 2 (handoff para Fase 3 — no adivinar nada)

**Rutas/páginas creadas:**
| Path | Qué es |
|---|---|
| `/login` | Email + contraseña + Turnstile. Links a `/registro` y `/recuperar`. Lee `?error=confirmacion`. |
| `/registro` | Email **dos veces** + contraseña ≥8 + Turnstile → pantalla "Revisá tu casilla". |
| `/recuperar` | 2 pasos: email+Turnstile → código OTP 6 dígitos + contraseña nueva → vuelta a `/login`. |
| `/auth/confirm` | Route handler GET del link de confirmación de email (`token_hash`) → sesión en cookies → `/`. |
| `POST /api/auth/{signup,login,logout,recover,recover/verify}` + `GET /api/auth/me` | Backend de todo lo anterior (Zod + rate limit Upstash fail-closed en todos). |

**Acceso al usuario/sesión actual:**
- **Cliente**: hook `useUser()` en `app/lib/useUser.ts` (devuelve `{ user: {id, email}, loading }`, pega a `GET /api/auth/me`). No hay supabase-js en el navegador — las cookies son HttpOnly y el JS no puede leerlas, a propósito.
- **Server**: `supabaseForRequest(req).auth.getUser()` de `app/lib/supabase/server.ts` (acepta cookies o Bearer).

**Cómo funciona la protección de rutas:** `middleware.ts` en la raíz: toda página sin sesión → redirect `/login` (con `getUser()` validado contra el servidor de Auth + refresh de token); logueado en páginas de auth → redirect `/`. Los `/api/*` **no** dependen del middleware: cada handler verifica sesión por su cuenta (`/api/db`, `/api/tts` ahora devuelven 401; `/api/account/*` ya lo hacía). `app/lib/api.ts` redirige a `/login` ante cualquier 401 (cubre "volver atrás" tras logout).

**Checklist de seguridad verificado (uno por uno, con test o config real):**
- ✅ Login con Supabase Auth, pantalla propia, nada hardcodeado ni en localStorage (6.1)
- ✅ **Logout real**: cookies viejas post-logout → 401 (refresh token revocado server-side, verificado en e2e) (6.1)
- ✅ Ruta protegida = verificación **server-side** (middleware + por-endpoint, no solo frontend) (6.1)
- ✅ Confirmación de email obligatoria; template cambiado a `token_hash` — **nunca viajan tokens de sesión en URL/fragment** (6.1)
- ✅ CAPTCHA Turnstile en signup/login/recover, verificado por Supabase (probado: token falso → 400) (6.1)
- ✅ Doble campo de email en signup, re-verificado server-side (6.1)
- ✅ OTP: 6 dígitos, 10 min, un solo uso (config real confirmada vía Management API), **5 intentos/15min por email fail-closed** (e2e: 5×400 → 429), respuesta uniforme exista o no el email, signOut global al confirmar (6.1/6.16)
- ✅ Rate limiting propio en login (por IP **y** por email), signup, recover, verify — todos fail-closed (6.5)
- ✅ Cookies de sesión **HttpOnly + Secure + SameSite=Lax + Path=/** — confirmado en el Set-Cookie real del e2e, no asumido (6.7)
- ✅ Mensajes de error genéricos sin señal (credencial mala = cuenta eliminada = mismo texto); detalle solo en logs de server (6.9)
- ✅ Sin keys nuevas en el frontend (solo `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, pública por diseño); CSP ya cubría Turnstile; cero dependencias npm nuevas (6.2/6.14)
- ⚠️ `npm audit`: 2 advisories en `next@14.2.35` cuyo fix es **Next 16 (breaking)** — ninguna aplica directo al setup (el bypass de middleware es Pages Router+i18n, y la protección no depende solo del middleware). Decisión de Jano, no se toma sola.

**Qué falta explícitamente para Fase 3:**
1. **Bloqueante del merge a main**: migrar datos KV→Supabase y hacer `/api/db` por-usuario — hoy exige sesión pero sirve el blob compartido de KV (cualquier usuario logueado vería los datos de Jano si se mergeara así).
2. Pantalla de Cuenta (6.17): menú avatar/nombre arriba a la derecha, Perfil, Apariencia (mover ThemeToggle + temas por universidad), cambiar contraseña y eliminar cuenta — los endpoints `POST /api/account/change-password` y `/api/account/delete` ya existen de Fase 1 (change-password acepta `captchaToken` opcional).
3. Menores: OAuth Google/Apple (🟡), Sentry/PostHog (🟡), paginación (🟡), rename del proyecto Vercel a `stuniv` + actualizar `site_url` de Supabase (hoy `uca-economia.vercel.app`), agregar `localhost` al widget de Turnstile en Cloudflare si se quiere probar login en local (hoy solo pasa en `*.vercel.app`), revocar tokens de gestión amplia al cierre de la migración.

---

## v10 — Fase 1 de 3 de la migración multi-usuario (branch `migracion-v10`, NO mergeado a main todavía)

Infraestructura y backend de seguridad para multi-usuario, según [`MIGRACION-MULTIUSUARIO.md`](./MIGRACION-MULTIUSUARIO.md). **Sin ningún cambio visual ni de UI** — la app sigue funcionando igual (todavía sobre Vercel KV); lo nuevo es la base sobre la que las Fases 2-3 migran datos y construyen login/pantallas.

**Base de datos (Supabase, proyecto `stuniv`, ref `sfwntnljelgxrtyrizht`, región `sa-east-1`, Postgres 17):**
- 6 tablas: `profiles`, `materias`, `sesiones_estudio`, `semestres`, `plan_estudio`, `notas` — todas con `user_id → auth.users ON DELETE CASCADE`, RLS **habilitado y forzado**, políticas separadas por operación (23 en total, solo rol `authenticated`, siempre `auth.uid()` + perfil activo). `anon` tiene REVOKE total sobre `public`. Migraciones versionadas en `supabase/migrations/`.
- RPCs atómicos (fix definitivo del bug histórico `addMinutos`/`_delta`): `add_minutos(materia, delta)` (upsert con incremento en una sentencia), `archivar_semestre(nombre)` (snapshot + limpieza en una transacción). `purge_deleted_accounts(días)` solo ejecutable server-side.
- Trigger `on_auth_user_created` crea el profile automáticamente al registrarse.
- Security Advisor de Supabase: **0 hallazgos**.

**Supabase Auth (configurado vía Management API, sin pantallas todavía):**
- Confirmación de cuenta por email obligatoria; SMTP = SendGrid (remitente `soporte.stuniv@gmail.com`); recuperación por código OTP de 6 dígitos, 10 min, un solo uso (template en español).
- CAPTCHA Cloudflare Turnstile activo en signup/login; contraseña mínima 8; `jwt_exp` 900s; cambio de contraseña requiere re-autenticación; `rate_limit_email_sent` 10/h.

**Backend nuevo en el repo:**
- `app/lib/supabase/server.ts` (cliente por-request con RLS + cliente admin), `app/lib/ratelimit.ts` (Upstash), `app/lib/turnstile.ts` (verificación server-side).
- `POST /api/account/change-password`: exige contraseña actual (verificada contra Auth), rate limit 5/15min fail-closed, cierra sesión en los demás dispositivos.
- `POST /api/account/delete`: soft delete (`profiles.deleted_at`) + ban + signOut global; RLS corta el acceso a datos al instante aunque el JWT viejo siga vivo; hard delete automático a los 30 días.
- `/api/db` y `/api/tts`: rate limit por IP + validación Zod estricta del body; errores 500 genéricos al cliente.
- `next.config.mjs`: CSP completa, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, sin CORS cross-origin, `productionBrowserSourceMaps: false`.
- `scripts/test-seguridad-e2e.mjs`: 24 checks de seguridad (aislación entre usuarios, IDOR, RLS, rate limit, cambio de contraseña, eliminación) — **24/24 PASS**.
- Next.js 14.2.5 → 14.2.35 (CVEs críticos parchados).

**Backups (repo privado `janoBordo/stuniv-backups`):** GitHub Actions diario 03:00 AR — `pg_dump` de `public` + `auth.users/identities`, **prueba de restore contra un Postgres limpio en cada corrida** (verificado en verde), purga de cuentas eliminadas >30 días, retención 90 días. La conexión diaria además mantiene activo el proyecto free de Supabase. Ya activo (no depende del merge).

**Backup único pre-migración:** `backups/uca_data-backup-2026-07-12.json` (export completo del Vercel KV actual).

**Access Control Matrix (regla de autorización de toda la app):**
| Rol | Puede |
|---|---|
| Visitante sin sesión (`anon`) | Nada sobre datos: REVOKE total en `public`, ninguna política lo incluye. Solo signup/login (con CAPTCHA). |
| Usuario autenticado activo | CRUD **exclusivamente sobre sus propias filas** (`auth.uid() = user_id`, forzado por RLS en la base, no en JS). No existe forma de leer/tocar datos ajenos ni adivinando IDs. |
| Usuario soft-deleted | Nada: login bloqueado (ban) y RLS niega toda lectura/escritura aunque tenga un JWT aún válido. |
| Server (secret key) | Bypass de RLS solo en `app/lib/supabase/server.ts` → usos puntuales: marcar soft-delete, cambiar contraseña ya verificada. Nunca para servir lecturas de datos. |
| Admin humano | No existe rol admin en la app. Gestión = dashboard de Supabase con la cuenta de servicio. |

### Handoff exacto para Fase 2 (no adivinar nada — todo lo de abajo ya existe y se llama así)

**Tablas y columnas** (migraciones versionadas en `supabase/migrations/0001_schema_v10.sql` y `0002_soft_delete_enforcement.sql` — leerlas es la fuente de verdad):
- `profiles`: `id` (uuid PK = auth.users.id), `nombre`, `apellido`, `apodo`, `universidad`, `carrera`, `foto_url`, `tema_color` ('azul'|'bordo'|'negro'|'verde'|'dorado', default 'azul'), `deleted_at` (soft delete), `created_at`, `updated_at`. Se crea sola al registrarse (trigger `on_auth_user_created` → función `public.handle_new_user`).
- `materias`: `id` (uuid PK), `user_id`, `nombre`, `examen` (**timestamp SIN zona horaria** — mismo semántico que el string `"2026-06-08T09:00"` del modelo viejo), `meta_horas` numeric(6,1), `preparacion` smallint 0-100 (ya NO es un Record aparte como en KV), `posicion` (orden de la lista en UI), `created_at`, `updated_at`.
- `sesiones_estudio`: `materia_id` (uuid **PK**, 1 fila por materia), `user_id`, `minutos` (total agregado), `updated_at`. Los incrementos van SIEMPRE por el RPC `add_minutos`, nunca UPDATE leer-modificar-escribir.
- `semestres`: `id` (uuid PK), `user_id`, `numero` (unique por user), `nombre`, `materias` jsonb, `sesiones` jsonb, `archived_at`.
- `plan_estudio`: PK compuesta (`user_id`, `fecha` date), `materia_ids` uuid[], `updated_at`.
- `notas`: `id` (uuid PK), `user_id`, `texto` (1-144 chars), `posicion`, `created_at`.

**Políticas RLS** (23; todas `TO authenticated`, todas exigen `auth.uid()` = dueño **y** perfil no soft-deleted): `profiles_select_own`, `profiles_insert_own`, `profiles_update_own` (sin delete: se soft-deletea, nunca DELETE directo); `materias_{select,insert,update,delete}_own`; `sesiones_{select,insert,update,delete}_own` (sobre `sesiones_estudio`); `semestres_{select,insert,update,delete}_own`; `plan_{select,insert,update,delete}_own` (sobre `plan_estudio`); `notas_{select,insert,update,delete}_own`. RLS `ENABLE` + `FORCE` en las 6 tablas; `anon` con REVOKE total sobre `public`.

**RPCs** (llamar con `supabase.rpc(...)`): `add_minutos(p_materia_id uuid, p_delta integer)` (upsert atómico, valida dueño), `archivar_semestre(p_nombre text)` (snapshot + reset transaccional, devuelve el semestre archivado), `purge_deleted_accounts(p_dias integer)` (solo service role, la corre el workflow de backups).

**Variables de entorno** — cargadas en **Vercel (production+preview) y en `.env.local`**:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` (service role — solo server), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Solo en `.env.local` (no van a Vercel): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `UPSTASH_API_KEY`, `SENDGRID_*`, `SENTRY_AUTH_TOKEN`, `POSTHOG_*`, `TURNSTILE_SITE_KEY`. En GitHub Actions secrets de `stuniv-backups`/este repo: la connection string de la DB para `pg_dump`.

**Endpoints creados en esta fase**:
- `POST /api/account/change-password` — body `{ currentPassword, newPassword }` (Zod; nueva ≥8). Exige sesión, re-verifica la contraseña actual contra Auth, rate limit 5/15min por user+IP (fail-closed), al éxito cierra sesión en los demás dispositivos (`scope: 'others'`).
- `POST /api/account/delete` — body `{ confirmacion: "ELIMINAR MI CUENTA" }` literal. Exige sesión; marca `profiles.deleted_at`, banea al usuario y hace signOut global. Hard delete automático a los 30 días vía `purge_deleted_accounts`.
- `/api/db` y `/api/tts` siguen sobre KV pero ya con rate limit por IP + validación Zod. **Fase 2 los migra a Supabase con sesión.**

**Convenciones elegidas en Fase 1** (mantener): nombres de tablas/columnas en español y snake_case; políticas `<tabla>_<operacion>_own`; RPCs con prefijo de argumentos `p_`; clientes Supabase solo desde `app/lib/supabase/server.ts` (`createRlsClient()` por-request con el token del usuario, `createAdminClient()` service-role solo para soft-delete/cambio de contraseña — nunca para servir lecturas); rate limiting solo vía `app/lib/ratelimit.ts`; Turnstile server-side vía `app/lib/turnstile.ts`; signup/login del cliente deben mandar `captchaToken` (Turnstile) o Auth los rechaza.

**Checklist sección 6 — verificado en Fase 1**: 6.2 (secrets solo server, sourcemaps off), 6.3 completo (RLS/IDOR/aislación, Security Advisor 0 hallazgos, suite e2e 24/24), 6.4 (Zod server-side, sin SQL injection posible — client Supabase parametrizado, headers/CSP), 6.5 (rate limiting login/signup/db/tts/account), 6.6 (CORS same-origin, headers), 6.7 (jwt_exp 900s, rotación refresh tokens, sin sesión en localStorage), 6.10 (backup diario + restore probado en cada corrida), 6.13 (RPCs atómicos), 6.16 backend (cambiar contraseña + soft/hard delete).
**Pendiente Fase 2/3**: migración de datos KV→Supabase, `/api/db` sobre Supabase con sesión, pantallas login/registro/cuenta (6.1 UI, 6.17), doble campo de email en signup, middleware de sesión + logout real en UI, OAuth Google/Apple (🟡), Sentry y PostHog (6.9 🟡), paginación (6.12 🟡), rename del proyecto Vercel a `stuniv`, revocar tokens de gestión amplia al cierre de la migración.

---

## v8.6
Fix de fondo del pausado en Lectura + performance del Vidrio 3D en esa pantalla:
- **Lectura — pausa/resume EXACTO por carácter**: v8.5 pausaba cancelando y recordaba sólo la "parte" (~160 chars) → al reanudar releía la parte entera desde el principio, sonaba raro. Ahora se usa el evento `onboundary` de Web Speech (dispara con el carácter exacto que se está leyendo) para guardar el punto preciso al pausar; al reanudar, se lee sólo el texto restante desde ese carácter (`fullText.slice(offset)`), no la parte completa. 100% cliente: sin llamadas de red ni escrituras a Vercel KV, sólo un par de refs (`offsetRef`, `boundaryRef`) — cero peso extra. Si el navegador no dispara `onboundary` (pasa en Safari/iPhone), cae automáticamente al comportamiento de v8.5 (retoma la parte desde su inicio) — nunca peor que antes.
- **Vidrio 3D — Lectura más liviana**: nuevo marcador CSS `.glass-lite` (mismo patrón que ya se usaba para las celdas del calendario) que mantiene el vidrio (tinte + borde + reflejo) pero sin `backdrop-filter` (el blur, lo caro en GPU). Aplicado a las dos superficies más grandes de `/tts`: el textarea y el panel del reproductor. Se ve prácticamente igual, pesa bastante menos. También se sacó `framer-motion` de la barra de progreso del MP3 (ahora CSS puro).

---

## v8.5
Fixes sobre v8.4:
- **Lectura — reproductor arreglado de verdad**: (1) la **barra ahora avanza suave** mientras suena (progreso por tiempo estimado con `setInterval`, no a saltos por parte); (2) se puede **saltar tocando la barra** (`seekBar` mapea el toque a la parte); (3) **pausa confiable**: el bug era una condición de carrera (el `onerror` de la utterance cancelada pisaba a la nueva) — se agregó un `genRef` que invalida callbacks viejos y se anulan `onend`+`onerror` al cancelar. Además las partes ahora son ≤160 chars para no chocar con el corte de ~15s de Chrome. Barra con perilla arrastrable visual + botones ↺/⏮/▶⏸/⏭.
- **Timer — materia por defecto (bug recurrente) resuelto de raíz**: `materiasPorProximidad` hacía `Infinity - Infinity = NaN` cuando todos los exámenes estaban vencidos → el `sort` quedaba en el orden original y caía siempre en Administración. Reescrito: **futuros ascendente primero (el más próximo arriba), después los rendidos**. Y en `/timer` la sugerencia ahora **sigue actualizándose al llegar los datos de la nube** (antes se pegaba al primer valor), salvo que el usuario elija materia a mano (`eligioManual` ref).
- **Lectura — nota del MP3 corregida**: decía algo sin sentido para el usuario ("no ocupa espacio en tu cuenta"). Ahora: "En Safari/iPhone puede que la descarga no funcione; usá Chrome."
- **Semestre — "Reiniciar datos" con más diseño**: los links pelados pasaron a **botones con borde redondeado + hover** (borde rojo suave → relleno rojo claro al pasar el mouse), tipografía `text-sm` de la página (no más `text-[11px] uppercase`). Confirmación inline en pill roja.

---

## v8.4
Ajustes de UX y performance sobre lo de v8.2:
- **Pomodoro — carga manual reubicada**: el botón "Cargar horas" ya no va abajo (requería scroll para descubrirlo). Ahora es un panel **flotante a un costado del timer** (`absolute top-right`, siempre visible sin scroll). Trigger chico (ícono ＋ en mobile, "＋ Cargar horas" en desktop) que abre un mini-form compacto.
- **Lectura — reproductor simplificado y sin bug de pausa**: se sacó la card con las frases. Ahora es sólo una **barra que muestra por qué parte va + clickeable para saltar**, con controles ↺ principio · ⏮ atrás · ▶/⏸ · ⏭ adelante. La pausa ahora es confiable: en vez del `pause()/resume()` de Web Speech (que corta las utterances largas y quedaba trabado), **pausar cancela y recuerda la parte**, y al reanudar re-lee la parte actual desde el inicio (las partes son cortas → predecible).
- **Lectura — menos texto de notas**: la nota larga del MP3 + tip de iPhone se reemplazó por una sola línea ("Se genera al instante. No ocupa espacio en tu cuenta.").
- **Semestre — "Reiniciar datos" más compacto**: se sacó la card grande. Ahora es una **fila en línea** con acento rojo: label "Reiniciar" + links rojos "Borrar horas y preparación" / "Limpiar plan de estudio" con confirmación inline (Sí/No). Ocupa mucho menos espacio y mantiene el rojo.
- **Vidrio 3D — performance**: el material glass aplicaba `backdrop-filter` + `will-change` + `translateZ(0)` a **cada** elemento redondeado (todos los pills/botones), promoviendo cientos de capas GPU → app trabada, sobre todo en mobile. Ahora el blur va **sólo en superficies grandes** (cards, paneles, modales, tabs); los botones conservan el vidrio (translúcido + borde + gloss) sin blur propio. Se quitó `will-change`/`translateZ` globales. Se ve prácticamente igual pero mucho más fluido. (Ver globals.css.)

---

## v8.2
Cambios de esta versión (Lectura + Pomodoro + Semestre):
- **Pomodoro — carga manual de horas**: en `/timer`, botón "Ya estudiaste sin el timer" que abre un mini form (horas + min) y suma directo a la materia con `addMinutos`, para cuando estudiaste sin usar el timer. Solo visible con el timer detenido.
- **Pomodoro — materia por defecto = examen más próximo**: la materia preseleccionada ahora es la del examen más cercano no vencido (`materiasPorProximidad(data)[0]`), no la primera de la lista.
- **Lectura — PDF arreglado**: el worker de pdf.js apuntaba a un `.min.js` inexistente en CDN (por eso solo andaba Word). Ahora usa el worker `.mjs` correcto desde unpkg matcheando la versión del paquete + polyfill de `Promise.withResolvers` (pdf.js v4 lo requiere y iOS/Safari viejos no lo tienen). También se acepta `.txt`.
- **Lectura — escuchar por capítulos con seek**: el texto se parte en "partes" (oraciones agrupadas ~240 chars). Reproductor tipo podcast con ⏮/▶⏸/⏭ y una lista clickeable para saltar a cualquier parte y escuchar desde ahí (antes había que arrancar del inicio siempre). Sigue usando Web Speech (voz del navegador, gratis).
- **Lectura — descargar .mp3 REAL sin grabar pantalla**: nueva ruta `/api/tts` (edge) que hace de **proxy al TTS gratuito de Google Translate** (sin API key, sin ElevenLabs, sin tocar Vercel KV). El cliente parte el texto en trozos ≤200 chars, pide cada uno, concatena los blobs y descarga un `lectura.mp3` con barra de progreso. No se guarda nada en la nube.
- **Semestre — rediseño "Zona peligrosa" → "Reiniciar datos"**: se sacó el bloque rojo genérico. Ahora es una tarjeta navy/ocre integrada a la marca, con filas (Horas y preparación / Plan de estudio), botones neutros "Reiniciar"/"Limpiar" y confirmación inline; el rojo queda solo en el botón "Sí, borrar" (que en tema Vidrio se mapea al token `--gl-red`). Mismas funciones que antes.

---

## v8.1
Cambios clave: **rebrand a stuniv** (logo, favicon, título), nav sin "Inicio" (logo → home), fix TTS en iPhone, fix legibilidad confirmaciones rojas en Vidrio, fix overflow mobile al agregar materia, y **performance** (cache cliente con TTL + menos re-renders). Cambios clave: **sistema Liquid Glass completo** (material centralizado + primitivos React `Glass*` en todas las vistas, toggle Clásico 2D ↔ Vidrio en Inicio), Matriz de Confianza (radar) en Métricas, y **feedback de hover** en ambos modos (escala/elevación/brillo en botones, "encendido" del cristal en cards).

---

## Versión 6.2 — (última conocida al migrar a Claude Code)
Ver detalle completo de v2 a v6.2 en la sección "Historia completa" al final de este archivo.

---

# ESTADO ACTUAL (se reescribe cada vez que algo de esto cambia)

## Qué es
**stuniv** (marca de la app web; el repo sigue llamándose `uca-economia`). App multi-usuario para estudiantes universitarios (nacida como app personal de Jano, estudiante de Economía, UCA Buenos Aires) para gestionar el semestre: fechas de examen, horas de estudio, plan diario, lectura de apuntes en voz. Cada usuario tiene su cuenta, sus datos aislados por RLS y su personalización (perfil + tema de color por universidad). El claim "Tu futuro. Tu camino." del manual de marca NO se usa en la app.

## Infraestructura (ESTO PUEDE CAMBIAR — mantener actualizado)
- **Hosting**: Vercel Hobby, funciones serverless en **`gru1` (São Paulo)** desde v10.4 (antes iad1) — al lado de Supabase/Upstash (`sa-east-1`) y de los usuarios.
- **Repo**: GitHub `janoBordo/uca-economia`, branch `main`
- **Base de datos**: Supabase Postgres 17, proyecto `stuniv` (`sfwntnljelgxrtyrizht`, `sa-east-1`) — 6 tablas por-usuario con RLS forzado + bucket privado `avatars` en Supabase Storage. `/api/db` sirve el `AppData` del usuario logueado desde ahí (migración multi-usuario v10 mergeada; Vercel KV eliminado).
- **Rate limiting**: límites de **seguridad** (login, signup, OTP, contraseña, delete, perfil, avatar) en Upstash Redis `stuniv-ratelimit` (`sa-east-1`), fail-closed; límites de lectura/escritura general de datos (`rlDb`, `rlTts`, que ya eran fail-open) **en memoria por instancia** desde v10.4 (ahorra los comandos free de Upstash).
- **Backups**: repo privado `janoBordo/stuniv-backups`, diario 03:00 AR con prueba de restore
- **Dominio**: `stuniv.vercel.app` (dominio principal del proyecto Vercel `uca-economia`). `uca-economia.vercel.app` **redirige 308** a stuniv (ya no sirve en paralelo). Sin dominio propio comprado. `site_url` de Supabase = `https://stuniv.vercel.app`; el allow list cubre ambos dominios + localhost.
- **Auth/login**: Supabase Auth completo en `main` (`/login`, `/registro`, `/recuperar` por OTP, middleware, logout real, sesión en cookies HttpOnly persistentes, CAPTCHA Turnstile obligatorio). Mails por **Gmail SMTP directo** (`smtp.gmail.com`, `soporte.stuniv@gmail.com` con App Password, desde v10.4.1) — ~500/día con SPF/DKIM alineados; `rate_limit_email_sent` 50/h. SendGrid quedó fuera de uso.
- **Tipografía**: Inter **self-hosteada** vía `next/font` desde v10.4 (sin requests a Google Fonts; orígenes quitados de la CSP).
- **Capacidad medida (v10.4/v10.4.1)**: ~1.300 activos/día · ~4.000/semana · ~10.000 MAU · **~450 registros/día** (~3.000/semana), todo en planes gratis; el limitante de activos es Vercel (1M invocaciones/mes) y el de registros el mail (~500/día de Gmail).
- **Servicios externos pagos**: ninguno. (Para el MP3 se usa el TTS gratuito de Google Translate vía proxy `/api/tts`, no oficial y sin costo; si Google lo bloqueara, la descarga MP3 fallaría con aviso, pero escuchar en vivo con Web Speech seguiría andando.)

## Stack técnico
- Next.js 14 (App Router), TypeScript, Tailwind CSS
- Framer Motion (animaciones)
- Recharts (gráfico de barras de métricas + radar "Matriz de Confianza")
- pdfjs-dist + mammoth (lectura PDF/Word/TXT en Lectura). Worker de pdf.js desde unpkg (`.mjs`, versión matcheada) + polyfill `Promise.withResolvers`.
- Web Speech API nativa del navegador → **escuchar** en vivo por capítulos (gratis, sin servidor)
- **Descargar MP3**: ruta edge `/api/tts` que proxea al TTS gratuito de Google Translate (sin key, sin servicio pago, sin tocar KV). El cliente trocea ≤200 chars y concatena los MP3.

## Temas visuales (desde v7 / sistema Liquid Glass en v7.1)
- Dos modos: **Clásico 2D** (default, look de siempre) y **Vidrio 3D / Liquid Glass**.
- Se cambia con el toggle al final de la home (`app/components/ThemeToggle.tsx`, usa `GlassTabs`).
- Preferencia guardada en `localStorage` key `uca_theme` ("normal" | "glass") — NO va a la DB.
- Script anti-flash en `layout.tsx` aplica el tema antes del primer paint.
- **Sistema de material** (v7.1): el material Liquid Glass vive centralizado en `globals.css` bajo `html[data-theme="glass"]` (tokens `--gl-*` + cobertura de cards, botones, inputs, selects, textarea, tabs, paneles, modales y header). Transparencia real, borde de cristal, reflejo gloss (`::before`), glow de color y profundidad flotante. Calibrado ~70% de las referencias.
- **Performance del vidrio (v8.4)**: el `backdrop-filter` (blur, lo caro en GPU) se aplica **sólo a superficies grandes** (cards, paneles, modales, tabs, `.rounded-2xl/3xl`), NO a cada pill/botón. Los botones conservan translúcido + borde + gloss sin blur propio. Se quitaron `will-change` y `translateZ(0)` globales (promovían cientos de capas). Look casi idéntico, mucho más fluido en mobile.
- **Primitivos React** (`app/components/glass.tsx`): `GlassCard`, `GlassPanel`, `GlassButton`, `GlassInput`, `GlassSelect`, `GlassTextarea`, `GlassModal`, `GlassTabs`. Son wrappers finos sobre `framer-motion` que sólo agregan la clase marcadora `.glass-*` y reenvían props/animaciones/ref. En modo Clásico no agregan estilos → look idéntico al actual. Todas las vistas usan estos primitivos.

## Modelo de datos (`app/lib/types.ts` → `AppData`)
```ts
type AppData = {
  materias: Materia[];                    // id uuid, nombre, examen (local "YYYY-MM-DDTHH:MM"), metaHoras
  sesiones: Record<string, number>;       // materiaId -> minutos estudiados
  preparacion: Record<string, number>;    // materiaId -> 0..100
  semestres: SemestreArchivado[];         // historial archivado (solo viaja con ?full=1)
  planEstudio: Record<string, string[]>;  // "YYYY-MM-DD" -> materiaId[]
  notas: string[];                        // notas rápidas del calendario
}
```
En el branch v10 esto es una **vista armada por `/api/db` desde las tablas por-usuario de Supabase** (materias, sesiones_estudio, semestres, plan_estudio, notas — RLS forzado; preparación es columna de materias). GET trae todo menos el historial de semestres (`?full=1` para incluirlo — solo lo pide `/semestre`); POST hace merge parcial (minutos vía RPC atómico `add_minutos`; cerrar semestre vía RPC `archivar_semestre`). **Cache cliente** (`app/lib/api.ts`): cache en memoria con TTL de 15s + dedupe, las escrituras refrescan el cache al instante. Cuentas nuevas arrancan sin materias. El nav NO tiene "Inicio" — al inicio se llega tocando el logo.

## Rutas actuales
- `/` — countdown próximo examen + lista de materias (estado vacío con CTA a `/semestre` si no hay materias)
- `/timer` — Pomodoro + Cronómetro (persiste en localStorage al navegar) + carga manual de horas; materia default = examen más próximo
- `/metricas` — horas vs meta + sliders de preparación
- `/calendario` — grilla mensual, exámenes, plan de estudio, notas rápidas
- `/semestre` — config de materias + cierre/archivo de semestres + historial
- `/tts` — Lectura: texto/PDF/Word/TXT; escuchar por capítulos con seek + descargar .mp3 real
- `/cuenta` — Configuración (6.17): perfil (foto/nombre/apellido/apodo/universidad/carrera), apariencia (Clásico/Vidrio + tema de color), cambiar contraseña, eliminar cuenta, cerrar sesión. Se llega por el menú desplegable del nombre en el Nav.
- `/configuracion` — redirect a `/semestre` (legacy)
- `/login`, `/registro`, `/recuperar` (públicas) y `/auth/confirm` (callback de email) — todo lo demás exige sesión vía `middleware.ts`

## Reglas de diseño fijas
- **Paleta parametrizada por tema de color** (v10, sección 6.17): navy/ocre son variables CSS (`--navy-rgb`/`--ocre-rgb` + variantes en `globals.css`, consumidas por Tailwind). El default "Azul y Blanco" es la identidad de siempre: navy `#0B1F4D`, ocre `#C9A227`. Canvas `#F5F4F0` fijo en todos los temas. 5 paletas (mapeo universidad→paleta fijo, decidido por Jano): Azul (UCA/UADE/ITBA/Austral/Udesa), Bordó (UAI/UCEMA/Kennedy/UB), Negro (UBA/UTN/UP), Verde (USAL/UNLP), Dorado (solo manual). Preferencia en `profiles.tema_color` + espejo `localStorage.uca_palette` (anti-flash). **Colores nuevos SIEMPRE via variables/Tailwind, nunca hex navy/ocre hardcodeado**; para SVG/charts usar `rgbVar()` de `app/lib/paleta.ts`.
- 8 colores fijos para materias (no cambian con el tema): `#6B9FD4 #7BC47F #E07B6B #B088C9 #E8A838 #5BB8B0 #D4956A #8FA86E`
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

### v8.1 — Performance (sin cambios visuales ni de uso)
4 optimizaciones quirúrgicas. **Regla absoluta del pedido: cero cambios estéticos** (colores, opacidades, `--gl-*`, paddings, fuentes, bordes, sombras, animaciones `whileHover`/`whileTap`). El render es pixel-idéntico; sólo cambió dónde vive el estado y cómo se cargan los chunks.
- **Aceleración GPU** (`globals.css`): al material maestro `:where(.glass-*, .rounded-*, botones)` se le agregó `will-change: transform, backdrop-filter` + `transform: translateZ(0)` (promueve a capa de composición → backdrop-filter más barato). No se tocó ninguna otra propiedad ni variable.
- **Aislamiento de estado del Timer** (`app/timer/page.tsx`): el `setInterval` por segundo re-renderizaba TODO el Timer (tabs, input, select con ~9 options, círculo y controles). Se extrajo un nodo hoja `TimerDial` (memo) que es dueño del tick y se re-renderiza solo él. El padre ya no tickea. La lógica de `frenar()` se preservó exacta vía un `dispRef` puente (el leaf escribe ahí lo que antes iba al state). Inicio/Countdown ya estaba aislado (`CountdownHero`), no se tocó.
- **Code splitting de Recharts** (`app/metricas/page.tsx` + nuevos `BarHoras.tsx` y `RadarConfianza.tsx`): los gráficos se importan con `next/dynamic({ ssr:false })` → Recharts sale del bundle inicial a un chunk aparte que carga sólo en `/metricas`, dentro de los `GlassPanel` ya dimensionados (cero salto de layout). Los parsers de `/tts` (`pdfjs-dist`, `mammoth`) ya estaban diferidos con `await import()`, no se tocaron.
- **Prevención de re-renders** (`app/metricas/page.tsx`): `chartData`, `radarData` y `prepReal` con `useMemo`; `ahora` fijado una vez por montaje; `cambiarPrep` con `useCallback`; componentes de gráfico con `React.memo`. Resultado: arrastrar un slider de preparación recomputa sólo el radar, no el gráfico de barras.

### v8.0.1 — Logo fiel al manual de marca
- **Desktop**: el logo del nav ahora es el **logotipo completo "stuniv."** como texto (navy `#0B1F4D` extrabold lowercase + punto azul `#009CDE`), no el cuadradito isotipo.
- **Mobile + favicon**: el **isotipo "s."** (s navy + punto azul) tal cual la referencia que pasó Jano — se reemplazó la versión anterior (s blanca sobre cuadrado navy). Favicon (`app/icon.svg`): fondo blanco redondeado, "s" navy, punto azul. Al ser SVG es vectorial = alta calidad a cualquier tamaño.

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
