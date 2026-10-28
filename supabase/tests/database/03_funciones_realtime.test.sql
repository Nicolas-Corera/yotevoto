begin;
select plan(15);

insert into public.propuestas (nombre, texto, semana)
  select 'A', 'propuesta uno', n from public.semanas where not cerrada;
create temp table t as select id from public.propuestas where texto = 'propuesta uno';

-- Votos: tope de 3 por IP, cambio de voto permitido
select is(public.registrar_voto((select id from t), 'like', 'ip1', 'd1', 3), 'ok', 'voto 1');
select is(public.registrar_voto((select id from t), 'like', 'ip1', 'd2', 3), 'ok', 'voto 2');
select is(public.registrar_voto((select id from t), 'dislike', 'ip1', 'd3', 3), 'ok', 'voto 3');
select is(public.registrar_voto((select id from t), 'like', 'ip1', 'd4', 3), 'limite_ip', '4.º voto desde la misma IP');
select is(public.registrar_voto((select id from t), 'dislike', 'ip1', 'd1', 3), 'ok', 'cambio de voto del mismo dispositivo');
select is((select count(*)::int from public.votos where propuesta_id = (select id from t)), 3, 'el cambio no sumó filas');
select is(public.registrar_voto((select id from t), 'like', 'ip2', 'd4', 3), 'ok', 'otra IP sí puede');
select is(public.registrar_voto(-5, 'like', 'ipZ', 'dZ', 3), 'no_existe', 'propuesta inexistente');

-- Reportes: se oculta con 5 IPs distintas, no con 5 dispositivos de una IP
do $$ begin perform public.registrar_reporte((select id from t), 'ipR', 'r' || g, 5) from generate_series(1, 5) g; end $$;
select is((select estado from public.propuestas where id = (select id from t)), 'visible', '5 dispositivos desde 1 IP no ocultan');
do $$ begin perform public.registrar_reporte((select id from t), 'ipR' || g, 'q' || g, 5) from generate_series(1, 5) g; end $$;
select is((select estado from public.propuestas where id = (select id from t)), 'oculta', '5 IPs distintas ocultan');

-- Restituir: queda protegida
do $$ begin perform public.restituir_propuesta((select id from t)); end $$;
do $$ begin perform public.registrar_reporte((select id from t), 'ipN' || g, 'n' || g, 5) from generate_series(1, 6) g; end $$;
select is((select estado from public.propuestas where id = (select id from t)), 'visible', 'restituida y protegida no se oculta de nuevo');

-- rate_limit
select is(public.rate_limit(array['k1'], 2, 3600), 0, 'rate_limit 1');
select is(public.rate_limit(array['k1'], 2, 3600), 0, 'rate_limit 2');
select ok(public.rate_limit(array['k1'], 2, 3600) > 0, 'rate_limit N+1 devuelve segundos de espera');

-- Realtime: solo las tres tablas
select is((select array_agg(tablename::text order by tablename) from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public'),
          array['participacion', 'propuestas', 'semanas'], 'publicación realtime exacta');

select * from finish();
rollback;
