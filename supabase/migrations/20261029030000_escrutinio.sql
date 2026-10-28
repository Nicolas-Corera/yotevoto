-- Escrutinio congelado al cerrar la semana. Las vistas públicas ya no leen `votos`:
-- no hay forma de sacar un conteo por propuesta mientras la urna está abierta.

create table public.escrutinio (
  semana       int    not null references public.semanas (n) on delete cascade,
  propuesta_id bigint not null references public.propuestas (id) on delete cascade,
  favor        int    not null,
  contra       int    not null,
  primary key (semana, propuesta_id)
);
alter table public.escrutinio enable row level security;
create policy "escrutinio público" on public.escrutinio for select to anon, authenticated using (true);
revoke all on public.escrutinio from anon, authenticated;
grant select on public.escrutinio to anon, authenticated;

-- Interna (sin grants): llena escrutinio y los totales de la semana.
create function public.congelar_escrutinio(p_semana int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.escrutinio where semana = p_semana;
  insert into public.escrutinio (semana, propuesta_id, favor, contra)
    select p_semana, p.id, count(v.id) filter (where v.tipo = 'like'), count(v.id) filter (where v.tipo = 'dislike')
    from public.propuestas p left join public.votos v on v.propuesta_id = p.id
    where p.semana = p_semana and p.estado = 'visible'
    group by p.id;
  update public.semanas set
    emitidos = (select count(*) from public.votos v join public.propuestas p on p.id = v.propuesta_id where p.semana = p_semana),
    total_favor = (select coalesce(sum(favor), 0) from public.escrutinio where semana = p_semana),
    ganador_id = (select propuesta_id from public.escrutinio where semana = p_semana order by favor desc, propuesta_id limit 1)
  where n = p_semana;
end $$;
revoke all on function public.congelar_escrutinio(int) from public, anon, authenticated;

-- Backfill de las semanas ya cerradas
do $$ declare r record; begin
  for r in select n from public.semanas where cerrada loop perform public.congelar_escrutinio(r.n); end loop;
end $$;

-- Cierra la semana abierta si ya venció (o siempre con p_forzar), congela y abre la siguiente.
-- Sin grants: solo la ejecuta el dueño (pg_cron).
drop function public.cerrar_semana();
create function public.cerrar_semana(p_forzar boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare v_sem public.semanas%rowtype;
begin
  select * into v_sem from public.semanas where not cerrada order by n limit 1 for update;
  if not found then return; end if;
  if not p_forzar and now() < v_sem.fin - interval '2 minutes' then return; end if;
  perform public.congelar_escrutinio(v_sem.n);
  update public.semanas set cerrada = true where n = v_sem.n;
  insert into public.semanas (n, inicio, fin)
    values (v_sem.n + 1, v_sem.fin + interval '1 second', v_sem.fin + interval '7 days');
end $$;
revoke all on function public.cerrar_semana(boolean) from public, anon, authenticated, service_role;

-- Si el cron semanal fallara, la semana vencida se cierra dentro de la hora.
select cron.schedule('cerrar-vencidas', '0 * * * *', $$select public.cerrar_semana()$$);

-- Vistas: security_invoker (respetan RLS del que consulta) y solo semanas CERRADAS.
drop view public.resultados_semana, public.resumen_semana;

create view public.resultados_semana with (security_invoker = true) as
  select e.semana, p.id, p.nombre, p.texto, e.favor
  from public.escrutinio e
  join public.semanas s on s.n = e.semana and s.cerrada
  join public.propuestas p on p.id = e.propuesta_id and p.estado = 'visible';

create view public.resumen_semana with (security_invoker = true) as
  select s.n as semana, s.inicio, s.fin, s.cerrada,
         (select count(*) from public.propuestas p where p.semana = s.n and p.estado = 'visible') as props,
         s.emitidos, s.total_favor
  from public.semanas s
  where s.cerrada;

revoke all on public.resultados_semana, public.resumen_semana from anon, authenticated;
grant select on public.resultados_semana, public.resumen_semana to anon, authenticated;
