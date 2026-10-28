# Yo Te Voto

> **Ahora el cargo es tuyo.** Una plataforma ciudadana donde cualquiera escribe qué haría como presidente, la comunidad vota en secreto y, cada domingo, gana la propuesta más votada de la semana.

Sitio web estático con backend en tiempo real, voto anónimo sin registro y un diseño propio inspirado en la boleta electoral argentina.

**Estado:** en desarrollo · **Idioma de la interfaz:** español (Argentina) · **Autor:** [IntercomSite](https://intercomsite.com.ar)

---

## Índice

1. [Qué hace](#qué-hace)
2. [Características](#características)
3. [Arquitectura](#arquitectura)
4. [Tecnologías](#tecnologías)
5. [Estructura del proyecto](#estructura-del-proyecto)
6. [Cómo funciona la votación](#cómo-funciona-la-votación)
7. [Seguridad y privacidad](#seguridad-y-privacidad)
8. [Base de datos](#base-de-datos)
9. [Funciones del servidor](#funciones-del-servidor)
10. [Tiempo real](#tiempo-real)
11. [Rendimiento](#rendimiento)
12. [Instalación y uso local](#instalación-y-uso-local)
13. [Configuración](#configuración)
14. [Despliegue](#despliegue)
15. [Operación y mantenimiento](#operación-y-mantenimiento)
16. [Accesibilidad y compatibilidad](#accesibilidad-y-compatibilidad)
17. [Páginas legales](#páginas-legales)
18. [Licencia](#licencia)

---

## Qué hace

1. **Proponés.** En la portada escribís tu nombre y qué harías como presidente (hasta 500 caracteres, con formato).
2. **Se publica en el muro.** Tu propuesta aparece como una *boleta* con su número de lista, visible para todos al instante.
3. **Se vota.** Cada persona puede votar a favor o en contra, o reportar. Los votos son **secretos**: nadie ve cuántos tiene cada propuesta mientras la urna está abierta.
4. **Gana la más votada.** Cada domingo a las 23:59 (hora argentina) se cierra la semana, se cuentan los votos y se publica el escrutinio en **Presidentes**. La semana siguiente arranca sola.

## Características

### Para quien participa
- **Sin registro ni login:** entrar, escribir y votar, sin perder tiempo.
- **Editor con formato:** negrita, cursiva, subrayado, viñetas y lista por artículos (*Art. 1°, Art. 2°…*) con vista previa.
- **Muro de boletas** acomodado en columnas (bento), cada boleta con su propio alto, con carga progresiva y actualización en vivo.
- **Voto secreto** con la posibilidad de cambiar el voto.
- **Reporte de contenido:** al llegar a 5 reportes distintos, la propuesta se oculta sola.
- **Escrutinio semanal** con ganador, porcentajes, participación total y navegación por semanas anteriores.
- **Participación en vivo:** el total de votos emitidos sube en tiempo real, sin revelar el reparto.
- **Tutorial guiado** con tooltips en la portada y en el muro, y un botón «?» para repetirlo.

### Experiencia y diseño
- Diseño propio (estilo *neo-brutalista*) con la paleta celeste, blanco y sol de la bandera argentina.
- **Bandera flameando** animada en canvas, con el Sol de Mayo.
- Fondos con *cross-fade* y zoom suave, y overlay de bandera.
- **Transiciones entre páginas** (View Transitions) con el título del encabezado anclado en la misma posición en todas las páginas.
- **Skeletons** con la misma estructura que el contenido real.
- Carteles de «urna vacía» cuando no hay contenido.
- Totalmente **responsive** (desde 320 px) y con soporte de `prefers-reduced-motion`.

### Para quien administra
- **Cierre semanal automático** y apertura de la semana siguiente.
- **Moderación** por reportes de la comunidad.
- Límite de frecuencia (*rate limit*) por IP y por dispositivo.
- Esquema versionado en migraciones SQL y funciones de servidor desplegables por CLI.

---

## Arquitectura

```
┌────────────────────────┐        lecturas + realtime         ┌─────────────────────────┐
│  Navegador (estático)  │ ─────────────────────────────────▶ │  Postgres (RLS cerrado) │
│  HTML · CSS · JS       │ ◀───────────────────────────────── │  + Realtime             │
└───────────┬────────────┘                                    └────────────▲────────────┘
            │ escrituras (publicar / votar / reportar)                     │ service_role
            ▼                                                              │
┌────────────────────────┐   hash(IP) + hash(dispositivo) + límites        │
│  Edge Functions        │ ───────────────────────────────────────────────┘
│  publicar · votar ·    │
│  reportar              │
└────────────────────────┘
```

**Principio central:** el navegador **solo lee**. Toda escritura pasa por funciones del servidor que deciden con la IP real de la conexión y un identificador de dispositivo, ambos **hasheados**. Las tablas de votos y reportes no tienen ninguna política de acceso para el cliente.

## Tecnologías

| Capa | Tecnología |
| --- | --- |
| Frontend | HTML5, CSS3 (variables, grid, flex, `mask-image`, View Transitions), JavaScript sin framework |
| Animación | GSAP (introducción), Canvas 2D (bandera), CSS |
| Tipografías e íconos | Young Serif, Figtree, Material Symbols Rounded (Google Fonts) |
| Backend | Postgres con Row Level Security, Realtime, `pg_cron` |
| Servidor | Edge Functions (Deno / TypeScript) |
| Cliente de datos | `@supabase/supabase-js` (versión fijada) |
| Herramientas | Supabase CLI, Python 3 (servidor local) |

El frontend **no requiere compilación ni gestor de paquetes**: son archivos estáticos.

## Estructura del proyecto

```
.
├── index.html                 # Portada: formulario para proponer + intro con bandera
├── muro/index.html            # Muro de propuestas (boletas, votos, reportes)
├── presidentes/index.html     # Escrutinio semanal y semanas anteriores
├── terminos/ privacidad/ cookies/ legales/   # Páginas legales
├── 404.html                   # Página no encontrada
├── servir.py                  # Servidor local sin caché
├── assets/
│   ├── css/
│   │   ├── base.css           # Núcleo compartido: nav, fondo, footer, skeleton, transiciones
│   │   ├── home.css           # Portada
│   │   ├── muro.css           # Muro
│   │   ├── presidentes.css    # Presidentes y pestañas de semanas
│   │   ├── legal.css          # Páginas legales
│   │   ├── pie-min.css        # Footer de solo texto
│   │   ├── consent.css        # Banner de cookies
│   │   ├── tour.css           # Tutorial guiado
│   │   └── 404.css
│   ├── js/
│   │   ├── config.js          # URL y clave pública del proyecto
│   │   ├── api.js             # Cliente de datos + llamadas a las funciones
│   │   ├── home.js            # Formulario, editor con formato, intro
│   │   ├── muro.js            # Boletas, acomodo, virtualización, paginado, tiempo real
│   │   ├── presidentes.js     # Escrutinio, pestañas, tiempo real
│   │   ├── bandera.js         # Bandera flameando (canvas)
│   │   ├── fondos.js          # Slideshow de fondo
│   │   ├── tour.js            # Tutorial guiado
│   │   ├── consent.js         # Consentimiento de cookies
│   │   └── 404.js
│   └── img/                   # Imágenes de fondo (webp optimizado)
└── supabase/
    ├── config.toml
    ├── migrations/            # Esquema, RLS, funciones SQL, cron y realtime
    ├── functions/
    │   ├── _shared/seguridad.ts   # CORS, hash de IP/dispositivo, límites
    │   ├── publicar/  votar/  reportar/
    └── seed.sql               # Datos de demostración (solo desarrollo)
```

---

## Cómo funciona la votación

- **Un voto por persona y por propuesta**, aunque no haya cuentas.
- Se identifica con **dos señales**: el hash de la **IP** y el hash de un **identificador de dispositivo** (UUID guardado en el navegador).
- **Por dispositivo:** un único voto por propuesta, modificable (a favor ↔ en contra).
- **Por IP:** hasta **3 votos por propuesta**, para no bloquear a quienes comparten red (oficinas, colegios, datos móviles).
- **IPv6:** se usa el prefijo `/64`, para que una sola persona no tenga millones de direcciones.
- Mientras la semana está abierta **no se expone ningún conteo por propuesta**; solo el total de votos emitidos.
- Al cerrar la semana, gana la propuesta visible con más votos a favor (en empate, la más antigua).

| Parámetro | Valor | Dónde se cambia |
| --- | --- | --- |
| Votos máximos por IP y propuesta | 3 | `supabase/functions/votar/index.ts` |
| Reportes para ocultar | 5 | `supabase/functions/reportar/index.ts` |
| Publicaciones por hora (IP y dispositivo) | 3 | `supabase/functions/publicar/index.ts` |
| Votos por minuto (IP y dispositivo) | 60 | `supabase/functions/votar/index.ts` |
| Reportes por hora (IP y dispositivo) | 20 | `supabase/functions/reportar/index.ts` |
| Largo de propuesta | 5–500 caracteres | Migración SQL y función `publicar` |
| Largo de nombre | 1–40 caracteres | Migración SQL y función `publicar` |
| Propuestas por tanda en el muro | 24 | `assets/js/muro.js` (`PAGINA`) |

## Seguridad y privacidad

- **Row Level Security** activo en todas las tablas. Votos, reportes y límites no son legibles ni escribibles por el cliente.
- **Escritura solo por funciones del servidor**, con la clave de servicio, que nunca llega al navegador.
- **No se guarda la IP**: se almacena un **HMAC-SHA256** con una sal secreta del servidor.
- La IP se toma de las cabeceras de la infraestructura, **nunca del cuerpo del pedido** ni de cabeceras que pueda falsificar el cliente.
- **CORS restringido** a los orígenes permitidos; los pedidos de otros orígenes se rechazan.
- **Validación en el servidor** de nombre, texto, identificadores y tipos de voto; los límites también existen como restricciones `CHECK` en la base.
- **Escape de HTML** en todo el texto de los usuarios antes de mostrarlo.
- **Resultados protegidos:** las vistas de escrutinio solo exponen semanas ya cerradas.
- El escrutinio es **secreto** mientras la urna está abierta.
- **Consentimiento de cookies** con banner; hoy el sitio no usa cookies de seguimiento.
- Las claves públicas del cliente (`config.js`) están pensadas para ser públicas; la seguridad descansa en RLS y en las funciones.

> **Límites asumidos del voto por IP:** una persona determinada puede cambiar de red o de dispositivo para votar de nuevo. El sistema reduce el abuso casual y masivo, pero no ofrece identidad verificada.

## Base de datos

Esquema versionado en `supabase/migrations/`:

| Tabla / vista | Propósito | Acceso del cliente |
| --- | --- | --- |
| `semanas` | Semana, fechas, estado y ganador | Lectura |
| `propuestas` | Propuestas (visibles u ocultas) | Lectura de las visibles |
| `votos` | Voto, hash de IP y de dispositivo | **Ninguno** |
| `reportes` | Reportes únicos por dispositivo | **Ninguno** |
| `limites` | Contadores del límite de frecuencia | **Ninguno** |
| `participacion` | Total de votos por semana | Lectura |
| `resultados_semana` (vista) | Votos a favor por propuesta, solo semanas cerradas | Lectura |
| `resumen_semana` (vista) | Resumen y participación por semana | Lectura |

**Funciones SQL** (solo ejecutables por el servidor): `semana_abierta()`, `rate_limit()`, `registrar_voto()`, `registrar_reporte()`, `cerrar_semana()`.

**Tareas programadas:** `pg_cron` ejecuta `cerrar_semana()` cada domingo a las 23:59 (hora de Argentina). Si no hubiera ninguna semana abierta, `semana_abierta()` abre la semana en curso automáticamente.

## Funciones del servidor

| Función | Entrada | Qué hace |
| --- | --- | --- |
| `publicar` | `nombre`, `texto`, `device_id` | Valida, aplica límite de frecuencia y crea la propuesta en la semana abierta |
| `votar` | `propuesta_id`, `tipo`, `device_id` | Registra o cambia el voto con los límites por dispositivo y por IP |
| `reportar` | `propuesta_id`, `device_id` | Registra un reporte único; con 5 oculta la propuesta |

Todas responden JSON con `ok` y, ante un error, un código y un mensaje legible. No requieren sesión (`verify_jwt = false`): la protección es el hash de IP y dispositivo, los límites y CORS.

## Tiempo real

- **Propuestas nuevas** aparecen solas en el muro.
- **Propuestas ocultas por reportes** desaparecen solas (aviso por canal público).
- **Total de votos:** la tabla `participacion` expone únicamente el total por semana, que presidentes escucha en vivo.
- **Cambio de semana:** el muro y presidentes se recargan solos al cerrar o abrir una semana.
- **Reconexión:** si se corta la conexión, ambas páginas se ponen al día al volver.

## Rendimiento

- **Imágenes** de fondo optimizadas (WebP, máximo 1920 px).
- **Muro virtualizado:** el acomodo se calcula para todas las boletas, pero solo las visibles (más un margen de una pantalla) existen en el DOM; el resto se monta y desmonta con el scroll.
- **Carga por tandas:** el muro pide las propuestas de a 24, por identificador, y trae la siguiente tanda al acercarse al final. Lo ya cargado no se mueve.
- **Acomodo por bloques:** cada tanda se acomoda sola y los bloques se apilan; ninguna boleta se estira, así que los bordes pueden quedar dispares.
- **Canvas** de la bandera: se anima solo mientras es visible.
- **Versionado de archivos** (`?v=…`) para evitar caché obsoleto tras cada cambio.
- Sin dependencias pesadas ni empaquetado: HTML, CSS y JS directos.

---

## Instalación y uso local

**Requisitos:** Python 3 (para el servidor local) y un proyecto de backend configurado (ver [Configuración](#configuración)).

```bash
# Servidor local sin caché, en http://localhost:8123
python servir.py
```

Para cerrarlo, `Ctrl+C` en la terminal. En Windows (PowerShell), si quedó en segundo plano:

```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8123 -State Listen).OwningProcess
```

El sitio usa rutas absolutas (`/assets/...`), por lo que debe servirse desde la **raíz** de un dominio o servidor (no desde una subcarpeta).

## Configuración

### Cliente
Editar `assets/js/config.js` con la URL del proyecto y su clave pública (*anon*):

```js
window.CONFIG = {
  url: "https://<proyecto>.supabase.co",
  anon: "<clave-publica>",
};
```

### Servidor (secretos de las funciones)

| Secreto | Descripción |
| --- | --- |
| `HASH_SALT` | Sal aleatoria de al menos 32 caracteres (`openssl rand -base64 48`) para hashear IP y dispositivo. **No se cambia una vez en uso** (invalidaría los límites por dispositivo). |
| `ALLOWED_ORIGINS` | Orígenes permitidos separados por coma, p. ej. `https://tudominio.com`. Obligatorio: si falta, las funciones fallan cerradas. |
| `IP_HEADER` | Nombre de la cabecera con la IP real puesta por la infraestructura. Obligatorio, sin valor por defecto. |
| `IP_DESDE_DERECHA` | Si la cabecera trae varias IPs, cuál tomar contando desde la derecha (por defecto 1). |

```bash
supabase secrets set HASH_SALT="<aleatorio>" ALLOWED_ORIGINS="https://tudominio.com"
```

Las claves de servicio y las contraseñas **no deben subirse al repositorio** (`.env*` está en `.gitignore`).

## Despliegue

1. **Base de datos:** aplicar las migraciones.
   ```bash
   supabase link --project-ref <ref>
   supabase db push --linked
   ```
2. **Secretos:** definir `HASH_SALT` y `ALLOWED_ORIGINS` (ver arriba).
3. **Funciones:**
   ```bash
   supabase functions deploy --use-api
   ```
4. **Frontend:** publicar los archivos estáticos en cualquier hosting estático (raíz del dominio).
5. **Dominio:** actualizar `ALLOWED_ORIGINS` con el dominio definitivo.
6. **Caché:** al cambiar CSS o JS, subir el número de versión `?v=…` en los HTML.

> En producción conviene servir el sitio con HTTPS y cabeceras de caché adecuadas para los archivos con versión.

## Operación y mantenimiento

- **Datos de demostración:** `supabase/seed.sql` carga propuestas y semanas de ejemplo con votos falsos. Es **solo para desarrollo**.
- **Vaciar los datos antes de salir:** *no usar* `truncate … cascade` (arrastra las semanas). Usar:
  ```sql
  update public.semanas set ganador_id = null;
  truncate public.votos, public.reportes, public.limites;
  delete from public.participacion;
  delete from public.propuestas;
  delete from public.semanas where n <> (select min(n) from public.semanas where not cerrada);
  ```
- **Cierre manual de una semana** (pruebas): `select public.cerrar_semana(true);` (solo desde el SQL Editor)
- **Moderación:** una propuesta oculta tiene `estado = 'oculta'`. Para restituirla (queda protegida y se borran sus reportes), en el SQL Editor: `select public.restituir_propuesta(<id>);`
- **Límites de frecuencia:** además de los de cada acción hay un tope global de 120 pedidos por minuto por IP. Se limpian solos con `pg_cron`.
- **Ocultar por reportes:** hacen falta 5 reportes de IPs distintas (no solo dispositivos).
- **Ajustar límites:** ver la tabla de [parámetros](#cómo-funciona-la-votación).
- **Contenido legal:** las páginas de términos, privacidad, cookies y legales contienen texto provisorio y deben reemplazarse por el definitivo antes de publicar.

## Accesibilidad y compatibilidad

- Navegación por teclado, `aria-label` en controles, `aria-live` en avisos y `role="dialog"` en el tutorial y el banner.
- Respeta `prefers-reduced-motion`: se desactivan animaciones, transiciones y el slideshow.
- Probado desde **320 px** de ancho hasta escritorio.
- Desarrollado y probado en navegadores basados en Chromium (Chrome, Edge). Firefox y Safari no se verificaron todavía; las transiciones entre páginas (View Transitions) requieren un navegador que las soporte.

## Páginas legales

| Página | Ruta |
| --- | --- |
| Términos y condiciones | `/terminos/` |
| Política de privacidad | `/privacidad/` |
| Política de cookies | `/cookies/` (con botón para cambiar preferencias) |
| Legales | `/legales/` |

## Licencia

**Copyright © 2026 IntercomSite. Todos los derechos reservados.**

Este software es **propietario**. No se concede ningún permiso para usarlo, copiarlo, clonarlo, modificarlo, distribuirlo ni crear obras derivadas. Los términos completos están en [LICENSE.md](LICENSE.md).

Contacto: <https://intercomsite.com.ar>
