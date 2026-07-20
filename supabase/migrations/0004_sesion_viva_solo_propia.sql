-- ============================================================
-- Stuniv v10.9 — hardening de sesion_viva (auditoría de seguridad)
--
-- ⚠ PENDIENTE DE APLICAR A MANO (regla fija: las migraciones no se corren
--   automáticas en producción). Es un cambio chico y no destructivo:
--   redefine una función, no toca tablas ni datos. Aplicar desde el SQL
--   Editor del dashboard de Supabase y después re-correr
--   `node scripts/test-revocacion-e2e.mjs` (debe seguir 7/7).
--
-- Qué corrige: sesion_viva(uuid) es SECURITY DEFINER (necesario: el rol
-- authenticated no puede leer auth.sessions) y respondía si CUALQUIER uuid
-- de sesión existe — un oráculo de "esta sesión existe" para cualquier
-- usuario logueado. Riesgo real bajísimo (los uuid v4 tienen 122 bits de
-- azar, no se adivinan), pero el principio de mínimo privilegio manda:
-- ahora solo responde sobre sesiones DEL PROPIO usuario (s.user_id =
-- auth.uid()). Para el caller legítimo (get_app_data validando la sesión
-- del JWT propio) el comportamiento es idéntico.
-- ============================================================

create or replace function public.sesion_viva(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = p_session_id
      and s.user_id = auth.uid()
  );
$$;
revoke all on function public.sesion_viva(uuid) from public, anon;
grant execute on function public.sesion_viva(uuid) to authenticated;
