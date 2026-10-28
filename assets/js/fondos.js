/* Slideshow de fondo con cross-fade (ver .fondo en base.css). Carga la primera
   imagen, la muestra enseguida y va sumando las demás sin bloquear nada. */
(() => {
  const FONDOS = Array.from({ length: 10 }, (_, i) => `/assets/img/imagen_${i + 1}.webp`),
    cont = document.getElementById("fondos"),
    capas = [],
    espera = 7000;
  const cargar = (src) =>
    new Promise((ok) => {
      const img = new Image();
      img.src = src;
      img.decode().then(() => ok(src), () => ok(null));
    });

  let i = -1;
  function pasar() {
    const n = (i + 1) % capas.length;
    capas.forEach((c, k) => {
      if (k === n) c.classList.replace("previo", "activo") || c.classList.add("activo");
      else if (k === i) c.classList.replace("activo", "previo");
      else c.classList.remove("previo", "activo");
    });
    i = n;
  }

  (async () => {
    const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const primera = await cargar(FONDOS[0]);
    const agregar = (src) => {
      const d = document.createElement("div");
      d.className = "fondo";
      d.style.backgroundImage = `url("${src}")`;
      cont.append(d);
      capas.push(d);
      d.offsetWidth; /* fija el estado inicial para que el zoom y el fade arranquen */
    };
    if (!primera) return; /* sin imágenes queda el fondo marino */
    agregar(primera);
    pasar();
    if (reducir) return;
    /* las demás se cargan de a una, en segundo plano, y rotan apenas hay 2 */
    setInterval(() => capas.length > 1 && pasar(), espera);
    for (const src of FONDOS.slice(1)) {
      const ok = await cargar(src);
      if (ok) agregar(ok);
    }
  })();
})();
