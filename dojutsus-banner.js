/* Banner con video + entrada de paneles — NYDo Wiki (dojutsus) */
(function () {
    "use strict";
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var banner = document.getElementById("inicio");
    var v = banner && banner.querySelector(".banner-video");

    if (v) {
        var conn = navigator.connection || {};
        var ahorro = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "");
        var movil = window.matchMedia && matchMedia("(max-width: 768px)").matches;
        if (ahorro || reduce) {
            v.removeAttribute("autoplay"); /* solo se ve el poster */
        } else {
            v.src = movil && v.dataset.srcMovil ? v.dataset.srcMovil : v.dataset.src;
            v.addEventListener("error", function () { v.remove(); }); /* queda la imagen de fondo */
            var play = function () { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
            play();
            if ("IntersectionObserver" in window) {
                new IntersectionObserver(function (e) {
                    e[0].isIntersecting && !document.hidden ? play() : v.pause();
                }, { threshold: 0.05 }).observe(banner);
            }
            document.addEventListener("visibilitychange", function () { document.hidden ? v.pause() : play(); });
        }
    }

    /* revelar paneles al hacer scroll */
    if (reduce || !("IntersectionObserver" in window)) return;
    var items = document.querySelectorAll("main .jutsu-panel");
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var el = en.target;
            io.unobserve(el);
            el.classList.remove("rv-pre");
            el.classList.add("rv-in");
            el.addEventListener("animationend", function () { el.classList.remove("rv-in"); }, { once: true });
        });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.04 });
    items.forEach(function (el) {
        if (el.getBoundingClientRect().top < window.innerHeight) return; /* ya visibles */
        el.classList.add("rv-pre");
        io.observe(el);
    });
    /* red de seguridad: si algo falla, nada queda invisible */
    setTimeout(function () {
        document.querySelectorAll(".rv-pre").forEach(function (el) { el.classList.remove("rv-pre"); });
    }, 8000);

    /* chip activo en el menú de categorías */
    var links = document.querySelectorAll(".category-nav a[href^='#']");
    if (links.length) {
        var map = {};
        links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
        var so = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
                if (e.isIntersecting && map[e.target.id]) {
                    links.forEach(function (a) { a.classList.remove("activo"); });
                    map[e.target.id].classList.add("activo");
                }
            });
        }, { rootMargin: "-40% 0px -50% 0px" });
        Object.keys(map).forEach(function (id) { var t = document.getElementById(id); if (t) so.observe(t); });
    }
})();