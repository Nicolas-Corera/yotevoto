/* Bandera argentina flameando sobre un <canvas>; ocupa todo su contenedor.
   Se anima solo mientras es visible (en pantalla y sin display:none). */
function banderaFlameante(cv, amp = 14) {
  const ctx = cv.getContext("2d"),
    caja = cv.parentElement,
    reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let src,
    dpr = 1,
    paso = 3,
    visible = false;

  function armar() {
    if (!cv.clientWidth) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    paso = Math.round(3 * dpr);
    const W = (cv.width = Math.round(cv.clientWidth * dpr)),
      H = (cv.height = Math.round(cv.clientHeight * dpr)),
      pad = Math.round(amp * 2 * dpr);
    src = document.createElement("canvas");
    src.width = W;
    src.height = H + pad * 2;
    const s = src.getContext("2d");
    s.fillStyle = "#74ACDF";
    s.fillRect(0, 0, W, src.height);
    s.fillStyle = "#FFF";
    s.fillRect(0, pad + H / 3, W, H / 3 + 1);

    /* Sol de Mayo: rayos rectos y ondulados alternados, con cara */
    const r = Math.min(W, H, (H / 3) * 2.3) * 0.125,
      cx = W / 2,
      cy = pad + H / 2,
      N = 16;
    s.lineJoin = s.lineCap = "round";
    s.fillStyle = "#F0A81C";
    s.strokeStyle = "#A8620F";
    s.lineWidth = 1.8 * dpr;
    const rayo = (pts) => {
      s.beginPath();
      pts.forEach(([x, y], j) => (j ? s.lineTo(x, y) : s.moveTo(x, y)));
      s.closePath();
      s.fill();
      s.stroke();
    };
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2,
        dx = Math.cos(a),
        dy = Math.sin(a);
      rayo([
        [cx + dx * r * 1.1 - dy * r * 0.11, cy + dy * r * 1.1 + dx * r * 0.11],
        [cx + dx * r * 2.25, cy + dy * r * 2.25],
        [cx + dx * r * 1.1 + dy * r * 0.11, cy + dy * r * 1.1 - dx * r * 0.11],
      ]);
      const b = a + Math.PI / N,
        bx = Math.cos(b),
        by = Math.sin(b),
        izq = [],
        der = [];
      for (let j = 0; j <= 14; j++) {
        const u = j / 14,
          rad = r * (1.1 + u * 0.95),
          lat = Math.sin(u * Math.PI * 3) * r * 0.08,
          w = (1 - u) * r * 0.12 + 0.002 * r;
        izq.push([cx + bx * rad - by * (lat + w), cy + by * rad + bx * (lat + w)]);
        der.unshift([cx + bx * rad - by * (lat - w), cy + by * rad + bx * (lat - w)]);
      }
      rayo(izq.concat(der));
    }

    /* cara del sol */
    const g = s.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#FBD04F");
    g.addColorStop(1, "#E39A14");
    s.fillStyle = g;
    s.lineWidth = 3 * dpr;
    s.beginPath();
    s.arc(cx, cy, r, 0, Math.PI * 2);
    s.fill();
    s.stroke();
    s.lineWidth = 2 * dpr;
    s.fillStyle = "#7A4310";
    for (const sg of [-1, 1]) {
      s.beginPath();
      s.ellipse(cx + sg * r * 0.33, cy - r * 0.08, r * 0.1, r * 0.055, 0, 0, Math.PI * 2);
      s.fill();
      s.beginPath();
      s.moveTo(cx + sg * r * 0.52, cy - r * 0.2);
      s.quadraticCurveTo(cx + sg * r * 0.33, cy - r * 0.3, cx + sg * r * 0.13, cy - r * 0.22);
      s.stroke();
    }
    s.beginPath();
    s.moveTo(cx, cy - r * 0.16);
    s.lineTo(cx - r * 0.05, cy + r * 0.2);
    s.lineTo(cx + r * 0.07, cy + r * 0.22);
    s.moveTo(cx - r * 0.2, cy + r * 0.5);
    s.quadraticCurveTo(cx, cy + r * 0.49, cx + r * 0.2, cy + r * 0.5);
    s.stroke();
    dibujar(performance.now());
  }

  function dibujar(ts) {
    if (!src) return;
    const t = reducir ? 0 : ts / 1000,
      k = (Math.PI * 2 * 1.4) / cv.width,
      pad = Math.round(amp * 2 * dpr);
    for (let x = 0; x < cv.width; x += paso) {
      const f = k * x - t * 2.2,
        off = (Math.sin(f) * amp + Math.sin(f * 2.1 + 1) * amp * 0.3) * dpr,
        c = Math.cos(f); /* luz y sombra de la tela */
      ctx.drawImage(src, x, Math.round(pad + off), paso, cv.height, x, 0, paso, cv.height);
      ctx.fillStyle = c > 0 ? `rgba(255,255,255,${0.16 * c})` : `rgba(15,42,74,${0.22 * -c})`;
      ctx.fillRect(x, 0, paso, cv.height);
    }
  }
  const bucle = (ts) => {
    if (!visible) return;
    dibujar(ts);
    requestAnimationFrame(bucle);
  };

  new ResizeObserver(armar).observe(cv);
  new IntersectionObserver(([en]) => {
    const antes = visible;
    visible = en.isIntersecting && !reducir;
    if (visible && !antes) requestAnimationFrame(bucle);
  }).observe(cv);
}
