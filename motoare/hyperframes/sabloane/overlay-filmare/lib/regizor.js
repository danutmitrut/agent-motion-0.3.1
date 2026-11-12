/* Regizorul de la randare al lui overlay-filmare: citește planul (window.__MG_PLAN, același conținut cu build/plan.json)
 * și cheamă Miscari într-o ordine fixă: fiecare element cu pașii lui, apoi pașii subtitrărilor, apoi gata.
 * Nu calculează timpi: fiecare valoare vine din plan.mjs. */
(function () {
  var P = window.__MG_PLAN;
  var M = window.Miscari.start(P.durata, window.__MG_CULORI);
  function pas(p) {
    switch (p.efect) {
      case "apare": M.apare(p.tinta, p.t, p.dur, p.x, p.y, p.ease); break;
      case "iese": M.iese(p.tinta, p.t, p.dur, p.x, p.y, p.ease); break;
      case "numara": M.numara(p.tinta, p.t, p.dur, { valoare: p.valoare, zecimale: p.zecimale, prefix: p.prefix, sufix: p.sufix }); break;
      case "grup": M.grup(p.tinta, p.t, p.dur, p.iesire); break;
      case "cuvant": M.cuvant(p.tinta, p.t, p.dur); break;
      default: throw new Error("Efect necunoscut în plan: " + p.efect);
    }
  }
  P.elemente.forEach(function (e) {
    M.element("#e" + e.n, e.start, e.sfarsit, e.tip === "final");
    e.pasi.forEach(pas);
  });
  P.subtitrari.pasi.forEach(pas);
  M.gata();
})();
