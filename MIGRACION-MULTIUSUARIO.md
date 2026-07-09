# Stuniv → Multi-usuario: documento de contexto para la migración

Este documento es para pegarle/adjuntarle a Fable 5 (u otra sesión de Claude dedicada)
al arrancar la migración de Stuniv de app personal a app multi-usuario. Incluye **todo**
lo relacionado a seguridad y a que la app no se rompa/caiga del checklist que trajo
Jano, sin recortar — la prioridad número uno de esta migración es que ningún atacante
pueda robarle los datos a un usuario ni tocar los de otro. No es el registro de cambios
del día a día — ese es `PROYECTO.md`, que sigue siendo la fuente de verdad del estado
actual de la app.

---

## 1. Objetivo

Migrar Stuniv de "app web personal de un solo usuario" a "app web multi-usuario, con
la puerta abierta a una versión descargable (PWA / mobile) más adelante". Nadie más
usa la app hoy — es la ventana ideal para hacer el cambio de arquitectura bien, antes
de tener datos reales de terceros en juego.

## 2. Las 5 prioridades de Jano (en ese orden de peso, no de secuencia)

1. **Seguridad** — que un usuario nunca pueda ver ni tocar datos de otro, y que ningún
   hacker pueda robarle datos a ningún usuario. Esta es LA prioridad de esta migración.
2. **Fluidez / ligereza** — que la app se sienta rápida (ya se venía trabajando esto:
   ver v8.4/v8.6 en `PROYECTO.md`, performance del modo Vidrio 3D).
3. **Que no se rompa ni se caiga** — robustez ante errores, condiciones de carrera,
   deploys.
4. **Que no cueste dinero tenerla ni mantenerla** — todo en tiers gratuitos mientras
   la escala lo permita.
5. **Que se pueda seguir actualizando y mejorando** — arquitectura que no se vuelva
   una bola de barro a medida que crece.

Estas cinco no compiten entre sí en este caso: la misma decisión de arquitectura
(abajo) las resuelve todas a la vez.

## 3. Decisión de arquitectura ancla (recomendada)

**Migrar de Vercel KV (clave-valor plano) a Postgres, específicamente Supabase, con
Row Level Security (RLS) activado desde el día uno, y usar Supabase Auth para el
login** (en vez de Clerk).

Por qué Supabase Auth y no Clerk en este caso puntual:
- Supabase Auth se integra nativamente con RLS (`auth.uid()` disponible directo en las
  políticas de la base) — con Clerk hay que sincronizar el user id vía JWT template,
  una capa extra de integración y de puntos de falla.
- Un solo proveedor para DB + Auth = menos piezas móviles (arista 3: que no se
  rompa) y un solo dashboard que vigilar.
- Tier gratuito de Supabase es generoso y bundlea Auth sin costo extra (arista 4);
  Clerk tiene un tope de usuarios activos mensuales en el free tier que puede
  empezar a facturar antes.
- Supabase Auth también soporta Google y Apple Sign-In, así que no se pierde el
  onboarding con OAuth que pedía el checklist original.

Si en algún momento se quiere la UI de login más pulida de Clerk, es una opción
válida, pero implica aceptar el trade-off de más integración y un techo de costo
más bajo. Confirmar esto con Fable 5 antes de arrancar si hay dudas — es la decisión
más grande de toda la migración y conviene decidirla una sola vez.

### 3.1 Plan completo de servicios de terceros (decidido, presupuesto $0)

Contexto: Jano espera potencialmente **cientos/miles de usuarios** (apuntando a la
facultad/carrera) con **presupuesto cero** para infraestructura. Estas son las
decisiones tomadas para maximizar gratis sin resignar seguridad ni disponibilidad,
con los únicos dos puntos reales a vigilar señalados explícitamente (no son
bloqueantes, son cosas para monitorear a medida que crece el tráfico real).

| Servicio | Elegido | Costo | Nota |
|---|---|---|---|
| Hosting/deploy | Vercel (Hobby) | $0 | Ya en uso. Pensado para uso no comercial — Stuniv no cobra, entra bien. Si el tráfico se dispara y se acerca al límite de ancho de banda del plan, ahí (y sólo ahí) evaluar Vercel Pro. |
| Dominio | Propio, a comprar (~US$10-15/**año**) | ~US$1/mes | **Único gasto de todo el plan — dejó de ser opcional.** Sin dominio propio verificado, Resend no puede mandarle el mail de "olvidé mi contraseña" a NINGÚN usuario que no sea Jano (ver sección 6.1 y 6.16) — el flujo de recuperación de cuenta, que es seguridad bloqueante, no funciona para usuarios reales sin esto. Se compra antes de arrancar la Fase 0. |
| Base de datos + Auth | Supabase (free tier) | $0 | RLS activado desde el día uno (sección 6.3). Auth free tier soporta hasta 50.000 usuarios activos/mes — sobra para "miles". |
| Backups | Script propio: GitHub Action programada + `pg_dump`, sube el dump a un repo privado de backups | $0 | Los backups automáticos gestionados de Supabase son de plan Pro (pago). Este es el reemplazo gratis — corre solo, sin mantenimiento manual día a día. |
| "Keep-alive" anti-pausa | Ping gratuito programado (ej. cron-job.org, gratis) a un endpoint de health-check cada pocos días | $0 | Los proyectos free de Supabase se pausan tras ~7 días sin actividad. Sólo importa en el arranque, antes de tener usuarios reales — una vez que hay tráfico real y constante, el propio uso mantiene el proyecto activo y este ping deja de ser necesario. |
| Rate limiting | Upstash Redis + librería `@upstash/ratelimit` | $0 | Tier gratis generoso. Upstash es, de hecho, el mismo proveedor que hoy está detrás de Vercel KV — no es un vendor nuevo para Jano. |
| Email transaccional (reset de contraseña, confirmación) | Resend, con el dominio propio verificado | $0 (tier gratis ~100 emails/día) | El SMTP gratuito integrado de Supabase Auth es solo para testing (pocos emails/hora) — no sirve para producción real. Sin dominio verificado, Resend solo entrega al mail del dueño de la cuenta — por eso el dominio pasó a ser parte de la Fase 0. |
| Error tracking | Sentry (free tier) | $0 | Ya contemplado en el checklist (sección 6.9). |
| Analytics de producto (cuánta gente usa la app, a qué velocidad crece) | PostHog Cloud (free tier) | $0 | Free tier generoso (del orden de ~1 millón de eventos/mes — confirmar cifra exacta al implementar, cambia con el tiempo). Trackea signups (velocidad de crecimiento), usuarios activos diarios/semanales/mensuales, y retención — sin esto Jano no tiene forma de saber si la gente vuelve a usar la app o no. Ver sección 3.2. |
| CDN / edge | Vercel (incluido) | $0 | Ya viene con el hosting, sin configuración extra. |

**Los dos puntos reales a vigilar a medida que crece (ninguno bloquea el arranque):**
1. **Ancho de banda de Supabase** (5GB/mes en el free tier) es el límite más
   realista de tocar antes que cualquier otro con tráfico alto — se mitiga con
   el cache que ya tiene la app (`app/lib/api.ts`, TTL 15s) y con paginar
   cualquier endpoint que devuelva listas (sección 6.12). Si se acerca al
   límite, recién ahí evaluar Supabase Pro (~US$25/mes) — no antes.
2. **Vercel Hobby** es para uso no comercial — mientras Stuniv no cobre nada,
   corresponde. Si el uso se vuelve masivo y Vercel lo señala, el camino es
   Vercel Pro (~US$20/mes). Es una decisión para el día que realmente haga
   falta, no para hoy.

### 3.2 Capacidad estimada — cuánto aguanta gratis y cuándo mirar de cerca

De todos los límites de la tabla anterior, **el ancho de banda de Supabase (5GB/mes
gratis) es el que se toca primero, por lejos** — no la cantidad de usuarios de Auth
(aguanta 50.000), no el espacio de la base (con el modelo de datos liviano de
Stuniv, ahí entran decenas de miles de usuarios).

Estimación aproximada con el patrón de uso de Stuniv (requests chicos, cacheados
15s): **entre 300 y 1.000 usuarios activos reales por mes** antes de necesitar
pagar algo, dependiendo de qué tan seguido entren (uso diario ≈ más cerca de 300;
uso más esporádico ≈ más cerca de 1.000).

Qué pasa al llegar ahí: no se "cae" ni se "rompe" — es activar Supabase Pro
(~US$25/mes) para más ancho de banda. La arquitectura (RLS, tablas separadas,
índices) ya está pensada para escalar sin rediseñar nada; a ese punto es solo
pagar más cómputo, no reconstruir la app. **PostHog es la forma de ver este
número venir** (cuántos usuarios activos por mes, a qué velocidad crece la curva)
para decidir con tiempo cuándo pasar a Supabase Pro, en vez de que sea una
sorpresa. Nota: no hay certeza total de si Supabase corta de golpe o degrada
gradualmente al pasarse del límite gratis — confirmar en su documentación al
implementar, y vigilar desde su dashboard de uso.

### 3.3 Checklist de cuentas y tokens a preparar antes de arrancar con Fable 5

Las cuentas en sí no se pueden delegar (los signups tienen CAPTCHA/verificación de
mail a propósito para que un bot no los haga solo) — pero es lo único manual.
Con un token de acceso generado una vez por servicio, Fable 5 hace el resto
(crear el proyecto, la base, las políticas, todo) sin que Jano vuelva a tocar un
dashboard:

| Servicio | Lo único manual | Con eso, Fable 5 automatiza |
|---|---|---|
| Dominio | Comprarlo (cualquier registrador barato) | Configurar los registros DNS (apuntar a Vercel, SPF/DKIM para Resend) |
| Supabase | Signup (con GitHub) → *Account Settings → Access Tokens* → generar uno | Crear el proyecto entero vía CLI/Management API, sacar URL/anon key/service role key, correr migraciones y políticas RLS |
| Upstash | Signup (con GitHub) → *Account → API Keys* → generar uno | Crear la base Redis vía API, configurarla para rate limiting |
| Resend | Signup → *API Keys* → crear una | Configurar el envío transaccional con el dominio verificado |
| Sentry | Signup (con GitHub) → *Settings → Auth Tokens* → generar uno (`project:write`) | Crear el proyecto y sacar el DSN |
| PostHog | Signup (con GitHub) → *Project Settings → API Keys* → generar una | Instrumentar los eventos de signup/login/uso y armar los dashboards de crecimiento |
| Vercel | Ya hay cuenta → *Settings → Tokens* → generar uno | Cargar TODAS las variables de entorno nuevas vía `vercel env add` |
| GitHub (repo de backups) | Nada si `gh` ya está autenticado en la máquina | `gh repo create stuniv-backups --private` |

**Entrega de credenciales**: no pegarlas como texto en el chat — crear un
`.env.local` en el repo (ya está en `.gitignore`) con todos los tokens, y decirle
a Fable 5 que los lea de ahí.

**Al terminar la migración**: revocar los tokens de gestión amplia (los que
pueden crear/borrar proyectos enteros) y dejar activas solo las keys angostas que
la app usa en producción (la `anon key`, no el access token que crea proyectos) —
mismo criterio de mínimo privilegio que rige toda la sección 6.

## 4. Por qué es urgente resolver esto ahora (no es solo teoría)

El bug histórico de `addMinutos` sobreescribiendo minutos de otras materias (por eso
existe hoy el parche `_delta: true` en `app/lib/api.ts`) es exactamente la clase de
problema — condición de carrera / falta de updates atómicos — que una base
relacional con updates atómicos por fila resuelve de raíz, en vez de seguir
parchando caso por caso. Va a volver a pasar (peor, con más usuarios sincronizando
al mismo tiempo) si la arquitectura de datos no cambia.

## 5. Estado actual del proyecto (resumen — el detalle completo vive en `PROYECTO.md`)

- Next.js 14 (App Router), TypeScript, Tailwind, Framer Motion, Recharts.
- Hosting: Vercel. Repo: GitHub `janoBordo/uca-economia`, branch `main`.
- DB actual: Vercel KV (Upstash Redis), **una sola key `uca_data`** con todo el JSON
  adentro (materias, sesiones, preparación, semestres, plan de estudio, notas).
- **Sin auth** — cualquiera con la URL ve y edita los mismos datos (está bien para
  un solo usuario, es insostenible para multi-usuario).
- Modelo de datos actual (`app/lib/types.ts`): un único blob `AppData` con
  `materias`, `sesiones` (Record materiaId→minutos), `preparacion`,
  `semestres` (archivo histórico), `planEstudio`, `notas`. Todo pasa por
  `/api/db` con GET (trae todo) y POST (merge parcial).
- Ruta `/api/tts` (edge) proxea a Google Translate TTS gratis para descargar MP3 —
  no toca la DB, no tiene costo.
- Sin analytics, sin monitoreo de errores, sin backups configurados (no aplica hoy
  porque KV no tiene ese concepto igual que Postgres).

---

## 6. Checklist completo de seguridad y robustez (todo lo del PDF, sin recortar)

Cada ítem marcado con cuándo importa:
🔴 **bloqueante** (antes de que exista un segundo usuario) · 🟡 **antes de abrir la
app públicamente** · ⚪ **condicional** (solo si en algún momento se da esa situación
puntual — igual queda documentado para no perderlo de vista).

### 6.1 Autenticación y control de accesos

- 🔴 Login real con email + contraseña — nunca hardcodeado, nunca en `localStorage`.
- 🔴 Usar Supabase Auth (ver decisión de arquitectura arriba) — nunca armar un
  sistema de auth propio desde cero.
- 🟡 OAuth con Google y Apple Sign-In (genera confianza, facilita el onboarding).
- 🔴 Logout real: si volvés atrás en el navegador después de cerrar sesión, no te
  tiene que dejar entrar de nuevo — la sesión del lado del servidor tiene que estar
  invalidada, no solo borrada del cliente.
- 🔴 Un usuario logueado no puede acceder a URLs o datos de otro usuario aunque
  adivine o modifique el ID en la URL.
- 🔴 Chequear que cada ruta protegida realmente verifique sesión server-side, no
  solo que "parezca" protegida en el frontend.
- 🔴 Autenticación (quién sos) y autorización (qué podés hacer) son cosas
  distintas — se puede estar logueado y aun así no tener permiso para una acción
  puntual (ej: borrar el examen de otro usuario). Verificar ambas por separado.
- 🟡 Flujos de reset de contraseña: el link tiene que expirar, ser de un solo uso, y
  no filtrar si un email existe o no en la base (evita que alguien use el formulario
  para enumerar usuarios registrados). Con Supabase Auth esto ya viene resuelto —
  no programarlo a mano.
- 🔴 Manejo de sesión: nunca sesiones que no expiran, ni que sigan válidas después
  de cambiar la contraseña.
- ⚪ Credenciales por defecto sin cambiar — si en algún momento se usa un servicio
  con usuario/contraseña admin de fábrica (paneles de admin, dashboards de infra),
  cambiarlo apenas se instala.

### 6.2 API keys, secrets y variables de entorno

- 🔴 Cero API keys en el frontend — si alguien inspecciona la página (F12 →
  Network/Sources), no debe ver nada sensible.
- 🔴 Todas las keys van en `.env` del servidor, nunca en el cliente (la única
  excepción es la `anon key` pública de Supabase, diseñada para ir en el frontend —
  confirmar con Fable 5 cuál va en cada lado).
- ⚪ Preferir credenciales de corta duración (short-lived) sobre keys estáticas
  fijas, cuando el servicio lo permita.
- 🔴 Las llamadas a APIs externas (Anthropic, Stripe, ElevenLabs, lo que sea)
  siempre pasan por el servidor propio — nunca directo desde el browser.
- 🔴 `.env` en `.gitignore` desde el primer commit del proyecto (ya está así en
  Stuniv). Si en algún momento se sospecha que algo se subió igual, correr
  `git log --all --full-history -- .env` para chequear el historial completo.
- 🔴 Si se descubre que una key se filtró: rotarla de inmediato (y todas las del
  mismo archivo, no solo la sospechosa) — recién después limpiar el historial de
  Git con `git filter-repo` o BFG Repo-Cleaner. El orden importa: mientras la key
  vieja siga activa, sirve igual aunque se borre el archivo del repo.
- 🔴 Secrets filtrados en el JavaScript del frontend: pasa cuando una variable de
  entorno sin el prefijo correcto (en Next.js, `NEXT_PUBLIC_` puesto donde no
  corresponde, o al revés, faltando donde sí correspondía) termina bundleada y
  visible en el código que llega al navegador. Revisar cada `NEXT_PUBLIC_*`
  manualmente antes de cada release.
- 🟡 Revisar que los logs de build de Vercel no impriman variables de entorno
  completas en consola durante el deploy.
- 🟡 Source maps expuestos en producción: facilitan a un atacante leer el código
  fuente original. Confirmar `productionBrowserSourceMaps: false` en
  `next.config.mjs` (es el default de Next.js, pero confirmarlo explícitamente).
- ⚪ Si el repo de GitHub es público: cualquiera puede ver todo el historial de
  commits, no solo el código actual — si se subió algo sensible alguna vez, sigue
  ahí aunque se haya "borrado" en un commit posterior.

### 6.3 Base de datos — RLS, permisos y aislación multi-usuario

Esta es la sección más importante de todo el documento para Stuniv.

- 🔴 Activar **Row Level Security (RLS)** en TODAS las tablas — el 70% de las apps
  hechas con IA lo tienen desactivado. Sin RLS, cualquier usuario logueado puede
  leer datos de cualquier otro con una API call básica.
- 🔴 Supabase tiene un Security Advisor integrado que dice exactamente qué política
  falta — pasarle el output a Fable 5/Claude para que lo arregle.
- 🔴 Cada usuario solo lee/escribe lo suyo, sin excepción — sin este punto no tiene
  sentido nada más de este documento.
- 🔴 Las políticas de RLS tienen que cubrir tanto `SELECT` como
  `INSERT`/`UPDATE`/`DELETE`, no solo lectura.
- 🔴 Si en algún momento se usa un bucket de storage (fotos de perfil, archivos
  subidos): confirmar que no quede público por error — es de las fugas más
  comunes y silenciosas (nadie se entera hasta que ya pasó).
- 🔴 **IDOR (Insecure Direct Object Reference)**: cuando un endpoint confía en el ID
  que manda el cliente sin verificar que le pertenezca a quien hace el request.
  Ejemplo concreto para Stuniv: `GET /api/materias/123` tiene que chequear
  server-side que la materia `123` sea del usuario logueado, no devolverla solo
  porque el ID es válido.
- 🔴 Nunca mandar `role: "admin"` (o cualquier rol/permiso) desde el frontend y
  confiar en eso — el rol se determina siempre server-side contra la base.
- 🟡 El usuario/rol técnico de base de datos que usa el backend no debería tener
  permisos de superadmin sobre toda la base — darle sólo lo que necesita.
- 🔴 **Este es EL punto central de la migración**: cada query tiene que estar
  filtrada por `user_id` a nivel de política de base de datos (RLS), no solo a
  nivel de código de la app — porque un bug en el código puede saltarse un filtro
  en JavaScript, pero no puede saltarse una política RLS en la base.
- **Caso real para tener muy presente**: una app con límites de uso de IA por
  usuario tenía mal configurado RLS — alguien encontró la forma de borrar sus
  propios límites (y los de otros), lo que en teoría podía generar una factura de
  $10.000 de costos de API. Es el ejemplo perfecto de por qué RLS no es opcional
  si en algún momento Stuniv tiene cualquier feature con límites de uso o cuotas.
- ⚪ Si en algún momento se arma un panel de admin: confirmar que no quede
  accesible sin login para cualquiera que encuentre la URL.

### 6.4 Protección contra ataques (inyecciones, XSS, CSRF, etc.)

- 🔴 Validar y sanitizar todos los campos en el servidor, no solo en el frontend —
  el cliente se puede bypassear siempre.
- 🔴 **SQL injection**: la defensa estructural es usar ORM y prepared statements
  (Prisma, el client de Supabase, etc.), no escapar manualmente. Un ORM separa el
  código SQL de los datos del usuario a nivel de protocolo — aunque alguien meta
  `admin' --` en un campo, nunca se interpreta como parte de la query SQL en sí.
    - *Mecánica del ataque*: cuando un login arma la query con un `WHERE` y el
      atacante mete una comilla seguida de `--`, esa comilla cierra el string y los
      dos guiones convierten el resto de la query en comentario — el chequeo de
      contraseña queda anulado y entra sin importar qué contraseña haya puesto,
      siempre que el usuario exista. Un ORM hace este ataque estructuralmente
      imposible, en vez de depender de "acordarse de validar cada campo".
- ⚪ **NoSQL injection**: mismo concepto para bases no relacionales — no aplica con
  Postgres, pero si en algún momento se suma Mongo o similar, nunca pasar objetos
  de input del usuario directo a una query sin validar su forma esperada.
- 🔴 **XSS (Cross-Site Scripting)**: cualquier lugar donde el usuario escriba texto
  (notas, comentarios, formularios) es una puerta de entrada potencial. Si no se
  cuida, un atacante mete un script entre etiquetas, y cuando se renderiza para
  cualquier otro usuario el navegador lo ejecuta como parte legítima del sitio —
  puede robar cookies, leer `localStorage`, o redirigir a otra página.
    - Defensa en dos capas: (1) validar todo lo que entra con esquemas (Zod), y
      (2) escapar las salidas — convertir `<` y `>` a texto plano para que el
      navegador no los reconozca como etiquetas ejecutables.
    - React ya escapa esto automáticamente en el render normal (`{variable}`
      dentro de JSX). Donde se rompe esa protección es si en algún momento se usa
      `dangerouslySetInnerHTML` — si se agrega texto con formato rico (negrita,
      itálica en notas, por ejemplo), ahí hay que sanitizar con una librería como
      DOMPurify antes de renderizar.
    - 🟡 Header `Content-Security-Policy` (CSP): le dice al navegador que no
      ejecute ningún script que no venga del servidor propio — segunda capa de
      defensa por si algo se cuela pese al escape.
- 🟡 **CSRF (Cross-Site Request Forgery)**: ataque donde un sitio malicioso hace
  que el navegador del usuario logueado mande requests no autorizados a la propia
  API, aprovechando que ya tiene la cookie de sesión activa. Supabase Auth maneja
  esto con tokens anti-CSRF o `SameSite` cookies — confirmar que esté activo, no
  asumirlo.
- ⚪ **Uploads de archivos inseguros**: si en algún momento se deja subir archivos
  (PDFs para Lectura ya se hace hoy client-side; si se sube el procesamiento al
  servidor, o se agregan fotos de perfil), validar tipo de archivo real (no solo
  la extensión, que se puede falsear), tamaño máximo, y nunca ejecutar ni servir
  el archivo desde el mismo dominio sin sandboxing.
- ⚪ **Path traversal**: si algún endpoint arma una ruta de archivo a partir de un
  input del usuario, validar que no pueda meter `../../` para escaparse del
  directorio esperado y leer archivos del servidor que no debería.
- ⚪ **SSRF (Server-Side Request Forgery)**: si el backend hace requests a una URL
  que viene de un input del usuario (poco común hoy en Stuniv, pero si en algún
  momento se agrega "importar desde una URL" o similar), validar que esa URL no
  apunte a infraestructura interna (`localhost`, IPs internas de Vercel/AWS).

### 6.5 Rate limiting y abuso de API

- 🔴 Limitar requests por usuario y por IP en todos los endpoints públicos. Sin
  esto, bots pueden spamear la API y generar una factura enorme en
  Vercel/Supabase.
- 🔴 Aplica especialmente a: login, registro, búsqueda, y cualquier endpoint que
  llame a una API paga o con cuota — incluido `/api/tts` en Stuniv.
- ⚪ **Prompt injection en features de IA**: si en algún momento la app manda texto
  del usuario a un modelo de lenguaje, un atacante puede escribir instrucciones
  diseñadas para sobreescribir el prompt de sistema. Defensa: envolver siempre el
  input del usuario en delimitadores claros y nunca dejar que el contenido del
  usuario llegue a la posición de "system prompt" — tiene que quedar marcado como
  "esto es input externo, no instrucción".
- ⚪ Herramientas o acciones de IA con acceso a datos: si alguna vez un agente de
  IA tiene la capacidad de leer/escribir en la base en nombre de un usuario, esa
  capacidad tiene que respetar los mismos permisos por usuario que el resto de la
  app (RLS incluido), no tener un acceso privilegiado paralelo.

### 6.6 CORS, headers y configuración de red

- 🔴 Configurar CORS para que solo acepte requests desde el dominio propio. Sin
  esto, páginas externas pueden hacer requests a la API usando la sesión de un
  usuario que tenga el sitio abierto.
- 🟡 Security Headers HTTP para evitar que la página se pueda embeber en un
  iframe falso (clickjacking) — se le puede pedir directo a Fable 5: "Agregá
  Security Headers en mi aplicación".
- 🟡 Además del anti-clickjacking: `X-Content-Type-Options`,
  `Strict-Transport-Security` (fuerza HTTPS), y el `Content-Security-Policy` ya
  mencionado arriba.
- ⚪ Si en algún momento existe un entorno de staging/test público
  (`staging.stuniv.com`), protegerlo con auth básica o IP allowlist — muchos
  atacantes buscan específicamente subdominios de staging porque suelen tener
  menos seguridad que producción.

### 6.7 Sesiones, cookies y tokens

- 🔴 Si se usa JWT en algún punto, el secret de firma tiene que ser largo, random,
  y único por entorno (no el mismo secret en dev y producción).
- 🔴 Cookies de sesión con `HttpOnly` (evita que JavaScript, incluido un script de
  XSS, pueda leerla), `Secure` (fuerza que solo viaje por HTTPS), y `SameSite`
  (mitiga CSRF). Con Supabase Auth bien configurado esto ya se maneja por
  default — confirmar, no asumir.
- 🔴 Nunca guardar tokens de sesión en `localStorage` — es una señal clásica de
  auth mal hecho. Si el token de sesión vive en `localStorage` en vez de una
  cookie HTTP-only, cualquier extensión de Chrome maliciosa o ataque de XSS
  exitoso puede robar la sesión directamente leyendo el `localStorage`. Confirmar
  que no se esté guardando nada de sesión manualmente en `localStorage` en ningún
  lado del código (hoy Stuniv sólo guarda ahí el timer y la preferencia de tema —
  ninguno es sesión, está bien, pero prestar atención a que la migración no
  agregue esto por error).

### 6.8 Pagos y webhooks (⚪ condicional — solo si en algún momento se monetiza)

- Webhooks sin verificación de firma: si se integra Stripe o similar, cada
  webhook recibido tiene que verificar la firma que manda el proveedor — sin
  esto, cualquiera puede mandar un POST falso simulando "pago confirmado".
- Checks de pago o suscripción hechos solo en el frontend: el control de "¿este
  usuario pagó / tiene plan premium?" tiene que verificarse server-side en cada
  request relevante, nunca confiar en un flag que mandó el cliente.

### 6.9 Logs, monitoreo y auditoría

- 🔴 Revisar qué loguea la app en consola/logs de Vercel — es común que por error
  se loguee el body completo de un request que incluye datos sensibles (tokens,
  emails, contraseñas).
- 🟡 Mensajes de error: uno genérico tipo "Algo salió mal" sin código ni contexto
  deja ciego para debuggear, pero uno demasiado detallado mostrado al usuario
  final le da a un atacante información de cómo está armado el sistema por
  dentro. El equilibrio correcto: loguear el detalle completo del lado del
  servidor (idealmente en una herramienta como Sentry), y mostrarle al usuario un
  mensaje genérico con un código de referencia.
- 🔴 Confirmar que ninguna ruta de diagnóstico/debug usada durante desarrollo
  (`/api/debug`, `/test`) quede accesible una vez en producción.
- ⚪ Si en algún momento hay panel de administración: confirmar que tiene su
  propio chequeo de auth + rol admin, no solo "está logueado".
- ⚪ Audit logs: para el arranque es secundario, pero si la app crece y en algún
  momento hay que investigar "¿qué pasó acá?", tener un registro de acciones
  importantes (login, cambios de datos críticos) ayuda mucho.
- 🟡 Monitoreo y alertas: enterarse de que algo se rompió porque un usuario
  escribe, en vez de por una alerta automática, es la diferencia entre reaccionar
  en minutos o en días. Sentry (tier gratuito alcanza para empezar) avisa de
  errores en tiempo real con stack trace incluido.
- 🟡 **Analytics de producto** (PostHog, free tier — ver sección 3.1 y 3.3): Jano
  necesita ver cuánta gente usa la app y a qué velocidad crece, tanto para
  entender adopción como para anticipar cuándo se acerca al límite de ancho de
  banda de Supabase (sección 3.2). Trackear como mínimo: signups (fecha de
  registro, para la curva de crecimiento), inicios de sesión (usuarios activos
  diarios/semanales/mensuales), y retención básica (¿vuelve al día 1/7/30?). Ojo
  con no mandar datos personales de más como propiedades de evento (nombre,
  email) más allá de lo necesario para el análisis.

### 6.10 Backups y recuperación

- 🔴 Configurar backups automáticos diarios (Supabase los tiene como feature del
  plan — confirmar que estén activos) y **probar el proceso de restore al menos
  una vez** antes de necesitarlo de verdad. El error que se repite en apps sin
  esto: alguien pierde la base de producción entera por una migración mal
  corrida, y la única respuesta posible es "estamos investigando el problema"
  porque no hay backup.
- 🔴 Migraciones de base de datos con IA: **nunca automáticas en producción**. Si
  en algún momento se le pide a Fable 5/Claude que modifique el schema (agregar
  columna, renombrar tabla, cambiar un tipo de dato): revisar el SQL generado a
  mano antes de correrlo, probarlo primero en una base local o de desarrollo,
  hacer backup antes de aplicarlo en producción, y nunca dejar que el agente
  ejecute directamente un comando destructivo contra la base real. Esto aplica
  especialmente a Stuniv porque viene trabajando con Claude generando código de
  base de datos directamente.

### 6.11 Arquitectura de base de datos (que no se rompa al crecer)

- 🔴 No usar una sola tabla gigante con todo adentro (perfil + settings +
  historial + lo que sea) — es exactamente lo que hoy es el blob `uca_data` en
  Vercel KV. Cuando esa tabla crece, cada query se pone lenta porque tiene que
  leer filas mucho más pesadas de lo necesario. Separar en tablas relacionadas:
  `users`, `materias`, `sesiones_estudio`, `semestres`, `plan_estudio`, `notas`,
  vinculadas por `user_id`.
- El bug de los emojis (3 bytes vs 4 bytes): en MySQL con charset `utf8` (mal
  llamado así históricamente), el límite es 3 bytes por carácter, pero los
  emojis modernos pesan 4 bytes — un insert con emoji puede tirar error o
  truncar el dato en silencio. Esto no le va a pasar a Stuniv si se migra a
  Postgres (Supabase), porque soporta UTF-8 completo nativamente sin
  configuración extra — buena noticia dado que ya está decidido usar Supabase.
- 🟡 Indexing: pedirle a Fable 5 que revise las queries más frecuentes y agregue
  índices en las columnas que más se filtran/ordenan (típicamente `user_id`,
  fechas de examen).
- 🔴 La connection string de la base (usuario y contraseña incluidos) tiene que
  vivir únicamente en variables de entorno del servidor, nunca en código ni en
  logs.
- 🔴 Cada campo que llega a la base debería pasar por una validación de
  tipo/formato (Zod) antes de tocar la query, así un dato corrupto nunca llega a
  romper una columna con un tipo incompatible.

### 6.12 Performance y que no se ponga lenta

- 🟡 Caching: calcular una vez, cachear, servir desde cache — no reprocesar lo
  mismo en cada request (Stuniv ya hace esto client-side con el cache de 15s en
  `app/lib/api.ts` — mantener el equivalente del lado del servidor/DB).
- ⚪ Async / procesamiento en background: operaciones pesadas (mandar emails,
  generar reportes, procesos largos) van a una cola en background, el usuario no
  se queda esperando bloqueado.
- 🟡 Paginación: los endpoints que devuelven listas tienen que paginar siempre —
  nunca devolver la tabla entera de una. Esto es además un punto de seguridad:
  sin paginación, un solo GET puede dumpear toda la base de un saque.
- 🟡 Load testing antes de lanzar: pedirle a Fable 5 que simule tráfico para
  encontrar cuellos de botella antes de que pase con usuarios reales — mejor que
  reviente en testing que en producción.
- ⚪ Performance de frontend: comprimir imágenes antes de subir, eliminar
  animaciones pesadas innecesarias (ya se viene trabajando esto en Stuniv, ver
  v8.4/v8.6), testear con Google PageSpeed Insights.
- ⚪ Performance percibida (UX): skeleton loaders en vez de spinners; caching del
  lado del cliente para que la navegación no se sienta lenta (ya existe en
  Stuniv); optimistic rendering en acciones que casi siempre funcionan (ej:
  tildar una materia como estudiada — actualizar la UI al instante, revertir
  solo si falla); tooltips en botones que son solo ícono.

### 6.13 Robustez — que no se crashee

- 🔴 **Race conditions / transacciones atómicas**: pasa cuando dos procesos
  intentan modificar el mismo dato al mismo tiempo, y el orden en que "ganan" es
  impredecible. Esto le puede pegar directo a Stuniv, porque la app sincroniza
  entre celular y compu: si se abre en los dos dispositivos a la vez y se
  modifica el mismo dato (sumar minutos de estudio a la misma materia) en
  simultáneo, sin una transacción atómica se puede perder uno de los dos
  cambios. La solución es usar transacciones atómicas en las operaciones de
  escritura concurrente (en Postgres/Supabase esto se maneja con funciones de
  base de datos o `UPDATE ... WHERE` con valores actuales, no
  leer-modificar-escribir desde la app). Ver sección 4 — esto ya pasó una vez en
  Stuniv (`addMinutos` + `_delta`), la migración lo resuelve de raíz.
- 🟡 Errores genéricos sin contexto (ya cubierto en logs) también es un tema de
  robustez: si no se sabe por qué crasheó, no se puede prevenir que vuelva a
  pasar.

### 6.14 Dependencias y código generado por IA

- 🔴 No confiar a ciegas en lo que un agente de IA instala. Antes de aceptar un
  `npm install` sugerido, fijarse en `package.json` que el paquete exista de
  verdad (buscarlo en npmjs.com) y que no sea una versión vieja con
  vulnerabilidades conocidas. Los modelos de lenguaje a veces "alucinan" nombres
  de paquetes que suenan plausibles pero no existen — hay atacantes que
  registran esos nombres con malware adentro, apostando a que alguien los
  instale por confiar en la sugerencia de la IA.
- 🟡 Correr `npm audit` periódicamente — tira las vulnerabilidades conocidas de
  las dependencias directas y transitivas.
- 🔴 **Meta-punto de todo el documento**: cada cambio relevante que genere
  Fable 5/Claude (sobre todo en auth, base de datos, o cualquier endpoint que
  toque datos de otro usuario) conviene leerlo antes de aceptarlo, no solo
  correrlo porque "compila".

### 6.15 Control de versiones y deploys seguros

- 🔴 Commits chicos y frecuentes, no un commit gigante cada tanto. Si un cambio
  generado por IA rompe algo, con commits chicos se puede hacer un
  `git revert` quirúrgico de ese cambio puntual. Con un commit gigante, revertir
  hace perder todo lo bueno que vino junto con lo malo.
- 🟡 Probar en local (o en un branch/preview deploy de Vercel) antes de mergear a
  `main`/producción — Vercel arma automáticamente un preview deploy por cada PR.
- 🔴 Backup de base de datos antes de cualquier migración de schema (ya
  mencionado en backups, pero es el punto de mayor riesgo en cualquier
  "actualización").
- 🔴 Revisar el SQL generado para migraciones antes de correrlo — nunca dejarlo
  en automático contra producción.

### 6.16 Gestión de usuarios (operativa real)

- 🟡 Cambiar contraseña: con Supabase Auth este flujo ya viene resuelto — no
  programarlo a mano. "Forgot password" con link por mail con expiración, y
  desde el perfil logueado un "Change password" que pide la actual + la nueva.
  Lo que sí hay que garantizar: que ese endpoint también tenga rate limiting
  (si no, alguien puede hacer fuerza bruta de la contraseña actual).
- 🔴 Borrar un usuario sin romper la base — el error típico es un
  `DELETE FROM users` directo que deja huérfanos (materias, sesiones que
  apuntaban a ese `user_id` quedan flotando, o la query rompe por foreign key
  constraint). Dos enfoques, recomendado usar los dos juntos:
    1. **Soft delete**: en vez de borrar la fila, agregar una columna
       `deleted_at` y marcarla con la fecha. La cuenta deja de poder loguearse
       pero los datos quedan intactos por si fue un error o hay que recuperar
       algo.
    2. **Hard delete con `ON DELETE CASCADE`**: configurar las foreign keys
       (materias/sesiones → `user_id`) para que al borrar el usuario en serio,
       Postgres borre automáticamente todo lo asociado sin dejar huérfanos.
       Necesario igual si en algún momento alguien pide "borrame todos mis
       datos" en serio.
    - Recomendado: soft delete por default (reversible), y un proceso aparte
      que haga hard delete con cascade después de X días para los pedidos de
      borrado definitivo.

---

## 7. Apéndice — Las 50 vulnerabilidades, checklist final rápido

Usar esto como pasada final antes de cada lanzamiento importante — tildar cada una a
medida que se confirma resuelta (ya están desarrolladas en detalle en la sección 6):

1. Credenciales de base de datos expuestas
2. Archivos `.env` públicos
3. API keys hardcodeadas
4. Autenticación débil o ausente
5. Sin chequeos de autorización
6. Usuarios accediendo a datos de otros usuarios
7. Permisos de lectura/escritura abiertos en la base
8. Firebase / Supabase / S3 mal configurados
9. Rutas de admin sin proteger
10. Páginas de debug expuestas en producción
11. Logs de build filtrando secrets
12. Mensajes de error verbosos filtrando stack traces
13. Repos de GitHub o historial de commits filtrados
14. Secrets incluidos en el JavaScript del frontend
15. Chequeos de seguridad solo del lado del cliente
16. Falta de validación de inputs
17. SQL injection
18. NoSQL injection
19. Cross-site scripting (XSS)
20. Cross-site request forgery (CSRF)
21. Uploads de archivos inseguros
22. Path traversal
23. Server-side request forgery (SSRF)
24. Flujos de reset de contraseña rotos
25. Manejo de sesión débil
26. JWT secrets débiles, filtrados o reusados
27. CORS demasiado permisivo
28. Rate limits faltantes en login, signup, APIs y endpoints de IA
29. Entornos de test/staging públicos
30. Credenciales por defecto sin cambiar
31. Webhooks sin verificación de firma
32. Checks de pago/suscripción solo en frontend
33. IDOR (Insecure Direct Object Reference)
34. Endpoints que confían en IDs/roles controlados por el usuario
35. Logs con tokens, emails, contraseñas o datos privados
36. Source maps expuestos en producción
37. Vulnerabilidades de dependencias
38. Paquetes desactualizados
39. Prompt injection en features de IA
40. Herramientas/acciones de IA accediendo a datos sin chequeo de permisos
41. Permisos excesivos del usuario técnico de la app sobre la base
42. Sin audit logs
43. Sin monitoreo ni alertas
44. Sin plan de backup/restore
45. Dashboards internos expuestos públicamente
46. Headers de seguridad faltantes
47. Cookies sin `HttpOnly`, `Secure`, o `SameSite`
48. Datos sensibles sin encriptar
49. Mala aislación entre tenants en apps multi-usuario
50. Confiar en código generado por IA sin revisión

### Prompt de auditoría pre-lanzamiento (usar en un chat nuevo, después de completar la Fase 0)

```
Act as a senior security engineer. Audit my entire codebase for vulnerabilities,
specifically checking for exposed environment variables, missing rate limits, and
database security rules.
```

---

## 8. Orden sugerido de ejecución (fases, sobre el checklist de la sección 6)

- **Fase 0 — bloqueante, antes de que exista un segundo usuario**: todo lo marcado
  🔴 arriba, más comprar el dominio (sección 3.1) — sin él, Supabase Auth con
  recuperación de contraseña no funciona para nadie que no sea Jano. Es, en
  esencia: migrar a Postgres/Supabase con RLS en todas las tablas, Supabase Auth
  con logout real e IDOR resuelto, updates atómicos por fila, secrets solo
  server-side, backups activados, y ningún commit de base de datos sin revisión
  humana.
- **Fase 1 — antes de abrir la app públicamente (aunque sea a pocos usuarios)**:
  todo lo marcado 🟡 — rate limiting, headers de seguridad, CORS, cookies
  confirmadas, paginación, `npm audit` limpio, monitoreo básico (Sentry),
  analytics de producto (PostHog) para ver adopción y velocidad de crecimiento.
- **Fase 2/condicional — según lo que se agregue con el tiempo**: todo lo
  marcado ⚪ — pagos/webhooks (solo si se monetiza), prompt injection (solo si
  se agrega IA de cara al usuario), uploads/path traversal/SSRF (solo si se
  agregan esas features puntuales).

## 9. Reglas para Fable 5 al ejecutar esta migración

**Modo de ejecución: una sola pasada, no ida y vuelta por mensaje.** Fable 5 es un
modelo caro de correr — no tiene sentido gastar tokens en microcorrecciones paso a
paso. Como hoy Stuniv la usa un solo usuario (Jano), no hay datos de terceros en
riesgo todavía: eso baja mucho el costo de un error durante la migración, así que
se justifica darle autonomía para resolver toda la Fase 0 de corrido en la misma
sesión, en vez del modelo de "proponé y esperá confirmación en cada paso".

- **Único paso obligatorio antes de tocar cualquier dato real**: exportar/hacer
  backup del `uca_data` actual de Vercel KV (el único dato en juego hoy es el de
  Jano mismo). Hecho eso, no hace falta aprobación intermedia para el resto.
- **Commits chicos y frecuentes** a medida que avanza, no un commit gigante al
  final — así un `git revert` puntual sigue siendo posible aunque la sesión haya
  sido de una sola pasada.
- Ningún punto de la sección 6 se da por sobreentendido "porque Supabase/Next.js
  ya lo hace por default" — confirmarlo contra la documentación real y dejarlo
  explícito en código/config.
- Los servicios de terceros y sus costos ya están decididos en la sección 3.1
  (todo en tier gratuito: Vercel Hobby, Supabase free, Upstash Redis, Resend,
  Sentry, backup propio vía GitHub Action) — no hace falta que Fable 5 proponga
  alternativas ni pregunte por presupuesto, ya está resuelto.
- **Access Control Matrix**: definir por escrito qué puede hacer cada tipo de
  usuario según su nivel de permisos (usuario normal, admin si llega a existir),
  y dejarlo en `PROYECTO.md` o en un `CLAUDE.md` del repo. La mayoría de
  vulnerabilidades en apps "vibecodeadas" no son código malo — es que el agente
  no tenía el contexto de qué debía estar permitido o no.
- Al terminar, correr por su cuenta el prompt de auditoría de la sección 7
  ("Act as a senior security engineer...") sobre lo que armó, y arreglar lo que
  encuentre — sin esperar que Jano lo pida en otro mensaje.
- Actualizar `PROYECTO.md` con el nuevo estado (infraestructura, stack, modelo de
  datos) al terminar — es la regla que ya rige el resto del proyecto.
- Cerrar con un resumen único: qué quedó resuelto de la sección 6, qué falta (si
  algo quedó pendiente), y qué tiene que hacer Jano manualmente (crear cuenta de
  Supabase/Upstash/Resend, cargar variables de entorno en Vercel, etc.).

---

## Prompt para pegar en Fable 5 (nueva sesión)

```
Vas a migrar Stuniv (app de gestión de estudio) de Vercel KV a una arquitectura
multi-usuario segura, de punta a punta, en esta misma sesión: Postgres (Supabase)
con Row Level Security, Supabase Auth para el login, y todo lo necesario para que
ningún hacker pueda robarle datos a un usuario ni que un usuario pueda ver o tocar
los datos de otro. La seguridad es la prioridad número uno, por encima de todo lo
demás. Espero potencialmente cientos/miles de usuarios (apunto a mi facultad/
carrera) con presupuesto cero para infraestructura salvo un dominio propio (único
gasto del plan, ~US$10-15/año, ya comprado o lo compro yo antes de arrancar) —
todo lo demás tiene que quedar en tiers gratuitos. Hoy la app la uso solo yo, no
hay otros usuarios en riesgo todavía, así que podés avanzar sin pedirme
confirmación en cada paso.

Te adjunto MIGRACION-MULTIUSUARIO.md con todo el contexto: las 5 prioridades (en
este orden de peso: seguridad, fluidez/ligereza, que no se rompa, que no cueste
dinero, que se pueda seguir mejorando), la arquitectura ya decidida (Postgres/
Supabase + RLS + Supabase Auth), el plan completo de servicios de terceros ya
resuelto (sección 3.1: Vercel Hobby, dominio propio, Supabase free, Upstash Redis
para rate limiting, Resend para email transaccional con el dominio verificado,
Sentry, PostHog para analytics de producto, backup propio vía GitHub Action +
pg_dump — todo gratis salvo el dominio, no hace falta que propongas alternativas
ni preguntes por presupuesto), la capacidad estimada y qué vigilar a medida que
crece (sección 3.2), el checklist de cuentas/tokens ya resuelto (sección 3.3), el
checklist completo de seguridad y robustez (sección 6, marcado 🔴 bloqueante /
🟡 antes de abrir la app / ⚪ condicional), y el apéndice de las 50 vulnerabilidades
(sección 7).

Reglas para esta sesión:
1. Único paso obligatorio ANTES de tocar cualquier dato: exportá/hacé backup de mi
   `uca_data` actual de Vercel KV en un archivo del repo, para no perder mi propio
   historial de estudio si algo sale mal. Después de eso, no necesito aprobar nada
   más paso a paso — resolvé todo de corrido.
2. Ejecutá completo TODO lo marcado 🔴 de la sección 6 (Fase 0, incluyendo dejar
   configurado el dominio con sus registros DNS), y de ahí seguí con lo marcado
   🟡 (Fase 1) en la misma sesión si el tiempo/tokens lo permiten: schema
   separado por tabla con RLS en todas, Supabase Auth con logout real, updates
   atómicos, secrets solo server-side, rate limiting con Upstash, headers de
   seguridad, CORS, cookies, email transaccional con Resend, analytics con
   PostHog (signups, usuarios activos, retención), backup automático propio con
   GitHub Action.
3. No dejes ningún punto de la sección 6 por sobreentendido "porque Supabase/
   Next.js ya lo hace por default" — confirmalo vos mismo contra la documentación
   real y dejalo explícito en el código o config.
4. Todo en los tiers gratuitos ya decididos en la sección 3.1 (salvo el dominio) —
   no propongas servicios pagos.
5. Commits chicos y frecuentes a medida que avanzás, no uno gigante al final.
6. Cuando termines, corré vos mismo la auditoría de la sección 7 ("Act as a senior
   security engineer...") sobre lo que armaste, y arreglá lo que encuentres —
   sin esperar que yo te lo pida en otro mensaje.
7. Actualizá PROYECTO.md con el nuevo estado (infraestructura, stack, modelo de
   datos) al terminar.

Al final quiero un resumen único: qué quedó resuelto de la sección 6, qué falta
(si algo quedó pendiente por límite de tiempo/tokens), y qué tengo que hacer yo
manualmente (crear cuentas de Supabase/Upstash/Resend/PostHog, cargar variables
de entorno en Vercel, etc. — la lista completa ya está en la sección 3.3). No me
pidas nada intermedio salvo que te topes con algo genuinamente ambiguo o
irreversible que no esté ya cubierto acá.
```
