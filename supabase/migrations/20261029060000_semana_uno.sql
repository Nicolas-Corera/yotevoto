-- La primera semana es la 1 (antes tomaba el número de semana ISO del calendario, p. ej. 44).
-- Las siguientes siguen siendo correlativas (max + 1).
create or replace function public.semana_abierta() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int; v_ini timestamptz;
begin
  select n into v_n from public.semanas where not cerrada order by n limit 1;
  if found then return v_n; end if;

  v_ini := date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')
           at time zone 'America/Argentina/Buenos_Aires';
  select coalesce(max(n), 0) + 1 into v_n from public.semanas;
  insert into public.semanas (n, inicio, fin)
    values (v_n, v_ini, v_ini + interval '7 days' - interval '1 second')
    on conflict (n) do nothing;
  return v_n;
end $$;

revoke all on function public.semana_abierta() from public, anon, authenticated;
grant execute on function public.semana_abierta() to service_role;
