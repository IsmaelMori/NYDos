/* ==========================================================
   NYDo Wiki · Ojo único de dojutsu (canvas, detallado y ligero)
   - UN ojo por sección. Empieza cerrado y se abre al llegar a ella.
   - Evoluciona UNA vez: normal → Sharingan → Mangekyō → Eterno → Rinnegan
   - Optimización:
       · las texturas (iris, fibras, tomoes…) se dibujan UNA sola vez
         en canvas ocultos; cada fotograma solo las compone
       · solo se construye / anima lo que está en pantalla
       · un único bucle rAF; se detiene fuera de vista o con la pestaña oculta
       · DPR limitado y calidad adaptativa si el equipo va lento
       · prefers-reduced-motion: ojo estático en su etapa final
   ========================================================== */
(function () {
    'use strict';

    var TAU = Math.PI * 2;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    var DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
    var quality = 1;

    /* Coordenadas lógicas: ojo en 0..240 × 0..150 · lienzo 260×170 (margen de 10) */
    var W = 260, H = 170, IR = 44;          /* IR = radio del iris */

    /* ---------- Estilos ---------- */
    var st = document.createElement('style');
    st.textContent = [
        '.dj-eyes{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;width:min(360px,100%);margin:0 auto;pointer-events:none}',
        '.dj-stage{position:relative;width:100%;aspect-ratio:260/170}',
        '.dj-cv{position:absolute;inset:0;width:100%;height:100%;display:block}',
        '.dj-glow{position:absolute;left:50%;top:50%;width:94%;aspect-ratio:1;border-radius:50%;',
        'background:radial-gradient(circle,var(--c,#fff) 0%,transparent 64%);opacity:0;',
        'transform:translate(-50%,-50%) scale(.55);transition:opacity .9s ease,transform 1.2s cubic-bezier(.2,.8,.2,1)}',
        '.dj-eyes.on .dj-glow{opacity:.36;transform:translate(-50%,-50%) scale(1);animation:djBreath 3.6s ease-in-out 1.2s infinite}',
        '@keyframes djBreath{50%{opacity:.6;transform:translate(-50%,-50%) scale(1.08)}}',
        '.dj-eyes.paused .dj-glow{animation-play-state:paused}',
        '.dj-burst{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;',
        'border:2px solid var(--c,#fff);box-shadow:0 0 14px var(--c,#fff);opacity:0;transform:scale(.2)}',
        '.dj-eyes.burst .dj-burst{animation:djBurst 1.1s cubic-bezier(.1,.7,.3,1)}',
        '@keyframes djBurst{0%{opacity:.95;transform:scale(.2)}100%{opacity:0;transform:scale(11)}}',
        '.dj-label{font:700 11px/1 monospace;letter-spacing:1.5px;text-transform:uppercase;color:#cbd5e1;',
        'text-shadow:0 0 10px var(--c,#fff);text-align:center;min-height:11px;transition:opacity .5s}',
        '.dj-eyes:not(.on) .dj-label{opacity:.35}',
        '@media (max-width:768px){.dj-eyes{width:min(300px,88%)}.dj-label{font-size:10px;letter-spacing:1.2px}}'
    ].join('\n');
    document.head.appendChild(st);

    /* ---------- Etapas ---------- */
    var STAGES = {
        normal:    { label: 'Ojo normal',               c: '#cbd5e1' },
        byakugan:  { label: 'Byakugan',                 c: '#b9b4ff' },
        sharingan: { label: 'Sharingan · 3 tomoes',     c: '#ff3b4b' },
        ms:        { label: 'Mangekyō · Madara',        c: '#ff2030' },
        ems:       { label: 'Mangekyō Eterno · Madara', c: '#ff5a6a' },
        rinnegan:  { label: 'Rinnegan',                 c: '#b15eff' }
    };
    var CONFIG = [
        { id: 'byakugan',  seq: ['normal', 'byakugan'],   mount: '#byakuganEyes' },
        { id: 'sharingan', seq: ['normal', 'sharingan'],  mount: '#sharinganEyes' },
        { id: 'mangekyo',  seq: ['sharingan', 'ms'],      mount: '#mangekyoEyes' },
        { id: 'eternal',   seq: ['ms', 'ems'],            mount: '#eternalEyes' },
        { id: 'susanoo',   seq: ['ems'],                  mount: '#susanooEyes' },
        { id: 'rinnegan',  seq: ['ems', 'rinnegan'],      mount: '#rinneganEyes' }
    ];

    /* ---------- Utilidades de dibujo ---------- */
    function rng(seed) {
        return function () {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }
    /* canvas fuera de pantalla centrado en (0,0); w×h lógicos a k px por unidad */
    function sprite(w, h, k, fn) {
        var c = document.createElement('canvas');
        c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
        var x = c.getContext('2d');
        x.scale(c.width / w, c.height / h);
        x.translate(w / 2, h / 2);
        fn(x);
        return c;
    }
    function circle(x, r, fill) { x.fillStyle = fill; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill(); }
    function radial(x, r, stops) {
        var g = x.createRadialGradient(0, 0, 0, 0, 0, r);
        stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
        return g;
    }
    function fibers(x, seed, n, r0, r1, light, dark) {
        var R = rng(seed);
        x.lineCap = 'round';
        for (var i = 0; i < n; i++) {
            var a = R() * TAU, b = a + (R() - .5) * .07, ra = r0 + R() * 6, rb = r1 - R() * 11;
            x.strokeStyle = R() < .55 ? light : dark;
            x.lineWidth = .4 + R() * 1.1;
            x.globalAlpha = .25 + R() * .6;
            x.beginPath();
            x.moveTo(Math.cos(a) * ra, Math.sin(a) * ra);
            x.lineTo(Math.cos(b) * rb, Math.sin(b) * rb);
            x.stroke();
        }
        x.globalAlpha = 1;
    }
    function limbal(x, col) {
        var g = x.createRadialGradient(0, 0, IR - 9, 0, 0, IR);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
        circle(x, IR, g);
    }
    function ring(x, r, w, col) { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); }
    function P(r, d) { var t = d * Math.PI / 180; return [r * Math.cos(t), r * Math.sin(t)]; }

    /* ---------- Texturas estáticas ---------- */
    function sclera(k) {
        return sprite(W, H, k, function (x) {
            x.translate(-120, -75);
            var g = x.createRadialGradient(120, 75, 10, 120, 75, 130);
            g.addColorStop(0, '#fffdfb'); g.addColorStop(.55, '#f4ede9');
            g.addColorStop(.85, '#dccfcf'); g.addColorStop(1, '#b9a3a8');
            x.fillStyle = g; x.fillRect(-10, -10, W, H);
            /* capilares */
            var R = rng(3); x.lineCap = 'round';
            for (var i = 0; i < 22; i++) {
                var a = R() * TAU, sx = 120 + Math.cos(a) * 112, sy = 75 + Math.sin(a) * 54;
                var len = 12 + R() * 20, ex = sx - Math.cos(a) * len, ey = sy - Math.sin(a) * len * .8;
                x.strokeStyle = 'rgba(190,60,70,' + (.14 + R() * .16).toFixed(2) + ')';
                x.lineWidth = .5 + R() * .7;
                x.beginPath(); x.moveTo(sx, sy);
                x.quadraticCurveTo((sx + ex) / 2 + (R() - .5) * 10, (sy + ey) / 2 + (R() - .5) * 8, ex, ey);
                x.stroke();
            }
            /* lagrimal (esquina interna) */
            var cg = x.createRadialGradient(18, 79, 1, 18, 79, 18);
            cg.addColorStop(0, 'rgba(226,120,126,.95)'); cg.addColorStop(.6, 'rgba(232,160,160,.55)'); cg.addColorStop(1, 'rgba(232,160,160,0)');
            x.fillStyle = cg; x.beginPath(); x.ellipse(18, 79, 19, 13, 0, 0, TAU); x.fill();
            x.fillStyle = 'rgba(150,50,60,.45)'; x.beginPath(); x.ellipse(15, 79, 3.2, 2.2, 0, 0, TAU); x.fill();
        });
    }
    function glint(k) {
        return sprite(40, 40, k, function (x) { circle(x, 20, radial(x, 20, [[0, 'rgba(255,255,255,1)'], [.45, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']])); });
    }
    function veins(k) {   /* venas del Byakugan alrededor del ojo */
        return sprite(W, H, k, function (x) {
            x.translate(-120, -75);
            var R = rng(11); x.lineCap = 'round'; x.lineJoin = 'round';
            for (var i = 0; i < 18; i++) {
                var side = i < 9 ? -1 : 1, t = ((i % 9) + .6) / 9.4, a = Math.PI * (.14 + .72 * t);
                var sx = 120 + Math.cos(Math.PI - a) * 99, sy = 75 + side * Math.sin(a) * 41;
                var len = 12 + R() * 18, nx = Math.cos(Math.PI - a) * .55, ny = side * (.75 + R() * .25);
                var ex = sx + nx * len + (R() - .5) * 8, ey = sy + ny * len;
                var cx = sx + nx * len * .4 + (R() - .5) * 10, cy = sy + ny * len * .6;
                [[3.6, 'rgba(70,58,160,.55)'], [1.7, 'rgba(150,140,240,.95)']].forEach(function (p) {
                    x.lineWidth = p[0]; x.strokeStyle = p[1];
                    x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(cx, cy, ex, ey); x.stroke();
                });
            }
            [[228, 62, 244, 40], [12, 70, -2, 50]].forEach(function (v) {     /* venas de las sienes */
                [[4, 'rgba(70,58,160,.55)'], [2, 'rgba(150,140,240,.95)']].forEach(function (p) {
                    x.lineWidth = p[0]; x.strokeStyle = p[1];
                    x.beginPath(); x.moveTo(v[0], v[1]); x.quadraticCurveTo((v[0] + v[2]) / 2 + 4, (v[1] + v[3]) / 2, v[2], v[3]); x.stroke();
                });
            });
        });
    }

    /* ---------- Iris por etapa ---------- */
    function redBase(x, seed) {
        circle(x, IR, radial(x, IR, [[0, '#b30914'], [.45, '#e3202c'], [.85, '#b20c17'], [1, '#5b050b']]));
        fibers(x, seed, 96, 9, IR - 3, 'rgba(255,130,120,.6)', 'rgba(60,0,6,.65)');
        limbal(x, 'rgba(28,0,3,.9)');
    }
    function tomoe(x) {
        var R = 23, hw = 6.4, n = 26, a0 = -Math.PI / 2, o = [], q = [], i, t, a, w;
        for (i = 0; i <= n; i++) {
            t = i / n; a = a0 + t * .8; w = hw * Math.pow(1 - t, .75);
            o.push([Math.cos(a) * (R + w), Math.sin(a) * (R + w)]);
            q.push([Math.cos(a) * (R - w), Math.sin(a) * (R - w)]);
        }
        x.beginPath(); x.moveTo(o[0][0], o[0][1]);
        o.forEach(function (p) { x.lineTo(p[0], p[1]); });
        for (i = n; i >= 0; i--) x.lineTo(q[i][0], q[i][1]);
        x.closePath(); x.fill();
        x.beginPath(); x.arc(0, -R, hw, 0, TAU); x.fill();
    }
    function core(x) {      /* núcleo del Mangekyō de Madara (unidades de radio) */
        x.beginPath();
        for (var i = 0; i <= 90; i++) {
            var d = i * 4, q = P(.5 + .1 * Math.cos(3 * (d - 102) * Math.PI / 180), d);
            i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]);
        }
        x.closePath();
        var g = x.createRadialGradient(0, 0, .1, 0, 0, .75);
        g.addColorStop(0, '#e0121c'); g.addColorStop(1, '#a80008');
        x.fillStyle = g; x.fill();
        [-90, 30, 150].forEach(function (a) {
            var q = P(.64, a);
            x.fillStyle = '#050102'; x.beginPath(); x.arc(q[0], q[1], .29, 0, TAU); x.fill();
            x.fillStyle = '#d4141f'; x.beginPath(); x.arc(q[0], q[1], .155, 0, TAU); x.fill();
        });
        x.fillStyle = '#050102'; x.beginPath(); x.arc(0, 0, .19, 0, TAU); x.fill();
    }

    var BUILD = {
        normal: function (k) {
            return { live: 'normal', spin: [], base: sprite(100, 100, k, function (x) {
                circle(x, IR, radial(x, IR, [[0, '#2a1608'], [.3, '#8a5428'], [.55, '#a56b36'], [.85, '#5a3418'], [1, '#1b0e06']]));
                fibers(x, 5, 150, 14, IR - 4, 'rgba(255,205,140,.55)', 'rgba(20,8,2,.6)');
                ring(x, 24, 1.6, 'rgba(255,215,160,.28)');
                limbal(x, 'rgba(10,4,2,.85)');
            }) };
        },
        byakugan: function (k) {
            return { spin: [], veins: true, base: sprite(100, 100, k, function (x) {
                circle(x, IR, radial(x, IR, [[0, '#f8f5ff'], [.6, '#e6e0ff'], [.9, '#c9c1f6'], [1, '#a79ee6']]));
                fibers(x, 9, 70, 10, IR - 4, 'rgba(255,255,255,.7)', 'rgba(130,118,214,.5)');
                [14, 22, 31].forEach(function (r) { ring(x, r, .8, 'rgba(140,128,220,.22)'); });
                ring(x, 7.5, 1, 'rgba(140,128,220,.45)');
                limbal(x, 'rgba(100,88,190,.7)');
                ring(x, IR - .6, 1.2, 'rgba(108,96,200,.8)');
            }) };
        },
        sharingan: function (k) {
            return {
                base: sprite(100, 100, k, function (x) {
                    redBase(x, 7);
                    ring(x, 23, 1.5, 'rgba(32,3,6,.9)');
                    circle(x, 8, '#080102'); ring(x, 8, 1, 'rgba(255,90,100,.35)');
                }),
                spin: [{ w: TAU / 7, c: sprite(100, 100, k, function (x) {
                    x.fillStyle = '#090103';
                    for (var i = 0; i < 3; i++) { x.save(); x.rotate(i * TAU / 3); tomoe(x); x.restore(); }
                    x.fillStyle = 'rgba(255,255,255,.22)';
                    for (i = 0; i < 3; i++) { var p = P(23, i * 120 - 90); x.beginPath(); x.arc(p[0] - 1.8, p[1] - 1.8, 1.7, 0, TAU); x.fill(); }
                }) }]
            };
        },
        ms: function (k) {
            return {
                base: sprite(100, 100, k, function (x) { redBase(x, 17); }),
                spin: [{ w: TAU / 18, c: sprite(100, 100, k, function (x) {
                    x.scale(40, 40);
                    x.strokeStyle = '#050102'; x.lineWidth = .17; x.beginPath(); x.arc(0, 0, .68, 0, TAU); x.stroke();
                    x.lineWidth = .1; x.beginPath(); x.arc(0, 0, .99, 0, TAU); x.stroke();
                    core(x);
                }) }]
            };
        },
        ems: function (k) {
            return {
                base: sprite(100, 100, k, function (x) { circle(x, IR, '#050102'); }),
                spin: [{ w: -TAU / 18, c: sprite(100, 100, k, function (x) {
                    x.beginPath(); x.arc(0, 0, IR, 0, TAU); x.clip();
                    x.scale(40, 40);
                    x.fillStyle = '#050102'; x.beginPath(); x.arc(0, 0, 1.17, 0, TAU); x.fill();
                    [-90, 30, 150].forEach(function (a) {
                        var a0 = (a - 47) * Math.PI / 180, a1 = (a + 47) * Math.PI / 180, i1 = P(.78, a + 47);
                        var g = x.createRadialGradient(0, 0, .75, 0, 0, 1); g.addColorStop(0, '#8e0006'); g.addColorStop(1, '#d00a14');
                        x.fillStyle = g; x.beginPath();
                        x.arc(0, 0, .97, a0, a1, false); x.lineTo(i1[0], i1[1]); x.arc(0, 0, .78, a1, a0, true);
                        x.closePath(); x.fill();
                    });
                    core(x);
                }) }]
            };
        },
        rinnegan: function (k) {
            /* el globo ocular entero es lavanda: sin esclera blanca ni iris separado */
            return { live: 'rinnegan', full: true, spin: [], base: sprite(W, H, k, function (x) {
                x.translate(-120, -75);
                var g = x.createRadialGradient(120, 75, 6, 120, 75, 130);
                g.addColorStop(0, '#f6f2ff'); g.addColorStop(.55, '#e3dcf6');
                g.addColorStop(.88, '#c6bbe6'); g.addColorStop(1, '#a596cf');
                x.fillStyle = g; x.fillRect(-10, -10, W, H);
                var R = rng(31); x.lineCap = 'round';          /* trama muy fina */
                for (var i = 0; i < 90; i++) {
                    var a = R() * TAU, r0 = 10 + R() * 40, r1 = r0 + 10 + R() * 50;
                    x.strokeStyle = R() < .5 ? 'rgba(255,255,255,.5)' : 'rgba(110,90,170,.22)';
                    x.lineWidth = .4 + R() * .6;
                    x.beginPath();
                    x.moveTo(120 + Math.cos(a) * r0, 75 + Math.sin(a) * r0);
                    x.lineTo(120 + Math.cos(a) * r1, 75 + Math.sin(a) * r1);
                    x.stroke();
                }
            }) };
        }
    };

    /* dibujo "vivo" (barato) de elementos que se animan por función */
    function live(x, kind, t, o) {
        if (kind === 'normal') {      /* pupila que respira */
            var r = 13 + 2 * Math.sin(t * 1.1);
            circle(x, r, '#060302');
            x.fillStyle = 'rgba(255,255,255,.07)'; x.beginPath(); x.arc(0, 0, r + 1.6, 0, TAU); x.arc(0, 0, r, 0, TAU, true); x.fill();
        } else if (kind === 'rinnegan') {   /* anillos que cruzan todo el ojo, con onda hacia afuera */
            x.lineWidth = 1.35;
            for (var i = 0; i < 16; i++) {
                x.globalAlpha = .55 + .35 * Math.sin(t * 2.2 - i * .8);
                x.strokeStyle = '#4b3b7c';
                x.beginPath(); x.arc(0, 0, 5.5 + i * 8.4, 0, TAU); x.stroke();
            }
            x.globalAlpha = 1;
            ring(x, 5.5, 2.2, '#2a1c4d');
            circle(x, 2.8, '#0c0618');
        }
    }

    /* ---------- Forma del ojo ---------- */
    function lid(x, u, l) {
        x.beginPath(); x.moveTo(10, 78);
        x.bezierCurveTo(55, u, 170, u, 230, 68);
        x.bezierCurveTo(170, l, 55, l, 10, 78);
        x.closePath();
    }

    /* ---------- Un ojo ---------- */
    var eyes = [], raf = 0, last = 0, ema = .016, slow = 0;
    var ptr = { x: 0, y: 0, q: false };

    function mk(cfg, panel) {
        var box = document.createElement('div'); box.className = 'dj-eyes paused';
        var stage = document.createElement('div'); stage.className = 'dj-stage';
        var glow = document.createElement('div'); glow.className = 'dj-glow';
        var cv = document.createElement('canvas'); cv.className = 'dj-cv'; cv.setAttribute('aria-hidden', 'true');
        var bs = document.createElement('span'); bs.className = 'dj-burst';
        var lab = document.createElement('div'); lab.className = 'dj-label';
        stage.appendChild(glow); stage.appendChild(cv); stage.appendChild(bs);
        box.appendChild(stage); box.appendChild(lab);

        var host = cfg.mount ? document.querySelector(cfg.mount) : null;
        if (host) host.appendChild(box); else panel.insertBefore(box, panel.firstChild);

        var e = {
            box: box, stage: stage, cv: cv, ctx: cv.getContext('2d'), lab: lab, seq: cfg.seq, panel: host || panel,
            st: -1, open: 0, v: 0, tgt: 0, gx: 0, gy: 0, tx: 0, ty: 0, nextLook: 0, nextBlink: 0, lookUntil: 0,
            k: 0, kB: 0, sp: null, built: false, vis: false, live: false, drawn: false, dirty: true,
            R: rng(cfg.id.length * 977 + 13)
        };
        lab.textContent = STAGES[cfg.seq[0]].label;
        box.style.setProperty('--c', STAGES[cfg.seq[0]].c);
        return e;
    }

    function fit(e) {
        var w = e.stage.clientWidth;
        if (!w) return false;
        var kk = w * DPR * quality / W;
        var cw = Math.round(W * kk), ch = Math.round(H * kk);
        if (e.cv.width !== cw || e.cv.height !== ch) { e.cv.width = cw; e.cv.height = ch; }
        e.k = cw / W;
        var x = e.ctx;
        e.vig = x.createRadialGradient(120, 75, 30, 120, 75, 128);
        e.vig.addColorStop(0, 'rgba(0,0,0,0)'); e.vig.addColorStop(.7, 'rgba(20,10,20,.12)'); e.vig.addColorStop(1, 'rgba(10,4,10,.6)');
        if (!e.kB || Math.abs(e.k - e.kB) / e.kB > .05) buildSprites(e);
        e.dirty = false; e.drawn = false;
        return true;
    }
    function buildSprites(e) {
        var k = e.k;
        e.kB = k; e.scl = sclera(k); e.glint = glint(k); e.sp = {};
        e.seq.forEach(function (n) {
            if (!e.sp[n]) {
                e.sp[n] = BUILD[n](k);
                if (e.sp[n].veins) e.sp.veins = veins(k);
            }
        });
        e.built = true;
    }

    function setStage(e, i) {
        e.st = i;
        var s = STAGES[e.seq[i]];
        e.lab.textContent = s.label;
        e.box.style.setProperty('--c', s.c);
    }
    function burst(e) {
        if (reduce) return;
        e.box.classList.remove('burst'); void e.box.offsetWidth; e.box.classList.add('burst');
    }
    function blink(e, mid) {
        e.tgt = 0;
        setTimeout(function () { if (mid) mid(); e.tgt = 1; }, 170);
    }
    function play(e) {
        if (e.live) return;
        if (!e.built && !fit(e)) { setTimeout(function () { play(e); }, 120); return; }
        e.live = true; e.box.classList.add('on');
        setStage(e, 0); burst(e); e.tgt = 1;
        e.nextBlink = performance.now() / 1000 + 4; e.nextLook = e.nextBlink - 2.4;
        e.seq.forEach(function (_, i) {
            if (!i) return;
            setTimeout(function () { blink(e, function () { setStage(e, i); burst(e); }); }, 1500 + (i - 1) * 2200);
        });
        kick();
    }

    /* ---------- Actualizar + dibujar ---------- */
    function update(e, dt, t) {
        /* párpado con muelle: se abre con un pequeño rebote, cierra rápido */
        var sti = e.tgt ? 230 : 700, damp = e.tgt ? 20 : 48;
        e.v += ((e.tgt - e.open) * sti - e.v * damp) * dt;
        e.open += e.v * dt;
        if (e.open < 0) { e.open = 0; e.v = 0; }
        if (e.open > 1.07) { e.open = 1.07; e.v = 0; }

        if (e.live && e.tgt === 1 && e.open > .9 && t > e.nextBlink) {
            e.nextBlink = t + 3 + e.R() * 3.5;
            blink(e);
            if (e.R() < .22) setTimeout(function () { blink(e); }, 330);
        }
        if (t > e.nextLook && t > e.lookUntil) {      /* sacadas: mira a puntos al azar */
            e.tx = (e.R() - .5) * 16; e.ty = (e.R() - .5) * 8;
            e.nextLook = t + 1.2 + e.R() * 2.6;
        }
        var f = 1 - Math.exp(-dt * 9);
        e.gx += (e.tx - e.gx) * f; e.gy += (e.ty - e.gy) * f;
    }

    function draw(e, t) {
        var x = e.ctx, o = e.open, k = e.k;
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, e.cv.width, e.cv.height);
        x.setTransform(k, 0, 0, k, 10 * k, 10 * k);

        var u = 75 - 62 * o, l = 75 + 61 * o, name = e.st >= 0 ? e.seq[e.st] : null;
        var sp = name && e.sp ? e.sp[name] : null;

        if (name === 'byakugan' && o > .05 && e.sp.veins) {
            x.globalAlpha = Math.min(1, o) * (.72 + .28 * Math.sin(t * 2.6));
            x.drawImage(e.sp.veins, -10, -10, W, H);
            x.globalAlpha = 1;
        }

        if (o > .015) {
            x.save(); lid(x, u, l); x.clip();
            if (sp && sp.full) x.drawImage(sp.base, -10, -10, W, H); else x.drawImage(e.scl, -10, -10, W, H);
            if (name === 'byakugan') { x.fillStyle = 'rgba(176,166,255,.16)'; x.fillRect(0, 0, 240, 150); }

            if (sp) {
                x.save();
                x.translate(120 + e.gx, 75 + e.gy);
                if (!sp.full) x.scale(1 - Math.abs(e.gx) / 130, 1);        /* leve escorzo al mirar de lado */
                if (!sp.full) x.drawImage(sp.base, -50, -50, 100, 100);
                for (var i = 0; i < sp.spin.length; i++) {
                    x.save(); x.rotate(sp.spin[i].w * t);
                    x.drawImage(sp.spin[i].c, -50, -50, 100, 100);
                    x.restore();
                }
                if (sp.live) live(x, sp.live, t, o);
                x.restore();
            }

            /* sombras: párpado superior, inferior y curvatura del globo */
            var yt = .75 * u + 18.25, yb = .75 * l + 18.25;
            var g = x.createLinearGradient(0, yt, 0, yt + 34);
            g.addColorStop(0, 'rgba(0,0,0,.62)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = g; x.fillRect(0, yt - 2, 240, 40);
            g = x.createLinearGradient(0, yb, 0, yb - 20);
            g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
            x.fillStyle = g; x.fillRect(0, yb - 22, 240, 24);
            x.fillStyle = e.vig; x.fillRect(0, 0, 240, 150);

            /* brillos (la luz no sigue a la mirada: da volumen) */
            var hx = 120 + e.gx * .5, hy = 75 + e.gy * .5;
            x.globalAlpha = .9 * Math.min(1, o); x.drawImage(e.glint, hx - 25, hy - 27, 18, 18);
            x.globalAlpha = .4 * Math.min(1, o); x.drawImage(e.glint, hx + 12, hy + 14, 9, 9);
            x.globalAlpha = 1;
            x.restore();
        }

        /* líneas de los párpados */
        x.lineCap = 'round'; x.lineJoin = 'round';
        x.strokeStyle = 'rgba(255,255,255,.13)'; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(16, 70); x.bezierCurveTo(58, u - 17 * o, 170, u - 17 * o, 228, 58); x.stroke();
        x.strokeStyle = 'rgba(8,8,14,.92)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(10, 78); x.bezierCurveTo(55, l, 170, l, 230, 68); x.stroke();
        x.strokeStyle = '#07070c'; x.lineWidth = 4.8;
        x.beginPath(); x.moveTo(10, 78); x.bezierCurveTo(55, u, 170, u, 230, 68); x.stroke();
        x.lineWidth = 2.4;
        x.beginPath(); x.moveTo(228, 67); x.quadraticCurveTo(238, 62, 246, 53); x.moveTo(223, 63); x.quadraticCurveTo(231, 57, 237, 47); x.stroke();
    }

    /* ---------- Bucle único ---------- */
    function frame(now) {
        raf = 0;
        var dt = Math.min(.05, (now - last) / 1000); last = now;
        var t = now / 1000, any = false;
        ema += (dt - ema) * .05;
        for (var i = 0; i < eyes.length; i++) {
            var e = eyes[i];
            if (!e.vis) continue;
            if (e.dirty && !fit(e)) continue;
            if (e.live) { update(e, dt, t); draw(e, t); any = true; }
            else if (!e.drawn) { draw(e, t); e.drawn = true; }
        }
        /* calidad adaptativa: si va lento, baja la resolución del canvas */
        if (any && ema > .034 && quality > .62) {
            if (++slow > 40) { quality *= .8; slow = 0; ema = .016; eyes.forEach(function (q) { q.dirty = true; }); }
        } else slow = 0;
        if (any) raf = requestAnimationFrame(frame);
    }
    function kick() {
        if (raf || document.hidden) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });

    /* La mirada sigue al dedo / puntero (mientras se use) */
    function applyPtr() {
        ptr.q = false;
        var now = performance.now() / 1000;
        eyes.forEach(function (e) {
            if (!e.vis || !e.live) return;
            var r = e.cv.getBoundingClientRect();
            var dx = (ptr.x - (r.left + r.width / 2)) / r.width, dy = (ptr.y - (r.top + r.height / 2)) / r.height;
            e.tx = Math.max(-10, Math.min(10, dx * 26));
            e.ty = Math.max(-6, Math.min(6, dy * 20));
            e.lookUntil = now + 2.2;
        });
    }
    function onPtr(ev) {
        ptr.x = ev.clientX; ptr.y = ev.clientY;
        if (!ptr.q) { ptr.q = true; requestAnimationFrame(applyPtr); }
    }

    /* ---------- Montaje ---------- */
    function init() {
        CONFIG.forEach(function (cfg) {
            var panel = document.getElementById(cfg.id);
            if (!panel) return;
            eyes.push(mk(cfg, panel));
        });
        if (!eyes.length) return;

        if (reduce || !('IntersectionObserver' in window)) {
            eyes.forEach(function (e) {
                e.vis = true;
                if (fit(e)) {
                    setStage(e, e.seq.length - 1); e.open = 1; e.box.classList.add('on'); e.box.classList.remove('paused');
                    draw(e, 0);
                } else { e.dirty = true; }
            });
            if (!reduce) eyes.forEach(play);
            return;
        }

        /* visibilidad: solo se construye y anima lo cercano a la pantalla */
        var vis = new IntersectionObserver(function (ens) {
            ens.forEach(function (en) {
                var e = eyes.filter(function (q) { return q.panel === en.target; })[0];
                if (!e) return;
                e.vis = en.isIntersecting;
                e.box.classList.toggle('paused', !e.vis);
                if (e.vis) { if (!e.built) e.dirty = true; kick(); }
            });
        }, { rootMargin: '300px 0px' });

        /* activación: una sola vez, al entrar en la sección */
        var go = new IntersectionObserver(function (ens) {
            ens.forEach(function (en) {
                if (!en.isIntersecting) return;
                go.unobserve(en.target);
                var e = eyes.filter(function (q) { return q.panel === en.target; })[0];
                if (e) { e.vis = true; play(e); }
            });
        }, { rootMargin: '0px 0px -30% 0px', threshold: 0 });

        eyes.forEach(function (e) { vis.observe(e.panel); go.observe(e.panel); });

        if ('ResizeObserver' in window) {
            var ro = new ResizeObserver(function () { eyes.forEach(function (e) { e.dirty = true; }); kick(); });
            eyes.forEach(function (e) { ro.observe(e.stage); });
        }
        window.addEventListener('pointermove', onPtr, { passive: true });
        window.addEventListener('pointerdown', onPtr, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();