# Stuniv → Multi-usuario: instrucciones para esta sesión

Estas son las instrucciones completas para migrar Stuniv de app personal a app
multi-usuario. Vas a operar sobre el repo `janoBordo/uca-economia` (carpeta de
Stuniv) y ejecutar toda la Fase 0 de una sola pasada — ver el modo de ejecución
en la sección 9. Incluye **todo** lo relacionado a seguridad y a que la app no se
rompa/caiga del checklist de seguridad que Jano armó a partir de un PDF, sin
recortar — la prioridad número uno de esta migración es que ningún atacante
pueda robarle los datos a un usuario ni tocar los de otro. Este documento no es
el registro de cambios del día a día — ese es `PROYECTO.md` del mismo repo,
leelo también antes de empezar para tener el estado real del stack.

---

## 1. Objetivo

Migrar Stuniv de "app web personal de un solo usuario de UCA" a "app web
multi-usuario para estudiantes de distintas universidades" (con perfil, carrera y
tema de color por universidad — sección 6.17), con la puerta abierta a una versión
descargable (PWA/mobile) más adelante. Nadie más usa la app hoy — es la ventana
ideal para hacer el cambio de arquitectura bien, antes de tener datos reales de
terceros en juego.

## 2. Las prioridades de Jano — NINGUNA se negocia (ese orden de peso, no de secuencia)

1. **Seguridad** — que un usuario nunca pueda ver ni tocar datos de otro, y que ningún
   hacker pueda robarle datos a ningún usuario. Esta es LA prioridad de esta migración.
2. **Fluidez / ligereza** — que la app se sienta rápida (ya se venía trabajando esto:
   ver v8.4/v8.6 en `PROYECTO.md`, performance del modo Vidrio 3D).
3. **Que no se rompa ni se caiga** — robustez ante errores, condiciones de carrera,
   deploys.
4. **Que no cueste dinero tenerla ni mantenerla** — presupuesto $0 por el momento,
   todo en tiers gratuitos mientras la escala lo permita.
5. **Que se pueda seguir actualizando y mejorando, sin cerrar puertas a futuro** —
   después de esta migración, Jano va a seguir pidiendo cambios en sesiones nuevas
   (agregando secciones, pusheando versiones, como viene pasando desde v2 hasta
   v8.6). La arquitectura no puede volverse una bola de barro que trabe ese flujo
   normal, ni bloquear cosas que se agreguen más adelante (pagos con Stripe es
   solo un ejemplo posible, no el único).
6. **Que quede práctico acceder a la app, al backend y a la base de datos — todo
   ordenado, sin sobrecomplejizar.** No apiles piezas nuevas si una ya alcanza.

Estas seis no compiten entre sí en este caso: la misma decisión de arquitectura
(abajo) las resuelve todas a la vez. Supabase en particular pega fuerte con la
prioridad 6: un solo dashboard para ver la base, correr SQL, gestionar usuarios y
revisar Auth — no hay que aprender ni pagar por herramientas separadas para cada
cosa.

## 3. Decisión de arquitectura ancla (ya tomada)

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

Esta ya es la decisión tomada — no la relitigues. Si encontrás un problema técnico
real al implementarla (no una preferencia, un impedimento concreto), avisale a
Jano antes de cambiar de rumbo — es la decisión más grande de toda la migración.

### 3.1 Plan completo de servicios de terceros (decidido, presupuesto $0)

Contexto: Jano espera potencialmente **cientos/miles de usuarios** (apuntando a la
facultad/carrera) con **presupuesto cero** para infraestructura. Estas son las
decisiones tomadas para maximizar gratis sin resignar seguridad ni disponibilidad,
con los únicos dos puntos reales a vigilar señalados explícitamente (no son
bloqueantes, son cosas para monitorear a medida que crece el tráfico real).

| Servicio | Elegido | Costo | Nota |
|---|---|---|---|
| Hosting/deploy | Vercel (Hobby) | $0 | Ya en uso. Pensado para uso no comercial — Stuniv no cobra, entra bien. Si el tráfico se dispara y se acerca al límite de ancho de banda del plan, ahí (y sólo ahí) evaluar Vercel Pro. Aprovechá la migración para renombrar el proyecto de `uca-economia` a `stuniv` (sección 3.3) — sujeto a que el subdominio `stuniv.vercel.app` esté libre. |
| Dominio | Ninguno por ahora — se sigue con `*.vercel.app` | $0 | Jano no va a pagar dominio por el momento. Esto obliga a resolver el email transaccional sin dominio propio (ver fila de Email abajo). |
| Base de datos + Auth | Supabase (free tier) | $0 | RLS activado desde el día uno (sección 6.3). Auth free tier soporta hasta 50.000 usuarios activos/mes — sobra para "miles". |
| Backups | Mecanismo propio y gratuito, sin depender del plan pago de Supabase | $0 | Los backups automáticos gestionados de Supabase son de plan Pro (pago). Elegís vos el mecanismo concreto (ej. un dump programado a un repo privado, u otra opción gratis que conozcas) — la única condición es que corra solo, sin mantenimiento manual día a día, y sin sumar un vendor nuevo fuera de lo ya usado (GitHub). |
| "Keep-alive" anti-pausa | Ping gratuito programado (ej. cron-job.org, gratis) a un endpoint de health-check cada pocos días | $0 | Los proyectos free de Supabase se pausan tras ~7 días sin actividad. Sólo importa en el arranque, antes de tener usuarios reales — una vez que hay tráfico real y constante, el propio uso mantiene el proyecto activo y este ping deja de ser necesario. |
| Rate limiting | Upstash Redis + librería `@upstash/ratelimit` | $0 | Tier gratis generoso. Upstash es, de hecho, el mismo proveedor que hoy está detrás de Vercel KV — no es un vendor nuevo para Jano. |
| Email transaccional (reset de contraseña, confirmación) | **Ninguno por ahora — desactivado a propósito** | $0 | Jano decidió no configurar ningún proveedor de email por el momento. Cuando compre un dominio propio más adelante, va a avisar y ahí se habilita un proveedor de email (Resend con el dominio verificado, o AWS SES) y se reactiva la recuperación de contraseña. Ver el impacto concreto de esto en las secciones 6.1 y 6.16. |
| Error tracking | Sentry (free tier) | $0 | Ya contemplado en el checklist (sección 6.9). |
| Analytics de producto (cuánta gente usa la app, a qué velocidad crece) | PostHog Cloud (free tier) | $0 | Free tier generoso (del orden de ~1 millón de eventos/mes — confirmá la cifra exacta al implementar, cambia con el tiempo). Trackeá signups (velocidad de crecimiento), usuarios activos diarios/semanales/mensuales, y retención — sin esto Jano no tiene forma de saber si la gente vuelve a usar la app o no. Ver sección 3.2. |
| CDN / edge | Vercel (incluido) | $0 | Ya viene con el hosting, sin configuración extra. |

**Los dos puntos reales a vigilar a medida que crece (ninguno bloquea el arranque):**
1. **Ancho de banda de Supabase** (5GB/mes en el free tier) es el límite más
   realista de tocar antes que cualquier otro con tráfico alto — se mitiga con
   el cache que ya tiene la app (`app/lib/api.ts`, TTL 15s) y con paginar
   cualquier endpoint que devuelva listas (sección 6.12). Si se acerca al
   límite, ahí se evalúa Supabase Pro (~US$25/mes) — pero **esa decisión es
   siempre de Jano, nunca automática**: sin una tarjeta cargada en la cuenta de
   Supabase, vos no podrías activarlo aunque quisieras, así que esto no es una
   restricción operativa hoy, es sólo la aclaración de quién decide si en
   algún momento se agrega un medio de pago ahí.
2. **Vercel Hobby** es para uso no comercial — mientras Stuniv no cobre nada,
   corresponde. Si el uso se vuelve masivo y Vercel lo señala, el camino es
   Vercel Pro (~US$20/mes). Misma lógica: decisión de Jano, no algo que pase solo.

### 3.2 Capacidad estimada — cuánto aguanta gratis y cuándo mirar de cerca

De todos los límites de la tabla anterior, **el ancho de banda de Supabase (5GB/mes
gratis) es el que se toca primero, por lejos** — no la cantidad de usuarios de Auth
(aguanta 50.000), no el espacio de la base (con el modelo de datos liviano de
Stuniv, ahí entran decenas de miles de usuarios).

**Estimación conservadora inicial** (asumiendo el patrón de hoy, donde `/api/db`
trae TODO el blob en cada request): entre 300 y 1.000 usuarios activos/mes.

**En usuarios activos POR DÍA (la métrica que realmente importa para dimensionar):**
5GB/mes ÷ 30 días ≈ 166 MB/día de presupuesto. Con el patrón de hoy (~350-400 KB
de egress por usuario activo por día), eso da **~400-500 usuarios activos por día,
sosteniblemente, todos los días, sin acercarse al límite** — ya con la Fase 0 recién
migrada, sin ningún ajuste extra.

**Por qué ese número sube bastante con la propia migración, sin sumar nada extra:**
al pasar a tablas separadas (sección 6.11), cada pantalla deja de traer el blob
entero y pasa a pedir sólo lo que necesita (ej. la vista del timer no necesita el
historial completo de semestres archivados) — eso solo, sin ninguna pieza nueva,
puede reducir el peso por request varias veces, y sumado a mejoras de cacheo
razonables (que vos diseñás, sección 3.2.1) el techo sube a **~1.500-2.000
usuarios activos por día**, unos pocos miles al mes, gratis. Esto respeta la
arista 6 — son ajustes dentro del mismo stack, sin piezas nuevas.

**El techo real, honesto**: no existe una versión 100% gratis que aguante
cualquier volumen para siempre — en algún punto de crecimiento genuino, algo hay
que pagar. El objetivo acá no es evitarlo para siempre, es correrlo lo más lejos
posible sin complejizar, y que cuando llegue sea una decisión tomada con datos
(PostHog + el dashboard de uso de Supabase avisando con anticipación), no una
sorpresa. Y cuando llegue, la solución sigue siendo la misma de siempre: activar
Supabase Pro (~US$25/mes) — sin rediseñar nada, sin migrar de proveedor, un clic.
Nota: no hay certeza total de si Supabase corta de golpe o degrada gradualmente
al pasarse del límite gratis — confirmá esto en su documentación al implementar.

### 3.2.1 El objetivo de capacidad: maximizar, sin techo fijo

No hay un número exacto a cumplir — **optimizá al máximo la cantidad de
usuarios/tráfico diario que la app aguanta gratis, cuanto más mejor, sin techo
prefijado y sin pasar a ningún plan pago sin autorización explícita de Jano.**

Cómo lograrlo queda 100% a tu criterio técnico — no se prescribe la técnica (ni
cache, ni compresión, ni ninguna en particular). Dos condiciones fijas nada más:
- **No agregues ningún servicio/vendor nuevo** fuera de la tabla de la sección
  3.1 sin consultarle antes a Jano — ese es el límite real de "no
  sobrecomplejizar" (arista 6), no una restricción a la ingeniería en sí.
- **La optimización no puede empeorar la app visual ni funcionalmente** — tiene
  que verse y funcionar exactamente igual que hoy para el usuario; lo único que
  cambia es cuánto tráfico aguanta por detrás.

**Si después de optimizar en serio el techo gratis sigue sin alcanzar para el
volumen que Jano espera**: no actives nada pago por tu cuenta — reportá el
número real al que llegaste optimizando, y qué pasaría con Supabase Pro
(~US$25/mes) si se activara, para que Jano decida. Esa decisión siempre es de
Jano, y en la práctica ni siquiera es algo que puedas ejecutar vos solo
(necesita una tarjeta cargada en la cuenta, que no existe hoy).

### 3.3 Cuentas y tokens que Jano ya preparó antes de esta sesión

Las cuentas en sí no se pueden delegar (los signups tienen CAPTCHA/verificación de
mail a propósito para que un bot no los haga solo) — por eso Jano las creó él mismo
de antemano y generó un token de acceso por servicio. Con esos tokens, vos hacés
el resto (crear el proyecto, la base, las políticas, todo) sin que Jano tenga que
tocar ningún dashboard:

| Servicio | Lo que Jano ya preparó | Con eso, vos automatizás |
|---|---|---|
| Supabase | Cuenta + Access Token generado | Creás el proyecto entero vía CLI/Management API, sacás URL/anon key/service role key, corrés migraciones y políticas RLS |
| Upstash | Cuenta + API Key generada | Creás la base Redis vía API, la configurás para rate limiting |
| Sentry | Cuenta + Auth Token generado (`project:write`) | Creás el proyecto y sacás el DSN |
| PostHog | Cuenta + API Key generada | Instrumentás los eventos de signup/login/uso y armás los dashboards de crecimiento |
| Vercel | Token generado | Cargás TODAS las variables de entorno nuevas vía `vercel env add`, y renombrás el proyecto de `uca-economia` a `stuniv` (verificando que el subdominio `stuniv.vercel.app` esté libre; si no, una variante cercana) |
| GitHub (repo de backups) | Nada si `gh` ya está autenticado en la máquina | `gh repo create stuniv-backups --private` |

**Email transaccional (AWS SES o Resend) — no está preparado a propósito.** Jano
decidió dejarlo desactivado hasta comprar un dominio propio. Cuando eso pase, va a
avisar y ahí se agrega este servicio, junto con reactivar la recuperación de
contraseña (secciones 6.1 y 6.16).

**Credenciales**: están en `.env.local` en la raíz del repo (ya está en
`.gitignore`) — leelas de ahí, no le pidas a Jano que las pegue como texto.

**Al terminar la migración**: decile a Jano cuáles de los tokens de gestión amplia
(los que pueden crear/borrar proyectos enteros) ya cumplieron su función y puede
revocar, dejando activas solo las keys angostas que la app usa en producción (la
`anon key`, no el access token que crea proyectos) — mismo criterio de mínimo
privilegio que rige toda la sección 6.

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
- 🔴 Chequeá que cada ruta protegida realmente verifique sesión server-side, no
  solo que "parezca" protegida en el frontend.
- 🔴 Autenticación (quién sos) y autorización (qué podés hacer) son cosas
  distintas — se puede estar logueado y aun así no tener permiso para una acción
  puntual (ej: borrar el examen de otro usuario). Verificá ambas por separado.
- 🟡 **DIFERIDO — Recuperación de cuenta por código (OTP), no solo link.**
  Jano decidió no configurar ningún proveedor de email todavía (sección 3.1), así
  que este flujo queda **desactivado en la UI por ahora** (sin botón de "olvidé
  mi contraseña" visible, o con un mensaje de "próximamente") — no dejes un flujo
  a medio hacer ni roto a la vista. Diseño ya decidido para cuando se active:
  recibe un código de 6 dígitos por mail (no un link), lo ingresa en la app,
  define contraseña nueva — es una configuración nativa de Supabase Auth, no hay
  que programarla desde cero. Parámetros de seguridad no negociables para cuando
  se active:
    - El código expira rápido y es de un solo uso — al pedir uno nuevo, el
      anterior queda inválido automáticamente. El tiempo exacto de expiración lo
      definís vos según buenas prácticas actuales.
    - **Límite estricto de intentos** en el endpoint que verifica el código (vía
      Upstash, sección 3.1) — un código de 6 dígitos es adivinable por fuerza
      bruta si no se limitan los intentos. El número exacto de intentos
      permitidos antes de exigir un código nuevo lo definís vos.
    - La respuesta es igual exista o no ese email en la base (evita que alguien
      use el formulario para enumerar usuarios registrados).
    - Al confirmar la nueva contraseña, cerrá sesión en todos los demás
      dispositivos donde el usuario estuviera logueado.
  **Mientras tanto — fallback manual, 🔴 bloqueante esto sí**: Jano tiene que
  poder resetear la contraseña de un usuario a mano desde el dashboard/Admin API
  de Supabase (usando la `service_role key`) si alguien le escribe pidiendo
  ayuda. Sirve para un grupo chico de prueba, no escala a miles — es el motivo
  por el que activar el email transaccional pasa a ser la primera tarea cuando
  Jano compre el dominio, antes de sumar más usuarios de los que pueda atender
  manualmente uno por uno.
- 🔴 **Signup sin confirmación por email**: como tampoco hay proveedor de email
  para mandar el mail de "confirmá tu cuenta", configurá Supabase Auth para que
  las cuentas nuevas queden confirmadas automáticamente al registrarse (sin ese
  paso intermedio) — si no, nadie podría terminar de crear una cuenta. Esto se
  revisa también cuando se active el email más adelante (ahí sí se puede sumar la
  confirmación por mail si se quiere).
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
  confirmá vos cuál va en cada lado).
- ⚪ Preferir credenciales de corta duración (short-lived) sobre keys estáticas
  fijas, cuando el servicio lo permita.
- 🔴 Las llamadas a APIs externas (Anthropic, Stripe, ElevenLabs, lo que sea)
  siempre pasan por el servidor propio — nunca directo desde el browser.
- 🔴 `.env` en `.gitignore` desde el primer commit del proyecto (ya está así en
  Stuniv). Si en algún momento se sospecha que algo se subió igual, corré
  `git log --all --full-history -- .env` para chequear el historial completo.
- 🔴 Si se descubre que una key se filtró: rotala de inmediato (y todas las del
  mismo archivo, no solo la sospechosa) — recién después limpiar el historial de
  Git con `git filter-repo` o BFG Repo-Cleaner. El orden importa: mientras la key
  vieja siga activa, sirve igual aunque se borre el archivo del repo.
- 🔴 Secrets filtrados en el JavaScript del frontend: pasa cuando una variable de
  entorno sin el prefijo correcto (en Next.js, `NEXT_PUBLIC_` puesto donde no
  corresponde, o al revés, faltando donde sí correspondía) termina bundleada y
  visible en el código que llega al navegador. Revisá cada `NEXT_PUBLIC_*`
  manualmente antes de cada release.
- 🟡 Revisá que los logs de build de Vercel no impriman variables de entorno
  completas en consola durante el deploy.
- 🟡 Source maps expuestos en producción: facilitan a un atacante leer el código
  fuente original. Confirmá `productionBrowserSourceMaps: false` en
  `next.config.mjs` (es el default de Next.js, pero confirmalo explícitamente).
- ⚪ Si el repo de GitHub es público: cualquiera puede ver todo el historial de
  commits, no solo el código actual — si se subió algo sensible alguna vez, sigue
  ahí aunque se haya "borrado" en un commit posterior.

### 6.3 Base de datos — RLS, permisos y aislación multi-usuario

Esta es la sección más importante de todo el documento para Stuniv.

- 🔴 Activá **Row Level Security (RLS)** en TODAS las tablas — el 70% de las apps
  hechas con IA lo tienen desactivado. Sin RLS, cualquier usuario logueado puede
  leer datos de cualquier otro con una API call básica.
- 🔴 Supabase tiene un Security Advisor integrado que dice exactamente qué política
  falta — usá ese output para arreglarlo.
- 🔴 Cada usuario solo lee/escribe lo suyo, sin excepción — sin este punto no tiene
  sentido nada más de este documento.
- 🔴 Las políticas de RLS tienen que cubrir tanto `SELECT` como
  `INSERT`/`UPDATE`/`DELETE`, no solo lectura.
- 🔴 Si en algún momento se usa un bucket de storage (fotos de perfil, archivos
  subidos): confirmá que no quede público por error — es de las fugas más
  comunes y silenciosas (nadie se entera hasta que ya pasó).
- 🔴 **IDOR (Insecure Direct Object Reference)**: cuando un endpoint confía en el ID
  que manda el cliente sin verificar que le pertenezca a quien hace el request.
  Ejemplo concreto para Stuniv: `GET /api/materias/123` tiene que chequear
  server-side que la materia `123` sea del usuario logueado, no devolverla solo
  porque el ID es válido.
- 🔴 Nunca mandes `role: "admin"` (o cualquier rol/permiso) desde el frontend y
  confíes en eso — el rol se determina siempre server-side contra la base.
- 🟡 El usuario/rol técnico de base de datos que usa el backend no debería tener
  permisos de superadmin sobre toda la base — dale sólo lo que necesita.
- 🔴 **Este es EL punto central de la migración**: cada query tiene que estar
  filtrada por `user_id` a nivel de política de base de datos (RLS), no solo a
  nivel de código de la app — porque un bug en el código puede saltarse un filtro
  en JavaScript, pero no puede saltarse una política RLS en la base.
- **Caso real para tener muy presente**: una app con límites de uso de IA por
  usuario tenía mal configurado RLS — alguien encontró la forma de borrar sus
  propios límites (y los de otros), lo que en teoría podía generar una factura de
  $10.000 de costos de API. Es el ejemplo perfecto de por qué RLS no es opcional
  si en algún momento Stuniv tiene cualquier feature con límites de uso o cuotas.
- ⚪ Si en algún momento se arma un panel de admin: confirmá que no quede
  accesible sin login para cualquiera que encuentre la URL.

### 6.4 Protección contra ataques (inyecciones, XSS, CSRF, etc.)

- 🔴 Validá y sanitizá todos los campos en el servidor, no solo en el frontend —
  el cliente se puede bypassear siempre.
- 🔴 **SQL injection**: la defensa estructural es usar ORM y prepared statements
  — evaluá qué opción te convence más (Prisma, el client nativo de Supabase, u
  otra; no hace falta que sea una en particular), en vez de escapar manualmente.
  Un ORM separa el código SQL de los datos del usuario a nivel de protocolo —
  aunque alguien meta `admin' --` en un campo, nunca se interpreta como parte de
  la query SQL en sí.
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
    - Defensa en dos capas: (1) validá todo lo que entra con esquemas (Zod es una
      opción a evaluar, no la única), y (2) escapá las salidas — convertí `<` y
      `>` a texto plano para que el navegador no los reconozca como etiquetas
      ejecutables.
    - React ya escapa esto automáticamente en el render normal (`{variable}`
      dentro de JSX). Donde se rompe esa protección es si en algún momento se usa
      `dangerouslySetInnerHTML` — si se agrega texto con formato rico (negrita,
      itálica en notas, por ejemplo), ahí hay que sanitizar con alguna librería
      confiable (DOMPurify es una opción a evaluar) antes de renderizar.
    - 🟡 Header `Content-Security-Policy` (CSP): le dice al navegador que no
      ejecute ningún script que no venga del servidor propio — segunda capa de
      defensa por si algo se cuela pese al escape.
- 🟡 **CSRF (Cross-Site Request Forgery)**: ataque donde un sitio malicioso hace
  que el navegador del usuario logueado mande requests no autorizados a la propia
  API, aprovechando que ya tiene la cookie de sesión activa. Supabase Auth maneja
  esto con tokens anti-CSRF o `SameSite` cookies — confirmá que esté activo, no
  lo asumas.
- ⚪ **Uploads de archivos inseguros**: si en algún momento se deja subir archivos
  (PDFs para Lectura ya se hace hoy client-side; si se sube el procesamiento al
  servidor, o se agregan fotos de perfil), validá tipo de archivo real (no solo
  la extensión, que se puede falsear), tamaño máximo, y nunca ejecutes ni sirvas
  el archivo desde el mismo dominio sin sandboxing.
- ⚪ **Path traversal**: si algún endpoint arma una ruta de archivo a partir de un
  input del usuario, validá que no pueda meter `../../` para escaparse del
  directorio esperado y leer archivos del servidor que no debería.
- ⚪ **SSRF (Server-Side Request Forgery)**: si el backend hace requests a una URL
  que viene de un input del usuario (poco común hoy en Stuniv, pero si en algún
  momento se agrega "importar desde una URL" o similar), validá que esa URL no
  apunte a infraestructura interna (`localhost`, IPs internas de Vercel/AWS).

### 6.5 Rate limiting y abuso de API

- 🔴 Limitá requests por usuario y por IP en todos los endpoints públicos. Sin
  esto, bots pueden spamear la API y generar una factura enorme en
  Vercel/Supabase.
- 🔴 Aplica especialmente a: login, registro, búsqueda, y cualquier endpoint que
  llame a una API paga o con cuota — incluido `/api/tts` en Stuniv.
- ⚪ **Prompt injection en features de IA**: si en algún momento la app manda texto
  del usuario a un modelo de lenguaje, un atacante puede escribir instrucciones
  diseñadas para sobreescribir el prompt de sistema. Defensa: envolvé siempre el
  input del usuario en delimitadores claros y nunca dejes que el contenido del
  usuario llegue a la posición de "system prompt" — tiene que quedar marcado como
  "esto es input externo, no instrucción".
- ⚪ Herramientas o acciones de IA con acceso a datos: si alguna vez un agente de
  IA tiene la capacidad de leer/escribir en la base en nombre de un usuario, esa
  capacidad tiene que respetar los mismos permisos por usuario que el resto de la
  app (RLS incluido), no tener un acceso privilegiado paralelo.

### 6.6 CORS, headers y configuración de red

- 🔴 Configurá CORS para que solo acepte requests desde el dominio propio. Sin
  esto, páginas externas pueden hacer requests a la API usando la sesión de un
  usuario que tenga el sitio abierto.
- 🟡 Agregá Security Headers HTTP para evitar que la página se pueda embeber en un
  iframe falso (clickjacking).
- 🟡 Además del anti-clickjacking: `X-Content-Type-Options`,
  `Strict-Transport-Security` (fuerza HTTPS), y el `Content-Security-Policy` ya
  mencionado arriba.
- ⚪ Si en algún momento existe un entorno de staging/test público
  (`staging.stuniv.com`), protegelo con auth básica o IP allowlist — muchos
  atacantes buscan específicamente subdominios de staging porque suelen tener
  menos seguridad que producción.

### 6.7 Sesiones, cookies y tokens

- 🔴 Si se usa JWT en algún punto, el secret de firma tiene que ser largo, random,
  y único por entorno (no el mismo secret en dev y producción).
- 🔴 Cookies de sesión con `HttpOnly` (evita que JavaScript, incluido un script de
  XSS, pueda leerla), `Secure` (fuerza que solo viaje por HTTPS), y `SameSite`
  (mitiga CSRF). Con Supabase Auth bien configurado esto ya se maneja por
  default — confirmalo, no lo asumas.
- 🔴 Nunca guardes tokens de sesión en `localStorage` — es una señal clásica de
  auth mal hecho. Si el token de sesión vive en `localStorage` en vez de una
  cookie HTTP-only, cualquier extensión de Chrome maliciosa o ataque de XSS
  exitoso puede robar la sesión directamente leyendo el `localStorage`. Confirmá
  que no se esté guardando nada de sesión manualmente en `localStorage` en ningún
  lado del código (hoy Stuniv sólo guarda ahí el timer y la preferencia de tema —
  ninguno es sesión, está bien, pero prestá atención a que la migración no
  agregue esto por error).

### 6.8 Pagos y webhooks (⚪ condicional — solo si en algún momento se monetiza)

**No construyas nada de esto ahora — pero dejá constancia expresa de que la
arquitectura decidida (Postgres/Supabase + RLS) NO cierra esta puerta para
siempre.** Si más adelante Jano quiere vender Stuniv con Stripe (u otra
pasarela), lo único que hace falta agregar en ese momento es:
- Una tabla `suscripciones` (o una columna de plan en el perfil del usuario),
  vinculada por `user_id` con RLS igual que el resto — encaja directo en el
  mismo esquema relacional, no requiere cambiar de base ni de proveedor de auth.
- Un endpoint `/api/webhooks/stripe` que verifique la firma que manda Stripe.
- Que el chequeo de "¿este usuario tiene plan pago?" se haga siempre
  server-side (nunca confiar en un flag mandado por el cliente).

Stripe en sí tampoco rompe la arista de presupuesto $0: no cobra nada hasta que
se procesa un cobro real (se lleva un % de cada transacción, no una cuota fija
mensual) — se puede integrar el día que se decida monetizar sin haber pagado un
peso antes de esa fecha.

- Webhooks sin verificación de firma: si se integra Stripe o similar, cada
  webhook recibido tiene que verificar la firma que manda el proveedor — sin
  esto, cualquiera puede mandar un POST falso simulando "pago confirmado".
- Checks de pago o suscripción hechos solo en el frontend: el control de "¿este
  usuario pagó / tiene plan premium?" tiene que verificarse server-side en cada
  request relevante, nunca confiar en un flag que mandó el cliente.

### 6.9 Logs, monitoreo y auditoría

- 🔴 Revisá qué loguea la app en consola/logs de Vercel — es común que por error
  se loguee el body completo de un request que incluye datos sensibles (tokens,
  emails, contraseñas).
- 🟡 Mensajes de error: uno genérico tipo "Algo salió mal" sin código ni contexto
  deja ciego para debuggear, pero uno demasiado detallado mostrado al usuario
  final le da a un atacante información de cómo está armado el sistema por
  dentro. El equilibrio correcto: loguear el detalle completo del lado del
  servidor (idealmente en una herramienta como Sentry), y mostrarle al usuario un
  mensaje genérico con un código de referencia.
- 🔴 Confirmá que ninguna ruta de diagnóstico/debug usada durante desarrollo
  (`/api/debug`, `/test`) quede accesible una vez en producción.
- ⚪ Si en algún momento hay panel de administración: confirmá que tiene su
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
  banda de Supabase (sección 3.2). Trackeá como mínimo: signups (fecha de
  registro, para la curva de crecimiento), inicios de sesión (usuarios activos
  diarios/semanales/mensuales), y retención básica (¿vuelve al día 1/7/30?). Ojo
  con no mandar datos personales de más como propiedades de evento (nombre,
  email) más allá de lo necesario para el análisis.

### 6.10 Backups y recuperación

- 🔴 Configurá backups automáticos diarios (con el mecanismo propio de la sección
  3.1) y **probá el proceso de restore al menos una vez** antes de necesitarlo de
  verdad. El error que se repite en apps sin esto: alguien pierde la base de
  producción entera por una migración mal corrida, y la única respuesta posible
  es "estamos investigando el problema" porque no hay backup.
- 🔴 Migraciones de base de datos con IA: **nunca automáticas en producción**.
  Antes de correr cualquier cambio de schema (agregar columna, renombrar tabla,
  cambiar un tipo de dato): revisalo a mano, probalo primero en una base local o
  de desarrollo, hacé backup antes de aplicarlo en producción, y nunca ejecutes
  directamente un comando destructivo contra la base real sin que Jano lo revise.
  Esto aplica especialmente a Stuniv porque viene trabajando con Claude generando
  código de base de datos directamente.

### 6.11 Arquitectura de base de datos (que no se rompa al crecer)

- 🔴 No uses una sola tabla gigante con todo adentro (perfil + settings +
  historial + lo que sea) — es exactamente lo que hoy es el blob `uca_data` en
  Vercel KV. Cuando esa tabla crece, cada query se pone lenta porque tiene que
  leer filas mucho más pesadas de lo necesario. Separá en tablas relacionadas:
  `users`, `materias`, `sesiones_estudio`, `semestres`, `plan_estudio`, `notas`,
  vinculadas por `user_id`.
- La tabla/perfil de `users` necesita los campos nuevos de la sección 6.17:
  nombre, apellido, apodo, universidad, carrera, URL de foto de perfil, y el
  tema de color elegido — todos de personalización, no cambian la lógica de
  materias/sesiones.
- El bug de los emojis (3 bytes vs 4 bytes): en MySQL con charset `utf8` (mal
  llamado así históricamente), el límite es 3 bytes por carácter, pero los
  emojis modernos pesan 4 bytes — un insert con emoji puede tirar error o
  truncar el dato en silencio. Esto no le va a pasar a Stuniv al migrar a
  Postgres (Supabase), porque soporta UTF-8 completo nativamente sin
  configuración extra.
- 🟡 Indexing: revisá las queries más frecuentes y agregá índices en las
  columnas que más se filtran/ordenan (típicamente `user_id`, fechas de examen).
- 🔴 La connection string de la base (usuario y contraseña incluidos) tiene que
  vivir únicamente en variables de entorno del servidor, nunca en código ni en
  logs.
- 🔴 Cada campo que llega a la base debería pasar por una validación de
  tipo/formato (esquemas tipo Zod, u otra opción equivalente) antes de tocar la
  query, así un dato corrupto nunca llega a romper una columna con un tipo
  incompatible.

### 6.12 Performance y que no se ponga lenta

- 🟡 Caching: calculá una vez, cacheá, serví desde cache — no reproceses lo
  mismo en cada request (Stuniv ya hace esto client-side con el cache de 15s en
  `app/lib/api.ts` — mantené el equivalente del lado del servidor/DB).
- ⚪ Async / procesamiento en background: operaciones pesadas (mandar emails,
  generar reportes, procesos largos) van a una cola en background, el usuario no
  se queda esperando bloqueado.
- 🟡 Paginación: los endpoints que devuelven listas tienen que paginar siempre —
  nunca devolver la tabla entera de una. Esto es además un punto de seguridad:
  sin paginación, un solo GET puede dumpear toda la base de un saque.
- 🟡 Load testing antes de lanzar: simulá tráfico para encontrar cuellos de
  botella antes de que pase con usuarios reales — mejor que reviente en testing
  que en producción.
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

- 🔴 No confíes a ciegas en lo que instalás. Antes de aceptar un `npm install`
  sugerido, fijate en `package.json` que el paquete exista de verdad (buscalo en
  npmjs.com) y que no sea una versión vieja con vulnerabilidades conocidas. Los
  modelos de lenguaje a veces "alucinan" nombres de paquetes que suenan
  plausibles pero no existen — hay atacantes que registran esos nombres con
  malware adentro, apostando a que alguien los instale por confiar en la
  sugerencia de la IA.
- 🟡 Corré `npm audit` periódicamente — tira las vulnerabilidades conocidas de
  las dependencias directas y transitivas.
- 🔴 **Meta-punto de todo el documento**: cada cambio relevante que generés vos
  (sobre todo en auth, base de datos, o cualquier endpoint que toque datos de
  otro usuario), dejá que Jano lo pueda revisar antes de darlo por terminado, no
  lo corras solo porque "compila".

### 6.15 Control de versiones y deploys seguros

- 🔴 Commits chicos y frecuentes, no un commit gigante cada tanto. Si un cambio
  generado por IA rompe algo, con commits chicos se puede hacer un
  `git revert` quirúrgico de ese cambio puntual. Con un commit gigante, revertir
  hace perder todo lo bueno que vino junto con lo malo.
- 🟡 Probá en local (o en un branch/preview deploy de Vercel) antes de mergear a
  `main`/producción — Vercel arma automáticamente un preview deploy por cada PR.
- 🔴 Backup de base de datos antes de cualquier migración de schema (ya
  mencionado en backups, pero es el punto de mayor riesgo en cualquier
  "actualización").
- 🔴 Revisá el SQL generado para migraciones antes de correrlo — nunca lo dejes
  en automático contra producción.

### 6.16 Gestión de usuarios (operativa real)

- 🟡 Olvidé mi contraseña: ver el flujo de recuperación por código, diferido
  hasta que haya un proveedor de email (sección 6.1) — mientras tanto, fallback
  manual de Jano vía Supabase. **Esta es la ÚNICA de las cuatro acciones de esta
  sección que depende del dominio/email — las otras tres no necesitan nada de
  eso y se construyen ya.**
- 🔴 Cambiar contraseña estando logueado — **no depende del dominio ni de ningún
  proveedor de email**, es un flujo 100% distinto de "olvidé mi contraseña": el
  usuario ya está autenticado, solo confirma la clave actual + define la nueva
  vía la API de Supabase Auth, sin mandar ningún mail. Exigí re-ingresar la
  contraseña actual antes de aceptar la nueva (Supabase no lo fuerza por
  default, hay que pedirlo explícito) — si no, alguien con acceso momentáneo a
  una sesión abierta (compu compartida, etc.) podría apropiarse la cuenta sin
  saber la clave vieja. Ese endpoint también necesita rate limiting (si no,
  alguien puede hacer fuerza bruta de la contraseña actual). Al confirmar el
  cambio, cerrá sesión en todos los demás dispositivos.
- 🔴 Borrar un usuario sin romper la base — **tampoco depende del dominio/email**.
  El error típico es un `DELETE FROM users` directo que deja huérfanos (materias,
  sesiones que apuntaban a ese `user_id` quedan flotando, o la query rompe por
  foreign key constraint). Dos enfoques, recomendado usar los dos juntos:
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

### 6.17 Pantalla de Cuenta (nueva, requerida)

Jano pidió una sección de Cuenta con esta estructura de navegación: **en vez de
agregar otra pestaña más al nav como las demás, el nombre del usuario en la
esquina superior derecha (con su avatar/iniciales) abre un menú desplegable** —
de ahí se accede a "Configuración" (la pantalla de Cuenta en sí), "Ayuda", y
"Cerrar sesión" directo desde el menú sin entrar a ninguna pantalla.

**Estilo visual**: tipografía, border-radius, cards, etc. usan la identidad que
Stuniv ya tiene (Inter, navy/ocre/canvas como base, mismo lenguaje de
`GlassCard`/`GlassButton`) — la referencia que trajo Jano es solo para la
**distribución de contenido** (qué campos van y dónde), no el look. Definí el
look final vos, consistente con el resto de la app.

La pantalla de Cuenta/Configuración debe incluir:

- 🟡 **Perfil**: foto de perfil (subir imagen — aplican las reglas de uploads
  seguros de la sección 6.4: validar tipo real de archivo, tamaño máximo, bucket
  de Supabase Storage privado por default), nombre, apellido, apodo (visible en
  la app), **universidad** (dropdown de opciones fijas, ver abajo — NO texto
  libre, salvo la opción "Otra"), **carrera** (texto libre, sin restricción).
  Guardado explícito ("Guardar cambios"), no autoguardado silencioso.
    - **Universidad/carrera son campos nuevos de personalización** — Stuniv
      pasa a soportar estudiantes de distintas universidades, no solo UCA. Son
      campos de perfil/identidad (se muestran en el header, alimentan el tema de
      color abajo) — **no cambian ninguna lógica de la app**: las materias
      siguen siendo 100% editables a mano por el usuario como hoy, no hay un
      catálogo de carreras/materias por universidad que mantener. Mantené el
      alcance acotado a esto para no sobrecomplejizar (arista 6).
- 🟡 **Apariencia**: dos cosas separadas, no una sola:
    1. El toggle Clásico 2D ↔ Vidrio 3D que Stuniv ya tiene
       (`app/components/ThemeToggle.tsx`) — **reubicalo** acá en vez de dejarlo
       al final de la home, no lo reconstruyas.
    2. **Nuevo**: tema de color por universidad — cambia la paleta de color
       global de la app (reemplaza el ocre/navy de acento) según la
       universidad elegida en Perfil. Mapeo fijo, decidido por Jano:

      | Paleta | Universidades |
      |---|---|
      | Azul y Blanco | UCA, UADE, ITBA, Austral, Udesa |
      | Bordó y Blanco | UAI, UCEMA, Kennedy, UB |
      | Negro y Blanco | UBA, UTN, UP |
      | Verde y Blanco | USAL, UNLP |
      | Amarillo/Dorado y Blanco | (sin universidad asociada — solo disponible como opción manual) |

      El dropdown de Universidad en Perfil tiene estas opciones fijas más
      **"Otra"** (ahí sí se escribe el nombre libremente) — si elige "Otra", no
      hay paleta automática, se le ofrece elegir cualquiera de las cinco a
      mano. **El usuario siempre puede volver a esta pantalla y cambiar la
      paleta manualmente**, sin importar qué universidad haya puesto en
      Perfil — la asignación automática es solo el valor sugerido inicial, no
      una restricción. Definí vos los tonos exactos de cada paleta y cómo
      parametrizar técnicamente los colores hoy hardcodeados (navy/ocre) — no
      hace falta logos/escudos por universidad, alcanza con la paleta de
      color. Esta preferencia se guarda en el perfil del usuario en la base
      (no solo en `localStorage` como hoy el tema Clásico/Vidrio), para que
      viaje entre dispositivos.
- 🔴 **Cambiar contraseña** (ver arriba) — con confirmación inline antes de
  aplicar el cambio.
- 🔴 **Eliminar cuenta** (ver arriba, soft-delete) — con confirmación inline
  explícita (no un solo clic), siguiendo la regla de diseño que ya rige Stuniv
  para toda acción destructiva (`PROYECTO.md` → "Reglas de diseño fijas":
  *"Acciones destructivas: SIEMPRE confirmación inline (Sí/No)"*) — mismo patrón
  que ya se usa en `/semestre` para "Reiniciar datos".
- 🟡 **Cerrar sesión**: disponible tanto en el menú desplegable directo como
  dentro de la pantalla de Cuenta.

Todas las acciones con efecto persistente (perfil, apariencia, cambiar
contraseña, eliminar cuenta) necesitan su propia confirmación inline
independiente donde corresponda (obligatorio en cambiar contraseña y eliminar
cuenta; para perfil/apariencia alcanza con que "Guardar" sea un paso explícito,
no autoguardado) — ninguna acción irreversible se ejecuta con un solo clic
accidental.

**Actualizá `PROYECTO.md`** cuando esto quede construido: la sección "Reglas de
diseño fijas" tiene que incluir el nuevo sistema de temas de color por
universidad, ya que hoy dice explícitamente "paleta fija navy/ocre/canvas".

---

## 7. Apéndice — Las 50 vulnerabilidades, checklist final rápido

Usá esto como pasada final antes de cada lanzamiento importante — tildá cada una a
medida que la confirmás resuelta (ya están desarrolladas en detalle en la sección 6):

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

### Auditoría pre-lanzamiento

Cuando termines la Fase 0 y esté probada, corré vos mismo esto sobre lo que
armaste (no esperes que Jano te lo pida en otro mensaje) y arreglá lo que
encuentres:

```
Act as a senior security engineer. Audit my entire codebase for vulnerabilities,
specifically checking for exposed environment variables, missing rate limits, and
database security rules.
```

---

## 8. Orden de ejecución (fases, sobre el checklist de la sección 6)

- **Fase 0 — bloqueante, antes de que exista un segundo usuario**: todo lo marcado
  🔴 arriba, incluyendo el signup sin confirmación por email, el fallback manual
  de reset de contraseña por Jano vía Supabase (sección 6.1), y la pantalla de
  Cuenta con cambiar contraseña + eliminar cuenta (sección 6.17, ambas sin
  dependencia de email). No hay proveedor de email configurado todavía a
  propósito. Es, en esencia: migrar a Postgres/Supabase con RLS en todas las
  tablas, Supabase Auth con logout real e IDOR resuelto, updates atómicos por
  fila, secrets solo server-side, backups activados, y ningún commit de base de
  datos sin revisión humana.
- **Fase 1 — antes de abrir la app públicamente (aunque sea a pocos usuarios)**:
  todo lo marcado 🟡 — rate limiting, headers de seguridad, CORS, cookies
  confirmadas, paginación, `npm audit` limpio, monitoreo básico (Sentry),
  analytics de producto (PostHog) para ver adopción y velocidad de crecimiento.
- **Fase 2/condicional — según lo que se agregue con el tiempo**: todo lo
  marcado ⚪ — pagos/webhooks (solo si se monetiza), prompt injection (solo si
  se agrega IA de cara al usuario), uploads/path traversal/SSRF (solo si se
  agregan esas features puntuales).

## 9. Modo de ejecución y reglas para esta migración

**Una sola pasada, no ida y vuelta por mensaje.** Como hoy Stuniv la usa un solo
usuario (Jano), no hay datos de terceros en riesgo todavía — eso baja mucho el
costo de un error durante la migración, así que tenés autonomía para resolver
toda la Fase 0 de corrido en esta misma sesión, sin pedir confirmación paso a
paso.

- **Único paso obligatorio antes de tocar cualquier dato real**: exportá/hacé
  backup del `uca_data` actual de Vercel KV en un archivo del repo (el único dato
  en juego hoy es el de Jano mismo). Hecho eso, no necesitás aprobación
  intermedia para el resto.
- **Commits chicos y frecuentes** a medida que avanzás, no un commit gigante al
  final — así un `git revert` puntual sigue siendo posible aunque la sesión haya
  sido de una sola pasada.
- Ningún punto de la sección 6 se da por sobreentendido "porque Supabase/Next.js
  ya lo hace por default" — confirmalo contra la documentación real y dejalo
  explícito en código/config.
- Los servicios de terceros y sus costos ya están decididos en la sección 3.1
  (todo en tier gratuito: Vercel Hobby, Supabase free, Upstash Redis, Sentry,
  PostHog, backup propio gratuito con mecanismo a definir por vos — sin
  proveedor de email por ahora, a propósito) — no hace falta que propongas
  alternativas ni preguntes por presupuesto, ya está resuelto.
- **Optimizá al máximo la capacidad diaria gratis, sin techo fijo** (sección
  3.2.1), sin sumar ningún servicio nuevo, y sin activar ningún plan pago sin
  autorización explícita de Jano.
- **Renombrá el proyecto de Vercel** de `uca-economia` a `stuniv` (sección 3.3).
- **Versioná esta migración como v10 de Stuniv en `PROYECTO.md`** (no como una
  continuación incremental de v8.6), dado el peso del cambio de arquitectura.
- **Access Control Matrix**: definí por escrito qué puede hacer cada tipo de
  usuario según su nivel de permisos (usuario normal, admin si llega a existir),
  y dejalo en `PROYECTO.md` o en un `CLAUDE.md` del repo. La mayoría de
  vulnerabilidades en apps "vibecodeadas" no son código malo — es que el agente
  no tenía el contexto de qué debía estar permitido o no.
- Al terminar, corré vos mismo el prompt de auditoría de la sección 7 sobre lo
  que armaste, y arreglá lo que encuentres — sin esperar que Jano lo pida en
  otro mensaje.
- Actualizá `PROYECTO.md` con el nuevo estado (infraestructura, stack, modelo de
  datos) al terminar — es la regla que ya rige el resto del proyecto.
- Cerrá con un resumen único: qué quedó resuelto de la sección 6, el número real
  de usuarios/día al que llegó la optimización de capacidad, qué falta (si algo
  quedó pendiente), y qué tiene que hacer Jano manualmente (revocar tokens de
  gestión amplia, comprar el dominio cuando quiera activar el email, etc.).
