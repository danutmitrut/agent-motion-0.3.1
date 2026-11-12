/* Regizorul de la randare al șablonului reel-ilustrat.
 * Citește planul pus de compileaza.mjs în window.__MG_PLAN (același conținut cu build/plan.json)
 * și desenele înghețate din window.__MG_DESENE, apoi apelează Linia într-o ordine fixă.
 * Nu calculează timpi și nu ia decizii: fiecare valoare vine din plan, scris de plan.mjs. */
(function () {
  var P = window.__MG_PLAN;
  var D = window.__MG_DESENE;
  var L = Linia.start(P.durata);

  function desenul(g) {
    for (var i = 0; i < P.desene.length; i++) if (P.desene[i].g === g) return P.desene[i];
    return null;
  }
  function repeta(punct, n) {
    var lista = [];
    for (var i = 0; i < n; i++) lista.push([punct[0], punct[1]]);
    return lista;
  }

  L.atmosfera({ mod: P.atmosfera.mod, aprinde: P.atmosfera.aprinde, impingere: P.atmosfera.impingere });

  (P.panouri || []).forEach(function (p) {
    var d = desenul(p.pentru);
    L.panou(p.pentru, { cutie: p.cutie, culoare: p.culoare, draw: d.draw, undraw: d.undraw });
  });

  P.desene.forEach(function (d) {
    var o = { x: d.x, y: d.y, s: d.s, oglindit: d.oglindit, draw: d.draw, undraw: d.undraw,
      animatie: d.animatie, esalonare: d.esalonare };
    if (d.tip === "traseu") L.desen(d.g, D[d.id], o);
    else L.forma(d.g, D[d.id], o);
  });

  var centre = {};
  P.iconite.forEach(function (i) {
    centre[i.g] = L.iconite(i.g, i.pozitii, { scara: i.scara, apar: i.apar, tremura: i.tremura, retrag: i.retrag });
  });

  P.retele.forEach(function (r) {
    var din = r.din ? centre[r.din] : repeta(r.centru, r.noduri);
    L.retea(r.g, din, { nastere: r.nastere, scanteie: r.scanteie, retrag: r.retrag, centru: r.centru, raza: r.raza });
  });

  P.linii.forEach(function (l) { L.linie(l.id, l.t, l.dur); });

  P.carduri.forEach(function (c) {
    if (c.cuvinte) {
      L.cuvinte("cuvinte-" + c.id, c.cuvinte.map(function (w) { return w.t; }), c.iese, { card: c.id });
    } else {
      L.card(c.id, c.intra, c.iese);
    }
  });

  if (P.cta) L.card("cta", P.cta.intra, null);
  if (P.semnatura) L.semnatura("sig", P.semnatura.text, P.semnatura.t, P.semnatura.dur);
  L.gata();
})();
