/* Mișcările șablonului text-animat: efectele pe timeline-ul GSAP al compoziției (window.__timelines.main).
 * Regizorul (lib/regizor.js) le cheamă din plan, cu timpi absoluți; aici nu se calculează timpi și nu se iau decizii.
 * Reguli (ca la linia.js din reel; le verifică teste/runtime.test.mjs): nimic aleator, nimic legat de ceasul sistemului,
 * tween-uri fromTo cu valori absolute, iar numărarea, tastarea și granulația se calculează din timpul cadrului, în gata().
 * Comentariile sunt doar de tip bloc.
 *
 *   var M = Miscari.start(durata);
 *   M.atmosfera({ mod, impingere, inaltime });
 *   M.scena(id, start, sfarsit, ultima, deriva, iesire);
 *   M.apare(tinta, t, dur, x, y, ease);   M.masca(tinta, t, dur, ease);   M.iese(tinta, t, dur);
 *   M.scala(tinta, t, dur, de);           M.bifa(tinta, t, dur);
 *   M.numara(tinta, t, dur, { valoare, zecimale, prefix, sufix });   M.tasteaza(tinta, t, dur, text);
 *   M.gata();
 */
(function () {
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* formatarea românească scrisă de mână (copia lui formatRo din cifre.mjs; testul cifre.test.mjs le compară) */
  function formatRo(x, zecimale) {
    var parti = Math.abs(x).toFixed(zecimale || 0).split(".");
    var grupat = parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (x < 0 ? "-" : "") + grupat + (parti[1] ? "," + parti[1] : "");
  }

  function start(durata) {
    var tl = gsap.timeline({ paused: true });
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = tl;
    var numaratori = [], tastari = [], api = {};

    /* scena apare la start, derivă lent în sus pe toată fereastra ei, iar blocurile ies (0,45 s) înainte de sfârșit;
     * după ieșire, autoAlpha 0. Ultima scenă nu iese. */
    api.scena = function (id, start, sfarsit, ultima, deriva, iesire) {
      var s = "#" + id;
      gsap.set(s, { autoAlpha: 0 });
      tl.set(s, { autoAlpha: 1 }, start);
      tl.fromTo(s, { y: 0 }, { y: -deriva, duration: sfarsit - start, ease: "none", immediateRender: false }, start);
      if (!ultima) {
        tl.fromTo(s + " > .bloc", { y: 0, opacity: 1 }, { y: -24, opacity: 0, duration: iesire, ease: "power2.in", immediateRender: false }, sfarsit - iesire);
        tl.set(s, { autoAlpha: 0 }, sfarsit);
      }
    };

    api.apare = function (tinta, t, dur, x, y, ease) {
      tl.fromTo(tinta, { autoAlpha: 0, x: x, y: y }, { autoAlpha: 1, x: 0, y: 0, duration: dur, ease: ease }, t);
    };

    api.masca = function (tinta, t, dur, ease) {
      tl.fromTo(tinta, { yPercent: 105 }, { yPercent: 0, duration: dur, ease: ease }, t);
    };

    api.iese = function (tinta, t, dur) {
      tl.fromTo(tinta, { yPercent: 0, autoAlpha: 1 }, { yPercent: -105, autoAlpha: 0, duration: dur, ease: "power2.in", immediateRender: false }, t);
    };

    api.scala = function (tinta, t, dur, de) {
      tl.fromTo(tinta, { scale: de }, { scale: 1, duration: dur, ease: "power2.out" }, t);
    };

    api.bifa = function (tinta, t, dur) {
      tl.fromTo(tinta, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur, ease: "power2.out" }, t);
    };

    api.numara = function (tinta, t, dur, o) {
      numaratori.push({ el: document.querySelector(tinta), t: t, dur: dur, o: o });
    };

    api.tasteaza = function (tinta, t, dur, text) {
      tastari.push({ el: document.querySelector(tinta), t: t, dur: dur, litere: Array.from(text) });
    };

    /* împingerea lentă a compoziției (1 → impingere pe tot filmul), degradeul care urcă o înălțime de cadru,
     * ceața care derivă (ca L.atmosfera din reel); pe „plin” rămâne doar împingerea */
    api.atmosfera = function (o) {
      tl.fromTo("#compozitie", { scale: 1 }, { scale: o.impingere, transformOrigin: "50% 50%", duration: durata, ease: "none" }, 0);
      if (o.mod === "degrade") {
        tl.fromTo("#degrade", { y: 0 }, { y: -o.inaltime, duration: durata, ease: "none" }, 0);
      }
      if (o.mod === "ceata") {
        tl.fromTo("#glow-a", { x: 0, y: 0 }, { x: 60, y: 40, duration: durata / 2, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
        tl.fromTo("#glow-b", { x: 0 }, { x: -80, duration: durata / 2, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
      }
    };

    /* motorul pur de timp: numărarea, tastarea, granulația; se adaugă ultimul */
    api.gata = function () {
      var nt = document.getElementById("noise-t");
      var cuGranulatie = document.getElementById("root").className.indexOf("plin") < 0;
      function cadru(t) {
        numaratori.forEach(function (n) {
          var p = clamp((t - n.t) / n.dur);
          var v = p >= 1 ? n.o.valoare : n.o.valoare * (1 - (1 - p) * (1 - p));
          n.el.textContent = (n.o.prefix || "") + formatRo(v, n.o.zecimale) + (n.o.sufix || "");
        });
        tastari.forEach(function (s) {
          var k = Math.floor(clamp((t - s.t) / s.dur) * s.litere.length);
          s.el.textContent = s.litere.slice(0, k).join("");
        });
        if (nt && cuGranulatie) nt.setAttribute("seed", String(1 + (Math.floor(t * 12) % 8)));
      }
      cadru(0);
      tl.to({}, { duration: durata, onUpdate: function () { cadru(tl.time()); } }, 0);
    };
    return api;
  }

  window.Miscari = { start: start, formatRo: formatRo };
})();
