import { db, Falla, idPropuesta, manejar } from "../_shared/seguridad.ts";

const REPORTES_PARA_OCULTAR = 5; // IPs distintas

Deno.serve(manejar(
  { accion: "reportar", max: 20, segundos: 3600, claves: ["propuesta_id"] },
  async ({ cuerpo }) => {
    const id = idPropuesta(cuerpo.propuesta_id);
    const { data, error } = await db.rpc("registrar_reporte", {
      p_prop: id, p_ip: cuerpo.ip_hash, p_dev: cuerpo.dev_hash, p_umbral: REPORTES_PARA_OCULTAR,
    });
    if (error) throw error;
    if (data === "no_existe") throw new Falla(404, "no_existe", "Esa propuesta ya no está disponible.");
    if (data === "fuera_de_plazo") throw new Falla(409, "fuera_de_plazo", "La semana ya terminó.");
    return {};
  },
));
