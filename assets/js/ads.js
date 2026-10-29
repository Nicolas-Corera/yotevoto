/* Google AdSense. Se carga solo si se cumple todo esto:
   1) enabled = true, 2) client tenga tu ID real (ca-pub-2066576602777227),
   3) el hueco tenga su ID de bloque en `slots`, y 4) la persona haya aceptado "Aceptar todas" en el banner de cookies.
   Para apagarlo de golpe: enabled = false. */
(() => {
  const ADS = {
    enabled: true,
    client: "ca-pub-2066576602777227",
    /* data-ad del hueco -> ID del bloque de anuncios de AdSense (10 dígitos). Son 3 bloques y se reutilizan en todas las páginas */
    slots: { "lateral-izq": "4068262506", "lateral-der": "2755180834", banner: "5507794690" },
  };

  const huecos = [...document.querySelectorAll("[data-ad]")];
  if (!huecos.length) return;

  /* En tu máquina nunca se piden anuncios reales (evita impresiones inválidas): se ven los huecos marcados */
  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
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
