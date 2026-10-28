const $ = (id) => document.getElementById(id);

const pad = (n) => String(n).padStart(2, "0");
const fecha = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* Mismo formato que el editor: primero escapa el HTML, así que es seguro */
function formatearPropuesta(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/\n/g, "<br>");
}
const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* Votos optimistas: lo visual cambia al instante; el pedido va en segundo plano y solo se revierte si falla.
   `pendientes` guarda lo que todavía no confirmó el servidor, para que un re-render no lo pierda. */
const pendientes = new Map();
const estadoDe = (id) => ({ ...API.mios()[id], ...pendientes.get(id) });

const ICONOS = {
  like: '<span class="material-symbols-rounded" aria-hidden="true">thumb_up</span>',
  dislike:
    '<span class="material-symbols-rounded" aria-hidden="true">thumb_down</span>',
  report:
    '<span class="material-symbols-rounded" aria-hidden="true">flag</span>',
};
const boleta = (p, i) => `
    <div class="celda" data-id="${p.n}"${p.demo ? ' data-demo="1"' : ""} style="--i:${i}">
      <article class="boleta">
        <div class="cabeza"><div class="lista"><small>Lista N°</small><b>${pad(p.n).padStart(3, "0")}</b></div></div>
        <div class="cuerpo">
          <p class="pres"><span>Presidente:</span><strong>${esc(p.nombre)}</strong></p>
          <p class="texto">${formatearPropuesta(p.texto)}</p>
        </div>
        <div class="pie-boleta">
          <time class="fecha" datetime="${p.fecha}">${fecha(p.fecha)}</time>
          <div class="votos">
            <button class="voto" data-n="${p.n}" data-voto="like" aria-pressed="false" aria-label="A favor">${ICONOS.like}</button>
            <button class="voto" data-n="${p.n}" data-voto="dislike" aria-pressed="false" aria-label="En contra">${ICONOS.dislike}</button>
            <button class="voto" data-n="${p.n}" data-voto="report" aria-pressed="false" aria-label="Reportar">${ICONOS.report}</button>
          </div>
        </div>
      </article>
    </div>`;

const bento = $("bento");

/* ---------- Bento en caja ----------
         Reparte las boletas en columnas para que el conjunto forme un
         rectángulo sin huecos:
         - Las boletas de texto largo pueden ocupar 2 columnas.
         - Si una columna queda más baja, la boleta de arriba se estira.
         - Se prueban muchas combinaciones (orden casi cronológico) y se
           elige la que menos estira. Es determinista: siempre da lo mismo. */
const GAP_X = 30,
  GAP_Y = 34,
  COL_MIN = 270;
let anchoPrevio = 0;

function repartir(orden, ancha, cols, alto) {
  const h = Array(cols).fill(0); // próxima posición libre de cada columna
  const ultima = Array(cols).fill(null);
  const items = [];
  let desperdicio = 0;
  const puedeEstirar = (it) =>
    it && !it.ancha && it.cols.every((c) => ultima[c] === it);
  const estirar = (it, d) => {
    it.h += d;
    desperdicio += d;
    it.cols.forEach((c) => (h[c] = it.top + it.h + GAP_Y));
  };

  for (const i of orden) {
    let a = -1;
    if (ancha[i] && cols > 1) {
      let mejor = Infinity;
      for (let c = 0; c < cols - 1; c++) {
        if ((h[c] === 0) !== (h[c + 1] === 0)) continue; // evita hueco arriba
        const dif = Math.abs(h[c] - h[c + 1]);
        if (dif > 0.5 && !puedeEstirar(ultima[h[c] < h[c + 1] ? c : c + 1]))
          continue;
        const costo = Math.max(h[c], h[c + 1]) + dif;
        if (costo < mejor) {
          mejor = costo;
          a = c;
        }
      }
      if (a < 0) return null; // no entra como ancha en ese momento
    }
    let it;
    if (a >= 0) {
      const dif = Math.abs(h[a] - h[a + 1]);
      if (dif > 0.5) estirar(ultima[h[a] < h[a + 1] ? a : a + 1], dif);
      it = {
        i,
        ancha: true,
        cols: [a, a + 1],
        top: Math.max(h[a], h[a + 1]),
        h: alto[i].w,
      };
    } else {
      let c = 0;
      for (let k = 1; k < cols; k++) if (h[k] < h[c] - 0.5) c = k;
      it = { i, ancha: false, cols: [c], top: h[c], h: alto[i].n };
    }
    it.cols.forEach((c) => {
      h[c] = it.top + it.h + GAP_Y;
      ultima[c] = it;
    });
    items.push(it);
  }

  // Igualar el final de todas las columnas
  const fin = Math.max(...h);
  for (let c = 0; c < cols; c++) {
    if (h[c] >= fin - 0.5) continue;
    const it = ultima[c];
    if (!it || !puedeEstirar(it)) {
      if (it && it.ancha && it.cols.every((k) => ultima[k] === it))
        estirar(it, fin - h[c]);
      else return null;
    } else estirar(it, fin - h[c]);
  }
  return { items, total: fin - GAP_Y, desperdicio };
}

function mejorReparto(cols, alto, quieren) {
  const n = quieren.length;
  const base = [...Array(n).keys()];
  let semilla = 12345;
  const azar = () =>
    (semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296;
  let mejor = null,
    costoMejor = Infinity;
  const iteraciones = cols === 1 ? 1 : 400;
  for (let t = 0; t < iteraciones; t++) {
    let orden = base,
      ancha = quieren;
    if (t > 0) {
      // orden casi cronológico: cada boleta se corre como mucho unas posiciones
      const r = 1 + (t % 4);
      orden = base
        .map((i) => [i + azar() * r, i])
        .sort((x, y) => x[0] - y[0])
        .map((x) => x[1]);
      ancha = quieren.map((q) => q && azar() < 0.75);
    }
    const res = repartir(orden, ancha, cols, alto);
    if (!res) continue;
    const desorden = orden.reduce((s, i, pos) => s + Math.abs(pos - i), 0);
    const costo = res.desperdicio + desorden * 25 + res.total * 0.05;
    if (costo < costoMejor) {
      costoMejor = costo;
      mejor = res;
    }
  }
  // Respaldo (no debería hacer falta): todo angosto
  return (
    mejor ||
    repartir(
      base,
      quieren.map(() => false),
      cols,
      alto,
    )
  );
}

/* ---------- Virtualización + carga por tandas ----------
   Las propuestas llegan de a PAGINA y cada tanda es un "bloque": se acomoda sola como un rectángulo sin
   huecos y los bloques se apilan, así lo ya cargado no se mueve cuando llegan más. El DOM solo tiene las
   boletas que se ven (más un margen de una pantalla); el resto no existe hasta que se scrollea hasta ahí. */
const PAGINA = 24;
let semanaActual = null,
  ultimoId = 0, /* paginación por id: no se corre si se oculta o se agrega alguna */
  fin = false, /* ya se cargó hasta la última propuesta */
  cargando = false;
let bloques = []; /* [{ items: [{ id, f, ancha, demo?, esq? }], sucio, alto, lay }] en orden cronológico */
let pos = new Map(); /* id -> { left, top, width, height } dentro del bento */
const montadas = new Map(); /* id -> elemento en el DOM */
const yaAnimadas = new Set(); /* la animación de entrada se hace una sola vez por boleta */

/* contenedor invisible donde se mide cada boleta, sin dejarla en pantalla */
const medidor = document.createElement("div");
medidor.className = "bento-medidor";
medidor.setAttribute("aria-hidden", "true");
document.body.append(medidor);

/* Skeleton: boletas vacías con la misma estructura que las reales */
const ESQ = [2, 4, 3, 2, 5, 3];
const esqueletoHtml = (n, i) => {
  const lineas = Array.from({ length: n }, (_, k) => `<span class="sk sk-linea" style="width:${k === n - 1 ? 60 : 100}%"></span>`).join("");
  return `
    <div class="celda" style="--i:${i}" aria-hidden="true">
      <article class="boleta">
        <div class="cabeza"><div class="lista"><small>Lista N°</small><span class="sk" style="width:46px;height:1.5rem;align-self:center"></span></div></div>
        <div class="cuerpo">
          <p class="pres"><span>Presidente:</span><span class="sk" style="width:110px;height:1.2rem"></span></p>
          <div>${lineas}</div>
        </div>
        <div class="pie-boleta">
          <span class="sk" style="width:120px;height:0.85rem"></span>
          <div class="votos">${'<span class="sk" style="width:36px;height:36px;border-radius:8px"></span>'.repeat(3)}</div>
        </div>
      </article>
    </div>`;
};
const htmlItem = (it, i) => (it.esq ? esqueletoHtml(it.esq, i) : boleta(it.f, i));
const bloqueEsqueleto = (id, lista) => ({ esq: true, sucio: true, items: lista.map((n, i) => ({ id: id + i, esq: n, ancha: false })) });

function colocar(el, p) {
  const s = el.style;
  s.left = p.left + "px";
  s.top = p.top + "px";
  s.width = p.width + "px";
  s.height = p.height + "px";
}

function montar(it, k) {
  const t = document.createElement("template");
  t.innerHTML = htmlItem(it, Math.min(k, 8)).trim();
  const el = t.content.firstElementChild;
  if (it.demo || yaAnimadas.has(it.id)) el.style.animation = "none";
  yaAnimadas.add(it.id);
  if (!it.esq && !it.demo) {
    const mio = estadoDe(it.id);
    if (mio.voto) el.querySelector(`[data-voto="${mio.voto}"]`).setAttribute("aria-pressed", "true");
    if (mio.reporte) el.querySelector('[data-voto="report"]').setAttribute("aria-pressed", "true");
  }
  bento.append(el);
  montadas.set(it.id, el);
  return el;
}

/* monta lo que está cerca de la pantalla, desmonta lo que quedó lejos y pide más si se acerca el final */
function ventana(reubicar = false) {
  const caja = bento.getBoundingClientRect();
  const desde = -caja.top - innerHeight,
    hasta = -caja.top + innerHeight * 2;
  const cerca = new Set();
  let k = 0;
  for (const b of bloques)
    for (const it of b.items) {
      const p = pos.get(it.id);
      if (!p || p.top + p.height < desde || p.top > hasta) continue;
      cerca.add(it.id);
      let el = montadas.get(it.id);
      const nuevo = !el;
      if (nuevo) el = montar(it, k++);
      if (nuevo || reubicar) colocar(el, p);
    }
  for (const [id, el] of montadas)
    if (!cerca.has(id)) {
      el.remove();
      montadas.delete(id);
    }
  if (semanaActual && !fin && !cargando && caja.bottom - innerHeight < innerHeight * 1.5) cargarMas();
}

let cuadro = 0;
const alMover = () => {
  if (cuadro) return;
  cuadro = requestAnimationFrame(() => {
    cuadro = 0;
    ventana();
  });
};
addEventListener("scroll", alMover, { passive: true });
addEventListener("resize", alMover);

/* acomoda un bloque (mide sus boletas juntas, a ancho angosto y ancho) y guarda sus posiciones relativas */
function distribuir(b, cols, colW) {
  const its = b.items;
  medidor.style.width = colW + "px";
  medidor.innerHTML = its.map(htmlItem).join("");
  const nodos = [...medidor.children];
  const n = nodos.map((e) => e.offsetHeight);
  let w = n;
  if (cols > 1) {
    medidor.style.width = colW * 2 + GAP_X + "px";
    w = nodos.map((e) => e.offsetHeight);
  }
  medidor.innerHTML = "";
  const alto = its.map((_, i) => ({ n: n[i], w: w[i] }));
  const quieren = its.map((it) => !!it.ancha);
  /* con pocas boletas (o si no cierra el rectángulo) se prueba con menos columnas */
  let r = null;
  for (let c = Math.min(cols, its.length); c >= 1 && !r; c--) r = mejorReparto(c, alto, quieren);
  if (!r) return false;
  b.lay = new Map(
    r.items.map((it) => [
      its[it.i].id,
      { left: it.cols[0] * (colW + GAP_X), top: it.top, width: it.cols.length * colW + (it.cols.length - 1) * GAP_X, height: it.h },
    ]),
  );
  b.alto = r.total;
  b.sucio = false;
  return true;
}

/* solo se vuelven a acomodar los bloques que cambiaron (o todos si cambió el ancho) */
function acomodar(todo = false) {
  const W = bento.clientWidth;
  if (!W) return;
  if (W !== anchoPrevio) {
    anchoPrevio = W;
    todo = true;
  }
  const cols = Math.max(1, Math.floor((W + GAP_X) / (COL_MIN + GAP_X)));
  const colW = (W - GAP_X * (cols - 1)) / cols;
  let y = 0;
  pos = new Map();
  for (const b of bloques) {
    if (todo || b.sucio) distribuir(b, cols, colW);
    if (!b.lay) continue;
    for (const [id, p] of b.lay) pos.set(id, { ...p, top: p.top + y });
    y += b.alto + GAP_Y;
  }
  bento.style.height = Math.max(0, y - GAP_Y) + "px"; /* sin boletas no queda el alto del skeleton */
  ventana(true);
}

bloques = [bloqueEsqueleto("esq", ESQ)];
acomodar(true);
document.fonts && document.fonts.ready.then(() => acomodar(true));
new ResizeObserver(() => acomodar()).observe(bento);
addEventListener("load", () => acomodar(true));

/* ---------- Tutorial (solo la primera vez; el botón "?" lo repite) ---------- */
const PASOS_TOUR = [
  { sel: ".boleta", titulo: "Una boleta, una propuesta", texto: "Cada propuesta es una boleta con su N° de lista y quién la escribió." },
  { sel: ".votos", titulo: "Votá", texto: "El pulgar arriba es a favor y el de abajo en contra. Tu voto es secreto y lo podés cambiar." },
  { sel: "[data-voto='report'], .votos .sk:last-child", titulo: "Reportá", texto: "Si una propuesta es ofensiva o spam, tocá la bandera. Con varios reportes se oculta." },
  { sel: ".items a[href='/presidentes/']", titulo: "Presidentes", texto: "Cada domingo se cuenta todo: acá ves quién ganó cada semana." },
  { sel: ".items a[href='/']", titulo: "Proponer", texto: "¿Se te ocurrió algo? Escribí tu propuesta y sumala al muro." },
];

/* El tutorial arranca cuando el contenido ya está en pantalla (boletas o cartel vacío), nunca sobre el skeleton */
/* Si todavía no hay propuestas, durante el tutorial se muestra una boleta de ejemplo (solo en pantalla,
   nunca se guarda) para poder explicar los botones; al terminar o saltar el tutorial se saca. */
const GANCHOS_TOUR = {
  antes() {
    if (veces.size) return;
    vacio.hidden = true;
    bloques.push({
      demo: true,
      sucio: true,
      items: [
        {
          id: "demo",
          demo: true,
          ancha: false,
          f: { n: 0, demo: true, nombre: "Tu nombre", fecha: new Date().toISOString(), texto: "Así se ve una propuesta. La tuya va a aparecer acá." },
        },
      ],
    });
    acomodar();
  },
  despues() {
    bloques = bloques.filter((b) => !b.demo);
    actualizarVacio();
    acomodar();
  },
};
let tourListo = false;
const iniciarTour = () => {
  if (tourListo) return;
  tourListo = true;
  setTimeout(() => Tour.iniciar("muro", PASOS_TOUR, GANCHOS_TOUR), 700); /* deja terminar la entrada de las boletas */
  Tour.ayuda("muro", PASOS_TOUR, GANCHOS_TOUR);
};

/* ---------- Datos reales (Supabase): de a tandas + realtime ---------- */
const veces = new Set(); /* ids ya cargados */
const aItem = (p) => ({ id: p.id, ancha: p.texto.length > 170, f: { n: p.id, nombre: p.nombre, fecha: p.created_at, texto: p.texto } });
const vacio = $("vacio");
const actualizarVacio = () => {
  vacio.hidden = veces.size > 0;
  document.body.classList.toggle("sin-contenido", !vacio.hidden);
};
/* saca el skeleton o la lista anterior; respeta la boleta de ejemplo del tutorial */
const limpiar = () => {
  bloques = bloques.filter((b) => b.demo);
  veces.clear();
};
const sinSkeleton = () => {
  limpiar();
  actualizarVacio();
  acomodar();
  iniciarTour();
};

let generacion = 0, /* invalida cargas en vuelo cuando cambia la semana o se reconecta */
  reintento = 0,
  primeraConexion = true,
  temporizador = null;

/* Trae la siguiente tanda. Se llama sola cuando el scroll se acerca al final. */
async function cargarMas(primera = false) {
  if (cargando || fin || !semanaActual || Date.now() < reintento) return;
  cargando = true;
  const gen = generacion;
  if (!primera) {
    bloques.push({ ...bloqueEsqueleto("cola", [2, 3, 2]), cola: true }); /* skeleton al final mientras llega */
    acomodar();
  }
  const { data, error } = await API.db
    .from("propuestas")
    .select("id,nombre,texto,created_at")
    .eq("semana", semanaActual)
    .gt("id", primera ? 0 : ultimoId)
    .order("id", { ascending: true })
    .limit(PAGINA);
  if (gen !== generacion) return; /* quedó vieja: la nueva carga se ocupa */
  cargando = false;
  bloques = bloques.filter((b) => !b.cola);
  if (error) {
    reintento = Date.now() + 5000; /* no se insiste cada cuadro de scroll */
    if (primera) {
      sinSkeleton();
      toast("No pudimos cargar las propuestas. Recargá la página.", "info");
    } else {
      acomodar();
      toast("No pudimos traer más propuestas. Probamos de nuevo en unos segundos.", "info");
    }
    return;
  }
  if (primera) limpiar();
  const nuevas = data.filter((p) => !veces.has(p.id));
  nuevas.forEach((p) => veces.add(p.id));
  if (data.length) ultimoId = data[data.length - 1].id;
  fin = data.length < PAGINA;
  if (nuevas.length) bloques.push({ sucio: true, items: nuevas.map(aItem) });
  actualizarVacio();
  acomodar();
  if (primera) iniciarTour();
}

/* una propuesta nueva en vivo: si ya se llegó al final se suma ahí; si no, la traerá el scroll */
function anexar(p) {
  if (p.semana !== semanaActual || !fin || veces.has(p.id)) return;
  veces.add(p.id);
  ultimoId = Math.max(ultimoId, p.id);
  const ult = bloques[bloques.length - 1];
  if (ult && !ult.demo && !ult.esq && ult.items.length < PAGINA) {
    ult.items.push(aItem(p));
    ult.sucio = true;
  } else bloques.push({ sucio: true, items: [aItem(p)] });
  actualizarVacio();
  acomodar();
}

function quitarBoleta(id) {
  if (!veces.has(id)) return;
  veces.delete(id);
  for (const b of bloques) {
    const i = b.items.findIndex((it) => it.id === id);
    if (i < 0) continue;
    b.items.splice(i, 1);
    b.sucio = true;
  }
  bloques = bloques.filter((b) => b.demo || b.items.length);
  actualizarVacio();
  acomodar();
}

async function cargarMuro() {
  const { data: sem } = await API.db.from("semanas").select("n").eq("cerrada", false).order("n").limit(1);
  semanaActual = sem?.[0]?.n ?? null;
  generacion++;
  cargando = false;
  fin = false;
  ultimoId = 0;
  reintento = 0;
  if (!semanaActual) return sinSkeleton();
  await cargarMas(true);
}

const recargarMuro = () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(cargarMuro, 2000);
};

cargarMuro().then(() =>
  API.db
    .channel("avisos", { config: { private: true } })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "propuestas" }, ({ new: p }) => anexar(p))
    .on("postgres_changes", { event: "*", schema: "public", table: "semanas" }, recargarMuro) /* cerró una semana / abrió otra */
    .on("broadcast", { event: "oculta" }, async ({ payload }) => {
      /* se ocultó por reportes: solo se quita si la base confirma que ya no es visible (un aviso no manda) */
      const id = Number(payload?.id);
      if (!Number.isSafeInteger(id) || !veces.has(id)) return;
      const { data, error } = await API.db.from("propuestas").select("id").eq("id", id).maybeSingle();
      if (!error && !data) quitarBoleta(id);
    })
    .subscribe((estado) => {
      if (estado !== "SUBSCRIBED") return;
      if (!primeraConexion) cargarMuro(); /* si se cortó la conexión, se pone al día */
      primeraConexion = false;
    }),
);

/* ---------- Toasts ---------- */
function toast(msg, tipo = "", ms = 3200) {
  const caja = $("toasts");
  if ([...caja.children].some((t) => t.textContent === msg)) return;
  while (caja.children.length >= 3) caja.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = "toast " + tipo;
  el.textContent = msg;
  el.setAttribute("role", "status");
  caja.appendChild(el);
  const quitar = () => {
    el.classList.add("saliendo");
    setTimeout(() => el.remove(), 300);
  };
  el.addEventListener("click", quitar);
  setTimeout(quitar, ms);
}

/* ---------- Votos: no se muestra la cantidad, el escrutinio es secreto ----------
   El click es solo visual e inmediato (botón + aviso). El pedido sale después, en orden por propuesta,
   y si falla se vuelve atrás con un aviso. */
const colas = new Map(),
  versiones = new Map();
bento.addEventListener("click", (e) => {
  const b = e.target.closest("[data-voto]");
  if (!b || b.closest("[data-demo]")) return;
  const id = +b.dataset.n,
    tipo = b.dataset.voto,
    mio = estadoDe(id);
  if (tipo === "report" && mio.reporte) return toast("Ya reportaste esta propuesta.", "info");
  if (tipo !== "report" && mio.voto === tipo) return toast("Ya votaste así esta propuesta. Tu voto es secreto.", "");

  const grupo = b.closest(".votos"),
    antes = [...grupo.querySelectorAll("[data-voto]")].map((x) => [x, x.getAttribute("aria-pressed")]),
    campo = tipo === "report" ? "reporte" : "voto",
    previo = pendientes.get(id);
  const version = (versiones.get(id) || 0) + 1;
  versiones.set(id, version);

  /* 1. todo lo visible, ya */
  if (tipo === "report") {
    b.setAttribute("aria-pressed", "true");
    toast("Gracias por avisar. Vamos a revisar esta propuesta.", "info");
  } else {
    grupo
      .querySelectorAll("[data-voto='like'],[data-voto='dislike']")
      .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    toast(
      tipo === "like"
        ? "Voto a favor registrado. El escrutinio es secreto."
        : "Voto en contra registrado. El escrutinio es secreto.",
      tipo === "like" ? "ok" : "",
    );
  }
  pendientes.set(id, { ...previo, [campo]: tipo === "report" ? true : tipo });

  /* 2. el pedido, en segundo plano y en orden */
  const enviar = () => (tipo === "report" ? API.reportar(id) : API.votar(id, tipo));
  const p = (colas.get(id) || Promise.resolve())
    .then(enviar)
    .then(
      () => {},
      (err) => {
        if (versiones.get(id) === version) antes.forEach(([x, v]) => x.setAttribute("aria-pressed", v));
        if (previo) pendientes.set(id, previo);
        else pendientes.delete(id);
        toast(err.message, "info");
      },
    )
    .then(() => {
      if (colas.get(id) === p) {
        colas.delete(id);
        pendientes.delete(id); /* ya quedó guardado en API.mios() si salió bien */
      }
    });
  colas.set(id, p);
});

banderaFlameante($("bandera"));
