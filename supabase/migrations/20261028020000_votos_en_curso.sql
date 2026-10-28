-- El total de votos emitidos es público también con la urna abierta (solo el número, nunca el reparto
-- por propuesta). Así la gente ve cuánta participación hay sin revelar el escrutinio.
create or replace view public.resumen_semana as
  select s.n as semana, s.inicio, s.fin, s.cerrada,
         (select count(*) from public.propuestas p where p.semana = s.n and p.estado = 'visible') as props,
         (select count(*) from public.votos v join public.propuestas p on p.id = v.propuesta_id where p.semana = s.n) as emitidos,
         case when s.cerrada then (select count(*) from public.votos v join public.propuestas p on p.id = v.propuesta_id where p.semana = s.n and v.tipo = 'like') end as total_favor
  from public.semanas s;
