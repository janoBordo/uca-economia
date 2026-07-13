# Migración multi-usuario v10 — cierre (3 fases, branch `migracion-v10`)

Resumen de cierre de toda la migración ([`MIGRACION-MULTIUSUARIO.md`](./MIGRACION-MULTIUSUARIO.md)), entregado al terminar la Fase 3. El detalle técnico versionado vive en [`PROYECTO.md`](./PROYECTO.md).

**Fase 3 completada**: `/api/db` ya sirve datos por-usuario desde Supabase (el bloqueante del merge quedó destrabado), pantalla de Cuenta según 6.17 completa, auditoría de la sección 7 corrida sobre las 3 fases con su único hallazgo arreglado, y las 3 suites e2e en verde (25 + 32 + 33 checks).

## Sección 6 — qué quedó resuelto y verificado

| Punto | Estado |
|---|---|
| 6.1 Autenticación y accesos | ✅ Login/registro/OTP con Turnstile, confirmación de email por `token_hash`, logout real revocado server-side, rutas protegidas server-side (verificado en e2e) |
| 6.2 Secrets y env vars | ✅ Al cliente solo llegan las 3 `NEXT_PUBLIC_*` públicas por diseño (re-verificado en auditoría); sourcemaps off |
| 6.3 RLS / aislación / IDOR | ✅ RLS forzado en 6 tablas + bucket privado; IDOR probado por e2e en datos, perfil, avatar y RPCs; Security Advisor re-consultado post-Fase 3: **0 hallazgos** |
| 6.4 Inyecciones/XSS/CSRF/uploads | ✅ Zod estricto en todo endpoint, queries parametrizadas, React escapa salidas + CSP, cookies SameSite=Lax sin CORS; uploads (antes ⚪): magic bytes, 400KB, bucket privado, path solo de la sesión |
| 6.5 Rate limiting | ✅ Todos los endpoints (escrituras sensibles fail-closed) — verificado por grep endpoint por endpoint + 429 en e2e |
| 6.6 CORS/headers | ✅ Same-origin, CSP/HSTS/X-Frame-Options DENY/nosniff |
| 6.7 Sesiones/cookies | ✅ HttpOnly+Secure+Lax confirmado en Set-Cookie real; jwt 900s; nada de sesión en localStorage |
| 6.8 Pagos | ⚪ No aplica; la arquitectura deja la puerta abierta (documentado) |
| 6.9 Logs/monitoreo | 🟡 **Parcial**: errores genéricos al cliente + detalle en logs ✅; **Sentry y PostHog no instalados** |
| 6.10 Backups | ✅ Diario 03:00 AR con prueba de restore en cada corrida |
| 6.11 Arquitectura DB | ✅ 6 tablas relacionadas, índices, migraciones versionadas, campos 6.17 en profiles |
| 6.12 Performance/paginación | 🟡 Cache cliente + egress optimizado + lecturas acotadas (límites por tabla) ✅; **load testing formal no hecho** |
| 6.13 Race conditions | ✅ `add_minutos` y `archivar_semestre` atómicos en la base (el bug histórico de `_delta` muerto de raíz, probado) |
| 6.14 Dependencias | 🟡 Cero deps nuevas en las 3 fases; `npm audit` con 2 advisories cuyo fix es **Next 16 (breaking)** — decisión de Jano |
| 6.15 Versionado | ✅ 12 commits chicos en el branch; preview deploy de Vercel disponible para probar antes del merge |
| 6.16 Gestión de usuarios | ✅ Recuperación OTP, cambio de contraseña (re-auth + rate limit + cierra otras sesiones), soft delete + hard delete a 30 días |
| 6.17 Pantalla de Cuenta | ✅ Completa: menú desplegable en el Nav, perfil con foto, universidad/carrera, apariencia (toggle reubicado + 5 paletas con el mapeo exacto del documento, persistidas en la cuenta), contraseña y eliminar con confirmación inline |

**Falta (menores, marcados a propósito)**: Sentry/PostHog, OAuth Google/Apple, load testing, Next 16, `localhost` en Turnstile para probar login local.

**Hallazgo de la auditoría (arreglado)**: el reemplazo de `sesiones` sin `_delta` permitía plantar una fila con `materia_id` de otro usuario (el FK valida existencia, no dueño) y romperle la suma de minutos; ahora ese camino solo acepta el reset `{}` (+ check e2e).

## Capacidad — número real, medido

Un GET típico con un semestre cargado pesa **5.4KB crudo / 0.75KB comprimido en el cable** (verificado que PostgREST manda gzip). Contra los ~166MB/día del tier gratis de Supabase: **~1.500 usuarios activos/día sostenibles con uso mixto realista**, techo ~3.000/día si el uso promedio es moderado — versus ~400-500/día del patrón viejo. La palanca principal: el historial de semestres (lo único que crece sin techo) solo viaja cuando `/semestre` lo pide (`?full=1`).

## Qué tiene que hacer Jano antes de mergear a main

1. **Registrarse** en el preview deploy del branch (`/registro` con `janobordo@gmail.com` — Turnstile solo pasa en `*.vercel.app`) y confirmar el email.
2. **Avisar si usó la app en main después del 12/07** (el backup migrable es de esa fecha) — si no hubo cambios, se corre directo `node scripts/migrar-kv-a-supabase.mjs .env.local janobordo@gmail.com` y quedan sus datos en su cuenta.
3. **Probar en el preview** lo que localmente no se puede (Turnstile real): login, cambiar contraseña en `/cuenta`, subir foto.
4. **Mergear** — y después: renombrar el proyecto Vercel a `stuniv` + actualizar `site_url` de Supabase, decidir Next 16, y **revocar los tokens amplios** (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `UPSTASH_API_KEY`, etc. — lista exacta en PROYECTO.md), con la salvedad de que la suite de Fase 1 usa `SUPABASE_ACCESS_TOKEN` para el toggle del CAPTCHA.
