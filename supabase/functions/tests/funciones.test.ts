// Pruebas de las Edge Functions contra `supabase functions serve` (local).
//   supabase functions serve --env-file supabase/.env.local
//   deno test --allow-net --allow-env supabase/functions/tests/funciones.test.ts
// Variables: BASE (default http://127.0.0.1:55321/functions/v1), ORIGEN (default http://localhost:8123),
// IP_HEADER (default x-forwarded-for; debe coincidir con el de .env.local).
import { assert, assertEquals } from "jsr:@std/assert@1";

const BASE = Deno.env.get("BASE") ?? "http://127.0.0.1:55321/functions/v1";
const ORIGEN = Deno.env.get("ORIGEN") ?? "http://localhost:8123";
const IP_HEADER = Deno.env.get("IP_HEADER") ?? "x-forwarded-for";
const uuid = () => crypto.randomUUID();
const ipAzar = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function llamar(fn: string, cuerpo: unknown, o: { ip?: string; origen?: string | null; ct?: string; metodo?: string; raw?: string } = {}) {
  const h: Record<string, string> = { [IP_HEADER]: o.ip ?? ipAzar(), "content-type": o.ct ?? "application/json" };
  if (o.origen !== null) h["origin"] = o.origen ?? ORIGEN;
  const r = await fetch(`${BASE}/${fn}`, {
    method: o.metodo ?? "POST", headers: h, body: o.metodo === "GET" ? undefined : (o.raw ?? JSON.stringify(cuerpo)),
  });
  const texto = await r.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(texto); } catch { /* sin cuerpo */ }
  return { r, json, texto };
}

async function proponer(ip?: string) {
  const { json } = await llamar("publicar", { nombre: "Test", texto: "Propuesta de prueba " + uuid(), device_id: uuid() }, { ip });
  return json.id as number;
}

Deno.test("CORS: origen ajeno, sin origen y preflight", async () => {
  for (const origen of ["https://malo.example", null]) {
    const { r } = await llamar("votar", { propuesta_id: 1, tipo: "like", device_id: uuid() }, { origen });
    assertEquals(r.status, 403);
  }
  const pre = await fetch(`${BASE}/votar`, { method: "OPTIONS", headers: { origin: "https://malo.example", [IP_HEADER]: ipAzar() } });
  await pre.body?.cancel();
  assertEquals(pre.status, 403);
  const ok = await fetch(`${BASE}/votar`, { method: "OPTIONS", headers: { origin: ORIGEN, [IP_HEADER]: ipAzar() } });
  await ok.body?.cancel();
  assertEquals(ok.status, 204);
  /* el ACAO exacto no se verifica acá: Kong local lo pisa con "*" (la función real lo fija por origen) */
});

Deno.test("método, tipo de contenido y tamaño", async () => {
  assertEquals((await llamar("votar", {}, { metodo: "GET" })).r.status, 405);
  assertEquals((await llamar("votar", {}, { ct: "text/plain" })).r.status, 415);
  const grande = JSON.stringify({ propuesta_id: 1, tipo: "like", device_id: uuid(), x: "a".repeat(9000) });
  assertEquals((await llamar("votar", null, { raw: grande })).r.status, 413);
});

Deno.test("validación de campos", async () => {
  const id = await proponer();
  const malos: unknown[] = [true, "1e2", [id], -1, " 7 ", 1.5, null, {}];
  for (const propuesta_id of malos) {
    assertEquals((await llamar("votar", { propuesta_id, tipo: "like", device_id: uuid() })).r.status, 400, `propuesta_id=${JSON.stringify(propuesta_id)}`);
  }
  assertEquals((await llamar("votar", { propuesta_id: id, tipo: "favor", device_id: uuid() })).r.status, 400);
  assertEquals((await llamar("votar", { propuesta_id: id, tipo: "like", device_id: uuid(), extra: 1 })).r.status, 400);
  assertEquals((await llamar("votar", { propuesta_id: id, tipo: "like", device_id: "1234" })).r.status, 400);
  const v1 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // UUID v1
  assertEquals((await llamar("votar", { propuesta_id: id, tipo: "like", device_id: v1 })).r.status, 400);
  assertEquals((await llamar("votar", { propuesta_id: id, tipo: "like" })).r.status, 400);
});

Deno.test("texto: HTML rechazado, bidi y control limpiados, nombre sin saltos", async () => {
  for (const texto of ["hola <script>alert(1)</script>", "x <img src=x onerror=alert(1)>", "cierre </p> raro"]) {
    const { r, json } = await llamar("publicar", { nombre: "N", texto, device_id: uuid() });
    assertEquals(r.status, 400);
    assertEquals(json.error, "formato");
  }
  assertEquals((await llamar("publicar", { nombre: "a\nb", texto: "texto válido", device_id: uuid() })).r.status, 400);
  assertEquals((await llamar("publicar", { nombre: { a: 1 }, texto: "texto válido", device_id: uuid() })).r.status, 400);
  const { r } = await llamar("publicar", { nombre: "Ok‮", texto: "texto​ con **negrita**", device_id: uuid() });
  assertEquals(r.status, 200);
});

Deno.test("votos: 4.º desde la misma IP → 409; cambio de voto desde el mismo dispositivo → 200", async () => {
  const id = await proponer();
  const ip = ipAzar();
  const dev = uuid();
  assertEquals((await llamar("votar", { propuesta_id: id, tipo: "like", device_id: dev }, { ip })).r.status, 200);
  for (let i = 0; i < 2; i++) assertEquals((await llamar("votar", { propuesta_id: id, tipo: "like", device_id: uuid() }, { ip })).r.status, 200);
  const cuarto = await llamar("votar", { propuesta_id: id, tipo: "like", device_id: uuid() }, { ip });
  assertEquals(cuarto.r.status, 409);
  assertEquals(cuarto.json.error, "limite_ip");
  assertEquals((await llamar("votar", { propuesta_id: id, tipo: "dislike", device_id: dev }, { ip })).r.status, 200);
});

Deno.test("rate limit: la 4.ª publicación por IP da 429 con Retry-After, aun rotando device_id", async () => {
  const ip = ipAzar();
  for (let i = 0; i < 3; i++) assertEquals((await llamar("publicar", { nombre: "N", texto: "propuesta " + uuid(), device_id: uuid() }, { ip })).r.status, 200);
  const { r, json } = await llamar("publicar", { nombre: "N", texto: "propuesta " + uuid(), device_id: uuid() }, { ip });
  assertEquals(r.status, 429);
  assertEquals(json.error, "demasiados");
  assert(Number(r.headers.get("retry-after")) > 0);
});

Deno.test("rate limit: voto 61 en el minuto y 121 pedidos globales dan 429", async () => {
  const id = await proponer();
  const ip = ipAzar();
  let primero429 = 0;
  for (let i = 1; i <= 125 && !primero429; i++) {
    const { r } = await llamar("votar", { propuesta_id: id, tipo: "like", device_id: uuid() }, { ip });
    if (r.status === 429) primero429 = i;
  }
  // El 4.º voto a la misma propuesta da 409 (no cuenta como bloqueo), pero el límite sigue sumando.
  assert(primero429 === 61 || primero429 === 121, `primer 429 en el pedido ${primero429}`);
});

Deno.test("reportes: 21.º por hora y por IP da 429", async () => {
  const id = await proponer();
  const ip = ipAzar();
  let codigo = 0;
  for (let i = 1; i <= 21; i++) codigo = (await llamar("reportar", { propuesta_id: id, device_id: uuid() }, { ip })).r.status;
  assertEquals(codigo, 429);
});

Deno.test("carrera: 10 publicaciones en paralelo desde una IP → exactamente 3 OK", async () => {
  const ip = ipAzar();
  const res = await Promise.all(Array.from({ length: 10 }, () =>
    llamar("publicar", { nombre: "N", texto: "carrera " + uuid(), device_id: uuid() }, { ip })));
  assertEquals(res.filter((x) => x.r.status === 200).length, 3);
  assertEquals(res.filter((x) => x.r.status === 429).length, 7);
});

Deno.test("carrera: 30 votos en paralelo, misma IP y devices distintos → exactamente 3 OK", async () => {
  const id = await proponer();
  const ip = ipAzar();
  const res = await Promise.all(Array.from({ length: 30 }, () =>
    llamar("votar", { propuesta_id: id, tipo: "like", device_id: uuid() }, { ip })));
  assertEquals(res.filter((x) => x.r.status === 200).length, 3);
});

Deno.test("la IP no se puede falsificar con otras cabeceras", async () => {
  const id = await proponer();
  const ip = ipAzar();
  let ultimo = 0;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${BASE}/votar`, {
      method: "POST",
      headers: { origin: ORIGEN, "content-type": "application/json", [IP_HEADER]: ip, "x-real-ip": ipAzar(), "cf-connecting-ip": ipAzar(), "true-client-ip": ipAzar() },
      body: JSON.stringify({ propuesta_id: id, tipo: "like", device_id: uuid() }),
    });
    await r.body?.cancel();
    ultimo = r.status;
  }
  assertEquals(ultimo, 409);
});

Deno.test("errores genéricos: sin SQL, tablas ni stacks", async () => {
  const { texto } = await llamar("votar", { propuesta_id: 99999999, tipo: "like", device_id: uuid() });
  for (const prohibido of ["votos", "relation", "select ", "stack", "postgres", "at file:"]) {
    assert(!texto.toLowerCase().includes(prohibido), `la respuesta contiene "${prohibido}"`);
  }
});
