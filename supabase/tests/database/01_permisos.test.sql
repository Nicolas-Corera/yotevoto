begin;
select plan(33);

-- RLS y FORCE en todas las tablas
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)),
          0, 'todas las tablas de public tienen RLS + FORCE');

-- Sin políticas en votos, reportes, limites
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('votos', 'reportes', 'limites')),
          0, 'votos/reportes/limites sin políticas');
-- Las demás: solo SELECT
select is((select count(*)::int from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
          0, 'solo políticas SELECT en public');
select is((select qual from pg_policies where tablename = 'propuestas'), $$(estado = 'visible'::text)$$,
          'propuestas: solo visibles');

-- Datos de prueba (como postgres)
insert into public.propuestas (nombre, texto, semana, estado)
  select 'T', 'texto de prueba', n, 'oculta' from public.semanas where not cerrada;
insert into public.propuestas (nombre, texto, semana)
  select 'V', 'texto visible', n from public.semanas where not cerrada;

-- ---- como anon ----
set local role anon;
select throws_ok('select * from public.votos', '42501', null, 'anon no lee votos');
select throws_ok('select * from public.reportes', '42501', null, 'anon no lee reportes');
select throws_ok('select * from public.limites', '42501', null, 'anon no lee limites');
select throws_ok($$insert into public.semanas (n, inicio, fin) values (999, now(), now() + interval '1 day')$$, '42501', null, 'anon no inserta semanas');
select throws_ok($$insert into public.propuestas (nombre, texto, semana) values ('x', 'xxxxx', 1)$$, '42501', null, 'anon no inserta propuestas');
select throws_ok($$insert into public.votos (propuesta_id, tipo, ip_hash, device_hash) values (1, 'like', 'a', 'b')$$, '42501', null, 'anon no inserta votos');
select throws_ok($$insert into public.reportes (propuesta_id, ip_hash, device_hash) values (1, 'a', 'b')$$, '42501', null, 'anon no inserta reportes');
select throws_ok($$insert into public.limites (clave, ventana, cuenta) values ('a', now(), 1)$$, '42501', null, 'anon no inserta limites');
select throws_ok($$insert into public.participacion (semana, emitidos) values (1, 1)$$, '42501', null, 'anon no inserta participacion');
select throws_ok($$insert into public.escrutinio (semana, propuesta_id, favor, contra) values (1, 1, 1, 1)$$, '42501', null, 'anon no inserta escrutinio');
select throws_ok($$update public.propuestas set estado = 'visible'$$, '42501', null, 'anon no actualiza propuestas');
select throws_ok($$update public.semanas set cerrada = true$$, '42501', null, 'anon no actualiza semanas');
select throws_ok($$delete from public.propuestas$$, '42501', null, 'anon no borra propuestas');
select throws_ok($$select public.registrar_voto(1, 'like', 'a', 'b', 3)$$, '42501', null, 'anon no ejecuta registrar_voto');
select throws_ok($$select public.registrar_reporte(1, 'a', 'b', 5)$$, '42501', null, 'anon no ejecuta registrar_reporte');
select throws_ok($$select public.crear_propuesta('x', 'xxxxx')$$, '42501', null, 'anon no ejecuta crear_propuesta');
select throws_ok($$select public.rate_limit(array['x'], 1, 60)$$, '42501', null, 'anon no ejecuta rate_limit');
select throws_ok($$select public.semana_abierta()$$, '42501', null, 'anon no ejecuta semana_abierta');
select throws_ok($$select public.cerrar_semana()$$, '42501', null, 'anon no ejecuta cerrar_semana');
select throws_ok($$select public.restituir_propuesta(1)$$, '42501', null, 'anon no ejecuta restituir_propuesta');
select is((select count(*)::int from public.propuestas where estado <> 'visible'), 0, 'anon no ve propuestas ocultas');
reset role;

-- ---- como authenticated ----
set local role authenticated;
select throws_ok('select * from public.votos', '42501', null, 'authenticated no lee votos');
select throws_ok($$select public.cerrar_semana()$$, '42501', null, 'authenticated no ejecuta cerrar_semana');
reset role;

-- ---- service_role: solo funciones, nada de escritura directa ----
set local role service_role;
select throws_ok($$insert into public.votos (propuesta_id, tipo, ip_hash, device_hash) values (1, 'like', 'a', 'b')$$, '42501', null, 'service_role no inserta votos directo');
select throws_ok($$select public.cerrar_semana()$$, '42501', null, 'service_role no ejecuta cerrar_semana');
reset role;

-- Una tabla nueva no queda expuesta a anon
create table public.__prueba (id int);
select is((select count(*)::int from information_schema.role_table_grants where table_name = '__prueba' and grantee in ('anon', 'authenticated')),
          0, 'tablas nuevas sin grants para anon/authenticated');

-- Inventario exacto de lo que anon puede leer
select is((select array_agg(table_name::text order by table_name) from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'),
          array['escrutinio', 'participacion', 'propuestas', 'resultados_semana', 'resumen_semana', 'semanas'],
          'anon solo lee: escrutinio, participacion, propuestas, resultados_semana, resumen_semana, semanas');
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'),
          0, 'anon/authenticated no tienen privilegios de escritura');

-- Ninguna función de public (SECURITY DEFINER o no) es ejecutable por anon/authenticated vía rpc
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
             and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
          0, 'ninguna función de public es ejecutable por anon/authenticated');

select * from finish();
rollback;
