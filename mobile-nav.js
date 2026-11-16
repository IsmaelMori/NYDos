/* =========================================================
   DOCK MÓVIL NYDo
   - Burbuja que se desliza hasta el enlace activo
   - Mantener pulsado + deslizar = elegir página y soltar para ir
   - Botón de búsqueda (el buscador flota sobre el dock)
   - Se esconde al bajar / reaparece al subir
========================================================= */
(() => {
    const movil = window.matchMedia("(max-width: 768px)");
    const body = document.body;
    const raiz = document.documentElement;

    let sidebar, nav, indicador, blob, burbuja, btnBuscar, barra, roNav, moNav;
    let wrapBusqueda, inputBusqueda, resultados;
    let buscando = false, saliendo = false;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conVT = raiz.classList.contains("vt-ok");   /* View Transitions entre páginas */
    const JELLY = [
        { transform: "scale(1,1)" },
        { transform: "scale(1.18,.86)", offset: .3 },
        { transform: "scale(.96,1.07)", offset: .65 },
        { transform: "scale(1,1)" }
    ];

    /* ---------- Utilidades ---------- */
    const vibrar = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

    function archivoActual() {
        return (location.pathname.split("/").pop() || "index.html").toLowerCase();
    }

    function buscarActivo() {
        const f = archivoActual();
        const todos = [...nav.querySelectorAll("a.nav-link")];
        const mismo = l => (l.getAttribute("href") || "").split("#")[0].toLowerCase() === f;
        let a = nav.querySelector("a.nav-link.active");
        if (!(a && mismo(a))) a = todos.find(mismo) || a;
        if (a && !a.classList.contains("active")) {
            todos.forEach(l => l.classList.remove("active"));
            a.classList.add("active");
        }
        return a || null;
    }

    /* Precarga de la página destino: al tocar ya va medio cargada */
    const precargadas = new Set();
    function precargar(url) {
        if (!url || precargadas.has(url)) return;
        try {
            const u = new URL(url, location.href);
            if (u.origin !== location.origin) return;
            precargadas.add(url);
            const l = document.createElement("link");
            l.rel = "prefetch";
            l.href = u.href;
            document.head.appendChild(l);
        } catch (e) {}
    }

    /* Salida suave hacia otra página */
    function irA(url, link) {
        if (saliendo) return;
        saliendo = true;
        if (link) {
            moverIndicador(link);
            nav.querySelectorAll(".nav-link.active").forEach(l => l.classList.remove("active"));
            link.classList.add("active");
        }
        try { sessionStorage.setItem("nydoDock", "1"); } catch (e) {}
        raiz.classList.add("saliendo");
        if (barra) barra.classList.add("go");
        setTimeout(() => { location.href = url; }, reduce ? 0 : (conVT ? 120 : 200));
    }

    /* Onda al tocar */
    function onda(link, x, y) {
        if (reduce) return;
        const wrap = link.querySelector("dock-rip");
        if (!wrap) return;
        const r = link.getBoundingClientRect();
        const s = document.createElement("i");
        s.className = "rip";
        s.style.left = (x - r.left) + "px";
        s.style.top = (y - r.top) + "px";
        wrap.appendChild(s);
        s.addEventListener("animationend", () => s.remove(), { once: true });
    }

    const base = () => (buscando ? btnBuscar : buscarActivo());

    function etiqueta(link) {
        const s = link.querySelector(".t-short") || link.querySelector("span");
        return s ? s.textContent.trim() : "";
    }

    /* ---------- Indicador (burbuja líquida) ---------- */
    function moverIndicador(link, instantaneo) {
        if (!indicador) return;
        if (!link || !movil.matches) { indicador.style.opacity = 0; return; }
        const x = link.offsetLeft, w = link.offsetWidth;
        const cambia = indicador._x !== x || indicador._w !== w;
        indicador._x = x; indicador._w = w;
        if (instantaneo) indicador.style.transition = "none";
        indicador.style.opacity = 1;
        indicador.style.width = w + "px";
        indicador.style.transform = "translate3d(" + x + "px,0,0)";
        if (!instantaneo && cambia && !reduce && blob && blob.animate) {
            blob.animate(JELLY, { duration: 560, easing: "cubic-bezier(.2,.8,.3,1)" });
        }
        if (instantaneo) {
            void indicador.offsetWidth;
            indicador.style.transition = "";
        }
    }

    function centrar(link, suave) {
        if (!link) return;
        nav.scrollTo({
            left: link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2,
            behavior: suave ? "smooth" : "auto"
        });
    }

    /* ---------- Mantener pulsado y deslizar ---------- */
    let hold = null, scrub = false, cancelado = false;
    let sx = 0, sy = 0, lastX = 0, lastY = 0;
    let items = [], hover = null, raf = 0, bloquearClick = 0;

    function medir() {
        items = [...nav.querySelectorAll(".nav-link")].map(el => ({
            el, c: el.offsetLeft + el.offsetWidth / 2
        }));
    }

    function mostrarBurbuja(link) {
        const ic = link.querySelector("i");
        if (ic) burbuja.querySelector("i").className = ic.className;
        burbuja.querySelector("span").textContent = etiqueta(link);
        burbuja.classList.add("show");
    }

    function ocultarBurbuja() { burbuja.classList.remove("show"); }

    function posicionarBurbuja() {
        const w = burbuja.offsetWidth || 120;
        const x = Math.min(Math.max(lastX - w / 2, 8), window.innerWidth - w - 8);
        burbuja.style.transform = "translate3d(" + x + "px,0,0)";
    }

    function elegir(el) {
        if (el === hover) return;
        if (hover) hover.classList.remove("scrub-hover");
        hover = el;
        if (el) {
            el.classList.add("scrub-hover");
            if (el.href) precargar(el.href);
            moverIndicador(el);
            mostrarBurbuja(el);
            vibrar(6);
        } else {
            ocultarBurbuja();
            moverIndicador(base());
        }
    }

    function actualizar() {
        const r = nav.getBoundingClientRect();
        /* Si el dedo sube mucho, se cancela (como en iOS) */
        cancelado = lastY < r.top - 150;
        sidebar.classList.toggle("scrub-cancel", cancelado);

        if (cancelado) { elegir(null); return; }

        const x = lastX - r.left + nav.scrollLeft;
        let mejor = null, dmin = 1e9;
        for (const it of items) {
            const d = Math.abs(it.c - x);
            if (d < dmin) { dmin = d; mejor = it.el; }
            it.el.style.setProperty("--s", (1 + 0.3 * Math.max(0, 1 - d / 90)).toFixed(3));
        }
        elegir(mejor);
        posicionarBurbuja();
    }

    /* Al acercar el dedo a los bordes, el dock se desplaza solo */
    function bucle() {
        if (!scrub) return;
        const r = nav.getBoundingClientRect();
        const z = 44;
        let v = 0;
        if (lastX < r.left + z)       v = -Math.min(1, (r.left + z - lastX) / z) * 14;
        else if (lastX > r.right - z) v =  Math.min(1, (lastX - (r.right - z)) / z) * 14;
        if (v) { nav.scrollLeft += v; actualizar(); }
        raf = requestAnimationFrame(bucle);
    }

    function empezar(link) {
        hold = null;
        scrub = true;
        cancelado = false;
        medir();
        sidebar.classList.add("scrubbing");
        body.classList.add("scrubbing");
        vibrar(12);
        elegir(link);
        posicionarBurbuja();
        raf = requestAnimationFrame(bucle);
    }

    function terminar(ir) {
        clearTimeout(hold);
        hold = null;
        if (!scrub) return;
        scrub = false;
        cancelAnimationFrame(raf);

        const destino = ir && !cancelado ? hover : null;

        sidebar.classList.remove("scrubbing", "scrub-cancel");
        body.classList.remove("scrubbing");
        items.forEach(i => i.el.style.removeProperty("--s"));
        if (hover) hover.classList.remove("scrub-hover");
        hover = null;
        ocultarBurbuja();
        bloquearClick = Date.now() + 500;

        if (!destino) { moverIndicador(base()); return; }

        vibrar(14);
        destino.classList.add("lanzando");
        setTimeout(() => destino.classList.remove("lanzando"), 450);

        if (destino === btnBuscar) {
            alternarBusqueda();
        } else {
            irA(destino.href, destino);
        }
    }

    function conectarGestos() {
        nav.addEventListener("touchstart", (e) => {
            if (!movil.matches || e.touches.length !== 1) return;
            const link = e.target.closest(".nav-link");
            if (!link) return;
            const t = e.touches[0];
            sx = lastX = t.clientX;
            sy = lastY = t.clientY;
            onda(link, sx, sy);
            if (link.href) precargar(link.href);
            clearTimeout(hold);
            hold = setTimeout(() => empezar(link), 300);
        }, { passive: true });

        nav.addEventListener("touchmove", (e) => {
            const t = e.touches[0];
            if (!scrub) {
                /* Si se mueve antes de tiempo, es un scroll normal */
                if (hold && Math.hypot(t.clientX - sx, t.clientY - sy) > 10) {
                    clearTimeout(hold);
                    hold = null;
                }
                return;
            }
            e.preventDefault();
            lastX = t.clientX;
            lastY = t.clientY;
            actualizar();
        }, { passive: false });

        nav.addEventListener("touchend", (e) => {
            if (scrub && e.cancelable) e.preventDefault();
            terminar(true);
        });
        nav.addEventListener("touchcancel", () => terminar(false));

        /* Evita menús contextuales y clics fantasma tras deslizar */
        nav.addEventListener("contextmenu", e => e.preventDefault());
        nav.addEventListener("dragstart", e => e.preventDefault());
        nav.addEventListener("click", (e) => {
            if (Date.now() < bloquearClick) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        /* Botón de búsqueda (el botón se recrea si el dock se vuelve a montar) */
        nav.addEventListener("click", (e) => {
            if (e.target.closest(".nav-search")) alternarBusqueda();
        });

        /* Toque normal: la burbuja salta al enlace y la página sale con fundido */
        nav.addEventListener("click", (e) => {
            const l = e.target.closest("a.nav-link");
            if (!l || !movil.matches) return;
            if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const href = l.getAttribute("href") || "";
            if (!href || l.target === "_blank" || /^(mailto:|tel:|javascript:)/i.test(href)) return;
            const u = new URL(l.href, location.href);
            if (u.origin !== location.origin) return;
            const mismoArchivo = u.pathname === location.pathname;
            if (mismoArchivo && u.hash) { moverIndicador(l); return; }      /* ancla dentro de la página */
            e.preventDefault();
            if (mismoArchivo) {                                             /* ya estás aquí: sube suave */
                moverIndicador(l);
                window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
                return;
            }
            irA(l.href, l);
        });
    }

    /* ---------- Buscador ---------- */
    function alternarBusqueda() {
        buscando ? cerrarBusqueda() : abrirBusqueda();
    }

    function abrirBusqueda() {
        if (!wrapBusqueda) return;
        buscando = true;
        body.classList.add("search-open");
        btnBuscar.classList.add("is-on");
        btnBuscar.setAttribute("aria-expanded", "true");
        moverIndicador(btnBuscar);
        inputBusqueda.focus({ preventScroll: true });
    }

    function cerrarBusqueda() {
        if (!buscando) return;
        buscando = false;
        body.classList.remove("search-open", "kb-open");
        btnBuscar.classList.remove("is-on");
        btnBuscar.setAttribute("aria-expanded", "false");
        if (inputBusqueda) inputBusqueda.blur();
        if (resultados) resultados.style.display = "none";
        moverIndicador(base());
    }

    function prepararBusqueda() {
        wrapBusqueda = document.getElementById("wikiSearch");
        if (!wrapBusqueda) return;
        inputBusqueda = document.getElementById("wikiSearchInput");
        resultados = document.getElementById("wikiSearchResults");

        /* En móvil el buscador sale de la barra superior y flota sobre el dock */
        const marca = document.createComment("wikiSearch");
        wrapBusqueda.parentNode.insertBefore(marca, wrapBusqueda);

        const colocar = () => {
            if (movil.matches) {
                if (wrapBusqueda.parentNode !== body) body.appendChild(wrapBusqueda);
                wrapBusqueda.classList.add("wiki-search-floating");
            } else {
                cerrarBusqueda();
                if (marca.parentNode && wrapBusqueda.previousSibling !== marca) {
                    marca.parentNode.insertBefore(wrapBusqueda, marca.nextSibling);
                }
                wrapBusqueda.classList.remove("wiki-search-floating");
            }
        };
        colocar();
        movil.addEventListener("change", colocar);

        /* Cerrar al tocar fuera, con Escape o al elegir un resultado */
        document.addEventListener("pointerdown", (e) => {
            if (buscando && !e.target.closest("#wikiSearch, .nav-search")) cerrarBusqueda();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") cerrarBusqueda();
        });
        resultados.addEventListener("click", (e) => {
            if (e.target.closest("a")) setTimeout(cerrarBusqueda, 50);
        });

        /* Teclado en pantalla: el buscador sube con él */
        if (window.visualViewport) {
            const vv = window.visualViewport;
            const ajustar = () => {
                const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
                raiz.style.setProperty("--kb", kb + "px");
                body.classList.toggle("kb-open", buscando && kb > 120);
            };
            vv.addEventListener("resize", ajustar);
            vv.addEventListener("scroll", ajustar);
        }
    }

    /* ---------- Esconder al bajar / mostrar al subir ---------- */
    function ocultar(v) {
        sidebar.classList.toggle("dock-hidden", v);
        body.classList.toggle("dock-away", v);
    }

    function conectarScroll() {
        let ultimoY = window.scrollY, pendiente = false;
        window.addEventListener("scroll", () => {
            if (pendiente) return;
            pendiente = true;
            requestAnimationFrame(() => {
                pendiente = false;
                if (!movil.matches || buscando || scrub) { ocultar(false); return; }
                const y = window.scrollY;
                const alFinal = window.innerHeight + y >= document.documentElement.scrollHeight - 4;
                if (alFinal) { ocultar(false); ultimoY = y; return; }
                if (Math.abs(y - ultimoY) < 8) return;
                ocultar(y > ultimoY && y > 120);
                ultimoY = y;
            });
        }, { passive: true });
    }

    /* ---------- Montaje del dock ----------
       Se puede montar VARIAS veces: si sidebar.html se vuelve a inyectar
       (o llega después de la copia en caché), el dock se reconstruye solo. */
    let iniciado = false, globalesListos = false;

    function montar() {
        nav = sidebar.querySelector(".navigation");
        if (!nav || !nav.querySelector(".nav-link")) return false;

        /* Copia del HTML original: la próxima página lo pinta al instante (sin píldora vacía) */
        try {
            sessionStorage.setItem("nydoSB", sidebar.innerHTML);
            sessionStorage.setItem("nydoDock", "1");
        } catch (e) {}

        if (roNav) roNav.disconnect();
        if (moNav) moNav.disconnect();

        indicador = document.createElement("div");
        indicador.className = "dock-indicator";
        indicador.innerHTML = '<div class="dock-blob"></div>';
        blob = indicador.firstChild;
        nav.appendChild(indicador);

        btnBuscar = document.createElement("button");
        btnBuscar.type = "button";
        btnBuscar.className = "nav-link nav-search";
        btnBuscar.setAttribute("aria-label", "Buscar");
        btnBuscar.setAttribute("aria-expanded", String(buscando));
        btnBuscar.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><span>Buscar</span>';
        btnBuscar.hidden = !document.getElementById("wikiSearch");
        nav.insertBefore(btnBuscar, nav.firstChild);
        if (buscando) btnBuscar.classList.add("is-on");

        [...nav.querySelectorAll(".nav-link")].forEach((l, i) => {
            l.style.setProperty("--i", i);
            if (l.tagName === "A") l.draggable = false;
            l.appendChild(document.createElement("dock-rip"));
        });

        const activo = buscarActivo();
        centrar(activo, false);
        moverIndicador(base(), true);

        conectarGestos();

        if ("ResizeObserver" in window) {
            roNav = new ResizeObserver(() => { if (!scrub) moverIndicador(base(), true); });
            nav.querySelectorAll(".nav-link").forEach(l => roNav.observe(l));
        }

        /* Si otro script marca la página activa más tarde */
        let esperando = false;
        moNav = new MutationObserver(() => {
            if (esperando || scrub) return;
            esperando = true;
            requestAnimationFrame(() => {
                esperando = false;
                moverIndicador(base());
            });
        });
        moNav.observe(nav, { attributes: true, attributeFilter: ["class"], subtree: true });
        return true;
    }

    function globales() {
        if (globalesListos) return;
        globalesListos = true;

        burbuja = document.createElement("div");
        burbuja.className = "dock-bubble notranslate";
        burbuja.setAttribute("aria-hidden", "true");
        burbuja.innerHTML = '<div class="in"><i></i><span></span></div>';
        body.appendChild(burbuja);

        barra = document.createElement("div");
        barra.className = "nav-prog";
        barra.setAttribute("aria-hidden", "true");
        body.appendChild(barra);

        prepararBusqueda();
        conectarScroll();

        window.addEventListener("load", () => moverIndicador(base(), true));
        window.addEventListener("resize", () => { if (!scrub) moverIndicador(base(), true); });
        movil.addEventListener("change", () => {
            ocultar(false);
            moverIndicador(base(), true);
        });

        /* Volver con el botón "atrás" (caché de página): quita el estado de salida */
        window.addEventListener("pageshow", () => {
            saliendo = false;
            raiz.classList.remove("saliendo");
            barra.classList.remove("go");
            if (nav) moverIndicador(base(), true);
        });

        /* Si el contenido del dock se reemplaza, se vuelve a montar */
        new MutationObserver(() => {
            if (nav && nav.isConnected && sidebar.contains(nav)) return;
            montar();
        }).observe(sidebar, { childList: true });
    }

    function iniciar() {
        if (iniciado) return true;
        sidebar = document.getElementById("sidebar");
        if (!sidebar || !sidebar.querySelector(".navigation .nav-link")) return false;
        iniciado = true;
        montar();
        globales();
        return true;
    }

    /* El sidebar se inyecta con data-include: esperamos a que aparezca.
       En pantallas anchas el dock NO se activa (no se crea nada ni se
       registra ningún observador), así el escritorio queda intacto. */
    function arrancar() {
        if (iniciar()) return;
        const obs = new MutationObserver(() => { if (iniciar()) obs.disconnect(); });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 15000);
    }

    if (movil.matches) {
        arrancar();
    } else {
        const alEstrechar = (e) => {
            if (!e.matches) return;
            movil.removeEventListener("change", alEstrechar);
            arrancar();
        };
        movil.addEventListener("change", alEstrechar);
    }
})();