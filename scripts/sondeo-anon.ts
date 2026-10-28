// Sondeo con la clave ANON (solo lectura de seguridad: intenta lo prohibido y espera que falle).
//   deno run --allow-net --allow-env scripts/sondeo-anon.ts <URL> <ANON_KEY>
// Local: deno run --allow-net scripts/sondeo-anon.ts http://127.0.0.1:55321 <anon de `supabase status`>
// Contra el proyecto real solo hace SELECT y llamadas que deben ser denegadas; no crea datos.
const [URL_, ANON] = Deno.args;
if (!URL_ || !ANON) { console.error("uso: sondeo-anon.ts <URL> <ANON_KEY>"); Deno.exit(2); }

const H = { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json" };
let fallos = 0;
const chequear = (nombre: string, ok: boolean, detalle = "") => {
  console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${ok ? "" : "  → " + detalle}`);
  if (!ok) fallos++;
};
const req = (metodo: string, ruta: string, cuerpo?: unknown) =>
  fetch(`${URL_}${ruta}`, { method: metodo, headers: H, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
// "denegado o vacío": 401/403/404 o un 200 con lista vacía
const denegadoOVacio = async (r: Response) => {
  const t = await r.text();
  if (r.status >= 400) return { ok: true, t };
  try { const j = JSON.parse(t); return { ok: Array.isArray(j) && j.length === 0, t }; } catch { return { ok: false, t }; }
};

// JWT del cliente: rol anon
try {
  const rol = JSON.parse(atob(ANON.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role;
  chequear("la clave de config.js tiene role=anon", rol === "anon", String(rol));
} catch { chequear("la clave de config.js es un JWT legible", false); }

// 1. select en votos/reportes/limites
for (const t of ["votos", "reportes", "limites"]) {
  const r = await denegadoOVacio(await req("GET", `/rest/v1/${t}?select=*`));
  chequear(`select ${t} denegado o vacío`, r.ok, r.t.slice(0, 80));
}
// 2. escritura en cualquier tabla
for (const t of ["semanas", "propuestas", "votos", "reportes", "limites", "participacion", "escrutinio"]) {
  for (const [m, body] of [["POST", { x: 1 }], ["PATCH", { x: 1 }], ["DELETE", undefined]] as const) {
    const q = m === "POST" ? "" : "?id=gte.0";
    const r = await req(m, `/rest/v1/${t}${q}`, body);
    chequear(`${m} ${t} denegado`, r.status >= 400, `status ${r.status}`);
    await r.body?.cancel();
  }
}
// 3. rpc denegadas
for (const f of ["registrar_voto", "registrar_reporte", "crear_propuesta", "rate_limit", "semana_abierta", "cerrar_semana", "congelar_escrutinio", "restituir_propuesta"]) {
  const r = await req("POST", `/rest/v1/rpc/${f}`, {});
  chequear(`rpc ${f} denegada`, r.status >= 400, `status ${r.status}`);
  await r.body?.cancel();
}
// 4. con la semana abierta, no hay conteos por propuesta
const ab = await (await req("GET", "/rest/v1/semanas?select=n&cerrada=eq.false")).json();
if (Array.isArray(ab) && ab[0]) {
  for (const v of ["resultados_semana", "resumen_semana"]) {
    const j = await (await req("GET", `/rest/v1/${v}?semana=eq.${ab[0].n}`)).json();
    chequear(`${v} sin filas de la semana abierta`, Array.isArray(j) && j.length === 0, JSON.stringify(j).slice(0, 80));
  }
  const e = await (await req("GET", `/rest/v1/escrutinio?semana=eq.${ab[0].n}`)).json();
  chequear("escrutinio sin filas de la semana abierta", Array.isArray(e) && e.length === 0);
}
// 5. propuestas ocultas no se leen
const o = await (await req("GET", "/rest/v1/propuestas?select=id&estado=eq.oculta")).json();
chequear("propuestas ocultas no legibles", Array.isArray(o) && o.length === 0);
// Superficie: sin GraphQL ni signup
const g = await req("POST", "/graphql/v1", { query: "{ __typename }" });
const gt = await g.text();
chequear("GraphQL no expuesto", g.status >= 400 || /not enabled/i.test(gt) || !/__typename|"data"/.test(gt), `status ${g.status} ${gt.slice(0, 80)}`);
const s = await req("POST", "/auth/v1/signup", { email: "sondeo@example.com", password: "Sondeo-12345678" });
chequear("signup deshabilitado", s.status >= 400, `status ${s.status}`);
await s.body?.cancel();

console.log(fallos ? `\n${fallos} FALLOS` : "\nTodo OK");
Deno.exit(fallos ? 1 : 0);
