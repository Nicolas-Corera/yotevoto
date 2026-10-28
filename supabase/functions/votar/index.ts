import { db, Falla, idPropuesta, manejar } from "../_shared/seguridad.ts";

const MAX_VOTOS_POR_IP = 3; // tolera redes compartidas (oficinas, datos móviles)

Deno.serve(manejar(
  { accion: "votar", max: 60, segundos: 60, claves: ["propuesta_id", "tipo"] },
  async ({ cuerpo }) => {
    const id = idPropuesta(cuerpo.propuesta_id);
    const tipo = cuerpo.tipo;
    if (tipo !== "like" && tipo !== "dislike") throw new Falla(400, "tipo", "Voto inválido.");

    const { data, error } = await db.rpc("registrar_voto", {
      p_prop: id, p_tipo: tipo, p_ip: cuerpo.ip_hash, p_dev: cuerpo.dev_hash, p_max_ip: MAX_VOTOS_POR_IP,
    });
    if (error) throw error;
    if (data === "no_existe") throw new Falla(404, "no_existe", "Esa propuesta ya no está disponible para votar.");
    if (data === "fuera_de_plazo") throw new Falla(409, "fuera_de_plazo", "La votación de esta semana ya terminó.");
    if (data === "limite_ip") {
      throw new Falla(409, "limite_ip", "Ya se registraron votos desde tu conexión para esta propuesta.");
    }
    return {}; // el escrutinio es secreto: no se devuelven conteos
  },
));
