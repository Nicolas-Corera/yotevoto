const $ = (id) => document.getElementById(id);
const intro = $("intro"),
  pagina = $("pagina");

const cv = $("bandera");
banderaFlameante(cv, 20);

/* ---------- Header: toma fondo solo si la página necesita scroll (no mueve nada) ---------- */
const nav = document.querySelector(".nav");
const revisarScroll = () =>
  nav.classList.toggle(
    "con-fondo",
    document.body.classList.contains("listo") && document.documentElement.scrollHeight > innerHeight + 1,
  );
addEventListener("resize", revisarScroll);
new ResizeObserver(revisarScroll).observe(document.body);

/* ---------- Tutorial (solo la primera vez; el botón "?" lo repite) ---------- */
const PASOS_TOUR = [
  { sel: "#campo-nombre", titulo: "Tu nombre", texto: "Así vas a figurar como Presidente en tu boleta del muro." },
  { sel: "#barra", titulo: "Dale formato", texto: "Negrita, cursiva, subrayado y listas. El botón <b>Art.</b> arma artículos numerados, como un decreto." },
  { sel: ".editor", titulo: "Escribí tu propuesta", texto: "Tenés hasta 500 caracteres. Con <b>Vista previa</b> ves cómo va a quedar antes de publicar." },
  { sel: "#publicar", titulo: "Publicá", texto: "Tu propuesta entra al muro y compite esta semana. Podés publicar hasta 3 por hora.", lado: "top" },
  { sel: ".btn-muro", titulo: "Mirá el muro", texto: "Ahí votás las propuestas de los demás. La más votada de la semana gana el cargo." },
];

/* ---------- Secuencia de entrada ---------- */
function mostrarFormulario() {
  intro.style.display = "none";
  document.body.classList.add("listo");
  dispatchEvent(new Event("intro:fin"));
  revisarScroll();
  Tour.ayuda("index", PASOS_TOUR);
  pagina.style.visibility = "visible";
  if (window.gsap && !reducirMovimiento) {
    gsap.to(pagina, { opacity: 1, duration: 0.5 });
    gsap.from("#form > *", {
      onComplete: () => {
        revisarScroll();
        Tour.iniciar("index", PASOS_TOUR); /* recién cuando el formulario terminó de aparecer */
      },
      opacity: 0,
      y: 18,
      duration: 0.6,
      stagger: 0.09,
      ease: "power2.out",
    });
  } else {
    pagina.style.opacity = 1;
    Tour.iniciar("index", PASOS_TOUR);
  }
}

const reducirMovimiento = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

if (!window.gsap || reducirMovimiento) {
  mostrarFormulario();
} else {
  const tl = gsap.timeline({ onComplete: mostrarFormulario });
  tl.to(".intro-texto", { opacity: 1, duration: 0.4 }, 0.8)
    .from(
      ".intro-texto",
      { y: 50, rotation: -2, duration: 0.7, ease: "back.out(1.6)" },
      0.8,
    )
    .to("#previa", { opacity: 1, duration: 0.6 }, 1.3)
    .to("#titulo", { opacity: 1, duration: 0.8 }, 1.9)
    .to({}, { duration: 2.2 }) /* pausa para leer */
    .to([".intro-texto", "#saltar"], {
      opacity: 0,
      y: -30,
      duration: 0.5,
    })
    .to(intro, { opacity: 0, duration: 0.5 }, "-=.1");

  gsap.to("#saltar", { opacity: 0.7, duration: 0.6, delay: 1 });
  gsap.set("#saltar", { opacity: 0 });

  const saltarIntro = () => {
    tl.progress(1);
  };
  intro.addEventListener("click", saltarIntro);
  window.addEventListener("keydown", (e) => {
    if (
      intro.style.display !== "none" &&
      (e.key === "Enter" || e.key === " " || e.key === "Escape")
    )
      saltarIntro();
  });
}

/* ---------- Formulario ---------- */
const form = $("form"),
  area = $("propuestas"),
  campo = $("campo-propuestas");
const btn = $("publicar");
const inputNombre = $("nombre"),
  campoNombre = $("campo-nombre");
const animar = !!window.gsap && !reducirMovimiento;

/* ---------- Toasts: tipo = "error" | "ok" | "info" ---------- */
function toast(mensaje, tipo = "info", duracion = 3500) {
  const caja = $("toasts");
  if ([...caja.children].some((t) => t.textContent === mensaje))
    return; /* sin repetidos */
  while (caja.children.length >= 3) caja.firstElementChild.remove();

  const el = document.createElement("div");
  el.className = "toast " + tipo;
  el.setAttribute("role", tipo === "error" ? "alert" : "status");
  el.textContent = mensaje;
  caja.appendChild(el);
  if (animar)
    gsap.from(el, {
      y: 30,
      opacity: 0,
      scale: 0.95,
      duration: 0.4,
      ease: "back.out(1.7)",
    });

  const quitar = () => {
    if (!el.isConnected) return;
    if (animar)
      gsap.to(el, {
        opacity: 0,
        y: 20,
        duration: 0.3,
        onComplete: () => el.remove(),
      });
    else el.remove();
  };
  el.addEventListener("click", quitar);
  setTimeout(quitar, duracion);
}

function marcar(contenedor, mensaje) {
  contenedor.classList.add("invalido");
  toast(mensaje, "error");
  if (animar)
    gsap.fromTo(
      contenedor,
      { x: -8 },
      { x: 0, duration: 0.5, ease: "elastic.out(1, .3)" },
    );
}

inputNombre.addEventListener("input", () => {
  if (inputNombre.value.trim()) campoNombre.classList.remove("invalido");
});

let avisoMaximo = false;
area.addEventListener("input", () => {
  $("contador").textContent = area.value.length + " / 500";
  if (area.value.trim()) campo.classList.remove("invalido");
  if (area.value.length >= 500 && !avisoMaximo) {
    avisoMaximo = true;
    toast("Llegaste al máximo de 500 caracteres.", "info");
  }
  if (area.value.length < 500) avisoMaximo = false;
});

/* ---------- Editor con formato ----------
     El formato se guarda como texto liviano: **negrita**  *cursiva*  __subrayado__
     Las listas son texto común ("• " y "Art. 1° "). Para mostrarlo en el muro
     usá formatearPropuesta(): primero escapa el HTML, así que es seguro. */
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

function editar(desde, hasta, nuevo, selDesde, selHasta) {
  if (area.value.length - (hasta - desde) + nuevo.length > 500) {
    toast("No entra: el máximo es de 500 caracteres.", "info");
    return;
  }
  area.focus();
  area.setSelectionRange(desde, hasta);
  if (!document.execCommand("insertText", false, nuevo)) {
    /* execCommand conserva el deshacer */
    area.setRangeText(nuevo, desde, hasta, "end");
    area.dispatchEvent(new Event("input"));
  }
  area.setSelectionRange(selDesde, selHasta);
}

const contar = (v, i, paso) => {
  let n = 0;
  while (v[i + paso * n] === "*") n++;
  return n;
};

function envolver(marca) {
  const v = area.value,
    s = area.selectionStart,
    e = area.selectionEnd,
    m = marca.length;
  let envuelto;
  if (marca === "*" || marca === "**") {
    const n = Math.min(contar(v, s - 1, -1), contar(v, e, 1));
    envuelto = marca === "**" ? n >= 2 : n % 2 === 1;
  } else {
    envuelto = v.slice(s - m, s) === marca && v.slice(e, e + m) === marca;
  }
  if (envuelto) {
    editar(
      s - m,
      e + m,
      v.slice(s, e),
      e - m,
      e - m,
    ); /* cursor al final, sin selección */
  } else {
    const fin =
      s === e
        ? s + m
        : e +
          2 *
            m; /* sin selección: queda entre las marcas; con selección: después del texto */
    editar(s, e, marca + v.slice(s, e) + marca, fin, fin);
  }
}

function alternarLista(tipo) {
  const v = area.value,
    s = area.selectionStart;
  const ini = s === 0 ? 0 : v.lastIndexOf("\n", s - 1) + 1;
  let fin = v.indexOf("\n", area.selectionEnd);
  if (fin === -1) fin = v.length;
  const lineas = v.slice(ini, fin).split("\n");
  const re = tipo === "vinetas" ? /^• / : /^Art\. \d+° /;
  let nuevas;
  if (lineas.every((l) => re.test(l))) {
    nuevas = lineas.map((l) => l.replace(re, ""));
  } else {
    let n = 1;
    if (tipo === "articulos" && ini > 0) {
      /* sigue la numeración de la línea anterior */
      const previa = v
        .slice(v.lastIndexOf("\n", ini - 2) + 1, ini - 1)
        .match(/^Art\. (\d+)° /);
      if (previa) n = +previa[1] + 1;
    }
    nuevas = lineas.map((l) => {
      const limpia = l.replace(/^(• |Art\. \d+° )/, "");
      return tipo === "vinetas" ? "• " + limpia : "Art. " + n++ + "° " + limpia;
    });
  }
  const texto = nuevas.join("\n");
  editar(ini, fin, texto, ini + texto.length, ini + texto.length);
}

function continuarLista(e) {
  /* Enter sigue la lista; Enter en vacío la termina */
  if (area.selectionStart !== area.selectionEnd) return;
  const v = area.value,
    p = area.selectionStart;
  const ini = p === 0 ? 0 : v.lastIndexOf("\n", p - 1) + 1;
  const linea = v.slice(ini, p),
    m = linea.match(/^(• |Art\. (\d+)° )/);
  if (!m) return;
  e.preventDefault();
  if (linea.length === m[0].length) {
    editar(ini, p, "", ini, ini);
    return;
  }
  const sig = m[2] ? "Art. " + (+m[2] + 1) + "° " : "• ";
  editar(p, p, "\n" + sig, p + 1 + sig.length, p + 1 + sig.length);
}

const acciones = {
  negrita: () => envolver("**"),
  cursiva: () => envolver("*"),
  subrayado: () => envolver("__"),
  vinetas: () => alternarLista("vinetas"),
  articulos: () => alternarLista("articulos"),
};
const barra = $("barra"),
  vista = $("vista");
barra.addEventListener("mousedown", (e) => {
  if (e.target.closest(".fmt")) e.preventDefault();
}); /* no perder la selección */
barra.addEventListener("click", (e) => {
  const b = e.target.closest("[data-accion]");
  if (b && !b.disabled) acciones[b.dataset.accion]();
});

area.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    const k = e.key.toLowerCase();
    const atajo = { b: "negrita", i: "cursiva", u: "subrayado" }[k];
    if (atajo) {
      e.preventDefault();
      acciones[atajo]();
      return;
    }
  }
  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey)
    continuarLista(e);
});

/* Un solo botón: alterna entre Escribir y Vista previa dentro del mismo cuadro */
const btnModo = $("modo");
function cambiarModo(previa) {
  if (previa === !vista.hidden) return; /* ya estamos en ese modo */
  if (previa) {
    const vacia = !area.value.trim();
    vista.classList.toggle("vacia", vacia);
    if (vacia) vista.textContent = "Todavía no escribiste nada.";
    else vista.innerHTML = formatearPropuesta(area.value);
  }
  vista.hidden = !previa;
  area.hidden = previa;
  btnModo.setAttribute("aria-pressed", String(previa));
  btnModo.textContent = previa ? "Escribir" : "Vista previa";
  barra.querySelectorAll("[data-accion]").forEach((b) => {
    b.disabled = previa;
  });
}
btnModo.addEventListener("click", () =>
  cambiarModo(!vista.hidden ? false : true),
);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  cambiarModo(false); /* salir de la vista previa */
  const propuestas = area.value.trim();
  const nombre = inputNombre.value.trim();
  let primero = null;

  if (!nombre) {
    marcar(campoNombre, "Escribí tu nombre antes de publicar.");
    primero = inputNombre;
  }
  if (propuestas.length < 5) {
    marcar(campo, "Escribí al menos una propuesta antes de publicar.");
    primero = primero || area;
  }
  if (primero) {
    primero.focus();
    return;
  }

  btn.disabled = true;
  btn.classList.add("cargando");
  btn.setAttribute("aria-busy", "true");
  btn.textContent = "Publicando…";
  toast("Publicando tu propuesta…", "info", 1500);
  try {
    await API.publicar(nombre, propuestas);
    btn.classList.remove("cargando");
    btn.removeAttribute("aria-busy");
    btn.textContent = "Publicada";
    toast("¡Propuesta publicada! Te llevamos al muro.", "ok", 2000);
    setTimeout(() => {
      window.location.href = "/muro/";
    }, 1200);
  } catch (err) {
    btn.disabled = false;
    btn.classList.remove("cargando");
    btn.removeAttribute("aria-busy");
    btn.textContent = "Publicar";
    toast(err.message || "No pudimos publicar tu propuesta. Probá de nuevo.", "error");
  }
});
