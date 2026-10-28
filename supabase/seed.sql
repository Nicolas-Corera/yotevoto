-- SOLO DEMO: propuestas de ejemplo y semanas cerradas con votos falsos.
-- Para borrarlo todo antes de salir (NO uses truncate ... cascade: se lleva también las semanas):
--   update public.semanas set ganador_id = null;
--   truncate public.votos, public.reportes, public.limites, public.escrutinio;
--   delete from public.propuestas;
--   delete from public.semanas where n <> 44;
do $$
declare
  v_id bigint; v_hoy int := 44;
  r record; c record; k int;
  semanas_cerradas jsonb := '[
    {"n":43,"i":"2026-10-19 00:00:00-03","f":"2026-10-25 23:59:59-03","c":[
      ["Lucía M.","Que el asado del domingo sea feriado nacional, con carbón y chimichurri garantizados por el Estado.",442,60],
      ["Tomás G.","Plan Nacional del Bondi: boleto gratis los lunes, aire acondicionado que funcione y frecuencia máxima de 10 minutos.",372,40],
      ["Camila R.","Crear el Ministerio de la Siesta, con 30 minutos de descanso obligatorio después del almuerzo.",281,30],
      ["Valentina S.","Mate caliente en todas las oficinas públicas y yerba de buena calidad, siempre.",116,20],
      ["Nacho","Wifi gratis en todas las plazas del país.",72,10]]},
    {"n":42,"i":"2026-10-12 00:00:00-03","f":"2026-10-18 23:59:59-03","c":[
      ["Mariana L.","Los audios de WhatsApp de más de dos minutos se convierten automáticamente en texto.",398,50],
      ["Fede P.","Que el dulce de leche tenga denominación de origen en todo el mundo.",301,40],
      ["Bruno A.","Una cancha de fútbol con iluminación gratuita en cada barrio.",215,30],
      ["Sofía T.","Los lunes empiezan a las 11. Es lo justo.",148,20],
      ["Julián K.","Prohibido hacer spoilers en la mesa a la hora de la cena.",64,10]]},
    {"n":41,"i":"2026-10-05 00:00:00-03","f":"2026-10-11 23:59:59-03","c":[
      ["Lola B.","Un feriado puente por cada fin de semana largo, sin excepciones.",301,40],
      ["Martín D.","Que los colectivos avisen por altoparlante cuando se acerca la parada.",247,30],
      ["Agustina C.","Dulce de leche gratis en todos los desayunos escolares.",176,20],
      ["Gonzalo V.","Ascensores con música decente, por ley.",98,10],
      ["Rocío F.","Que el bondi tenga enchufes para cargar el celular.",41,5]]}
  ]';
begin
  for r in select * from jsonb_array_elements(semanas_cerradas) loop
    insert into public.semanas (n, inicio, fin, cerrada)
      values ((r.value->>'n')::int, (r.value->>'i')::timestamptz, (r.value->>'f')::timestamptz, true);
    for c in select * from jsonb_array_elements(r.value->'c') loop
      insert into public.propuestas (nombre, texto, semana, created_at)
        values (c.value->>0, c.value->>1, (r.value->>'n')::int, (r.value->>'i')::timestamptz + interval '1 day')
        returning id into v_id;
      for k in 1..(c.value->>2)::int loop
        insert into public.votos (propuesta_id, tipo, ip_hash, device_hash)
          values (v_id, 'like', md5('ip' || v_id || k), md5('dev' || v_id || k));
      end loop;
      for k in 1..(c.value->>3)::int loop
        insert into public.votos (propuesta_id, tipo, ip_hash, device_hash)
          values (v_id, 'dislike', md5('ipd' || v_id || k), md5('devd' || v_id || k));
      end loop;
    end loop;
    update public.semanas set ganador_id = (
      select p.id from public.propuestas p where p.semana = (r.value->>'n')::int order by p.id limit 1
    ) where n = (r.value->>'n')::int;
    perform public.congelar_escrutinio((r.value->>'n')::int);
  end loop;

  -- Semana abierta: las 8 propuestas de ejemplo del muro
  insert into public.propuestas (nombre, texto, semana, created_at) values
    ('Lucía M.',     'Que el asado del domingo sea feriado nacional.', v_hoy, '2026-10-26 18:42-03'),
    ('Tomás G.',     E'**Plan Nacional del Bondi**\nArt. 1° Boleto gratis los lunes.\nArt. 2° Colectivos con aire acondicionado que funcione.\nArt. 3° Una frecuencia máxima de 10 minutos, de verdad.\nArt. 4° Que el chofer no frene tan fuerte.', v_hoy, '2026-10-26 20:15-03'),
    ('Anónimo',      'Prohibido hacer *spoilers* en la mesa a la hora de la cena.', v_hoy, '2026-10-27 09:03-03'),
    ('Camila R.',    'Crear el **Ministerio de la Siesta**. Todos los trabajos con 30 minutos de descanso obligatorio después del almuerzo, y la reunión de las 14 queda prohibida por decreto.', v_hoy, '2026-10-27 11:30-03'),
    ('Nacho',        'Wifi gratis en todas las plazas del país.', v_hoy, '2026-10-27 14:48-03'),
    ('Valentina S.', E'• Mate caliente en todas las oficinas públicas\n• Termos con garantía de por vida\n• Que la yerba sea __siempre__ de buena calidad\n• Un día del año para el *mate cocido con leche*', v_hoy, '2026-10-27 17:21-03'),
    ('Fede P.',      'Que el dulce de leche tenga denominación de origen **en todo el mundo**.', v_hoy, '2026-10-28 08:10-03'),
    ('Mariana L.',   'Declarar al Día del Amigo como el único día en que los grupos de WhatsApp pueden mandar cadenas. El resto del año, cero audios de más de dos minutos. Después de ese límite, el audio se convierte automáticamente en texto.', v_hoy, '2026-10-28 10:55-03');
end $$;
