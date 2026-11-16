/* NYDo · Noche Shinobi: cielo estrellado, revelado, brillo en tarjetas y recorrido guiado */
(function () {
    "use strict";
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.add("nt-js");

    /* ---------- CIELO ESTRELLADO ---------- */
    var cv = document.getElementById("ntSky");
    if (cv && cv.getContext) {
        var ctx = cv.getContext("2d");
        var W = 0, H = 0, dpr = 1, stars = [], shoots = [], running = true, last = 0, nextShoot = 2500;

        function size() {
            dpr = Math.min(devicePixelRatio || 1, 2);
            W = innerWidth; H = innerHeight;
            cv.width = W * dpr; cv.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            var n = Math.round(Math.min(220, (W * H) / 7500));
            stars = [];
            for (var i = 0; i < n; i++) {
                stars.push({
                    x: Math.random() * W, y: Math.random() * H,
                    r: Math.random() * 1.4 + .25,
                    p: Math.random() * 6.28, s: Math.random() * 1.6 + .4,
                    d: Math.random() * .25 + .02,
                    c: Math.random() < .15 ? "255,226,190" : (Math.random() < .2 ? "190,200,255" : "255,255,255")
                });
            }
        }

        function frame(t) {
            if (!running) return;
            var dt = t - last; last = t;
            ctx.clearRect(0, 0, W, H);
            var sy = scrollY;
            for (var i = 0; i < stars.length; i++) {
                var s = stars[i];
                var a = .35 + .65 * (.5 + .5 * Math.sin(t / 1000 * s.s + s.p));
                var y = (s.y - sy * s.d) % H; if (y < 0) y += H;
                ctx.globalAlpha = a;
                ctx.fillStyle = "rgb(" + s.c + ")";
                ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, 6.283); ctx.fill();
                if (s.r > 1.2) {
                    ctx.globalAlpha = a * .25;
                    ctx.beginPath(); ctx.arc(s.x, y, s.r * 3, 0, 6.283); ctx.fill();
                }
            }
            nextShoot -= dt;
            if (nextShoot <= 0) {
                shoots.push({ x: Math.random() * W * .8 + W * .2, y: Math.random() * H * .35, vx: -(6 + Math.random() * 4), vy: 3 + Math.random() * 2, life: 1 });
                nextShoot = 3000 + Math.random() * 5000;
            }
            for (var j = shoots.length - 1; j >= 0; j--) {
                var m = shoots[j];
                m.x += m.vx; m.y += m.vy; m.life -= .012;
                if (m.life <= 0) { shoots.splice(j, 1); continue; }
                var g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 9, m.y - m.vy * 9);
                g.addColorStop(0, "rgba(255,255,255," + m.life + ")");
                g.addColorStop(1, "rgba(255,255,255,0)");
                ctx.globalAlpha = 1;
                ctx.strokeStyle = g; ctx.lineWidth = 1.8;
                ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 9, m.y - m.vy * 9); ctx.stroke();
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(frame);
        }

        size();
        var rt;
        addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(size, 150); });
        if (reduce) {
            frame(0); running = false;
        } else {
            requestAnimationFrame(function (t) { last = t; frame(t); });
            document.addEventListener("visibilitychange", function () {
                running = !document.hidden;
                if (running) requestAnimationFrame(function (t) { last = t; frame(t); });
            });
        }
    }

    /* ---------- REVELADO AL HACER SCROLL ---------- */
    var rv = document.querySelectorAll(".nt-rv");
    if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (es) {
            es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
        }, { threshold: .12, rootMargin: "0px 0px -6% 0px" });
        rv.forEach(function (el, i) { el.style.setProperty("--d", ((i % 4) * .08) + "s"); io.observe(el); });
    } else {
        rv.forEach(function (el) { el.classList.add("in"); });
    }

    /* ---------- VIDEO DEL BANNER ---------- */
    var hv = document.querySelector(".nt-hero-video");
    if (hv) {
        hv.addEventListener("loadeddata", function () {
            hv.closest(".nt-hero").classList.add("has-video");
            if (reduce) hv.pause();
        });
        if (hv.play) hv.play().catch(function () {});
    }

    /* ---------- BRILLO QUE SIGUE AL PUNTERO ---------- */
    if (!reduce) {
        document.querySelectorAll(".nt-el, .nt-portal").forEach(function (c) {
            var raf = 0, ev;
            c.addEventListener("pointermove", function (e) {
                if (e.pointerType === "touch") return;
                ev = e;
                if (raf) return;
                raf = requestAnimationFrame(function () {
                    raf = 0;
                    var r = c.getBoundingClientRect();
                    c.style.setProperty("--mx", (ev.clientX - r.left) + "px");
                    c.style.setProperty("--my", (ev.clientY - r.top) + "px");
                });
            }, { passive: true });
        });
    }

    /* ---------- CHIP ACTIVO SEGÚN LA SECCIÓN ---------- */
    var chips = [].slice.call(document.querySelectorAll(".nt-chips a"));
    if (chips.length && "IntersectionObserver" in window) {
        var so = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
                if (!e.isIntersecting) return;
                chips.forEach(function (c) { c.classList.toggle("on", c.getAttribute("href") === "#" + e.target.id); });
            });
        }, { rootMargin: "-35% 0px -55% 0px" });
        chips.forEach(function (c) {
            var s = document.querySelector(c.getAttribute("href"));
            if (s) so.observe(s);
        });
    }

    /* ---------- RECORRIDO GUIADO ---------- */
    var $ = function (id) { return document.getElementById(id); };
    var guia = $("guiaNube"), titulo = $("guiaTitulo"), texto = $("guiaTexto"),
        numero = $("guiaNumero"), siguiente = $("guiaSiguiente"),
        saltar = $("guiaSaltar"), flecha = $("guiaFlecha");
    if (!guia) return;

    var CLAVE = "NYDo_jutsus_guia_mostrada";
    try { if (sessionStorage.getItem(CLAVE) === "true") return; } catch (e) {}

    var pasos = [
        { nombre: "BIENVENIDO A NYDo", titulo: "¡Hola, shinobi! 🍃", texto: "Te mostraremos las partes más importantes de esta enciclopedia para que puedas orientarte.", selector: null },
        { nombre: "PARA NUEVOS JUGADORES", titulo: "¡Empieza por la luna! 🌕", texto: "Este banner es para quienes llegan por primera vez. Entra en la Guía para principiantes y aprende cómo comenzar tu aventura en el mod.", selector: "#inicio" },
        { nombre: "01 / ARTE NINJA", titulo: "Ninjutsu 🔥", texto: "Aquí están los cinco elementos básicos, el ninjutsu médico y el botón de Kekkei Genkai, con cada combinación y sus técnicas en video.", selector: "#ninjutsu" },
        { nombre: "02 / COMBATE FÍSICO", titulo: "Taijutsu 👊", texto: "Descubre el combate cuerpo a cuerpo, la velocidad, la defensa y la fuerza física.", selector: "#taijutsu" },
        { nombre: "03 / PERCEPCIÓN", titulo: "Genjutsu 👁️", texto: "Conoce las técnicas ilusorias que alteran los sentidos y la percepción del objetivo.", selector: "#genjutsu" },
        { nombre: "04 / ENERGÍA NATURAL", titulo: "Senjutsu 🍃", texto: "Aprende qué es la energía natural y explora los diferentes modos sabios.", selector: "#senjutsu" },
        { nombre: "05 / ARTE DE LA ESPADA", titulo: "Kenjutsu ⚔️", texto: "Descubre el manejo de espadas, los cortes, los bloqueos y las estrategias de combate.", selector: "#kenjutsu" },
        { nombre: "06 / TÉCNICAS DE SELLADO", titulo: "Fūinjutsu 🌀", texto: "Explora las técnicas para sellar objetos, contener chakra y restringir poderes.", selector: "#fuinjutsu" },
        { nombre: "RECORRIDO COMPLETADO", titulo: "¡Ya eres un shinobi explorador!", texto: "Has conocido el banner y las seis categorías. Ahora puedes explorar libremente la página.", selector: null }
    ];

    var indice = 0, actual = null, temporizador = null, frame = 0;

    function quitar() { if (actual) { actual.classList.remove("guia-destacada"); actual = null; } }

    function posicionar() {
        if (!actual || guia.style.display === "none") return;
        var r = actual.getBoundingClientRect();
        var ancho = guia.offsetWidth, alto = guia.offsetHeight, margen = 15;
        var abajo = innerHeight - r.bottom, arriba = r.top;
        var izq = r.left + scrollX;
        var top = (abajo >= alto + 30 || abajo >= arriba) ? r.bottom + scrollY + 18 : r.top + scrollY - alto - 18;
        izq = Math.max(scrollX + margen, Math.min(izq, scrollX + innerWidth - ancho - margen));
        top = Math.max(scrollY + margen, top);
        guia.style.cssText = "display:block;position:absolute;transform:none;left:" + izq + "px;top:" + top + "px";
        var centro = r.left + r.width / 2 + scrollX - izq - 8;
        flecha.style.display = "block";
        flecha.style.left = Math.max(15, Math.min(centro, ancho - 32)) + "px";
        if (top > r.bottom + scrollY) { flecha.style.top = (alto - 8) + "px"; flecha.style.transform = "rotate(225deg)"; }
        else { flecha.style.top = "-8px"; flecha.style.transform = "rotate(45deg)"; }
    }

    function mostrar() {
        quitar(); clearTimeout(temporizador);
        var p = pasos[indice];
        titulo.textContent = p.titulo; texto.textContent = p.texto; numero.textContent = p.nombre;
        siguiente.textContent = indice === pasos.length - 1 ? "Terminar ✓" : "Siguiente ➜";
        flecha.style.display = "none";
        var el = p.selector && document.querySelector(p.selector);
        if (el) {
            actual = el;
            el.classList.add("guia-destacada");
            guia.style.display = "block";
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            temporizador = setTimeout(posicionar, 600);
        } else {
            guia.style.cssText = "display:block;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%)";
        }
    }

    function fin() {
        try { sessionStorage.setItem(CLAVE, "true"); } catch (e) {}
        clearTimeout(temporizador); quitar();
        guia.style.display = "none"; flecha.style.display = "none";
        scrollTo({ top: 0, behavior: "smooth" });
    }

    siguiente.addEventListener("click", function () { if (indice < pasos.length - 1) { indice++; mostrar(); } else fin(); });
    saltar.addEventListener("click", fin);

    function repos() {
        if (frame || !actual) return;
        frame = requestAnimationFrame(function () { frame = 0; posicionar(); });
    }
    addEventListener("resize", repos);
    addEventListener("scroll", repos, { passive: true });

    mostrar();
})();