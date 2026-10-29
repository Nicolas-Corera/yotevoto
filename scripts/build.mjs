// Arma dist/ con SOLO lo que se publica en Cloudflare Pages.
//   node scripts/build.mjs
// Pages: Build command = `node scripts/build.mjs`, Build output directory = `dist`.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const PUBLICAR = [
  "index.html", "404.html", "_headers",
  "muro", "presidentes", "terminos", "privacidad", "cookies", "legales", "como-funciona", "reglas", "assets",
];
// Nada de esto puede terminar publicado
const PROHIBIDO = [/(^|\/)\.env/, /(^|\/)supabase(\/|$)/, /(^|\/)scripts(\/|$)/, /(^|\/)\.bak(\/|$)/, /\.sql$/, /\.md$/, /\.py$/];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const p of PUBLICAR) {
  if (!existsSync(p)) throw new Error(`Falta ${p}`);
  cpSync(p, join("dist", p), { recursive: true });
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
console.log(`dist/ listo: ${archivos.length} archivos`);
