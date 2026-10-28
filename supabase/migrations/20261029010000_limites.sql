-- rate_limit atómico: un solo viaje para varias claves. Devuelve 0 si está dentro del límite,
-- o los segundos que faltan para que se abra la ventana (para Retry-After).
drop function public.rate_limit(text, int, int);

create function public.rate_limit(p_claves text[], p_max int, p_segundos int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_ventana timestamptz := to_timestamp(floor(extract(epoch from now()) / p_segundos) * p_segundos);
  v_max int;
begin
  with up as (
    insert into public.limites as l (clave, ventana, cuenta)
    select c, v_ventana, 1 from unnest(p_claves) c
    on conflict (clave, ventana) do update set cuenta = l.cuenta + 1
    returning l.cuenta)
  select max(cuenta) into v_max from up;
  if v_max <= p_max then return 0; end if;
  return greatest(1, ceil(extract(epoch from v_ventana + make_interval(secs => p_segundos) - now()))::int);
end $$;

revoke all on function public.rate_limit(text[], int, int) from public, anon, authenticated;
grant execute on function public.rate_limit(text[], int, int) to service_role;

-- Limpieza de ventanas vencidas (antes se borraba en cada pedido)
select cron.schedule('limpiar-limites', '*/10 * * * *',
  $$delete from public.limites where ventana < now() - interval '2 hours'$$);
