/* Mișcările șablonului overlay-filmare: efectele pe timeline-ul GSAP al compoziției (window.__timelines.main).
 * Regizorul (lib/regizor.js) le cheamă din plan, cu timpi absoluți; aici nu se calculează timpi și nu se iau decizii.
 * Reguli (ca la text-animat; le verifică teste/runtime.test.mjs): nimic aleator, nimic legat de ceasul sistemului,
 * tween-uri fromTo cu valori absolute, iar numărarea se calculează din timpul cadrului, în gata().
 * Filmarea nu e atinsă: <video> și <audio> le redă HyperFrames din atributele data-*.
 * Comentariile sunt doar de tip bloc.
 *
 *   var M = Miscari.start(durata, { text, accent });
 *   M.element(tinta, start, sfarsit, final);
 *   M.apare(tinta, t, dur, x, y, ease);   M.iese(tinta, t, dur, x, y, ease);
 *   M.numara(tinta, t, dur, { valoare, zecimale, prefix, sufix });
 *   M.grup(tinta, t, dur, iesire);        M.cuvant(tinta, t, dur);
 *   M.gata();
 */
(function () {
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* formatarea românească scrisă de mână (copia lui formateazaNumar din tipuri.mjs; testul runtime.test.mjs le compară) */
  function formatRo(x, zecimale) {
    var parti = Math.abs(x).toFixed(zecimale || 0).split(".");
    var grupat = parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (x < 0 ? "-" : "") + grupat + (parti[1] ? "," + parti[1] : "");
  }

  function start(durata, culori) {
    var tl = gsap.timeline({ paused: true });
    window.__timelines = window.__timelines || {};
    window.__timelines["main"] = tl;
    var numaratori = [], api = {};

    /* elementul e ascuns până la start și după sfârșit (finalul rămâne până la capăt) */
    api.element = function (tinta, start, sfarsit, final) {
      gsap.set(tinta, { autoAlpha: 0 });
      tl.set(tinta, { autoAlpha: 1 }, start);
      if (!final) tl.set(tinta, { autoAlpha: 0 }, sfarsit);
    };

    api.apare = function (tinta, t, dur, x, y, ease) {
      tl.fromTo(tinta, { autoAlpha: 0, x: x, y: y }, { autoAlpha: 1, x: 0, y: 0, duration: dur, ease: ease }, t);
    };

    api.iese = function (tinta, t, dur, x, y, ease) {
      tl.fromTo(tinta, { autoAlpha: 1, x: 0, y: 0 }, { autoAlpha: 0, x: x, y: y, duration: dur, ease: ease, immediateRender: false }, t);
    };

    api.numara = function (tinta, t, dur, o) {
      numaratori.push({ el: document.querySelector(tinta), t: t, dur: dur, o: o });
    };

    /* grupul de subtitrare apare pe loc la t și se stinge în ultimele `iesire` secunde ale ferestrei lui */
    api.grup = function (tinta, t, dur, iesire) {
      gsap.set(tinta, { autoAlpha: 0 });
      tl.set(tinta, { autoAlpha: 1 }, t);
      tl.fromTo(tinta, { autoAlpha: 1 }, { autoAlpha: 0, duration: iesire, ease: "none", immediateRender: false }, t + dur - iesire);
    };

    /* cuvântul activ: în culoarea de accent cât e rostit */
    api.cuvant = function (tinta, t, dur) {
      tl.set(tinta, { color: culori.accent }, t);
      tl.set(tinta, { color: culori.text }, t + dur);
    };

    /* motorul pur de timp: numărarea; se adaugă ultimul */
    api.gata = function () {
      function cadru(t) {
        numaratori.forEach(function (n) {
          var p = clamp((t - n.t) / n.dur);
          var v = p >= 1 ? n.o.valoare : n.o.valoare * (1 - (1 - p) * (1 - p));
          n.el.textContent = (n.o.prefix || "") + formatRo(v, n.o.zecimale) + (n.o.sufix || "");
        });
      }
      cadru(0);
      tl.to({}, { duration: durata, onUpdate: function () { cadru(tl.time()); } }, 0);
    };
    return api;
  }

  window.Miscari = { start: start, formatRo: formatRo };
})();
