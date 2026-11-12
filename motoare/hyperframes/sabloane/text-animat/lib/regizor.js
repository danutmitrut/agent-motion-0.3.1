/* Regizorul de la randare al lui text-animat: citește planul (window.__MG_PLAN, același conținut cu build/plan.json)
 * și cheamă Miscari într-o ordine fixă: atmosfera, apoi fiecare scenă cu pașii ei, apoi gata. Nu calculează timpi:
 * fiecare valoare vine din plan.mjs. */
(function () {
  var P = window.__MG_PLAN;
  var M = window.Miscari.start(P.durata);
  M.atmosfera({ mod: P.atmosfera.mod, impingere: P.atmosfera.impingere, inaltime: P.inaltime });
  P.scene.forEach(function (s) {
    M.scena(s.id, s.start, s.sfarsit, s.ultima, s.deriva, P.iesire);
    s.pasi.forEach(function (p) {
      switch (p.efect) {
        case "apare": M.apare(p.tinta, p.t, p.dur, p.x, p.y, p.ease); break;
        case "masca": M.masca(p.tinta, p.t, p.dur, p.ease); break;
        case "iese": M.iese(p.tinta, p.t, p.dur); break;
        case "scala": M.scala(p.tinta, p.t, p.dur, p.de); break;
        case "bifa": M.bifa(p.tinta, p.t, p.dur); break;
        case "numara": M.numara(p.tinta, p.t, p.dur, { valoare: p.valoare, zecimale: p.zecimale, prefix: p.prefix, sufix: p.sufix }); break;
        case "tasteaza": M.tasteaza(p.tinta, p.t, p.dur, p.text); break;
        default: throw new Error("Efect necunoscut în plan: " + p.efect);
      }
    });
  });
  M.gata();
})();
