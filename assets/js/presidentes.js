const $ = (id) => document.getElementById(id);

/* ---------- Caras en SVG: cada nombre genera siempre la misma cara ---------- */
function azar(sem) {
  let h = 2166136261;
  for (const ch of sem) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}
function cara(semilla, fondo = "#EEF4FA") {
  const r = azar(semilla),
    el = (a) => a[Math.floor(r() * a.length)];
  const piel = el([
    "#F1C9A5",
    "#E0AC82",
    "#C68642",
    "#8D5524",
    "#F6D6B8",
    "#A9714B",
  ]);
  const pelo = el([
    "#1B1B1B",
    "#4A2C17",
    "#8B5A2B",
    "#D9A441",
    "#B5532B",
    "#8A8A8A",
  ]);
  const ropa = el([
    "#0F2A4A",
    "#B3261E",
    "#2E7D5B",
    "#6B3FA0",
    "#F6B40E",
    "#444B55",
    "#1E6BD6",
  ]);
  const estilo = Math.floor(r() * 6),
    lentes = r() < 0.35,
    barba = r() < 0.28,
    sonrie = r() < 0.7;
  let atras = "",
    frente = "";
  if (estilo === 1)
    atras = `<path d="M27 50Q24 20 50 20Q76 20 73 50L75 80H25Z" fill="${pelo}"/>`;
  if (estilo === 0 || estilo === 1 || estilo === 4)
    frente = `<path d="M31 46Q30 24 50 24Q70 24 69 46Q63 35 50 35Q37 35 31 46Z" fill="${pelo}"/>`;
  if (estilo === 4) frente += `<circle cx="50" cy="19" r="8" fill="${pelo}"/>`;
  if (estilo === 3)
    frente = [30, 36, 43, 50, 57, 64, 70]
      .map(
        (x, i) =>
          `<circle cx="${x}" cy="${[38, 30, 26, 24, 26, 30, 38][i]}" r="8" fill="${pelo}"/>`,
      )
      .join("");
  if (estilo === 5)
    frente = `<path d="M30 40Q30 19 50 19Q70 19 70 40Z" fill="${ropa}"/><path d="M30 38H80L76 43H30Z" fill="${ropa}"/>`;
  const boca = sonrie
    ? `<path d="M43.5 57Q50 63 56.5 57" fill="none" stroke="${barba ? "#F3D2C4" : "#7A3B2E"}" stroke-width="2" stroke-linecap="round"/>`
    : `<path d="M44.5 58.5H55.5" fill="none" stroke="${barba ? "#F3D2C4" : "#7A3B2E"}" stroke-width="2" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="${fondo}"/>${atras}
      <path d="M8 100Q10 73 50 71Q90 73 92 100Z" fill="${ropa}"/>
      <rect x="43" y="60" width="14" height="14" rx="4" fill="${piel}"/><rect x="43" y="60" width="14" height="14" rx="4" fill="#000" opacity=".1"/>
      <ellipse cx="50" cy="46" rx="19" ry="22" fill="${piel}"/><circle cx="31" cy="48" r="3.5" fill="${piel}"/><circle cx="69" cy="48" r="3.5" fill="${piel}"/>
      ${barba ? `<path d="M31 50Q33 74 50 74Q67 74 69 50Q62 61 50 61Q38 61 31 50Z" fill="${pelo}"/>` : ""}${frente}
      <circle cx="42.5" cy="46" r="2.2" fill="#1B1B1B"/><circle cx="57.5" cy="46" r="2.2" fill="#1B1B1B"/>
      <path d="M38.5 40.5L46 39.5M54 39.5L61.5 40.5" fill="none" stroke="${estilo === 2 ? "#5b3a25" : pelo}" stroke-width="2" stroke-linecap="round"/>
      <path d="M50 47v6l-2.5 1.2" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.6" stroke-linecap="round"/>${boca}
      ${lentes ? `<g fill="none" stroke="#1B1B1B" stroke-width="1.6"><circle cx="42.5" cy="46" r="6"/><circle cx="57.5" cy="46" r="6"/><path d="M48.5 46h3"/></g>` : ""}</svg>`;
}

/* ---------- Datos (Supabase): [N° de lista, nombre, propuesta, votos a favor] ---------- */
let SEMANAS = [];
const fechaAR = (iso, opts) =>
  new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", ...opts });
function rango(ini, fin) {
  const d = (i) => +fechaAR(i, { day: "numeric" }),
    m = (i) => fechaAR(i, { month: "long" });
  return m(ini) === m(fin) ? `${d(ini)} al ${d(fin)} de ${m(fin)}` : `${d(ini)} de ${m(ini)} al ${d(fin)} de ${m(fin)}`;
}
async function cargarSemanas() {
  /* hasta un año de semanas; los resultados se piden solo de esas semanas */
  const res = await API.db.from("resumen_semana").select("*").order("semana", { ascending: false }).limit(52);
  if (res.error) throw res.error;
  const desde = res.data.length ? Math.min(...res.data.map((x) => x.semana)) : 0;
  const sem = await API.db
    .from("resultados_semana").select("*").gte("semana", desde).order("favor", { ascending: false }).order("id");
  if (sem.error) throw sem.error;
  /* la semana abierta ya no sale de resumen_semana (solo trae cerradas): semanas + participacion + propuestas */
  const ab = await API.db.from("semanas").select("n,inicio,fin").eq("cerrada", false).order("n").limit(1);
  if (ab.error) throw ab.error;
  let actual = null,
    props = [];
  if (ab.data[0]) {
    const [pa, pr] = await Promise.all([
      API.db.from("participacion").select("emitidos").eq("semana", ab.data[0].n).maybeSingle(),
      API.db.from("propuestas").select("id,nombre,texto").eq("semana", ab.data[0].n).order("created_at"),
    ]);
    actual = { semana: ab.data[0].n, inicio: ab.data[0].inicio, fin: ab.data[0].fin, cerrada: false, emitidos: pa.data?.emitidos ?? 0 };
    props = pr.data || [];
  }
  const filas = actual ? [actual, ...res.data] : res.data;
  SEMANAS = filas
    .map((s) =>
      s.cerrada
        ? {
            n: s.semana,
            rango: rango(s.inicio, s.fin),
            emitidos: s.emitidos,
            props: s.props,
            total: s.total_favor,
            cands: sem.data.filter((c) => c.semana === s.semana).slice(0, 5).map((c) => [c.id, c.nombre, c.texto, c.favor]),
          }
        : { n: s.semana, actual: true, emitidos: s.emitidos, rango: rango(s.inicio, s.fin), cands: props.map((c) => [c.id, c.nombre, c.texto]) },
    )
    .filter((s) => s.cands.length && s.emitidos > 0 && (s.actual || s.total > 0)) /* sin votos no hay nada que mostrar */
    .sort((a, b) => b.n - a.n);
}
const COLORES = [
  "#1E6BD6",
  "#6B3FA0",
  "#FFC15E",
  "#5BA687",
  "#C97B84",
  "#74ACDF",
  "#E4572E",
  "#8D99AE",
];
const SECRETO = "#B9C4D0";

const pad3 = (n) => String(n).padStart(3, "0");
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/* acá se muestra texto plano: sin las marcas **negrita**, *cursiva*, __subrayado__ */
const plano = (t) => t.replace(/\*\*|__|\*/g, "");
const coma = (n) => n.toFixed(2).replace(".", ",");
const ICONO_ESTRELLA =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.6-6.3 3.6 1.5-7L2 9.3l7-.8z"/></svg>';
const ICONO_CANDADO =
  '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>';

function cierre() {
  const d = new Date(),
    c = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + ((7 - d.getDay()) % 7),
      23,
      59,
      59,
    );
  if (c < d) c.setDate(c.getDate() + 7);
  return c;
}

let reloj = null,
  seleccion = null; /* semana abierta en pantalla */
function mostrar(idx) {
  const s = SEMANAS[idx],
    res = $("resultado");
  clearInterval(reloj);
  seleccion = s.n;
  document
    .querySelectorAll(".semana")
    .forEach((b, i) => b.setAttribute("aria-pressed", String(i === idx)));
  $("etq").textContent = s.actual ? "Urna abierta" : "Escrutinio";
  $("titulo").textContent = "Semana " + s.n;
  $("rango").textContent = s.rango;

  if (s.actual) {
    const tic = () => {
      const ms = Math.max(0, cierre() - new Date()),
        p = (n) => String(n).padStart(2, "0");
      $("estado").innerHTML =
        `<small>Se cierra en</small>${Math.floor(ms / 864e5)}d ${p(Math.floor(ms / 36e5) % 24)}:${p(Math.floor(ms / 6e4) % 60)}:${p(Math.floor(ms / 1e3) % 60)}`;
    };
    tic();
    reloj = setInterval(tic, 1000);
    res.innerHTML = s.cands
      .map(
        (c, i) => `
        <article class="fila" style="--i:${i};--c:${SECRETO}">
          <span class="puesto">?</span>
          <div class="avatar">${cara(c[1] + c[0])}</div>
          <div><div class="linea"><strong>${esc(c[1])}</strong><span class="lst">Lista N° ${pad3(c[0])}</span></div>
            <a class="prop" href="/muro/?lista=${c[0]}" title="Ver esta propuesta en el muro">${esc(plano(c[2]))}</a>
            <div class="pista secreta">${ICONO_CANDADO} Voto secreto hasta el domingo</div></div>
        </article>`,
      )
      .join("");
    $("datos").innerHTML =
      `<span>Los resultados se publican el domingo a las 23:59.</span><span><b id="vivos">${s.emitidos.toLocaleString("es-AR")}</b> votos emitidos hasta ahora</span>`;
  } else {
    const max = s.cands[0][3];
    $("estado").innerHTML = "<small>Escrutinio</small>100,00% escrutado";
    res.innerHTML = s.cands
      .map(
        (c, i) => `
        <article class="fila${i === 0 ? " gana" : ""}" style="--i:${i};--c:${COLORES[i]}">
          <span class="puesto">${i + 1}</span>
          <div class="avatar">${cara(c[1] + c[0])}</div>
          <div><div class="linea"><strong>${esc(c[1])}</strong><span class="lst">Lista N° ${pad3(c[0])}</span>${i === 0 ? `<span class="callout">${ICONO_ESTRELLA} Presidente de la semana</span>` : ""}</div>
            <p class="prop" title="Tocá para leer completa">${esc(plano(c[2]))}</p>
            <div class="pista"><div class="relleno" style="--r:${c[3] / max}"><span class="pct">${coma((c[3] / s.total) * 100)}%</span></div></div></div>
        </article>`,
      )
      .join("");
    $("datos").innerHTML =
      `<span><b>${s.emitidos.toLocaleString("es-AR")}</b> votos emitidos</span><span><b>${s.props}</b> propuestas presentadas</span><span>Ganó por <b>${coma(((s.cands[0][3] - (s.cands[1]?.[3] ?? 0)) / s.total) * 100)}</b> puntos</span>`;
  }
  res.classList.remove("listo");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => res.classList.add("listo")),
  );
}

/* Skeleton: mismo molde que las semanas y filas reales */
const sk = (w, h, extra = "") => `<span class="sk" style="width:${w};height:${h};${extra}"></span>`;
function esqueleto() {
  const pestana = `<span class="semana" aria-hidden="true"><span class="mini sk"></span><span>${sk("78px", "0.95rem", "margin-bottom:5px")}${sk("56px", "0.8rem")}</span></span>`;
  $("semanas").innerHTML = `<div class="semana-fija">${pestana}</div><div class="semanas-lista">${pestana.repeat(3)}</div>`;
  $("etq").innerHTML = sk("86px", "0.8rem");
  $("titulo").innerHTML = sk("150px", "1.7rem", "margin-top:4px");
  $("rango").innerHTML = sk("190px", "0.88rem");
  $("estado").innerHTML = sk("118px", "2.2rem");
  $("resultado").innerHTML = Array.from({ length: 5 }, (_, i) => `
    <article class="fila" style="--i:${i};--c:#dbe5f0" aria-hidden="true">
      <span class="puesto sk" style="height:2rem"></span>
      <div class="avatar sk"></div>
      <div>
        <div class="linea">${sk("140px", "1.3rem")}${sk("84px", "1.3rem")}</div>
        <p class="prop">${sk("92%", "0.95rem", "margin-bottom:6px")}${sk("55%", "0.95rem")}</p>
        <div class="pista"><span class="sk" style="position:absolute;inset:0 auto 0 0;width:${80 - i * 12}%;border-radius:5px 0 0 5px"></span></div>
      </div>
    </article>`).join("");
  $("datos").innerHTML = sk("180px", "0.9rem") + sk("150px", "0.9rem");
}

function sinDatos(titulo, texto) {
  document.querySelector(".panel").hidden = true;
  $("semanas").hidden = true;
  const v = $("vacio");
  if (titulo) {
    v.querySelector("h2").textContent = titulo;
    v.querySelector("p").textContent = texto;
  }
  v.hidden = false;
  document.body.classList.add("sin-contenido");
}

/* Pinta (o repinta) todo con los datos actuales; conserva la semana que se estaba viendo */
function pintar() {
  const panel = document.querySelector(".panel");
  if (!SEMANAS.length) return sinDatos();
  panel.hidden = false;
  $("semanas").hidden = false;
  $("vacio").hidden = true;
  document.body.classList.remove("sin-contenido");
  const boton = (s, i) =>
    s.actual
      ? `<button class="semana" data-i="${i}" aria-pressed="false"><span class="mini">${ICONO_CANDADO}</span><span><b>Semana ${s.n}</b><small>En curso</small></span></button>`
      : `<button class="semana" data-i="${i}" aria-pressed="false"><span class="mini">${cara(s.cands[0][1] + s.cands[0][0])}</span><span><b>Semana ${s.n}</b><small>${esc(s.cands[0][1])}</small></span></button>`;
  /* la semana actual (con el candado) queda siempre primera y fija; las anteriores van en una tira que se arrastra */
  const fija = SEMANAS[0]?.actual ? 0 : -1;
  $("semanas").innerHTML =
    (fija === 0 ? `<div class="semana-fija">${boton(SEMANAS[0], 0)}</div>` : "") +
    `<div class="semanas-lista" id="semanas-lista">${SEMANAS.map((s, i) => (i === fija ? "" : boton(s, i))).join("")}</div>`;
  $("semanas-lista").addEventListener("scroll", bordesTira, { passive: true });
  let idx = SEMANAS.findIndex((s) => s.n === seleccion);
  if (idx < 0) idx = Math.max(0, SEMANAS.findIndex((s) => s.actual));
  mostrar(idx);
  verPestana($("semanas").querySelector('.semana[aria-pressed="true"]'));
  bordesTira();
}

/* Tira de semanas anteriores: se arrastra con el mouse (o con el dedo / rueda) y se desvanece en los bordes con más contenido */
function bordesTira() {
  const l = $("semanas-lista");
  if (!l) return;
  l.style.setProperty("--fi", l.scrollLeft > 2 ? "28px" : "0px");
  l.style.setProperty("--fd", l.scrollLeft < l.scrollWidth - l.clientWidth - 2 ? "28px" : "0px");
}
addEventListener("resize", bordesTira);

/* si la pestaña elegida queda cortada en la tira, la acerca */
function verPestana(b) {
  const l = b && b.closest(".semanas-lista");
  if (!l) return;
  const r = b.getBoundingClientRect(),
    lr = l.getBoundingClientRect();
  if (r.left < lr.left + 8) l.scrollBy({ left: r.left - lr.left - 20 });
  else if (r.right > lr.right - 8) l.scrollBy({ left: r.right - lr.right + 20 });
}

let arrastre = null,
  huboArrastre = false;
$("semanas").addEventListener("pointerdown", (e) => {
  const l = e.target.closest(".semanas-lista");
  huboArrastre = false;
  if (!l || e.pointerType !== "mouse" || e.button !== 0) return;
  arrastre = { l, x: e.clientX, izq: l.scrollLeft };
});
addEventListener("pointermove", (e) => {
  if (!arrastre) return;
  const dx = e.clientX - arrastre.x;
  if (!huboArrastre && Math.abs(dx) > 5) {
    huboArrastre = true;
    arrastre.l.classList.add("arrastrando");
  }
  if (huboArrastre) arrastre.l.scrollLeft = arrastre.izq - dx;
});
const soltar = () => {
  arrastre?.l.classList.remove("arrastrando");
  arrastre = null;
};
addEventListener("pointerup", soltar);
addEventListener("pointercancel", soltar);
$("semanas").addEventListener(
  "wheel",
  (e) => {
    const l = e.target.closest(".semanas-lista");
    if (!l || l.scrollWidth <= l.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const puede = (e.deltaY > 0 && l.scrollLeft < l.scrollWidth - l.clientWidth) || (e.deltaY < 0 && l.scrollLeft > 0);
    if (!puede) return; /* en los extremos deja scrollear la página */
    e.preventDefault();
    l.scrollLeft += e.deltaY;
  },
  { passive: false },
);

$("semanas").addEventListener("click", (e) => {
  if (huboArrastre) return (huboArrastre = false); /* fue un arrastre, no un click */
  const b = e.target.closest(".semana");
  if (!b || !SEMANAS[+b.dataset.i]) return;
  mostrar(+b.dataset.i);
  verPestana(b);
});
$("resultado").addEventListener("click", (e) => {
  /* semanas cerradas: la propuesta ya no está en el muro, se despliega acá; en la semana abierta es un link al muro */
  const p = e.target.closest("p.prop");
  if (p) p.classList.toggle("abierta");
});

/* Todo en vivo: votos (solo el total), propuestas nuevas u ocultas y cierre de semana */
let temporizador = null,
  primeraConexion = true;
const refrescar = () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    try {
      await cargarSemanas();
      pintar();
    } catch {}
  }, 2000); /* debounce: un aviso falso o una ráfaga no multiplican las consultas */
};

async function iniciar() {
  esqueleto();
  try {
    await cargarSemanas();
  } catch {
    return sinDatos("No pudimos cargar los resultados", "Revisá tu conexión y recargá la página.");
  }
  pintar();
  API.db
    .channel("avisos", { config: { private: true } })
    .on("postgres_changes", { event: "*", schema: "public", table: "participacion" }, ({ new: p }) => {
      const s = SEMANAS.find((x) => x.n === p.semana);
      if (!s) return refrescar(); /* la semana todavía no tenía votos: ahora aparece */
      s.emitidos = p.emitidos;
      if (s.actual && $("vivos") && seleccion === s.n) $("vivos").textContent = p.emitidos.toLocaleString("es-AR");
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "semanas" }, refrescar)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "propuestas" }, refrescar)
    .on("broadcast", { event: "oculta" }, refrescar)
    .subscribe((estado) => {
      if (estado !== "SUBSCRIBED") return;
      if (!primeraConexion) refrescar();
      primeraConexion = false;
    });
}
iniciar();

banderaFlameante($("bandera"));
