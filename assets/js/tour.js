/* Tutorial guiado. Uso: Tour.iniciar("clave", [{ sel, titulo, texto, lado }]).
   Se muestra una sola vez por clave (localStorage), cuando la página terminó de cargar (load + fuentes), sin esperar al banner de cookies.
   Mientras está abierto el scroll de la página queda bloqueado.
   Tour.ayuda("clave", pasos) agrega el botón "?" para repetirlo. Los pasos cuyo elemento no existe se saltean. */
const Tour = (() => {
  const leer = (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  };
  const guardar = (k) => {
    try { localStorage.setItem(k, "1"); } catch {}
  };
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  };
  const visible = (e) => e && e.getClientRects().length > 0;
  let activo = false;

  /* ganchos: { antes() } prepara la página (p. ej. una boleta de ejemplo); { despues() } la deja como estaba */
  function correr(clave, pasos, ganchos = {}) {
    if (activo) return;
    ganchos.antes?.();
    pasos = pasos.filter((p) => visible(document.querySelector(p.sel)));
    if (!pasos.length) return ganchos.despues?.();
    activo = true;
    const scrollInicial = scrollY; /* al terminar, la página vuelve donde estaba */
    const velo = el("div", "tour-velo"),
      foco = el("div", "tour-foco"),
      tip = el("div", "tour-tip");
    tip.setAttribute("role", "dialog");
    tip.setAttribute("aria-live", "polite");
    document.body.append(velo, foco, tip);
    document.documentElement.classList.add("tour-activo"); /* sin scroll mientras dura (ver tour.css) */
    const frenar = (e) => e.preventDefault();
    let i = 0,
      objetivo = null,
      ultimaClave = "";
    /* la primera vez se ubica sin transición (si no, el resalte "vuela" desde la esquina) */
    foco.style.transition = tip.style.transition = "none";

    function posicionar() {
      if (!objetivo) return;
      if (!objetivo.isConnected) {
        objetivo = document.querySelector(pasos[i].sel); /* el contenido real reemplazó al skeleton */
        if (!objetivo) return siguiente();
      }
      const r = objetivo.getBoundingClientRect(),
        tw = tip.offsetWidth,
        th = tip.offsetHeight,
        m = 6,
        vw = innerWidth,
        vh = innerHeight;
      /* solo se escribe si algo cambió: así las transiciones CSS no se reinician en cada cuadro */
      const clave = [i, r.top, r.left, r.width, r.height, tw, th, vw, vh].map(Math.round).join();
      if (clave === ultimaClave) return;
      ultimaClave = clave;
      Object.assign(foco.style, {
        top: r.top - m + "px",
        left: r.left - m + "px",
        width: r.width + m * 2 + "px",
        height: r.height + m * 2 + "px",
      });
      const t = { width: tw, height: th },
        pref = pasos[i].lado || "bottom",
        abajo = vh - r.bottom,
        arriba = r.top;
      let lado = pref === "top" ? "top" : "bottom";
      if (lado === "bottom" && abajo < t.height + 24 && arriba > abajo) lado = "top";
      if (lado === "top" && arriba < t.height + 24 && abajo > arriba) lado = "bottom";
      const top = lado === "bottom" ? r.bottom + m + 14 : r.top - m - 14 - t.height;
      const left = Math.min(Math.max(12, r.left + r.width / 2 - t.width / 2), vw - t.width - 12);
      tip.dataset.lado = lado;
      tip.style.top = Math.max(8, Math.min(top, vh - t.height - 8)) + "px";
      tip.style.left = left + "px";
      const centro = r.left + r.width / 2 - left;
      tip.style.setProperty("--flecha", Math.min(Math.max(22, centro), t.width - 22) + "px");
    }

    function mostrar() {
      const p = pasos[i];
      objetivo = document.querySelector(p.sel);
      if (!objetivo) return siguiente();
      objetivo.scrollIntoView({ block: "center", behavior: "instant" });
      const ultimo = i === pasos.length - 1;
      tip.innerHTML = `<div class="tour-cont"><h3>${p.titulo}</h3><p>${p.texto}</p>
        <div class="tour-pie"><small>${i + 1} / ${pasos.length}</small>
        ${ultimo ? "" : '<button type="button" class="saltar">Saltar</button>'}
        ${i ? '<button type="button" class="ant">Atrás</button>' : ""}
        <button type="button" class="sig">${ultimo ? "¡Listo!" : "Siguiente"}</button></div></div>`;
      ultimaClave = "";
      posicionar();
      if (foco.style.transition === "none") {
        void foco.offsetWidth; /* aplica la posición inicial y recién ahí se activan las transiciones */
        foco.style.transition = tip.style.transition = "";
      }
    }

    function cerrar() {
      guardar("tour_" + clave);
      removeEventListener("resize", posicionar);
      removeEventListener("scroll", posicionar, true);
      removeEventListener("keydown", teclas);
      removeEventListener("wheel", frenar);
      removeEventListener("touchmove", frenar);
      document.documentElement.classList.remove("tour-activo");
      ganchos.despues?.();
      scrollTo({ top: scrollInicial, behavior: "instant" });
      [velo, foco, tip].forEach((e) => e.remove());
      activo = false;
    }
    function teclas(e) {
      if (e.key === "Escape") cerrar();
      else if (e.key === "ArrowRight" || e.key === "Enter") siguiente();
      else if (e.key === "ArrowLeft" && i) (i--, mostrar());
    }
    const siguiente = () => (i === pasos.length - 1 ? cerrar() : (i++, mostrar()));

    tip.addEventListener("click", (e) => {
      if (e.target.closest(".sig")) siguiente();
      else if (e.target.closest(".ant")) (i--, mostrar());
      else if (e.target.closest(".saltar")) cerrar();
    });
    velo.addEventListener("click", cerrar);
    addEventListener("resize", posicionar);
    addEventListener("scroll", posicionar, true);
    addEventListener("keydown", teclas);
    addEventListener("wheel", frenar, { passive: false });
    addEventListener("touchmove", frenar, { passive: false });
    /* se re-mide en cada cuadro: sigue al elemento aunque la página se esté animando o cargando datos */
    (function seguir() {
      if (!activo) return;
      posicionar();
      requestAnimationFrame(seguir);
    })();
    mostrar();
  }

  /* la página terminó de cargar: recursos, fuentes y un cuadro más para que se pinte */
  const cargada = () =>
    new Promise((ok) => {
      const fin = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(ok)));
      document.readyState === "complete" ? fin() : addEventListener("load", fin, { once: true });
    });

  return {
    iniciar(clave, pasos, ganchos) {
      if (leer("tour_" + clave)) return;
      cargada().then(() => correr(clave, pasos, ganchos));
    },
    ayuda(clave, pasos, ganchos) {
      const b = el("button", "tour-ayuda", "?");
      b.type = "button";
      b.title = "Ver el tutorial";
      b.setAttribute("aria-label", "Ver el tutorial");
      b.addEventListener("click", () => correr(clave, pasos, ganchos));
      document.body.append(b);
    },
  };
})();
