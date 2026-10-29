-- Correcciones del Security y Performance Advisor de Supabase.

-- 1. public.rls_auto_enable() no es nuestra: la crea la plataforma (activa RLS en las tablas nuevas) y es
--    SECURITY DEFINER. No hace falta que anon ni authenticated la ejecuten por la API (rpc).
--    Solo existe en el proyecto de Supabase (no en el stack local), por eso la comprobación.
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- 2. Claves foráneas sin índice que las cubra
create index if not exists escrutinio_propuesta_idx on public.escrutinio (propuesta_id);
create index if not exists semanas_ganador_idx on public.semanas (ganador_id);

-- 3. reportes sin clave primaria
alter table public.reportes add column id bigint generated always as identity primary key;

-- Los avisos "RLS Enabled No Policy" de votos, reportes y limites son a propósito: esas tablas no tienen
-- ninguna política (ni siquiera de rechazo) y además se les quitó todo permiso a anon y authenticated.
