-- Tiempo real para todo, sin romper el secreto del escrutinio.
-- Los votos no son legibles por el cliente, así que no pueden escucharse directo. En su lugar:
--   · participacion: solo el TOTAL de votos por semana (público, el cliente lo escucha).
--   · aviso "oculta": cuando una propuesta se oculta por reportes, se avisa por un canal público.
--   · semanas en la publicación realtime: se entera de cuando cierra una semana y abre otra.

create table public.participacion (
  semana  int primary key references public.semanas (n) on delete cascade,
  emitidos int not null default 0
);
alter table public.participacion enable row level security;
create policy "participacion pública" on public.participacion for select to anon, authenticated using (true);
revoke all on public.participacion from anon, authenticated;
grant select on public.participacion to anon, authenticated;

insert into public.participacion (semana, emitidos)
  select p.semana, count(*) from public.votos v join public.propuestas p on p.id = v.propuesta_id
  group by p.semana;

create function public.sumar_participacion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sem int;
begin
  select semana into v_sem from public.propuestas where id = new.propuesta_id;
  insert into public.participacion as pa (semana, emitidos) values (v_sem, 1)
    on conflict (semana) do update set emitidos = pa.emitidos + 1;
  return null;
end $$;
revoke all on function public.sumar_participacion() from public, anon, authenticated;
create trigger votos_participacion after insert on public.votos
  for each row execute function public.sumar_participacion();

-- Aviso público cuando una propuesta pasa a "oculta" (RLS ya no deja ver la fila, así que no llegaría por postgres_changes)
create function public.avisar_oculta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'oculta' and old.estado <> 'oculta' then
    perform realtime.send(jsonb_build_object('id', new.id, 'semana', new.semana), 'oculta', 'propuestas', false);
  end if;
  return null;
end $$;
revoke all on function public.avisar_oculta() from public, anon, authenticated;
create trigger propuestas_oculta after update of estado on public.propuestas
  for each row execute function public.avisar_oculta();

alter publication supabase_realtime add table public.participacion, public.semanas;
