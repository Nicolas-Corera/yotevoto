/* Google AdSense. Hoy está APAGADO: no se carga nada de Google hasta que:
   1) enabled = true, 2) client tenga tu ID real (ca-pub-2066576602777227),
   3) el hueco tenga su ID de bloque en `slots`, y 4) la persona haya aceptado "Aceptar todas" en el banner de cookies.
   Antes de activar: ampliar la CSP de _headers (bloque comentado) y actualizar /privacidad/ y /cookies/. */
(() => {
  const ADS = {
    enabled: false,
    client: "ca-pub-2066576602777227",
    /* data-ad del hueco -> ID del bloque de anuncios de AdSense (10 dígitos). Son 3 bloques y se reutilizan en todas las páginas */
    slots: { "lateral-izq": "", "lateral-der": "", banner: "" },
  };

  const huecos = [...document.querySelectorAll("[data-ad]")];
  if (!huecos.length) return;

  /* En tu máquina se ven los huecos marcados para que sepas dónde irá cada anuncio */
  if (["localhost", "127.0.0.1"].includes(location.hostname) && !ADS.enabled) {
    for (const h of huecos) {
      h.hidden = false;
      h.classList.add("ad-slot--demo");
      h.textContent = `Espacio publicitario · ${h.dataset.ad}`;
    }
    return;
  }

  let cargado = false;
  function activar() {
    if (cargado || document.prerendering) return;
    if (!ADS.enabled || !/^ca-pub-\d{16}$/.test(ADS.client)) return;
    if (window.Cookies?.estado() !== "todas") return;
    cargado = true;

    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.client}`;
    document.head.append(s);

    window.adsbygoogle = window.adsbygoogle || [];
    for (const h of huecos) {
      const id = ADS.slots[h.dataset.ad];
      if (!/^\d{6,12}$/.test(id || "")) continue;
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.dataset.adClient = ADS.client;
      ins.dataset.adSlot = id;
      ins.dataset.adFormat = "auto";
      ins.dataset.fullWidthResponsive = "true";
      h.append(ins);
      h.hidden = false;
      try { window.adsbygoogle.push({}); } catch {}
    }
  }

  addEventListener("cookies:decidido", activar);
  document.addEventListener("prerenderingchange", activar);
  activar();
})();
