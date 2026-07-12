-- ============================================================
-- Stuniv v10 — Fase 1: schema multi-usuario con RLS
-- Proyecto Supabase: stuniv (ref sfwntnljelgxrtyrizht, sa-east-1)
-- Reglas: cada tabla tiene user_id -> auth.users ON DELETE CASCADE,
-- RLS habilitado y FORZADO, políticas separadas por operación
-- (select/insert/update/delete) restringidas a auth.uid().
-- ============================================================

-- ---------- 1. Tablas ----------

-- Perfil 1:1 con auth.users (campos de personalización, sección 6.17)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null default '' check (char_length(nombre) <= 60),
  apellido    text not null default '' check (char_length(apellido) <= 60),
  apodo       text not null default '' check (char_length(apodo) <= 40),
  universidad text not null default '' check (char_length(universidad) <= 80),
  carrera     text not null default '' check (char_length(carrera) <= 80),
  foto_url    text check (foto_url is null or char_length(foto_url) <= 500),
  tema_color  text not null default 'azul'
              check (tema_color in ('azul','bordo','negro','verde','dorado')),
  deleted_at  timestamptz,          -- soft delete (6.16): cuenta marcada, datos intactos
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.materias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nombre      text not null check (char_length(nombre) between 1 and 100),
  -- hora local del examen tal como la elige el usuario (sin zona horaria,
  -- mismo semántico que el string "2026-06-08T09:00" del modelo viejo)
  examen      timestamp,
  meta_horas  numeric(6,1) not null default 0 check (meta_horas >= 0 and meta_horas <= 10000),
  preparacion smallint not null default 0 check (preparacion between 0 and 100),
  posicion    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index materias_user_id_idx     on public.materias (user_id);
create index materias_user_examen_idx on public.materias (user_id, examen);

-- Total de minutos estudiados por materia (agregado, 1 fila por materia).
-- Los incrementos van SIEMPRE por el RPC atómico add_minutos (6.13).
create table public.sesiones_estudio (
  materia_id  uuid primary key references public.materias(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  minutos     integer not null default 0 check (minutos >= 0 and minutos <= 100000000),
  updated_at  timestamptz not null default now()
);
create index sesiones_estudio_user_id_idx on public.sesiones_estudio (user_id);

-- Archivo histórico de semestres (snapshot inmutable)
create table public.semestres (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  numero      integer not null check (numero > 0),
  nombre      text not null check (char_length(nombre) <= 100),
  materias    jsonb not null default '[]'::jsonb,
  sesiones    jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default now(),
  unique (user_id, numero)
);
create index semestres_user_id_idx on public.semestres (user_id);

-- Plan de estudio: qué materias tocan cada día
create table public.plan_estudio (
  user_id     uuid not null references auth.users(id) on delete cascade,
  fecha       date not null,
  materia_ids uuid[] not null default '{}' check (cardinality(materia_ids) <= 32),
  updated_at  timestamptz not null default now(),
  primary key (user_id, fecha)
);

-- Notas rápidas del calendario
create table public.notas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  texto      text not null check (char_length(texto) between 1 and 144),
  posicion   integer not null default 0,
  created_at timestamptz not null default now()
);
create index notas_user_id_idx on public.notas (user_id);

-- ---------- 2. RLS: habilitar y FORZAR en todas las tablas ----------

alter table public.profiles         enable row level security;
alter table public.materias         enable row level security;
alter table public.sesiones_estudio enable row level security;
alter table public.semestres        enable row level security;
alter table public.plan_estudio     enable row level security;
alter table public.notas            enable row level security;

alter table public.profiles         force row level security;
alter table public.materias         force row level security;
alter table public.sesiones_estudio force row level security;
alter table public.semestres        force row level security;
alter table public.plan_estudio     force row level security;
alter table public.notas            force row level security;

-- ---------- 3. Políticas (por operación, sólo authenticated) ----------
-- profiles: sin política de DELETE a propósito — el borrado de cuenta va por
-- soft delete + purga server-side (service role), nunca desde el cliente.

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy materias_select_own on public.materias
  for select to authenticated using (user_id = auth.uid());
create policy materias_insert_own on public.materias
  for insert to authenticated with check (user_id = auth.uid());
create policy materias_update_own on public.materias
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy materias_delete_own on public.materias
  for delete to authenticated using (user_id = auth.uid());

create policy sesiones_select_own on public.sesiones_estudio
  for select to authenticated using (user_id = auth.uid());
create policy sesiones_insert_own on public.sesiones_estudio
  for insert to authenticated with check (user_id = auth.uid());
create policy sesiones_update_own on public.sesiones_estudio
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sesiones_delete_own on public.sesiones_estudio
  for delete to authenticated using (user_id = auth.uid());

create policy semestres_select_own on public.semestres
  for select to authenticated using (user_id = auth.uid());
create policy semestres_insert_own on public.semestres
  for insert to authenticated with check (user_id = auth.uid());
create policy semestres_update_own on public.semestres
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy semestres_delete_own on public.semestres
  for delete to authenticated using (user_id = auth.uid());

create policy plan_select_own on public.plan_estudio
  for select to authenticated using (user_id = auth.uid());
create policy plan_insert_own on public.plan_estudio
  for insert to authenticated with check (user_id = auth.uid());
create policy plan_update_own on public.plan_estudio
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plan_delete_own on public.plan_estudio
  for delete to authenticated using (user_id = auth.uid());

create policy notas_select_own on public.notas
  for select to authenticated using (user_id = auth.uid());
create policy notas_insert_own on public.notas
  for insert to authenticated with check (user_id = auth.uid());
create policy notas_update_own on public.notas
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notas_delete_own on public.notas
  for delete to authenticated using (user_id = auth.uid());

-- ---------- 4. Mínimo privilegio: anon no toca nada de public ----------
-- (las políticas ya excluyen a anon; esto lo hace explícito a nivel GRANT — 6.3)

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------- 5. Triggers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger materias_updated_at before update on public.materias
  for each row execute function public.set_updated_at();
create trigger sesiones_updated_at before update on public.sesiones_estudio
  for each row execute function public.set_updated_at();
create trigger plan_updated_at before update on public.plan_estudio
  for each row execute function public.set_updated_at();

-- Perfil automático al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 6. RPCs atómicos (6.13 — race conditions resueltas en la base) ----------

-- Suma minutos a una materia de forma atómica (UPSERT con incremento en la
-- misma sentencia — dos dispositivos sumando a la vez nunca se pisan).
create or replace function public.add_minutos(p_materia_id uuid, p_delta integer)
returns integer
language plpgsql
security invoker            -- corre como el usuario logueado: RLS aplica
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_total integer;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_delta is null or p_delta < 1 or p_delta > 1440 then
    raise exception 'invalid_delta';
  end if;
  perform 1 from public.materias where id = p_materia_id and user_id = v_user;
  if not found then
    raise exception 'materia_not_found';
  end if;
  insert into public.sesiones_estudio (materia_id, user_id, minutos)
  values (p_materia_id, v_user, p_delta)
  on conflict (materia_id) do update
    set minutos = public.sesiones_estudio.minutos + excluded.minutos
  returning minutos into v_total;
  return v_total;
end;
$$;
revoke execute on function public.add_minutos(uuid, integer) from public, anon;
grant  execute on function public.add_minutos(uuid, integer) to authenticated;

-- Archiva el semestre activo en una sola transacción: snapshot de materias y
-- minutos -> tabla semestres; limpia materias (cascade borra sesiones),
-- plan de estudio. Las materias nuevas las inserta la app después.
create or replace function public.archivar_semestre(p_nombre text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_num  integer;
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_nombre is null or char_length(trim(p_nombre)) not between 1 and 100 then
    raise exception 'invalid_nombre';
  end if;
  select coalesce(max(numero), 0) + 1 into v_num
    from public.semestres where user_id = v_user;
  insert into public.semestres (user_id, numero, nombre, materias, sesiones)
  values (
    v_user, v_num, trim(p_nombre),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nombre', m.nombre, 'examen', m.examen,
        'metaHoras', m.meta_horas, 'posicion', m.posicion
      ) order by m.posicion)
      from public.materias m where m.user_id = v_user
    ), '[]'::jsonb),
    coalesce((
      select jsonb_object_agg(s.materia_id::text, s.minutos)
      from public.sesiones_estudio s where s.user_id = v_user
    ), '{}'::jsonb)
  )
  returning id into v_id;
  delete from public.materias     where user_id = v_user;
  delete from public.plan_estudio where user_id = v_user;
  return v_id;
end;
$$;
revoke execute on function public.archivar_semestre(text) from public, anon;
grant  execute on function public.archivar_semestre(text) to authenticated;

-- Purga definitiva (hard delete con cascade) de cuentas soft-deleted hace
-- más de p_days días. SOLO ejecutable server-side (service role / job de
-- backups) — jamás expuesta a anon/authenticated.
create or replace function public.purge_deleted_accounts(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.users u
  using public.profiles p
  where p.id = u.id
    and p.deleted_at is not null
    and p.deleted_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.purge_deleted_accounts(integer) from public, anon, authenticated;
