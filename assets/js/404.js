const $ = (id) => document.getElementById(id);
const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Los links son relativos (/muro/, /). Esta página se muestra
         en la URL equivocada, que puede estar en cualquier subcarpeta, así que
         si hace falta se puede fijar la raíz del sitio acá. Ejemplos:
           ""            -> relativo (funciona en dominio propio o en la raíz)
           "/"           -> raíz del dominio
           "/mi-repo/"   -> sitio de proyecto en GitHub Pages */
const RAIZ = "";
if (RAIZ)
  document.querySelectorAll("[data-ruta]").forEach((a) => {
    a.href = RAIZ + a.dataset.ruta;
  });

/* ---------- Bandera flameando (misma que /) ---------- */
const cv = $("bandera"),
  ctx = cv.getContext("2d");
const AMP = 20; /* altura de las ondas en px */
let flameando = true,
  src,
  dpr = 1,
  paso = 3;

function armarBandera() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  paso = Math.round(3 * dpr);
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  const pad = Math.round(AMP * 2 * dpr);

  /* bandera dibujada una sola vez, con margen arriba y abajo para las ondas */
  src = document.createElement("canvas");
  src.width = cv.width;
  src.height = cv.height + pad * 2;
  const s = src.getContext("2d");
  const y1 = pad + cv.height / 3,
    y2 = pad + (cv.height * 2) / 3;
  s.fillStyle = "#74ACDF";
  s.fillRect(0, 0, src.width, y1 + 1);
  s.fillStyle = "#FFFFFF";
  s.fillRect(0, y1, src.width, y2 - y1 + 1);
  s.fillStyle = "#74ACDF";
  s.fillRect(0, y2, src.width, src.height - y2);

  /* Sol de Mayo: rayos rectos y ondulados alternados, con cara */
  /* En 404 el sol no va al centro (ahí está la tarjeta):
           escritorio -> a la izquierda, celular -> arriba */
  const ancho = innerWidth >= 900;
  const cx = ancho ? src.width * 0.26 : src.width / 2,
    cy = pad + (ancho ? cv.height / 2 : 190 * dpr);
  const r = ancho
    ? Math.min(cv.width, cv.height) * 0.125
    : Math.min(cv.width, cv.height) * 0.14;
  const oro = "#F0A81C",
    borde = "#A8620F";
  s.lineJoin = "round";
  s.lineCap = "round";
  s.fillStyle = oro;
  s.strokeStyle = borde;
  s.lineWidth = 1.8 * dpr;
  const N = 16;
  for (let i = 0; i < N; i++) {
    /* rayo recto */
    const a = (i / N) * Math.PI * 2,
      dx = Math.cos(a),
      dy = Math.sin(a),
      px = -dy,
      py = dx;
    s.beginPath();
    s.moveTo(
      cx + dx * r * 1.1 + px * r * 0.11,
      cy + dy * r * 1.1 + py * r * 0.11,
    );
    s.lineTo(cx + dx * r * 2.25, cy + dy * r * 2.25);
    s.lineTo(
      cx + dx * r * 1.1 - px * r * 0.11,
      cy + dy * r * 1.1 - py * r * 0.11,
    );
    s.closePath();
    s.fill();
    s.stroke();

    /* rayo ondulado, entre dos rectos */
    const b = ((i + 0.5) / N) * Math.PI * 2,
      bx = Math.cos(b),
      by = Math.sin(b),
      qx = -by,
      qy = bx;
    const izq = [],
      der = [];
    for (let j = 0; j <= 14; j++) {
      const u = j / 14;
      const rad = r * (1.1 + u * 0.95);
      const lat = Math.sin(u * Math.PI * 3) * r * 0.08;
      const ancho = (1 - u) * r * 0.12 + 0.002 * r;
      izq.push([
        cx + bx * rad + qx * (lat + ancho),
        cy + by * rad + qy * (lat + ancho),
      ]);
      der.push([
        cx + bx * rad + qx * (lat - ancho),
        cy + by * rad + qy * (lat - ancho),
      ]);
    }
    s.beginPath();
    izq.forEach(([x, y], j) => (j ? s.lineTo(x, y) : s.moveTo(x, y)));
    der.reverse().forEach(([x, y]) => s.lineTo(x, y));
    s.closePath();
    s.fill();
    s.stroke();
  }

  /* cara del sol */
  const g = s.createRadialGradient(
    cx - r * 0.25,
    cy - r * 0.3,
    r * 0.1,
    cx,
    cy,
    r,
  );
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
    s.ellipse(
      cx + sg * r * 0.33,
      cy - r * 0.08,
      r * 0.1,
      r * 0.055,
      0,
      0,
      Math.PI * 2,
    );
    s.fill();
    s.beginPath();
    s.moveTo(cx + sg * r * 0.52, cy - r * 0.2);
    s.quadraticCurveTo(
      cx + sg * r * 0.33,
      cy - r * 0.3,
      cx + sg * r * 0.13,
      cy - r * 0.22,
    );
    s.stroke();
  }
  s.beginPath();
  s.moveTo(cx, cy - r * 0.16);
  s.lineTo(cx - r * 0.05, cy + r * 0.2);
  s.lineTo(cx + r * 0.07, cy + r * 0.22);
  s.stroke();
  s.beginPath();
  s.moveTo(cx - r * 0.2, cy + r * 0.5);
  s.quadraticCurveTo(cx, cy + r * 0.49, cx + r * 0.2, cy + r * 0.5);
  s.stroke();
}

function dibujar(ts) {
  if (!flameando) return;
  const t = ts / 1000;
  const k = (Math.PI * 2 * 1.4) / cv.width;
  const pad = Math.round(AMP * 2 * dpr);
  for (let x = 0; x < cv.width; x += paso) {
    const f = k * x - t * 2.2;
    const off = (Math.sin(f) * AMP + Math.sin(f * 2.1 + 1) * AMP * 0.3) * dpr;
    ctx.drawImage(
      src,
      x,
      Math.round(pad + off),
      paso,
      cv.height,
      x,
      0,
      paso,
      cv.height,
    );
    const c = Math.cos(f); /* luz y sombra de la tela */
    ctx.fillStyle =
      c > 0 ? `rgba(255,255,255,${0.16 * c})` : `rgba(15,42,74,${0.22 * -c})`;
    ctx.fillRect(x, 0, paso, cv.height);
  }
  if (!reducir) requestAnimationFrame(dibujar);
}

armarBandera();
addEventListener("resize", () => {
  armarBandera();
  if (reducir) dibujar(0);
});
if (reducir) dibujar(0);
else requestAnimationFrame(dibujar);
