-- Tus propuestas: esquema, seguridad (RLS), cierre semanal y realtime.
-- El navegador SOLO lee. Toda escritura pasa por Edge Functions (service_role).

create extension if not exists pg_cron;

-- ---------- Tablas ----------
create table public.semanas (
  n          int primary key,
  inicio     timestamptz not null,
  fin        timestamptz not null,
  cerrada    boolean not null default false,
  ganador_id bigint
);

create table public.propuestas (
  id         bigint generated always as identity primary key, -- es el "Lista N°"
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 40),
  texto      text not null check (char_length(btrim(texto)) between 5 and 500),
  semana     int  not null references public.semanas (n),
  estado     text not null default 'visible' check (estado in ('visible', 'oculta')),
  created_at timestamptz not null default now()
);
create index on public.propuestas (semana, created_at);
alter table public.semanas add foreign key (ganador_id) references public.propuestas (id);

create table public.votos (
  id           bigint generated always as identity primary key,
  propuesta_id bigint not null references public.propuestas (id) on delete cascade,
  tipo         text not null check (tipo in ('like', 'dislike')),
  ip_hash      text not null,
  device_hash  text not null,
  created_at   timestamptz not null default now(),
  unique (propuesta_id, device_hash)
);
create index on public.votos (propuesta_id, ip_hash);

create table public.reportes (
  propuesta_id bigint not null references public.propuestas (id) on delete cascade,
  ip_hash      text not null,
  device_hash  text not null,
  created_at   timestamptz not null default now(),
  unique (propuesta_id, device_hash)
);

create table public.limites (
  clave   text not null,
  ventana timestamptz not null,
  cuenta  int not null default 0,
  primary key (clave, ventana)
);

-- ---------- RLS: todo cerrado salvo lectura pública de lo que corresponde ----------
alter table public.semanas    enable row level security;
alter table public.propuestas enable row level security;
alter table public.votos      enable row level security;
alter table public.reportes   enable row level security;
alter table public.limites    enable row level security;

create policy "semanas públicas" on public.semanas for select to anon, authenticated using (true);
create policy "propuestas visibles" on public.propuestas for select to anon, authenticated
  using (estado = 'visible');

-- Supabase da permisos por defecto: los sacamos y dejamos solo lo necesario.
revoke all on public.semanas, public.propuestas, public.votos, public.reportes, public.limites
  from anon, authenticated;
grant select on public.semanas, public.propuestas to anon, authenticated;

-- ---------- Resultados: solo de semanas cerradas (el escrutinio es secreto mientras la urna está abierta) ----------
create view public.resultados_semana as
  select s.n as semana, p.id, p.nombre, p.texto,
         count(v.id) filter (where v.tipo = 'like') as favor
  from public.semanas s
  join public.propuestas p on p.semana = s.n and p.estado = 'visible'
  left join public.votos v on v.propuesta_id = p.id
  where s.cerrada
  group by s.n, p.id;

create view public.resumen_semana as
  select s.n as semana, s.inicio, s.fin, s.cerrada,
         (select count(*) from public.propuestas p where p.semana = s.n and p.estado = 'visible') as props,
         case when s.cerrada then (select count(*) from public.votos v join public.propuestas p on p.id = v.propuesta_id where p.semana = s.n) end as emitidos,
         case when s.cerrada then (select count(*) from public.votos v join public.propuestas p on p.id = v.propuesta_id where p.semana = s.n and v.tipo = 'like') end as total_favor
  from public.semanas s;

grant select on public.resultados_semana, public.resumen_semana to anon, authenticated;

-- ---------- Funciones (solo service_role) ----------
create function public.semana_abierta() returns int
language sql stable security definer set search_path = '' as $$
  select n from public.semanas where not cerrada order by n limit 1
$$;

-- true = dentro del límite. Ventanas fijas de p_segundos.
create function public.rate_limit(p_clave text, p_max int, p_segundos int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ventana timestamptz; v_cuenta int;
begin
  v_ventana := to_timestamp(floor(extract(epoch from now()) / p_segundos) * p_segundos);
  insert into public.limites as l (clave, ventana, cuenta) values (p_clave, v_ventana, 1)
    on conflict (clave, ventana) do update set cuenta = l.cuenta + 1
    returning cuenta into v_cuenta;
  delete from public.limites where ventana < now() - interval '2 days';
  return v_cuenta <= p_max;
end $$;

-- 'ok' | 'no_existe' | 'limite_ip'
create function public.registrar_voto(p_prop bigint, p_tipo text, p_ip text, p_dev text, p_max_ip int default 3)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.propuestas p join public.semanas s on s.n = p.semana
                 where p.id = p_prop and p.estado = 'visible' and not s.cerrada) then
    return 'no_existe';
  end if;
  if exists (select 1 from public.votos where propuesta_id = p_prop and device_hash = p_dev) then
    update public.votos set tipo = p_tipo where propuesta_id = p_prop and device_hash = p_dev;
    return 'ok';
  end if;
  if (select count(*) from public.votos where propuesta_id = p_prop and ip_hash = p_ip) >= p_max_ip then
    return 'limite_ip';
  end if;
  insert into public.votos (propuesta_id, tipo, ip_hash, device_hash) values (p_prop, p_tipo, p_ip, p_dev)
    on conflict (propuesta_id, device_hash) do update set tipo = excluded.tipo;
  return 'ok';
end $$;

-- 'ok' | 'no_existe'. Con p_umbral reportes distintos, la propuesta se oculta.
create function public.registrar_reporte(p_prop bigint, p_ip text, p_dev text, p_umbral int default 5)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.propuestas where id = p_prop and estado = 'visible') then
    return 'no_existe';
  end if;
  insert into public.reportes (propuesta_id, ip_hash, device_hash) values (p_prop, p_ip, p_dev)
    on conflict do nothing;
  if (select count(*) from public.reportes where propuesta_id = p_prop) >= p_umbral then
    update public.propuestas set estado = 'oculta' where id = p_prop;
  end if;
  return 'ok';
end $$;

-- Cierra la semana abierta, fija el ganador (más votos a favor) y abre la siguiente.
create function public.cerrar_semana() returns void
language plpgsql security definer set search_path = '' as $$
declare v_sem public.semanas%rowtype; v_gan bigint;
begin
  select * into v_sem from public.semanas where not cerrada order by n limit 1;
  if not found then return; end if;
  select p.id into v_gan
    from public.propuestas p left join public.votos v on v.propuesta_id = p.id and v.tipo = 'like'
    where p.semana = v_sem.n and p.estado = 'visible'
    group by p.id order by count(v.id) desc, p.id limit 1;
  update public.semanas set cerrada = true, ganador_id = v_gan where n = v_sem.n;
  insert into public.semanas (n, inicio, fin)
    values (v_sem.n + 1, v_sem.fin + interval '1 second', v_sem.fin + interval '7 days');
end $$;

revoke all on function public.semana_abierta(), public.rate_limit(text, int, int),
  public.registrar_voto(bigint, text, text, text, int), public.registrar_reporte(bigint, text, text, int),
  public.cerrar_semana() from public, anon, authenticated;
grant execute on function public.semana_abierta(), public.rate_limit(text, int, int),
  public.registrar_voto(bigint, text, text, text, int), public.registrar_reporte(bigint, text, text, int)
  to service_role;

-- ---------- Semana inicial, cierre automático y realtime ----------
-- Semana 44: lunes 26/10/2026 00:00 a domingo 01/11/2026 23:59:59 (hora argentina)
insert into public.semanas (n, inicio, fin)
  values (44, '2026-10-26 00:00:00-03', '2026-11-01 23:59:59-03');

-- Domingo 23:59 ART = lunes 02:59 UTC
select cron.schedule('cerrar-semana', '59 2 * * 1', $$select public.cerrar_semana()$$);

alter publication supabase_realtime add table public.propuestas;
