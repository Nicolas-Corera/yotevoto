/* Banner de consentimiento de cookies. Guarda la decisión en localStorage ("necesarias" | "todas").
   Hoy el sitio no usa cookies de seguimiento: cuando se sumen (analítica, etc.), cargalas solo si
   Cookies.estado() === "todas". Avisa con el evento "cookies:decidido". */
(() => {
  const K = "cookies";
  const leer = () => {
    try { return JSON.parse(localStorage.getItem(K)); } catch { return null; }
  };
  const guardar = (v) => {
    try { localStorage.setItem(K, JSON.stringify({ v, t: Date.now() })); } catch {}
  };

  function mostrar() {
    if (document.getElementById("cookies")) return;
    const d = document.createElement("div");
    d.id = "cookies";
    d.className = "cookies";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-label", "Consentimiento de cookies");
    d.innerHTML = `<p><strong>Usamos cookies</strong>Usamos almacenamiento propio para que el sitio funcione (por ejemplo, recordar tus votos) y, si lo aceptás, para mejorarlo. <a href="/cookies/">Más información</a></p>
      <div class="cookies-btns"><button type="button" data-v="necesarias">Solo necesarias</button><button type="button" class="ok" data-v="todas">Aceptar todas</button></div>`;
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      guardar(b.dataset.v);
      d.classList.add("sale");
      setTimeout(() => d.remove(), 300);
      dispatchEvent(new Event("cookies:decidido"));
    });
    document.body.append(d);
  }

  window.Cookies = { estado: () => leer()?.v ?? null, reabrir: mostrar };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-cookies-reabrir]")) mostrar(); });

  if (leer()) return;
  /* en la home esperamos a que termine la bienvenida */
  if (document.getElementById("intro") && !document.body.classList.contains("listo")) addEventListener("intro:fin", mostrar, { once: true });
  else mostrar();
})();
