// Inyección guardada: textos de ataque (SQL, plantillas, entidades) que SÍ pasan la validación se guardan
// como texto inerte, no alteran la base y vuelven idénticos al leerlos. Corre solo contra el stack LOCAL.
//   supabase functions serve --env-file supabase/.env.local
//   deno test --allow-net --allow-env --allow-run supabase/tests/inyeccion.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const BASE = Deno.env.get("BASE") ?? "http://127.0.0.1:55321";
const ORIGEN = Deno.env.get("ORIGEN") ?? "http://localhost:8123";
const ANON = Deno.env.get("ANON_KEY")!;
const DB = Deno.env.get("DB_CONTAINER") ?? "supabase_db_YoTeVoto";
if (!BASE.includes("127.0.0.1") && !BASE.includes("localhost")) throw new Error("Solo contra el stack local");

async function sql(q: string): Promise<string> {
  const o = await new Deno.Command("docker", { args: ["exec", DB, "psql", "-U", "postgres", "-qtA", "-c", q], stdout: "piped", stderr: "piped" }).output();
  if (!o.success) throw new Error(new TextDecoder().decode(o.stderr));
  return new TextDecoder().decode(o.stdout).trim();
}
const ipAzar = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const snapshot = async () => ({
  tablas: await sql("select string_agg(table_name, ',' order by table_name) from information_schema.tables where table_schema='public'"),
  funciones: await sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"),
  semanas: await sql("select count(*) from public.semanas"),
  votos: await sql("select count(*) from public.votos"),
  cerradas: await sql("select count(*) from public.semanas where cerrada"),
  roles: await sql("select count(*) from pg_roles"),
});

// Pasan la validación del servidor (no llevan "<letra", "<!" ni "</"): deben guardarse tal cual.
const ATAQUES = [
  "Robert'); DROP TABLE votos;--",
  "' OR '1'='1' --",
  "\"; DELETE FROM public.semanas; --",
  "$$; SELECT pg_sleep(8); $$",
  "x'; UPDATE public.propuestas SET estado='oculta'; --",
  "\\'; DROP SCHEMA public CASCADE; --",
  "1; CREATE ROLE hacker SUPERUSER; --",
  "{{7*7}} ${7*7} #{7*7} %s %d {0}",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  "javascript:alert(1) 5 < 6 && 7 > 3",
  "UNION SELECT usename, passwd FROM pg_shadow--",
  "%00 \\x00 \\u0000 %27 %22",
];

Deno.test("textos de ataque se guardan inertes y no alteran la base", async () => {
  const antes = await snapshot();
  for (const [i, a] of ATAQUES.entries()) {
    const nombre = a.slice(0, 40);
    const texto = `prueba ${i} ${a}`.slice(0, 500);
    const t0 = performance.now();
    const r = await fetch(`${BASE}/functions/v1/publicar`, {
      method: "POST",
      headers: { origin: ORIGEN, "content-type": "application/json", "x-forwarded-for": ipAzar() },
      body: JSON.stringify({ nombre, texto, device_id: crypto.randomUUID() }),
    });
    const j = await r.json();
    const ms = performance.now() - t0;
    assertEquals(r.status, 200, `rechazado: ${JSON.stringify(j)} para ${a}`);
    assert(ms < 4000, `tardó ${Math.round(ms)} ms: ¿se ejecutó un pg_sleep? (${a})`);

    // Lo leído por la API pública (como anon) es idéntico a lo enviado
    const g = await fetch(`${BASE}/rest/v1/propuestas?id=eq.${j.id}&select=nombre,texto`, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
    const [fila] = await g.json();
    assertEquals(fila.nombre, nombre.trim(), "nombre alterado");
    assertEquals(fila.texto, texto.trim(), "texto alterado");
  }
  const despues = await snapshot();
  assertEquals(despues, antes, "la inyección modificó la estructura o los datos de la base");
  assertEquals(await sql("select count(*) from pg_roles where rolname='hacker'"), "0");
  assertEquals(await sql("select count(*) from public.propuestas where estado='oculta'"), "0");
});
