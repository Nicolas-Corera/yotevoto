-- Integridad en la base: unicidad, una sola semana abierta, sin caracteres de control, índices.

-- Un reporte por (propuesta, IP): se conserva el más antiguo de cada grupo.
delete from public.reportes a using public.reportes b
  where a.propuesta_id = b.propuesta_id and a.ip_hash = b.ip_hash
    and (a.created_at, a.ctid) > (b.created_at, b.ctid);
create unique index reportes_ip_uq on public.reportes (propuesta_id, ip_hash);

-- Una sola semana abierta a la vez
create unique index semanas_una_abierta on public.semanas ((true)) where not cerrada;
alter table public.semanas add constraint semanas_fin_ok check (fin > inicio);

-- Sin caracteres de control (el texto admite \n)
alter table public.propuestas
  add constraint propuestas_nombre_sin_control check (nombre !~ '[[:cntrl:]]'),
  add constraint propuestas_texto_sin_control check (texto !~ E'[\\x01-\\x09\\x0B-\\x1F\\x7F]');

-- Una propuesta restituida a mano no vuelve a ocultarse sola
alter table public.propuestas add column protegida boolean not null default false;

-- Escrutinio congelado al cerrar (las vistas públicas ya no leen votos)
alter table public.semanas add column emitidos int, add column total_favor int;

create index limites_ventana_idx on public.limites (ventana);
