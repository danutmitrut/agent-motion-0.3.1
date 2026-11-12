/* Linia: motorul de animație al șablonului reel-ilustrat.
 * Port al lui kit/linia-continua/lib/linia.js (aceeași mecanică: desenarea cu dash, iconițele,
 * rețeaua, cardurile, cuvintele, scânteia, semnătura, atmosfera), fără culori, etichete,
 * semnătură sau trasee proprii. Culorile vin numai din variabilele CSS puse de compileaza.mjs:
 * --fundal, --text, --atenuat, --accent, --linie.
 * Reguli (le verifică teste/unitar/runtime-capcane.test.mjs): nimic aleator, nimic legat de ceasul
 * sistemului, grosimea liniei se compensează prin scară, nu prin atribute SVG speciale, iar lungimile
 * se măsoară o singură dată, la pregătire, niciodată în onUpdate. Comentariile sunt doar de tip bloc.
 *
 * Folosire (o face regizor-runtime.js, din plan; agentul nu scrie aici):
 *   var L = Linia.start(durata);
 *   L.desen(gId, traseu, { x, y, s, oglindit, draw: [t, dur], undraw: [t, dur] sau null });
 *   L.forma(gId, svg, { x, y, s, oglindit, animatie: "contur-umplere" sau "aparitie", esalonare, draw, undraw });
 *   L.panou(gId, { cutie: [x, y, w, h], culoare, draw, undraw });
 *   var centre = L.iconite(gId, pozitii, { scara, apar: [...], tremura, retrag });
 *   L.retea(gId, din, { nastere, scanteie: [t, dur] sau null, retrag, centru, raza });
 *   L.linie(id, t, dur, { ease });
 *   L.card(id, intra, iese);
 *   L.cuvinte(id, timpi, iese, { card });
 *   L.semnatura(id, text, t, dur);
 *   L.atmosfera({ mod, aprinde, impingere });
 *   L.gata();
 */
(function () {
  var NS = null;
  function ns() {
    if (NS === null) NS = document.getElementById("art").namespaceURI;
    return NS;
  }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function $(id) { return typeof id === "string" ? document.getElementById(id) : id; }
  function el(tag, attrs, parent) {
    var e = document.createElementNS(ns(), tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  /* pregătește un element SVG pentru desenare prin dash; lungimea se măsoară o singură dată, aici */
  function prepDash(e) {
    var L = e.getTotalLength() + 1;
    e.style.strokeDasharray = L + " " + L;
    e.style.strokeDashoffset = L;
    e.dataset.len = L;
    return e;
  }
  /* poziția unui desen: colțul stânga-sus (x, y), scara s; oglindit întoarce pe orizontală în aceeași cutie */
  function aseaza(g, o, w, x0, y0) {
    var tx = o.oglindit ? o.x + w * o.s : o.x;
    var sx = o.oglindit ? -o.s : o.s;
    var t = "translate(" + tx + " " + o.y + ") scale(" + sx + " " + o.s + ")";
    if (x0 || y0) t += " translate(" + (-x0) + " " + (-y0) + ")";
    g.setAttribute("transform", t);
  }

  function start(duration) {
    var tl = gsap.timeline({ paused: true });
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = tl;
    var EIO = gsap.parseEase("power1.inOut"), EI = gsap.parseEase("power2.in");
    var sets = [], sig = null;

    var api = { tl: tl, el: el, prepDash: prepDash };

    /* Motorul de traseu (inactiv din 2026-10-07; păstrat pentru pasul 7): {w, h, paths}. Progresul e funcție pură de timp. */
    api.desen = function (gId, data, o) {
      var g = $(gId);
      aseaza(g, o, data.w, 0, 0);
      var items = [], total = 0;
      data.paths.forEach(function (d) {
        var p = el("path", { d: d, "class": "w" }, g);
        p.style.strokeWidth = ((o.grosime || 3) / o.s).toFixed(3);
        var L = p.getTotalLength();
        p.style.strokeDasharray = (L + 1) + " " + (L + 1);
        p.style.strokeDashoffset = L + 1;
        items.push({ p: p, L: L, cum: total });
        total += L;
      });
      var set = { items: items, total: total, draw: o.draw, undraw: o.undraw || null };
      sets.push(set);
      return { total: total };
    };
    function renderSet(set, t) {
      var a = EIO(clamp((t - set.draw[0]) / set.draw[1])) * set.total;
      var r = set.undraw ? EI(clamp((t - set.undraw[0]) / set.undraw[1])) * set.total : 0;
      set.items.forEach(function (it) {
        var vis = Math.min(Math.max(a - it.cum, 0), it.L);
        var hid = Math.min(Math.max(r - it.cum, 0), it.L);
        /* o linie de lungime zero cu capete rotunde ar lăsa un punct; o ascundem de tot */
        it.p.style.visibility = (vis <= 0.5 || hid >= it.L - 0.5) ? "hidden" : "visible";
        it.p.style.strokeDashoffset = hid > 0 ? -hid : it.L + 1 - vis;
      });
    }

    /* O formă umplută (Open Doodles, Open Peeps, piese proprii), spec 8.4.4.
     * svg = { viewBox: [x0, y0, w, h], continut: marcajul interior, cu clasele de rol ink, fond, acc, acc2
     * și, la piesele proprii, clasele de contur ink-contur, fond-contur, acc-contur (nucleu/lib/desen/roluri.mjs) }.
     * contur-umplere (planul C, D1, varianta V2): conturul grupului ink se desenează (pathLength 1, dashoffset de la 1 la 0)
     * pe toată fereastra de contur (70% din draw): traseele sunt eșalonate cu un pas plafonat la jumătate din fereastră,
     * iar fiecare durează fereastra minus eșalonarea, ca ultimul să se termine exact unde începe umplerea, care apare
     * prin fade, fără a doua trasare. Elementele de contur sunt path, line, polyline, polygon, circle, ellipse și rect.
     * Pe panoul inversat (clasa inversat pe grupul desenului, pusă de compileaza.mjs), silueta fond apare întâi (0,3 s),
     * ca conturul, în culoarea fundalului, să se vadă peste ea.
     * Un traseu ink-contur se desenează la fel, dar își păstrează grosimea din desen (e chiar linia piesei).
     * Accentul și celelalte contururi intră doar prin apariție.
     * Retragerea oglindește intrarea: umplerea și accentele se sting în primele 40% din undraw, conturul se retrage cu dash
     * în rest (power2.in), iar pe panoul inversat silueta se stinge ultima, în ultimele 0,3 s; la sfârșit, autoAlpha 0.
     * aparitie: fade și scale pe toată piesa, iar la retragere un fade. */
    var FORME_CONTUR = ["path", "line", "polyline", "polygon", "circle", "ellipse", "rect"];
    function selectorRol(rol) {
      return FORME_CONTUR.map(function (f) { return "." + rol + " " + f + ", " + f + "." + rol; }).join(", ");
    }
    var SEL_INK = selectorRol("ink"), SEL_INK_CONTUR = selectorRol("ink-contur");
    api.forma = function (gId, svg, o) {
      var g = $(gId), vb = svg.viewBox;
      aseaza(g, o, vb[2], vb[0], vb[1]);
      var corp = el("g", { "class": "forma" }, g);
      corp.innerHTML = svg.continut;
      var t0 = o.draw[0], dur = o.draw[1];
      if (o.animatie === "aparitie") {
        var cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
        tl.fromTo(corp, { autoAlpha: 0, scale: 0.92, svgOrigin: cx + " " + cy },
          { autoAlpha: 1, scale: 1, svgOrigin: cx + " " + cy, duration: Math.min(0.8, dur), ease: "power2.out" }, t0);
        if (o.undraw) {
          tl.to(corp, { autoAlpha: 0, duration: o.undraw[1], ease: "power2.in" }, o.undraw[0]);
        }
        return corp;
      }
      var contur = dur * 0.7, umplere = dur - contur;
      var linii = Array.prototype.slice.call(corp.querySelectorAll(SEL_INK + ", " + SEL_INK_CONTUR));
      /* pe panoul inversat (noapte, Open Peeps) cerneala ia culoarea fundalului și nu are dreptunghi în spate:
       * silueta (fond) intră întâi, în primele 0,3 s ale ferestrei, iar conturul închis se trasează peste ea */
      var inversat = g.closest(".inversat") !== null;
      var siluete = inversat ? Array.prototype.slice.call(corp.querySelectorAll(".fond, .fond path")) : [];
      var pline = Array.prototype.slice.call(corp.querySelectorAll(inversat ? SEL_INK : SEL_INK + ", .fond, .fond path"));
      var accente = Array.prototype.slice.call(corp.querySelectorAll(".acc, .acc2, .acc-contur, .acc2-contur, .fond-contur"));
      var durSilueta = Math.min(0.3, contur);
      if (siluete.length) {
        tl.fromTo(siluete, { fillOpacity: 0 }, { fillOpacity: 1, duration: durSilueta, ease: "power1.out" }, t0);
      }
      var n = linii.length;
      var esal = o.esalonare == null ? 0.06 : o.esalonare;
      var pas = n > 1 ? Math.min(esal, 0.5 * contur / (n - 1)) : 0;
      var durTraseu = contur - (n - 1) * pas;
      /* autoRound: false, fiindcă GSAP rotunjește implicit valorile în px la întregi, iar cu pathLength 1
       * dashoffset-ul ar sări din 1 în 0, deci conturul ar apărea dintr-odată în loc să se deseneze */
      linii.forEach(function (p, i) {
        p.setAttribute("pathLength", "1");
        /* 3 px, ca traseele pe care s-a calibrat „primul conținut” din C12: la 2 px, pe hartie, linia trecea de prag
         * doar cu 1-3 niveluri și pe Windows ieșea sub el (C16) */
        if (!p.matches(SEL_INK_CONTUR)) p.style.strokeWidth = (3 / o.s).toFixed(3);
        tl.fromTo(p, { strokeDasharray: "1 1", strokeDashoffset: 1 },
          { strokeDasharray: "1 1", strokeDashoffset: 0, autoRound: false, duration: durTraseu, ease: "power1.inOut" }, t0 + i * pas);
      });
      if (pline.length) {
        tl.fromTo(pline, { fillOpacity: 0 }, { fillOpacity: 1, duration: umplere, ease: "power1.out" }, t0 + contur);
      }
      if (accente.length) {
        tl.fromTo(accente, { autoAlpha: 0 }, { autoAlpha: 1, duration: umplere, ease: "power1.out" }, t0 + contur);
      }
      if (o.undraw) {
        var u = o.undraw[0], durU = o.undraw[1], stingere = 0.4 * durU, retragere = durU - stingere;
        if (pline.length) tl.to(pline, { fillOpacity: 0, duration: stingere, ease: "power1.in" }, u);
        if (accente.length) tl.to(accente, { autoAlpha: 0, duration: stingere, ease: "power1.in" }, u);
        /* conturul se retrage de la capătul de unde a pornit, ca la trasee: dashoffset de la 0 la -1 */
        if (n) tl.to(linii, { strokeDashoffset: -1, autoRound: false, duration: retragere, ease: "power2.in" }, u + stingere);
        /* oglinda intrării: silueta, venită prima, pleacă ultima, în ultimele 0,3 s ale retragerii conturului */
        if (siluete.length) {
          var durStingereSilueta = Math.min(0.3, retragere);
          tl.to(siluete, { fillOpacity: 0, duration: durStingereSilueta, ease: "power1.in" }, u + durU - durStingereSilueta);
        }
        tl.set(corp, { autoAlpha: 0 }, u + durU);
      }
      return corp;
    };

    /* Panoul deschis la culoare din spatele unei piese (spec 8.4.3); stă cât stă desenul. */
    api.panou = function (gId, o) {
      var g = $(gId), c = o.cutie;
      var r = el("rect", { x: c[0], y: c[1], width: c[2], height: c[3], rx: 28, "class": "panou" });
      r.style.fill = o.culoare;
      g.parentNode.insertBefore(r, g);
      tl.fromTo(r, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: "power2.out" }, o.draw[0]);
      if (o.undraw) {
        tl.to(r, { autoAlpha: 0, duration: 0.5, ease: "power2.in" }, o.undraw[0] + o.undraw[1] - 0.5);
      }
      return r;
    };

    /* Iconițe Lucide (grupuri g data-icon puse de compileaza.mjs). Poziția e colțul stânga-sus; mărimea = 24 * scara. */
    api.iconite = function (gId, pos, o) {
      var sc = o.scara || 4.6;
      var groups = Array.prototype.slice.call($(gId).children);
      groups.forEach(function (g, i) {
        var P = pos[i];
        g.setAttribute("transform", "translate(" + P[0] + " " + P[1] + ") scale(" + sc + ")");
        var parts = g.querySelectorAll("path, rect, circle, line, polyline, polygon, ellipse");
        parts.forEach(function (e) { e.style.strokeWidth = (3 / sc).toFixed(3); prepDash(e); });
        var t = o.apar[i];
        tl.to(parts, { strokeDashoffset: 0, duration: 0.55, ease: "power2.out", stagger: 0.05 }, t);
        tl.from(g, { y: "+=24", opacity: 0, duration: 0.5, ease: "power3.out" }, t);
        if (o.tremura != null) tl.to(g, { x: "+=4", duration: 0.07, ease: "none", yoyo: true, repeat: 13 }, o.tremura + i * 0.03);
        if (o.retrag != null) {
          var r = o.retrag + i * 0.05;
          tl.to(parts, { strokeDashoffset: function (j, e) { return -parseFloat(e.dataset.len); }, duration: 0.7, ease: "power2.in" }, r);
          tl.set(g, { autoAlpha: 0 }, r + 0.75);
        }
      });
      /* centrele iconițelor, din care se pot naște nodurile rețelei */
      return pos.map(function (P) { return [P[0] + 12 * sc, P[1] + 12 * sc]; });
    };

    /* Desenează (și opțional retrage) un element SVG existent: path, line, circle. */
    api.linie = function (id, t, dur, o) {
      o = o || {};
      var e = $(id); prepDash(e);
      tl.to(e, { strokeDashoffset: 0, duration: dur, ease: o.ease || "power1.inOut" }, t);
      if (o.retrag != null) {
        tl.to(e, { strokeDashoffset: -parseFloat(e.dataset.len), duration: o.retragDur || 0.8, ease: "power2.in" }, o.retrag);
        tl.set(e, { autoAlpha: 0 }, o.retrag + (o.retragDur || 0.8) + 0.05);
      }
      return e;
    };

    /* Card de text: .label și zero sau mai multe .mask > .h (un card poate avea doar etichetă).
     * Vizibil doar în fereastra lui. Tween-urile pe elemente care lipsesc nu se adaugă deloc, ca GSAP
     * să nu scrie avertismente în consolă (check le numără ca probleme de runtime). */
    gsap.set(".card", { autoAlpha: 0 });
    api.card = function (id, tin, tout) {
      var c = "#" + id;
      var areEticheta = document.querySelector(c + " .label") !== null;
      var areRanduri = document.querySelector(c + " .mask > .h:not(.word)") !== null;
      var areText = document.querySelector(c + " .mask > .h") !== null;
      tl.set(c, { autoAlpha: 1 }, tin);
      if (areEticheta) tl.from(c + " .label", { opacity: 0, x: -20, duration: 0.5, ease: "power3.out" }, tin);
      if (areRanduri) tl.from(c + " .mask > .h:not(.word)", { yPercent: 105, duration: 0.7, ease: "power3.out", stagger: 0.35 }, tin + 0.15);
      if (tout != null) {
        if (areText) tl.to(c + " .mask > .h", { yPercent: -105, duration: 0.45, ease: "power2.in", stagger: 0.06 }, tout);
        if (areEticheta) tl.to(c + " .label", { opacity: 0, duration: 0.35 }, tout);
        tl.set(c, { autoAlpha: 0 }, tout + 0.5);
      }
    };

    /* Cuvinte care se înlocuiesc în același loc, într-un card cu .mask#id > .h.word.
     * Cu { card: "c2" } se ocupă și de cardul părinte (eticheta intră, cardul se ascunde la final).
     * tout null (cardul scenei finale): cardul, eticheta și ultimul cuvânt rămân până la capăt, ca la L.card;
     * o poziție null ar pune tween-ul la capătul curent al timeline-ului, adică într-un moment oarecare. */
    api.cuvinte = function (id, times, tout, o) {
      o = o || {};
      if (o.card) {
        var c = "#" + o.card;
        var areEticheta = document.querySelector(c + " .label") !== null;
        tl.set(c, { autoAlpha: 1 }, times[0] - 0.1);
        if (areEticheta) tl.from(c + " .label", { opacity: 0, x: -20, duration: 0.5, ease: "power3.out" }, times[0] - 0.1);
        if (tout != null) {
          if (areEticheta) tl.to(c + " .label", { opacity: 0, duration: 0.35 }, tout);
          tl.set(c, { autoAlpha: 0 }, tout + 0.5);
        }
      }
      var words = document.querySelectorAll("#" + id + " .word");
      gsap.set(words, { yPercent: 105, autoAlpha: 0 });
      words.forEach(function (w, i) {
        tl.set(w, { autoAlpha: 1 }, times[i]);
        tl.to(w, { yPercent: 0, duration: 0.45, ease: "power3.out" }, times[i]);
        var end = i < words.length - 1 ? times[i + 1] - 0.34 : tout;
        if (end != null) {
          tl.to(w, { yPercent: -105, duration: 0.3, ease: "power2.in" }, end);
          tl.set(w, { autoAlpha: 0 }, end + 0.31);
        }
      });
    };

    /* O lumină în culoarea accentului care aleargă pe un path; pozițiile se precalculează (fără măsurători la randare). */
    api.scanteie = function (pathId, t, dur, o) {
      o = o || {};
      var path = $(pathId), L = path.getTotalLength(), N = 600, LUT = [];
      for (var i = 0; i <= N; i++) { var p = path.getPointAtLength(L * i / N); LUT.push([p.x, p.y]); }
      var cam = $("cam");
      var halo = el("circle", { r: 22, "class": "spark-halo", filter: "url(#soft)" }, cam);
      var core = el("circle", { r: 7, "class": "spark-core" }, cam);
      var st = { p: 0 };
      function place() {
        var f = st.p * N, i0 = Math.min(Math.floor(f), N - 1), u = f - i0;
        var x = LUT[i0][0] + (LUT[i0 + 1][0] - LUT[i0][0]) * u, y = LUT[i0][1] + (LUT[i0 + 1][1] - LUT[i0][1]) * u;
        core.setAttribute("cx", x.toFixed(2)); core.setAttribute("cy", y.toFixed(2));
        halo.setAttribute("cx", x.toFixed(2)); halo.setAttribute("cy", y.toFixed(2));
      }
      place();
      gsap.set([core, halo], { opacity: 0 });
      tl.to([core, halo], { opacity: 1, duration: 0.25 }, t);
      tl.to(st, { p: 1, duration: dur, ease: o.ease || "none", onUpdate: place }, t);
      tl.to([core, halo], { opacity: 0, duration: 0.25 }, t + dur);
      /* momentul în care lumina trece prin fracțiunea f a traseului */
      return function (f) { return t + dur * f; };
    };

    /* Rețeaua „sistemului”: din fiecare punct din din se naște un nod; nodurile se așază în poligon
     * în jurul unui centru în accent, apoi o lumină trece prin ele și pune bife.
     * o = { nastere: t, scanteie: [t, dur] sau null, retrag: t, centru: [x, y], raza } */
    api.retea = function (gId, din, o) {
      var g = $(gId), C = o.centru || [540, 1080], R = o.raza || 290, n = din.length, t0 = o.nastere;
      var gE = el("g", {}, g), route = el("path", { "class": "c", d: "" }, g), gN = el("g", {}, g), gC = el("g", {}, g);
      var P = [];
      for (var k = 0; k < n; k++) { var a = (-90 + 360 / n * k) * Math.PI / 180; P.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]); }
      var edges = [];
      P.forEach(function (p, i) {
        edges.push(el("line", { x1: C[0], y1: C[1], x2: p[0], y2: p[1], "class": "w" }, gE));
        var p2 = P[(i + 1) % n];
        edges.push(el("line", { x1: p[0], y1: p[1], x2: p2[0], y2: p2[1], "class": "w" }, gE));
      });
      edges.forEach(prepDash);
      var nodes = P.map(function (p, i) { return el("circle", { cx: din[i][0], cy: din[i][1], r: 18, "class": "node" }, gN); });
      var hub = el("circle", { cx: C[0], cy: C[1], r: 34, "class": "hub" }, gN);
      var checks = P.map(function (p) { return prepDash(el("path", { d: "M" + (p[0] - 9) + " " + p[1] + " l6 7 l12 -14", "class": "c" }, gC)); });
      var rd = "M" + P[0].join(" "); for (var q = 1; q <= n; q++) rd += " L" + P[q % n].join(" ");
      route.setAttribute("d", rd);

      nodes.forEach(function (nd, i) {
        tl.from(nd, { scale: 0, svgOrigin: din[i].join(" "), duration: 0.4, ease: "back.out(2)" }, t0 + i * 0.05);
        tl.to(nd, { attr: { cx: P[i][0], cy: P[i][1] }, duration: 1.2, ease: "power3.inOut" }, t0 + 0.5);
      });
      tl.from(hub, { scale: 0, svgOrigin: C.join(" "), duration: 0.6, ease: "back.out(1.8)" }, t0 + 1.4);
      tl.to(edges, { strokeDashoffset: 0, duration: 0.7, ease: "power2.out", stagger: 0.06 }, t0 + 1.6);
      api.linie(route, t0 + 2.6, 1.4, { retrag: o.retrag });
      var cand = null;
      if (o.scanteie) {
        var ts = o.scanteie[0], td = o.scanteie[1];
        cand = api.scanteie(route, ts, td);
        checks.forEach(function (c, i) {
          var at = cand(i / n) + (i === 0 ? 0.05 : 0);
          tl.to(nodes[i], { attr: { r: 24 }, duration: 0.15, ease: "power2.out" }, at);
          tl.to(nodes[i], { attr: { r: 18 }, duration: 0.4, ease: "power2.inOut" }, at + 0.15);
          tl.to(c, { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" }, at + 0.1);
        });
        tl.to(hub, { attr: { r: 40 }, duration: 0.6, ease: "sine.inOut", yoyo: true, repeat: Math.max(1, Math.round(td / 0.6) - 1) }, ts);
      }
      if (o.retrag != null) {
        var r = o.retrag;
        tl.to(edges.concat(checks), { strokeDashoffset: function (j, e) { return -parseFloat(e.dataset.len); }, duration: 0.8, ease: "power2.in", stagger: 0.02 }, r);
        tl.set([gE, gC], { autoAlpha: 0 }, r + 1.0);
        tl.to(nodes.concat([hub]), { scale: 0, svgOrigin: C.join(" "), opacity: 0, duration: 0.7, ease: "power2.in" }, r + 0.3);
      }
      return { noduri: P, hub: C, cand: cand };
    };

    api.semnatura = function (id, text, t, dur) { sig = { el: $(id), text: text, t: t, dur: dur }; };

    /* Atmosfera: ceața stinsă (35%) până la aprinde, apoi se luminează; derivă lent tot filmul;
     * camera se împinge lent. Cu mod "plin" nu există ceață, granulație sau împingere. */
    api.atmosfera = function (o) {
      o = o || {};
      if (o.mod === "plin") return;
      if (o.aprinde != null) {
        gsap.set(["#glow-a", "#glow-b"], { opacity: 0.35 });
        tl.to("#glow-a", { opacity: 1, duration: 4, ease: "sine.inOut" }, o.aprinde);
        tl.to("#glow-b", { opacity: 1, duration: 4, ease: "sine.inOut" }, o.aprinde + 0.5);
      } else {
        tl.from(["#glow-a", "#glow-b"], { opacity: 0, scale: 0.85, duration: 1.6, ease: "power2.out", stagger: 0.3 }, 0);
      }
      tl.to("#glow-a", { x: 60, y: 40, duration: duration / 2, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
      tl.to("#glow-b", { x: -80, duration: duration / 2, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
      tl.fromTo("#cam", { scale: 1 }, { scale: o.impingere || 1.04, svgOrigin: "540 1080", duration: duration, ease: "none" }, 0);
    };

    /* Motorul pur de timp: traseele, semnătura, granulația. Se adaugă ultimul. */
    api.gata = function () {
      var nt = $("noise-t");
      function frame(t) {
        sets.forEach(function (s) { renderSet(s, t); });
        if (sig) {
          var n = Math.floor(clamp((t - sig.t) / sig.dur) * sig.text.length);
          sig.el.textContent = sig.text.slice(0, n) + (t > sig.t && Math.floor(t * 3) % 2 === 0 ? "_" : "");
        }
        if (nt) nt.setAttribute("seed", String(1 + (Math.floor(t * 12) % 8)));
      }
      frame(0);
      tl.to({}, { duration: duration, onUpdate: function () { frame(tl.time()); } }, 0);
    };
    return api;
  }

  window.Linia = { start: start };
})();
