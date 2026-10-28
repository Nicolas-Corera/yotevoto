-- Funciones de escritura: atómicas (locks) y con la semana validada dentro de la transacción.

-- 'ok' | 'no_existe' | 'fuera_de_plazo' | 'limite_ip'
create or replace function public.registrar_voto(p_prop bigint, p_tipo text, p_ip text, p_dev text, p_max_ip int default 3)
returns text language plpgsql security definer set search_path = '' as $$
declare v_fin timestamptz; v_n int;
begin
  -- Serializa los votos de una misma IP a una misma propuesta: el tope no se puede superar en carrera.
  perform pg_advisory_xact_lock(hashtextextended('voto:' || p_prop || ':' || p_ip, 0));

  select s.fin into v_fin
    from public.propuestas p join public.semanas s on s.n = p.semana
    where p.id = p_prop and p.estado = 'visible' and not s.cerrada
    for share of s;
  if not found then return 'no_existe'; end if;
  if now() > v_fin + interval '1 second' then return 'fuera_de_plazo'; end if;

  -- Cambiar el voto no suma a la IP: se modifica la fila del dispositivo.
  update public.votos set tipo = p_tipo where propuesta_id = p_prop and device_hash = p_dev;
  if found then return 'ok'; end if;

  select count(*) into v_n from public.votos where propuesta_id = p_prop and ip_hash = p_ip;
  if v_n >= p_max_ip then return 'limite_ip'; end if;

  insert into public.votos (propuesta_id, tipo, ip_hash, device_hash) values (p_prop, p_tipo, p_ip, p_dev)
    on conflict (propuesta_id, device_hash) do update set tipo = excluded.tipo;
  return 'ok';
end $$;

-- 'ok' | 'no_existe' | 'fuera_de_plazo'. Se oculta con p_umbral IPs DISTINTAS (no solo dispositivos).
create or replace function public.registrar_reporte(p_prop bigint, p_ip text, p_dev text, p_umbral int default 5)
returns text language plpgsql security definer set search_path = '' as $$
declare v_fin timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('reporte:' || p_prop, 0));

  select s.fin into v_fin
    from public.propuestas p join public.semanas s on s.n = p.semana
    where p.id = p_prop and p.estado = 'visible' and not s.cerrada
    for share of s;
  if not found then return 'no_existe'; end if;
  if now() > v_fin + interval '1 second' then return 'fuera_de_plazo'; end if;

  insert into public.reportes (propuesta_id, ip_hash, device_hash) values (p_prop, p_ip, p_dev)
    on conflict do nothing; -- cubre (propuesta, dispositivo) y (propuesta, IP)

  update public.propuestas set estado = 'oculta'
    where id = p_prop and not protegida
      and (select count(distinct ip_hash) from public.reportes where propuesta_id = p_prop) >= p_umbral;
  return 'ok';
end $$;

-- Devuelve el id, o null si la semana abierta ya venció (el cierre llega en breve).
create function public.crear_propuesta(p_nombre text, p_texto text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_sem int; v_fin timestamptz; v_id bigint;
begin
  v_sem := public.semana_abierta();
  select fin into v_fin from public.semanas where n = v_sem for share;
  if now() > v_fin + interval '1 second' then return null; end if;
  insert into public.propuestas (nombre, texto, semana) values (p_nombre, p_texto, v_sem) returning id into v_id;
  return v_id;
end $$;

-- Moderación manual (SQL Editor): restituye y la protege de volver a ocultarse sola.
create function public.restituir_propuesta(p_id bigint) returns void
language sql security definer set search_path = '' as $$
  update public.propuestas set estado = 'visible', protegida = true where id = p_id;
  delete from public.reportes where propuesta_id = p_id;
$$;

revoke all on function public.registrar_voto(bigint, text, text, text, int), public.registrar_reporte(bigint, text, text, int),
  public.crear_propuesta(text, text), public.restituir_propuesta(bigint) from public, anon, authenticated;
grant execute on function public.registrar_voto(bigint, text, text, text, int), public.registrar_reporte(bigint, text, text, int),
  public.crear_propuesta(text, text) to service_role;
