-- Las propuestas NO desaparecen al cerrar la semana: siguen en el muro y compiten en la semana siguiente.
-- `propuestas.semana` pasa a ser la semana en que se PUBLICÓ. Cada voto pertenece a la semana en que se emitió
-- (votos.semana): cada semana arranca con la urna en cero y se vota de nuevo, y el escrutinio de una semana
-- cuenta solo los votos de esa semana, sobre todas las propuestas visibles publicadas hasta entonces.
-- No borra nada: los votos existentes quedan asignados a la semana de su propuesta.

-- 1) Votos con semana
alter table public.votos add column semana int;
update public.votos v set semana = p.semana from public.propuestas p where p.id = v.propuesta_id;
alter table public.votos alter column semana set not null;
alter table public.votos add foreign key (semana) references public.semanas (n) on update cascade;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.votos'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (propuesta_id, device_hash)'
  loop
    execute format('alter table public.votos drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.votos add constraint votos_prop_dev_sem_key unique (propuesta_id, device_hash, semana);
create index votos_prop_ip_sem_idx on public.votos (propuesta_id, ip_hash, semana);
create index votos_semana_idx on public.votos (semana);

-- 2) Participación: el total de votos se cuenta por la semana del voto
create or replace function public.sumar_participacion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.participacion as pa (semana, emitidos) values (new.semana, 1)
    on conflict (semana) do update set emitidos = pa.emitidos + 1;
  return null;
end $$;

-- 3) Votar: cualquier propuesta visible, siempre en la semana abierta
create or replace function public.registrar_voto(p_prop bigint, p_tipo text, p_ip text, p_dev text, p_max_ip int default 3)
returns text language plpgsql security definer set search_path = '' as $$
declare v_fin timestamptz; v_sem int; v_n int;
begin
  -- Serializa los votos de una misma IP a una misma propuesta: el tope no se puede superar en carrera.
  perform pg_advisory_xact_lock(hashtextextended('voto:' || p_prop || ':' || p_ip, 0));

  select n, fin into v_sem, v_fin from public.semanas where not cerrada order by n limit 1 for share;
  if not found then return 'no_existe'; end if;
  if not exists (select 1 from public.propuestas where id = p_prop and estado = 'visible' and semana <= v_sem) then
    return 'no_existe';
  end if;
  if now() > v_fin + interval '1 second' then return 'fuera_de_plazo'; end if;

  -- Cambiar el voto no suma a la IP: se modifica la fila del dispositivo en esta semana.
  update public.votos set tipo = p_tipo where propuesta_id = p_prop and device_hash = p_dev and semana = v_sem;
  if found then return 'ok'; end if;

  select count(*) into v_n from public.votos where propuesta_id = p_prop and ip_hash = p_ip and semana = v_sem;
  if v_n >= p_max_ip then return 'limite_ip'; end if;

  insert into public.votos (propuesta_id, tipo, ip_hash, device_hash, semana) values (p_prop, p_tipo, p_ip, p_dev, v_sem)
    on conflict (propuesta_id, device_hash, semana) do update set tipo = excluded.tipo;
  return 'ok';
end $$;

-- 4) Reportar: cualquier propuesta visible (ya no depende de que su semana de origen siga abierta)
create or replace function public.registrar_reporte(p_prop bigint, p_ip text, p_dev text, p_umbral int default 5)
returns text language plpgsql security definer set search_path = '' as $$
declare v_fin timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('reporte:' || p_prop, 0));

  select fin into v_fin from public.semanas where not cerrada order by n limit 1 for share;
  if not found then return 'no_existe'; end if;
  if not exists (select 1 from public.propuestas where id = p_prop and estado = 'visible') then
    return 'no_existe';
  end if;
  if now() > v_fin + interval '1 second' then return 'fuera_de_plazo'; end if;

  insert into public.reportes (propuesta_id, ip_hash, device_hash) values (p_prop, p_ip, p_dev)
    on conflict do nothing; -- cubre (propuesta, dispositivo) y (propuesta, IP)

  update public.propuestas set estado = 'oculta'
    where id = p_prop and not protegida
      and (select count(distinct ip_hash) from public.reportes where propuesta_id = p_prop) >= p_umbral;
  return 'ok';
end $$;

-- 5) Escrutinio: todas las propuestas visibles publicadas hasta esa semana, con los votos de esa semana
create or replace function public.congelar_escrutinio(p_semana int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.escrutinio where semana = p_semana;
  insert into public.escrutinio (semana, propuesta_id, favor, contra)
    select p_semana, p.id, count(v.id) filter (where v.tipo = 'like'), count(v.id) filter (where v.tipo = 'dislike')
    from public.propuestas p
    left join public.votos v on v.propuesta_id = p.id and v.semana = p_semana
    where p.semana <= p_semana and p.estado = 'visible'
    group by p.id;
  update public.semanas set
    emitidos = (select count(*) from public.votos where semana = p_semana),
    total_favor = (select coalesce(sum(favor), 0) from public.escrutinio where semana = p_semana),
    ganador_id = (select propuesta_id from public.escrutinio where semana = p_semana order by favor desc, propuesta_id limit 1)
  where n = p_semana;
end $$;

-- "props" = propuestas que compitieron esa semana
create or replace view public.resumen_semana with (security_invoker = true) as
  select s.n as semana, s.inicio, s.fin, s.cerrada,
         (select count(*) from public.propuestas p where p.semana <= s.n and p.estado = 'visible') as props,
         s.emitidos, s.total_favor
  from public.semanas s
  where s.cerrada;
