import { db, Falla, limpiarTexto, manejar } from "../_shared/seguridad.ts";

Deno.serve(manejar(
  { accion: "publicar", max: 3, segundos: 3600, claves: ["nombre", "texto"] }, // 3 por hora por IP y por dispositivo
  async ({ cuerpo }) => {
    const nombre = limpiarTexto(cuerpo.nombre, "nombre", 1, 40, false);
    const texto = limpiarTexto(cuerpo.texto, "texto", 5, 500, true);
    const { data, error } = await db.rpc("crear_propuesta", { p_nombre: nombre, p_texto: texto });
    if (error) throw error;
    if (data === null) throw new Falla(409, "fuera_de_plazo", "La semana está cerrando. Probá en unos minutos.");
    return { id: data };
  },
));
