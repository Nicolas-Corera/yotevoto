-- Si no hay ninguna semana abierta (primer uso, base vaciada, cron caído), se abre la semana en curso:
-- lunes 00:00 a domingo 23:59:59 hora argentina. El n° es la semana ISO la primera vez y luego correlativo.
create or replace function public.semana_abierta() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int; v_ini timestamptz;
begin
  select n into v_n from public.semanas where not cerrada order by n limit 1;
  if found then return v_n; end if;

  v_ini := date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')
           at time zone 'America/Argentina/Buenos_Aires';
  select max(n) into v_n from public.semanas;
  v_n := case when v_n is null
              then extract(week from now() at time zone 'America/Argentina/Buenos_Aires')::int
              else v_n + 1 end;
  insert into public.semanas (n, inicio, fin)
    values (v_n, v_ini, v_ini + interval '7 days' - interval '1 second')
    on conflict (n) do nothing;
  return v_n;
end $$;

revoke all on function public.semana_abierta() from public, anon, authenticated;
grant execute on function public.semana_abierta() to service_role;
