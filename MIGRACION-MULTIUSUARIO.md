# Stuniv → Multi-usuario: documento de contexto para la migración

Este documento es para pegarle/adjuntarle a Fable 5 (u otra sesión de Claude dedicada)
al arrancar la migración de Stuniv de app personal a app multi-usuario. Consolida el
checklist de seguridad que trajo Jano + el estado real del proyecto, priorizado para
esta migración puntual. No es el registro de cambios del día a día — ese es
`PROYECTO.md`, que sigue siendo la fuente de verdad del estado actual de la app.

---

## 1. Objetivo

Migrar Stuniv de "app web personal de un solo usuario" a "app web multi-usuario, con
la puerta abierta a una versión descargable (PWA / mobile) más adelante". Nadie más
usa la app hoy — es la ventana ideal para hacer el cambio de arquitectura bien, antes
de tener datos reales de terceros en juego.

## 2. Las 5 prioridades de Jano (en ese orden de peso, no de secuencia)

1. **Seguridad** — que un usuario nunca pueda ver ni tocar datos de otro.
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
  no toca la DB, no tiene costo, no necesita cambios de seguridad más allá de rate
  limiting básico si se abre a más usuarios.
- Sin analytics, sin monitoreo de errores, sin backups configurados (no aplica hoy
  porque KV no tiene ese concepto igual que Postgres).

## 6. Checklist priorizado para esta migración

Organizado en fases. **No hay que resolver las 50 vulnerabilidades del PDF original
de una — la mayoría son condicionales ("si en algún momento agregás X").** Lo que
sigue es lo que aplica a Stuniv de verdad, ordenado por cuándo importa.

### Fase 0 — Bloqueante antes de que exista un segundo usuario

- [ ] Migrar Vercel KV → Postgres (Supabase), schema separado por tabla:
      `users`, `materias`, `sesiones_estudio`, `semestres`, `plan_estudio`, `notas`
      — todas con `user_id` (foreign key), nada de un blob JSON gigante.
- [ ] Activar **RLS en todas las tablas**, políticas que cubran SELECT +
      INSERT/UPDATE/DELETE (no solo lectura). Cada policy filtra por
      `auth.uid() = user_id`. Este es el punto que hace al resto tener sentido.
- [ ] Supabase Auth: login con email+contraseña, y Google/Apple Sign-In.
      Logout real (sesión invalidada server-side).
- [ ] Ningún endpoint confía en un `user_id` que mande el cliente — siempre se saca
      de la sesión autenticada server-side (evita IDOR, el #33 del checklist).
- [ ] Updates atómicos por fila para operaciones concurrentes (ej: sumar minutos
      de estudio) — nunca leer-modificar-escribir desde la app. Esto reemplaza el
      parche `_delta` actual de raíz.
- [ ] `.env` con las credenciales de Supabase (connection string, anon key, service
      role key) — nunca en el cliente salvo la `anon key` pública que Supabase
      diseña para ir en el frontend (confirmar con Fable 5 cuál va en cada lado).
- [ ] Borrado de usuario: soft-delete (`deleted_at`) por default + foreign keys con
      `ON DELETE CASCADE` para cuando se pida borrado definitivo.

### Fase 1 — Antes de abrir la app públicamente (aunque sea a pocos usuarios)

- [ ] Rate limiting en login, signup, y cualquier endpoint que llame a una API
      externa (incluido `/api/tts`).
- [ ] Validación de inputs en el servidor con Zod (no solo confiar en el frontend).
- [ ] CORS restringido al dominio propio.
- [ ] Security headers (CSP, X-Content-Type-Options, Strict-Transport-Security,
      anti-clickjacking) — pedirle esto explícito a Fable 5, es una tarea acotada.
- [ ] Cookies de sesión con `HttpOnly` + `Secure` + `SameSite` (Supabase Auth ya lo
      maneja bien por default — confirmar, no asumir).
- [ ] Mensajes de error genéricos al usuario, detalle completo solo en logs del
      servidor.
- [ ] Ninguna ruta de debug/test vieja (`/api/debug`, etc.) accesible en producción.
- [ ] Paginación en cualquier endpoint que devuelva listas (a futuro, si
      `sesiones`/`semestres` crecen mucho por usuario).
- [ ] Backups automáticos de la base activados (Supabase los tiene incluidos en el
      plan) + probar un restore al menos una vez.
- [ ] `npm audit` corrido y limpio; revisar que cada dependencia nueva exista de
      verdad en npmjs.com antes de instalarla (los agentes de IA a veces alucinan
      nombres de paquetes).

### Fase 2 — Calidad de vida / cuando ya hay usuarios reales

- [ ] Error tracking (Sentry, tier gratuito alcanza para empezar).
- [ ] Analytics básico (PostHog, tier gratuito) si se quiere saber uso real.
- [ ] Mail de soporte separado del Gmail personal.
- [ ] Skeleton loaders en vez de spinners, optimistic UI en acciones frecuentes
      (tildar materia estudiada, sumar minutos) — mejora percepción de velocidad
      sin tocar el backend.

### Fase 3 — Solo si se monetiza o se abre a otros países

- [ ] Webhooks de pago verificados por firma; check de plan pago siempre
      server-side.
- [ ] Política de privacidad + términos y condiciones (obligatorio si se recopila
      cualquier dato personal, revisar con un abogado antes de publicar).
- [ ] Cookie consent si hay usuarios en Europa.
- [ ] Verificar el nombre "Stuniv" en INPI/redes/dominio antes de registrar marca.

## 7. Reglas para Fable 5 al ejecutar esta migración

- **Proponer un plan por fases y esperar confirmación antes de ejecutar** —
  sobre todo la Fase 0 (auth + base de datos), que es irreversible si se hace mal.
  Esto no se decide solo agente, se avisa antes (así trabaja Jano siempre acá,
  ver `PROYECTO.md` → "Cómo le gusta trabajar a Jano").
- **Commits chicos y frecuentes**, no un commit gigante con toda la migración —
  así un `git revert` puntual es posible si algo rompe.
- **Nunca correr una migración de schema directo contra producción** sin: (1)
  probarla en local/desarrollo primero, (2) backup previo, (3) el SQL generado
  revisado a mano por Jano antes de ejecutar.
- **Nunca dejar un comando destructivo (DROP, DELETE sin WHERE, etc.) en manos de
  un agente sin revisión humana previa.**
- Actualizar `PROYECTO.md` con cada fase completada (infraestructura, stack,
  modelo de datos) — es la regla que ya rige el resto del proyecto.
- Definir por escrito una **Access Control Matrix** simple (qué puede hacer un
  usuario normal vs. un admin, si llega a existir un rol admin) y dejarla en
  `PROYECTO.md` o en un `CLAUDE.md` — la mayoría de vulnerabilidades en apps
  "vibecodeadas" no son código malo, son falta de este contexto explícito.
- Mantener todo en tiers gratuitos (Supabase free, Vercel free/hobby) mientras
  el número de usuarios lo permita; si algo va a generar costo, avisar antes de
  activarlo, no después.

## 8. Qué evitar en pantallas nuevas (pulido de producto, no seguridad)

Esto no afecta la seguridad pero vale la pena tenerlo presente en las pantallas de
login/registro/onboarding que se agreguen:
- No abusar de badges/tags redondeados en cada título de sección.
- No agrupar métricas siempre de a 3 o de a 4 en cajitas por costumbre.
- No abusar del efecto glass en TODO — Stuniv ya tiene su propio modo Vidrio 3D
  cuidado a mano, no hace falta imitar el patrón genérico de IA en pantallas nuevas.
- Sin marquesinas/loops infinitos de texto salvo que cumplan una función real.

---

## Prompt para pegar en Fable 5 (nueva sesión)

```
Vas a ayudarme a migrar Stuniv (app de gestión de estudio, hoy funcional para un
solo usuario) de Vercel KV a una arquitectura multi-usuario segura: Postgres
(Supabase) con Row Level Security, Supabase Auth para el login, y todo lo necesario
para que un usuario nunca pueda ver ni tocar datos de otro.

Te adjunto MIGRACION-MULTIUSUARIO.md con todo el contexto: las 5 prioridades (en
este orden de peso: seguridad, fluidez/ligereza, que no se rompa, que no cueste
dinero, que se pueda seguir mejorando), la decisión de arquitectura ya tomada
(Postgres/Supabase + RLS + Supabase Auth), y un checklist priorizado en fases
(Fase 0 = bloqueante, Fase 1 = antes de abrir la app, Fase 2 y 3 = más adelante).

Quiero que:
1. Leas el documento completo y el PROYECTO.md del repo (estado actual real del
   stack) antes de proponer nada.
2. Me propongas un plan de migración por fases, empezando SOLO por la Fase 0, con
   pasos concretos y el orden en que los harías. No empieces a programar todavía —
   quiero revisar el plan primero.
3. Cada paso que toque autenticación o el schema de la base de datos me lo
   expliques antes de ejecutarlo, con el SQL o la migración a la vista para que
   lo revise yo antes de correrlo contra cualquier base real.
4. Mantengas todo en tiers gratuitos (Supabase free, Vercel free/hobby) — avisame
   si algún paso puede generar costo antes de activarlo.
5. Sigas las reglas de ejecución de la sección 7 del documento adjunto (commits
   chicos, nunca migraciones destructivas automáticas, actualizar PROYECTO.md al
   cerrar cada fase).

Cuando terminemos la Fase 0 y esté probada, corré como auditoría final este check
(es el prompt de auditoría del checklist de seguridad original):

"Act as a senior security engineer. Audit my entire codebase for vulnerabilities,
specifically checking for exposed environment variables, missing rate limits, and
database security rules."

Empezá pidiéndome lo que necesites para arrancar (acceso al repo, si ya tengo
cuenta de Supabase creada, etc.) y después mostrame el plan de la Fase 0.
```
