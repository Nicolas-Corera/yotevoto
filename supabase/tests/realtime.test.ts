// Realtime e2e contra el stack local:
//   deno test --allow-net --allow-env --allow-run supabase/tests/realtime.test.ts
// Env: URL (default http://127.0.0.1:55321), ANON_KEY (de `supabase status`), DB_CONTAINER (default supabase_db_YoTeVoto)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { assert, assertEquals } from "jsr:@std/assert@1";

const URL_ = Deno.env.get("URL") ?? "http://127.0.0.1:55321";
const ANON = Deno.env.get("ANON_KEY")!;
const DB = Deno.env.get("DB_CONTAINER") ?? "supabase_db_YoTeVoto";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sql(q: string): Promise<string> {
  const o = await new Deno.Command("docker", { args: ["exec", DB, "psql", "-U", "postgres", "-qtA", "-c", q], stdout: "piped", stderr: "piped" }).output();
  if (!o.success) throw new Error(new TextDecoder().decode(o.stderr));
  return new TextDecoder().decode(o.stdout).trim();
}
const cliente = () => createClient(URL_, ANON, { auth: { persistSession: false } });
function suscribir(c: ReturnType<typeof cliente>, nombre: string, privado: boolean) {
  const recibidos: { tipo: string; payload: unknown }[] = [];
  const ch = c.channel(nombre, privado ? { config: { private: true } } : undefined)
    .on("broadcast", { event: "oculta" }, (m) => recibidos.push({ tipo: "oculta", payload: m.payload }))
    .on("postgres_changes", { event: "*", schema: "public", table: "propuestas" }, (m) => recibidos.push({ tipo: "pg", payload: m.new }))
    .on("postgres_changes", { event: "*", schema: "public", table: "votos" }, (m) => recibidos.push({ tipo: "votos", payload: m.new }));
  const listo = new Promise<string>((res) => ch.subscribe((estado) => res(estado)));
  return { recibidos, listo, ch };
}

Deno.test("realtime: aviso solo con id, sin fuga de ocultas ni de votos, y anon no puede emitir", async () => {
  const semana = await sql("select n from public.semanas where not cerrada");
  const id = await sql(`insert into public.propuestas (nombre, texto, semana) values ('RT', 'propuesta de realtime', ${semana}) returning id;`);
  const a = cliente(), b = cliente();
  const escucha = suscribir(a, "avisos", true);
  assertEquals(await escucha.listo, "SUBSCRIBED");
  const emisor = suscribir(b, "avisos", true);
  assertEquals(await emisor.listo, "SUBSCRIBED");

  // Un cliente (anon) intenta falsificar un aviso: no debe llegar a otros
  await emisor.ch.send({ type: "broadcast", event: "oculta", payload: { id: Number(id), falso: true } });
  await espera(1500);
  assertEquals(escucha.recibidos.filter((r) => r.tipo === "oculta").length, 0, "un aviso falsificado por anon llegó a otro cliente");

  // Un voto y un ocultamiento reales hechos por el servidor
  await sql(`insert into public.votos (propuesta_id, tipo, ip_hash, device_hash) values (${id}, 'like', 'rt-ip', 'rt-dev');`);
  await sql(`update public.propuestas set estado = 'oculta' where id = ${id};`);
  await espera(2500);

  const avisos = escucha.recibidos.filter((r) => r.tipo === "oculta");
  assertEquals(avisos.length, 1, "debe llegar exactamente un aviso real");
  assertEquals(Object.keys(avisos[0].payload as object), ["id"], "el aviso solo lleva el id");
  assertEquals((avisos[0].payload as { id: number }).id, Number(id));
  assertEquals(escucha.recibidos.filter((r) => r.tipo === "votos").length, 0, "no deben llegar votos");
  assert(!escucha.recibidos.some((r) => r.tipo === "pg" && (r.payload as { estado?: string })?.estado === "oculta"), "la fila oculta no debe llegar por postgres_changes");

  await a.removeAllChannels(); await b.removeAllChannels();
});
