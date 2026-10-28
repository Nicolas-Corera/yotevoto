-- Aviso de "oculta" por canal PRIVADO (solo el servidor emite) y con el id nada más.
create or replace function public.avisar_oculta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'oculta' and old.estado <> 'oculta' then
    perform realtime.send(jsonb_build_object('id', new.id), 'oculta', 'avisos', true);
  end if;
  return null;
end $$;

-- Los clientes pueden ESCUCHAR el canal 'avisos'; no hay política de INSERT, así que no pueden emitir.
create policy "avisos lectura" on realtime.messages for select to anon, authenticated
  using (realtime.topic() = 'avisos');

-- Exactamente estas tres tablas (nunca votos, reportes ni limites).
alter publication supabase_realtime set table public.propuestas, public.participacion, public.semanas;
