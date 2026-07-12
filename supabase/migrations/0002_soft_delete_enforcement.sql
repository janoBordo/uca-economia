-- ============================================================
-- Stuniv v10 — Fase 1, migración 0002
-- Un access token (JWT) emitido antes de eliminar la cuenta sigue siendo
-- criptográficamente válido hasta que expira (diseño de Supabase). Para que
-- una cuenta soft-deleted pierda acceso a los DATOS al instante, las
-- políticas RLS exigen además que el perfil no esté marcado como eliminado.
-- (Complemento: jwt_exp se bajó a 900s vía config de Auth.)
--
-- El chequeo va como subquery inline sobre profiles (la política de profiles
-- ya limita a la fila propia y activa, así que no hay recursión ni fuga) —
-- sin funciones security definer, que el Security Advisor marca.
-- ============================================================

-- profiles: chequeo directo por columna
alter policy profiles_select_own on public.profiles
  using (id = auth.uid() and deleted_at is null);
alter policy profiles_update_own on public.profiles
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid() and deleted_at is null);

-- resto de las tablas: la cuenta tiene que estar activa
alter policy materias_select_own on public.materias
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy materias_insert_own on public.materias
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy materias_update_own on public.materias
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null))
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy materias_delete_own on public.materias
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));

alter policy sesiones_select_own on public.sesiones_estudio
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy sesiones_insert_own on public.sesiones_estudio
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy sesiones_update_own on public.sesiones_estudio
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null))
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy sesiones_delete_own on public.sesiones_estudio
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));

alter policy semestres_select_own on public.semestres
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy semestres_insert_own on public.semestres
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy semestres_update_own on public.semestres
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null))
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy semestres_delete_own on public.semestres
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));

alter policy plan_select_own on public.plan_estudio
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy plan_insert_own on public.plan_estudio
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy plan_update_own on public.plan_estudio
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null))
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy plan_delete_own on public.plan_estudio
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));

alter policy notas_select_own on public.notas
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy notas_insert_own on public.notas
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy notas_update_own on public.notas
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null))
  with check (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));
alter policy notas_delete_own on public.notas
  using (user_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deleted_at is null));

-- limpieza del helper de la primera versión de esta migración
drop function if exists public.is_active_user();
