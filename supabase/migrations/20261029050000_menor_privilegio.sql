-- Menor privilegio y defensa en profundidad.
do $$ begin
  if not (select rolbypassrls from pg_roles where rolname = 'postgres') then
    raise exception 'postgres no tiene BYPASSRLS: FORCE RLS rompería las funciones';
  end if;
end $$;

do $$ declare t text; begin
  foreach t in array array['semanas', 'propuestas', 'votos', 'reportes', 'limites', 'participacion', 'escrutinio'] loop
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- service_role solo escribe a través de las funciones SECURITY DEFINER
revoke insert, update, delete, truncate on all tables in schema public from service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;

-- Lo que se cree después no queda expuesto por defecto
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'graphql_public') then
    revoke usage on schema graphql_public from anon, authenticated;
  end if;
end $$;
