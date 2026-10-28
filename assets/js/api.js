/* Cliente de Supabase. Lecturas y realtime: `API.db` (solo si cargó supabase-js).
   Escrituras: siempre por Edge Functions, que deciden con hash de IP + dispositivo. */
const API = (() => {
  const { url, anon } = window.CONFIG;
  const guardar = (k, v) => {
    try { localStorage.setItem(k, v); } catch {}
  };
  const leer = (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  };

  let device = leer("device_id");
  if (!device) {
    device = crypto.randomUUID();
    guardar("device_id", device);
  }

  async function llamar(fn, cuerpo) {
    let r, j;
    try {
      r = await fetch(`${url}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...cuerpo, device_id: device }),
      });
      j = await r.json();
    } catch {
      throw Object.assign(new Error("Sin conexión. Probá de nuevo."), { codigo: "red" });
    }
    if (!r.ok || !j.ok) {
      throw Object.assign(new Error(j.mensaje || "Algo salió mal. Probá de nuevo."), { codigo: j.error });
    }
    return j;
  }

  /* Qué votó este dispositivo (solo para pintar los botones; el servidor es el que manda) */
  const mios = () => {
    try { return JSON.parse(leer("mios") || "{}"); } catch { return {}; }
  };
  const marcar = (id, campo, valor) => {
    const m = mios();
    (m[id] ||= {})[campo] = valor;
    guardar("mios", JSON.stringify(m));
  };

  return {
    db: window.supabase?.createClient(url, anon, { auth: { persistSession: false } }),
    mios,
    publicar: (nombre, texto) => llamar("publicar", { nombre, texto }),
    async votar(id, tipo) {
      await llamar("votar", { propuesta_id: id, tipo });
      marcar(id, "voto", tipo);
    },
    async reportar(id) {
      await llamar("reportar", { propuesta_id: id });
      marcar(id, "reporte", true);
    },
  };
})();
