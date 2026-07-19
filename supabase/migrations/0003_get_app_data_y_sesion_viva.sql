-- ============================================================
-- Stuniv v10.5 — GET /api/db en un solo round-trip SIN aflojar seguridad
--
-- Contexto: hasta ahora GET /api/db hacía getUser() (round-trip al Auth
-- server) + 5 queries paralelas a PostgREST. Este RPC arma el AppData
-- completo en UNA sola llamada y, para conservar la garantía de
-- "sesión revocada → 401 INMEDIATO" (verificada por la suite e2e de
-- Fase 2), valida contra auth.sessions — la MISMA tabla que consulta el
-- Auth server en getUser(): logout / cambio de contraseña (scope others)
-- / eliminar cuenta borran la fila de la sesión, así que este chequeo
-- corta al instante, sin ventana de 15 minutos.
--
-- get_app_data es SECURITY INVOKER: corre como el usuario logueado y
-- TODAS las lecturas internas pasan por las políticas RLS de 0001/0002
-- (fila propia + perfil no soft-deleted). sesion_viva sí es SECURITY
-- DEFINER (authenticated no puede leer auth.sessions) pero con
-- search_path fijo y firma mínima (uuid → boolean, sin datos).
-- ============================================================

-- ¿La sesión del JWT sigue viva? (la fila existe en auth.sessions)
create or replace function public.sesion_viva(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.sessions s where s.id = p_session_id);
$$;
revoke all on function public.sesion_viva(uuid) from public, anon;
grant execute on function public.sesion_viva(uuid) to authenticated;

-- AppData completo del usuario en un solo round-trip.
-- Réplica exacta del contrato del getData() viejo de app/api/db/route.ts:
--   materias    [{id,nombre,examen("YYYY-MM-DDTHH:MM" | ""),metaHoras}] orden posicion,created_at, límite 50
--   sesiones    {materiaId: minutos} solo minutos > 0, límite 50
--   preparacion {materiaId: 0..100} solo > 0
--   planEstudio {"YYYY-MM-DD": [materiaId]} solo arrays no vacíos, límite 400
--   notas       [texto] orden posicion, límite 100
--   semestres   [] salvo p_full: [{id,numero,nombre,materias,sesiones,archivedAt}] orden numero, límite 100
create or replace function public.get_app_data(p_full boolean default false)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_sid  uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  v_sid := nullif(current_setting('request.jwt.claims', true)::jsonb->>'session_id', '')::uuid;
  if v_sid is null or not public.sesion_viva(v_sid) then
    raise exception 'sesion_revocada';
  end if;
  -- Cuenta soft-deleted ⇒ 401 (matriz de acceso: usuario eliminado = nada).
  -- Antes este corte lo daba el ban vía getUser(); acá lo da el perfil: la
  -- policy profiles_select_own (RLS, security invoker) solo ve perfiles vivos.
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'sesion_revocada';
  end if;

  return jsonb_build_object(
    'materias', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'nombre', m.nombre,
        'examen', coalesce(to_char(m.examen, 'YYYY-MM-DD"T"HH24:MI'), ''),
        'metaHoras', m.meta_horas
      ) order by m.posicion, m.created_at)
      from (
        select id, nombre, examen, meta_horas, posicion, created_at
        from public.materias where user_id = v_user
        order by posicion, created_at limit 50
      ) m
    ), '[]'::jsonb),
    'sesiones', coalesce((
      select jsonb_object_agg(s.materia_id::text, s.minutos)
      from (
        select materia_id, minutos from public.sesiones_estudio
        where user_id = v_user and minutos > 0 limit 50
      ) s
    ), '{}'::jsonb),
    'preparacion', coalesce((
      select jsonb_object_agg(m2.id::text, m2.preparacion)
      from (
        select id, preparacion from public.materias
        where user_id = v_user and preparacion > 0
        order by posicion, created_at limit 50
      ) m2
    ), '{}'::jsonb),
    'planEstudio', coalesce((
      select jsonb_object_agg(to_char(p.fecha, 'YYYY-MM-DD'), to_jsonb(p.materia_ids))
      from (
        select fecha, materia_ids from public.plan_estudio
        where user_id = v_user and cardinality(materia_ids) > 0 limit 400
      ) p
    ), '{}'::jsonb),
    'notas', coalesce((
      select jsonb_agg(n.texto order by n.posicion)
      from (
        select texto, posicion from public.notas
        where user_id = v_user order by posicion limit 100
      ) n
    ), '[]'::jsonb),
    'semestres', case when p_full then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', se.id, 'numero', se.numero, 'nombre', se.nombre,
        'materias', se.materias, 'sesiones', se.sesiones,
        'archivedAt', to_char(se.archived_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"+00:00"')
      ) order by se.numero)
      from (
        select id, numero, nombre, materias, sesiones, archived_at
        from public.semestres where user_id = v_user
        order by numero limit 100
      ) se
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke all on function public.get_app_data(boolean) from public, anon;
grant execute on function public.get_app_data(boolean) to authenticated;
