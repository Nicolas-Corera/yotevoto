begin;
select plan(17);

-- Semana abierta con datos
insert into public.propuestas (nombre, texto, semana)
  select 'A', 'propuesta de prueba', n from public.semanas where not cerrada;
create temp table t as select id, semana from public.propuestas where texto = 'propuesta de prueba';
grant select on t to anon, authenticated;
insert into public.votos (propuesta_id, tipo, ip_hash, device_hash) select id, 'like', 'ip1', 'd1' from t;

-- Vistas: invoker y solo cerradas
select ok((select bool_and(coalesce(reloptions::text, '') like '%security_invoker=true%')
           from pg_class where relname in ('resultados_semana', 'resumen_semana')), 'vistas con security_invoker');
set local role anon;
select is((select count(*)::int from public.resultados_semana where semana = (select semana from t limit 1)), 0,
          'resultados_semana vacía con la semana abierta');
select is((select count(*)::int from public.resumen_semana where not cerrada), 0, 'resumen_semana sin semana abierta');
reset role;

-- Cierre: congela y publica
do $$ begin perform public.cerrar_semana(true); end $$;
set local role anon;
select is((select favor from public.resultados_semana where id = (select id from t limit 1)), 1, 'tras cerrar, el favor queda congelado');
select is((select emitidos from public.resumen_semana where semana = (select semana from t limit 1)), 1, 'emitidos congelados');
reset role;
select is((select count(*)::int from public.semanas where not cerrada), 1, 'se abrió la semana siguiente');

-- Integridad
select throws_ok($$insert into public.semanas (n, inicio, fin) values (9001, now(), now() + interval '1 day')$$, '23505', null, 'segunda semana abierta');
select throws_ok($$insert into public.propuestas (nombre, texto, semana) select repeat('x', 41), 'texto valido', n from public.semanas where not cerrada$$, '23514', null, 'nombre de 41');
select throws_ok($$insert into public.propuestas (nombre, texto, semana) select 'n', 'abcd', n from public.semanas where not cerrada$$, '23514', null, 'texto de 4');
select throws_ok($$insert into public.propuestas (nombre, texto, semana) select 'n', 'abc' || chr(1) || 'def', n from public.semanas where not cerrada$$, '23514', null, 'control en texto');
select throws_ok($$insert into public.propuestas (nombre, texto, semana, estado) select 'n', 'texto valido', n, 'borrada' from public.semanas where not cerrada$$, '23514', null, 'estado inválido');
select throws_ok($$insert into public.votos (propuesta_id, tipo, ip_hash, device_hash) select id, 'favor', 'a', 'b' from t$$, '23514', null, 'tipo de voto inválido');
select throws_ok($$insert into public.votos (propuesta_id, tipo, ip_hash, device_hash) select id, 'like', 'ipX', 'd1' from t$$, '23505', null, 'voto duplicado por dispositivo');

insert into public.propuestas (nombre, texto, semana)
  select 'B', 'otra propuesta', n from public.semanas where not cerrada;
insert into public.reportes (propuesta_id, ip_hash, device_hash)
  select id, 'ipR', 'dR' from public.propuestas where texto = 'otra propuesta';
select throws_ok($$insert into public.reportes (propuesta_id, ip_hash, device_hash) select id, 'ipR', 'dR2' from public.propuestas where texto = 'otra propuesta'$$, '23505', null, 'reporte duplicado por IP');
select throws_ok($$insert into public.reportes (propuesta_id, ip_hash, device_hash) select id, 'ipR2', 'dR' from public.propuestas where texto = 'otra propuesta'$$, '23505', null, 'reporte duplicado por dispositivo');

-- search_path fijo en todas las SECURITY DEFINER
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false)),
          0, 'SECURITY DEFINER con search_path fijo');
select is((select count(*)::int from cron.job where jobname in ('cerrar-semana', 'cerrar-vencidas', 'limpiar-limites')), 3, 'jobs de cron presentes');

select * from finish();
rollback;
