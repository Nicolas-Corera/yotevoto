// Utilidades comunes de las Edge Functions: CORS, IP, hash de IP/dispositivo, límites y validación.
// Falla cerrada: sin ALLOWED_ORIGINS, HASH_SALT (>= 32 caracteres) o IP_HEADER, todo pedido da 500.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ORIGENES = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SALT = Deno.env.get("HASH_SALT") ?? "";
// Cabecera con la IP real, puesta por la infraestructura (sin valor por defecto). Si trae varios
// valores separados por coma, se toma el `IP_DESDE_DERECHA`-ésimo contando desde la derecha.
const IP_HEADER = (Deno.env.get("IP_HEADER") ?? "").trim().toLowerCase();
const IP_DESDE_DERECHA = Math.max(1, Number(Deno.env.get("IP_DESDE_DERECHA") ?? "1") || 1);
const CONFIG_OK = ORIGENES.length > 0 && SALT.length >= 32 && IP_HEADER !== "";

const MAX_BODY = 8 * 1024;
const GLOBAL_MAX = 120; // pedidos por minuto por IP-hash, sumando las tres funciones

export const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export class Falla extends Error {
  constructor(public estado: number, public codigo: string, mensaje: string, public reintento?: number) {
    super(mensaje);
  }
}

/** IPv4 tal cual; IPv6 → prefijo /64 (si no, una persona tendría millones de IPs). Valida el formato. */
export function normalizarIp(bruto: string): string {
  const malo = () => new Falla(400, "sin_ip", "No pudimos identificar tu conexión.");
  const v4 = (s: string): string | null => {
    const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const o = m.slice(1).map(Number);
    return o.some((n) => n > 255) ? null : o.join(".");
  };
  let ip = bruto.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!ip.includes(":")) {
    const r = v4(ip);
    if (!r) throw malo();
    return r;
  }
  const cola = ip.split(":").pop()!;
  if (cola.includes(".")) { // IPv4 incrustada (::ffff:1.2.3.4)
    const r = v4(cola);
    if (!r) throw malo();
    const [a, b, c, d] = r.split(".").map(Number);
    ip = ip.slice(0, ip.length - cola.length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const partes = ip.split("::");
  if (partes.length > 2) throw malo();
  const izq = partes[0] ? partes[0].split(":") : [];
  const der = partes.length === 2 && partes[1] ? partes[1].split(":") : [];
  const faltan = 8 - izq.length - der.length;
  if (partes.length === 2 ? faltan < 1 : faltan !== 0) throw malo();
  const g = [...izq, ...Array(partes.length === 2 ? faltan : 0).fill("0"), ...der];
  if (!g.every((x) => /^[0-9a-f]{1,4}$/.test(x))) throw malo();
  const n = g.map((x) => parseInt(x, 16));
  if (n.slice(0, 5).every((x) => x === 0) && n[5] === 0xffff) { // IPv4 mapeada → IPv4
    return `${n[6] >> 8}.${n[6] & 255}.${n[7] >> 8}.${n[7] & 255}`;
  }
  return n.slice(0, 4).map((x) => x.toString(16).padStart(4, "0")).join(":");
}

function ipDe(req: Request): string {
  const valor = req.headers.get(IP_HEADER);
  if (!valor) throw new Falla(400, "sin_ip", "No pudimos identificar tu conexión.");
  const lista = valor.split(",");
  const elegido = lista[lista.length - IP_DESDE_DERECHA];
  if (elegido === undefined) throw new Falla(400, "sin_ip", "No pudimos identificar tu conexión.");
  return normalizarIp(elegido);
}

async function hash(texto: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SALT), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(texto));
  return [...new Uint8Array(firma)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function leerCuerpo(req: Request): Promise<string> {
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY) {
    throw new Falla(413, "grande", "Pedido demasiado grande.");
  }
  const lector = req.body?.getReader();
  if (!lector) return "";
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BODY) {
      await lector.cancel();
      throw new Falla(413, "grande", "Pedido demasiado grande.");
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) { todo.set(t, pos); pos += t.length; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(todo); } catch {
    throw new Falla(400, "json", "Pedido inválido.");
  }
}

/** Corta con 429 (y Retry-After) si alguna clave supera `max` por `segundos`. Si falla el RPC, rechaza. */
async function limitar(claves: string[], max: number, segundos: number) {
  const { data, error } = await db.rpc("rate_limit", { p_claves: claves, p_max: max, p_segundos: segundos });
  if (error || typeof data !== "number") throw new Falla(503, "no_disponible", "Servicio no disponible. Probá de nuevo.");
  if (data > 0) throw new Falla(429, "demasiados", "Demasiados intentos. Esperá un rato y probá de nuevo.", data);
}

type Ctx = { cuerpo: Record<string, unknown> };
type Reglas = {
  accion: string;
  max: number; // límite de la acción, medido por IP-hash y por device-hash (por separado)
  segundos: number;
  claves: string[]; // lista blanca de campos del body (sin device_id)
};

/** Envuelve una función: CORS, método, origen, IP, límites (antes del trabajo), cuerpo y errores uniformes. */
export function manejar(reglas: Reglas, fn: (ctx: Ctx) => Promise<Record<string, unknown>>) {
  return async (req: Request): Promise<Response> => {
    const origen = req.headers.get("origin");
    const permitido = CONFIG_OK && !!origen && ORIGENES.includes(origen);
    const cors: Record<string, string> = { "Vary": "Origin" };
    if (permitido) {
      cors["Access-Control-Allow-Origin"] = origen!;
      cors["Access-Control-Allow-Headers"] = "content-type";
      cors["Access-Control-Allow-Methods"] = "POST, OPTIONS";
      cors["Access-Control-Max-Age"] = "600";
    }
    const responder = (estado: number, json: unknown, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(json), {
        status: estado,
        headers: { ...cors, ...extra, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });

    try {
      if (!CONFIG_OK) throw new Falla(500, "config", "Servidor mal configurado.");
      if (!permitido) throw new Falla(403, "origen", "Origen no permitido.");
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (req.method !== "POST") throw new Falla(405, "metodo", "Método no permitido.");

      const ipHash = await hash("ip:" + ipDe(req));
      await limitar([`global:ip:${ipHash}`], GLOBAL_MAX, 60);

      if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        throw new Falla(415, "tipo", "Tipo de contenido no permitido.");
      }
      let cuerpo: Record<string, unknown>;
      try { cuerpo = JSON.parse(await leerCuerpo(req)); } catch (e) {
        if (e instanceof Falla) throw e;
        throw new Falla(400, "json", "Pedido inválido.");
      }
      if (typeof cuerpo !== "object" || cuerpo === null || Array.isArray(cuerpo)) {
        throw new Falla(400, "json", "Pedido inválido.");
      }
      const permitidas = new Set([...reglas.claves, "device_id"]);
      if (Object.keys(cuerpo).some((k) => !permitidas.has(k))) throw new Falla(400, "campos", "Pedido inválido.");
      const dev = cuerpo.device_id;
      if (typeof dev !== "string" || !UUID_V4.test(dev)) throw new Falla(400, "dispositivo", "Dispositivo inválido.");
      const devHash = await hash("dev:" + dev);

      // El límite se evalúa antes del trabajo caro: IP y dispositivo, por separado, en un solo RPC atómico.
      await limitar([`${reglas.accion}:ip:${ipHash}`, `${reglas.accion}:dev:${devHash}`], reglas.max, reglas.segundos);

      return responder(200, { ok: true, ...(await fn({ cuerpo: { ...cuerpo, ip_hash: ipHash, dev_hash: devHash } })) });
    } catch (e) {
      if (e instanceof Falla) {
        const extra = e.reintento ? { "Retry-After": String(e.reintento) } : {};
        return responder(e.estado, { ok: false, error: e.codigo, mensaje: e.message }, extra);
      }
      // Nunca se loguea el error completo (puede traer hashes del esquema): solo el código de Postgres.
      console.error({ fn: reglas.accion, pg: (e as { code?: string })?.code ?? "?" });
      return responder(500, { ok: false, error: "interno", mensaje: "Error interno. Probá de nuevo." });
    }
  };
}

/** ID de propuesta: entero positivo seguro (number o string de dígitos). */
export function idPropuesta(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && /^[1-9]\d{0,15}$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) throw new Falla(400, "propuesta", "Propuesta inválida.");
  return n;
}

// Control (salvo \n), bidi y ancho cero
const PROHIBIDOS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;
const largo = (s: string) => [...s].length;

/** Limpia y valida texto de usuario. Rechaza HTML; deja pasar solo el marcado propio (**, *, __, •). */
export function limpiarTexto(v: unknown, campo: string, min: number, max: number, multilinea: boolean): string {
  if (typeof v !== "string") throw new Falla(400, campo, "Texto inválido.");
  let t = v.normalize("NFC").replace(/\r\n?/g, "\n");
  t = t.replace(PROHIBIDOS, "").trim();
  if (/<[a-z!/?]/i.test(t)) throw new Falla(400, "formato", "No se permite HTML en el texto.");
  if (multilinea) {
    t = t.replace(/^- /gm, "• ").replace(/\n{3,}/g, "\n\n");
    if (t.split("\n").length > 25) throw new Falla(400, campo, "Demasiadas líneas.");
  } else if (t.includes("\n")) {
    throw new Falla(400, campo, "No se permiten saltos de línea.");
  }
  if (largo(t) < min || largo(t) > max) {
    throw new Falla(400, campo, `Debe tener entre ${min} y ${max} caracteres.`);
  }
  return t;
}
