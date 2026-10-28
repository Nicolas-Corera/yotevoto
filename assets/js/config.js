/* Claves públicas de Supabase (la anon key es pública por diseño: la seguridad está en RLS y las Edge Functions).
   En localhost se usa el stack local (`supabase start`); en cualquier otro host, el proyecto real. */
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
window.CONFIG = LOCAL
  ? {
      url: "http://127.0.0.1:55321",
      /* clave anon DEMO del stack local: es la demo pública del stack local */
      anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    }
  : {
      url: "https://gklrjkasnkdqlotvynlq.supabase.co",
      anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrbHJqa2FzbmtkcWxvdHZ5bmxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMTAyNjAsImV4cCI6MjEwODc4NjI2MH0.1SNuqpRs3FpGiaKQ78naVH1L1CqW5EBG7653hSy5BSs",
    };
