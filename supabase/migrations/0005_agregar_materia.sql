-- Alta individual, con el mismo límite de filas de materias que valida /api/db.
create or replace function public.agregar_materia(p_id uuid, p_nombre text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_posicion integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 5));

  -- Un reintento con el mismo id no duplica la materia ni pisa sus ediciones.
  if exists (select 1 from public.materias where user_id = v_user_id and id = p_id) then
    return true;
  end if;

  select count(*), coalesce(max(posicion) + 1, 0)
    into v_count, v_posicion
    from public.materias where user_id = v_user_id;
  if v_count >= 50 then
    return false;
  end if;

  insert into public.materias (id, user_id, nombre, meta_horas, posicion)
    values (p_id, v_user_id, pg_catalog.btrim(p_nombre), 15, v_posicion);
  return true;
end;
$$;

revoke all on function public.agregar_materia(uuid, text) from public, anon;
grant execute on function public.agregar_materia(uuid, text) to authenticated;
