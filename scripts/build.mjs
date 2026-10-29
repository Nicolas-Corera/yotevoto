// Arma dist/ con SOLO lo que se publica en Cloudflare Pages.
//   node scripts/build.mjs
// Pages: Build command = `node scripts/build.mjs`, Build output directory = `dist`.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const PUBLICAR = [
  "index.html", "404.html", "_headers",
  "robots.txt", "sitemap.xml", "ads.txt", "site.webmanifest", "favicon.ico", ".well-known",
  "muro", "presidentes", "terminos", "privacidad", "cookies", "legales", "como-funciona", "reglas", "assets",
];
// Paginas publicas: el sitemap solo puede listar estas URLs
const PAGINAS = ["", "muro", "presidentes", "como-funciona", "reglas", "terminos", "privacidad", "cookies", "legales"];
const ORIGEN = "https://yotevoto.com.ar";
// Se copia a dist pero se omite: hoja de logos original (sin uso en el sitio)
const OMITIR = [/logotip/i];
// Nada de esto puede terminar publicado
const PROHIBIDO = [/(^|\/)\.env/, /(^|\/)supabase(\/|$)/, /(^|\/)scripts(\/|$)/, /(^|\/)\.bak(\/|$)/, /\.sql$/, /\.md$/, /\.py$/, /\.ts$/, /\.mjs$/, /\.log$/, /\.ya?ml$/, /\.map$/, /logotip/i, /(^|\/)\.git(\/|$)/];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const p of PUBLICAR) {
  if (!existsSync(p)) throw new Error(`Falta ${p}`);
  cpSync(p, join("dist", p), { recursive: true, filter: (src) => !OMITIR.some((re) => re.test(src)) });
}

const archivos = [];
(function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) recorrer(ruta); else archivos.push(ruta.replaceAll("\\", "/"));
  }
})("dist");
const malos = archivos.filter((f) => PROHIBIDO.some((re) => re.test(f)));
if (malos.length) throw new Error("Archivos que no deben publicarse:\n" + malos.join("\n"));

// Indexacion: lo que ve Google tiene que ser exactamente lo previsto
const leer = (f) => readFileSync(join("dist", f), "utf8");
const robots = leer("robots.txt");
if (/^\s*disallow\s*:\s*\S/im.test(robots)) throw new Error("robots.txt: no debe tener Disallow con rutas (revela rutas internas y puede cortar el rastreo)");
if (!robots.includes(`Sitemap: ${ORIGEN}/sitemap.xml`)) throw new Error("robots.txt: falta la linea Sitemap");
const permitidas = new Set(PAGINAS.map((p) => `${ORIGEN}/${p ? p + "/" : ""}`));
const locs = [...leer("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !u.includes("/assets/"));
const raras = locs.filter((u) => !permitidas.has(u));
if (raras.length) throw new Error("sitemap.xml lista URLs no permitidas:\n" + raras.join("\n"));
const faltan = [...permitidas].filter((u) => !locs.includes(u));
if (faltan.length) throw new Error("sitemap.xml no lista:\n" + faltan.join("\n"));

// Ningun secreto en lo publicado
const TEXTO = /\.(html|js|css|txt|xml|json|webmanifest)$|(^|\/)_headers$/;
const SECRETOS = /service_role|sb_secret|SUPABASE_SERVICE|PRIVATE KEY/;
const filtrados = archivos.filter((f) => TEXTO.test(f) && SECRETOS.test(readFileSync(f, "utf8")));
if (filtrados.length) throw new Error("Posible secreto en archivos publicados:\n" + filtrados.join("\n"));

console.log(`dist/ listo: ${archivos.length} archivos`);
