// Vectorizarea de contur a lui mg genereaza (felia 5, decizia lui Dănuț din 2026-10-26): desenul generat devine o formă
// umplută, ca Open Peeps, nu un traseu. Cerneala (zonele închise) dă trasee umplute cu găuri (fill-rule evenodd), iar
// silueta (tot ce nu e fundal legat de margine) dă forma albă din spate. Tot în Node, fără binar și fără dependențe,
// ca să meargă la fel pe Windows fără drepturi de administrator (decizia din 2026-10-03 rămâne pentru traseele din kit).

/** Pragurile implicite; testele și calibrarea le pot schimba. */
export const OPTIUNI_IMPLICITE = Object.freeze({
  pragCerneala: 128, // gri sub prag = cerneală
  ariaMinima: 0.00004, // componentele (și găurile) mai mici de atât din imagine se șterg
  toleranta: 0.9, // px, simplificarea Ramer-Douglas-Peucker
  margine: 12, // px în jurul siluetei, în viewBox
  maxTrasee: 400, // peste atâtea pete de cerneală, imaginea nu e un desen curat
  inchidere: 0.005, // din latura mare: golurile mai înguste de ~2x atât din contur se închid, doar pentru siluetă
  grosimeMaxima: 0.06, // din latura desenului: peste atât, cerneala e o pată plină, nu o linie
  pata: 0.007, // din latura mare: cerneala mai groasă de ~2x atât (păr, pantaloni) iese și ca pată, gri pe noapte
});

/**
 * O trecere a ferestrei pătrate de latură 2r+1, pe rânduri sau pe coloane; în afara imaginii nu e cerneală.
 * dilata: 1 dacă fereastra are măcar un 1; altfel (eroziune): 1 doar dacă e toată 1.
 */
function fereastra(src, latime, inaltime, r, orizontal, dilata) {
  const dst = new Uint8Array(src.length);
  const [n, linii, pas, pasLinie] = orizontal ? [latime, inaltime, 1, latime] : [inaltime, latime, latime, 1];
  for (let l = 0; l < linii; l++) {
    const baza = l * pasLinie;
    let s = 0;
    for (let j = 0; j < Math.min(r, n); j++) s += src[baza + j * pas];
    for (let i = 0; i < n; i++) {
      if (i + r < n) s += src[baza + (i + r) * pas];
      if (i - r - 1 >= 0) s -= src[baza + (i - r - 1) * pas];
      dst[baza + i * pas] = dilata ? (s > 0 ? 1 : 0) : (s === 2 * r + 1 ? 1 : 0);
    }
  }
  return dst;
}

/** Deschiderea morfologică (eroziune, apoi dilatare): păstrează doar zonele mai groase decât fereastra. */
function deschide(m, latime, inaltime, r) {
  const e = fereastra(fereastra(m, latime, inaltime, r, true, false), latime, inaltime, r, false, false);
  return fereastra(fereastra(e, latime, inaltime, r, true, true), latime, inaltime, r, false, true);
}

/** Închiderea morfologică (dilatare, apoi eroziune): leagă golurile mici dintr-un contur, fără să-l îngroașe. */
function inchide(m, latime, inaltime, r) {
  if (r < 1) return m;
  const d = fereastra(fereastra(m, latime, inaltime, r, true, true), latime, inaltime, r, false, true);
  return fereastra(fereastra(d, latime, inaltime, r, true, false), latime, inaltime, r, false, false);
}

/** Marchează componentele 4-conexe ale unei măști și le șterge (sau umple) pe cele mai mici decât `arieMin`. */
function curataComponente(masca, latime, inaltime, valoare, arieMin) {
  const vazut = new Uint8Array(masca.length);
  const coada = new Int32Array(masca.length);
  let numar = 0;
  for (let start = 0; start < masca.length; start++) {
    if (masca[start] !== valoare || vazut[start]) continue;
    let cap = 0;
    let coadaLungime = 0;
    coada[coadaLungime++] = start;
    vazut[start] = 1;
    while (cap < coadaLungime) {
      const p = coada[cap++];
      const x = p % latime;
      const vecini = [x > 0 ? p - 1 : -1, x < latime - 1 ? p + 1 : -1, p >= latime ? p - latime : -1, p + latime < masca.length ? p + latime : -1];
      for (const v of vecini) {
        if (v >= 0 && !vazut[v] && masca[v] === valoare) {
          vazut[v] = 1;
          coada[coadaLungime++] = v;
        }
      }
    }
    if (coadaLungime < arieMin) {
      for (let k = 0; k < coadaLungime; k++) masca[coada[k]] = valoare ? 0 : 1;
    } else numar++;
  }
  return numar;
}

/** Fundalul: pixelii fără cerneală legați 4-conex de marginea imaginii. */
function fundal(cerneala, latime, inaltime) {
  const f = new Uint8Array(cerneala.length);
  const coada = new Int32Array(cerneala.length);
  let n = 0;
  const pune = (p) => {
    if (!f[p] && !cerneala[p]) {
      f[p] = 1;
      coada[n++] = p;
    }
  };
  for (let x = 0; x < latime; x++) { pune(x); pune((inaltime - 1) * latime + x); }
  for (let y = 0; y < inaltime; y++) { pune(y * latime); pune(y * latime + latime - 1); }
  for (let cap = 0; cap < n; cap++) {
    const p = coada[cap];
    const x = p % latime;
    if (x > 0) pune(p - 1);
    if (x < latime - 1) pune(p + 1);
    if (p >= latime) pune(p - latime);
    if (p + latime < cerneala.length) pune(p + latime);
  }
  return f;
}

// direcțiile: 0 dreapta, 1 jos, 2 stânga, 3 sus (y crește în jos)
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Contururile închise ale unei măști, pe muchiile pixelilor, cu interiorul în dreapta (sensul acelor de ceasornic pe
 * ecran). La un vârf în șa se virează la dreapta, deci interiorul e 4-conex, la fel ca la curataComponente.
 * @returns {Array<Array<[number, number]>>} buclele, ca mijloace de muchii
 */
export function traseazaContururi(masca, latime, inaltime) {
  const W1 = latime + 1;
  const iesiri = new Uint8Array(W1 * (inaltime + 1));
  const inauntru = (x, y) => x >= 0 && y >= 0 && x < latime && y < inaltime && masca[y * latime + x] === 1;
  for (let y = 0; y < inaltime; y++) {
    for (let x = 0; x < latime; x++) {
      if (!inauntru(x, y)) continue;
      if (!inauntru(x, y - 1)) iesiri[y * W1 + x] |= 1 << 0;
      if (!inauntru(x + 1, y)) iesiri[y * W1 + x + 1] |= 1 << 1;
      if (!inauntru(x, y + 1)) iesiri[(y + 1) * W1 + x + 1] |= 1 << 2;
      if (!inauntru(x - 1, y)) iesiri[(y + 1) * W1 + x] |= 1 << 3;
    }
  }
  const alege = (biti, intrare) => {
    for (const d of [(intrare + 1) % 4, intrare, (intrare + 3) % 4]) if (biti & (1 << d)) return d;
    return -1;
  };
  const bucle = [];
  for (let v0 = 0; v0 < iesiri.length; v0++) {
    while (iesiri[v0]) {
      let d = 0;
      while (!(iesiri[v0] & (1 << d))) d++;
      const d0 = d;
      let x = v0 % W1;
      let y = (v0 - x) / W1;
      const puncte = [];
      for (let pasi = 0; pasi < iesiri.length * 4; pasi++) {
        const v = y * W1 + x;
        iesiri[v] &= ~(1 << d);
        puncte.push([x + DX[d] / 2, y + DY[d] / 2]);
        x += DX[d];
        y += DY[d];
        const urmator = y * W1 + x;
        if (urmator === v0 && alege(iesiri[v0] | (1 << d0), d) === d0) break;
        d = alege(iesiri[urmator], d);
        if (d < 0) break;
      }
      if (puncte.length >= 4) bucle.push(puncte);
    }
  }
  return bucle;
}

/** Aria cu semn (pozitivă pentru buclele exterioare, cu interiorul în dreapta pe ecran). */
export function arieCuSemn(p) {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return s / 2;
}

function distantaSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function rdp(puncte, toleranta) {
  if (puncte.length < 3) return puncte;
  const pastreaza = new Uint8Array(puncte.length);
  pastreaza[0] = 1;
  pastreaza[puncte.length - 1] = 1;
  const stiva = [[0, puncte.length - 1]];
  while (stiva.length) {
    const [a, b] = stiva.pop();
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distantaSegment(puncte[i], puncte[a], puncte[b]);
      if (d > max) { max = d; idx = i; }
    }
    if (idx >= 0 && max > toleranta) {
      pastreaza[idx] = 1;
      stiva.push([a, idx], [idx, b]);
    }
  }
  return puncte.filter((_, i) => pastreaza[i]);
}

/** Netezește bucla (media cu vecinii), apoi o simplifică, tăiată în două la punctul cel mai depărtat de început. */
export function simplificaBucla(bucla, toleranta) {
  const n = bucla.length;
  const neted = bucla.map((_, i) => {
    const a = bucla[(i - 1 + n) % n];
    const b = bucla[i];
    const c = bucla[(i + 1) % n];
    return [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
  });
  let departe = 0;
  let max = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(neted[i][0] - neted[0][0], neted[i][1] - neted[0][1]);
    if (d > max) { max = d; departe = i; }
  }
  const prima = rdp(neted.slice(0, departe + 1), toleranta);
  const adoua = rdp([...neted.slice(departe), neted[0]], toleranta);
  return [...prima.slice(0, -1), ...adoua.slice(0, -1)];
}

const r1 = (v) => {
  const s = (Math.round(v * 10) / 10).toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

/** O buclă închisă ca drum SVG neted: Catmull-Rom transformat în Bézier cubice. */
export function drumNeted(p, [ox, oy]) {
  const n = p.length;
  const q = (i) => p[(i + n) % n];
  const pt = (x, y) => `${r1(x - ox)} ${r1(y - oy)}`;
  let d = `M${pt(q(0)[0], q(0)[1])}`;
  if (n < 4) {
    for (let i = 1; i < n; i++) d += `L${pt(q(i)[0], q(i)[1])}`;
    return `${d}Z`;
  }
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [q(i - 1), q(i), q(i + 1), q(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${pt(c1[0], c1[1])} ${pt(c2[0], c2[1])} ${pt(p2[0], p2[1])}`;
  }
  return `${d}Z`;
}

function inPoligon([x, y], poligon) {
  let in_ = false;
  for (let i = 0, j = poligon.length - 1; i < poligon.length; j = i++) {
    const [xi, yi] = poligon[i];
    const [xj, yj] = poligon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) in_ = !in_;
  }
  return in_;
}

/** Grupează buclele: fiecare exterioară cu găurile ei, ca un singur traseu evenodd. */
function grupeaza(bucle) {
  const exterioare = [];
  const gauri = [];
  for (const b of bucle) {
    const a = arieCuSemn(b);
    if (a > 0) exterioare.push({ bucla: b, arie: a, gauri: [] });
    else if (a < 0) gauri.push(b);
  }
  exterioare.sort((a, b) => a.arie - b.arie);
  for (const g of gauri) {
    const proba = g[0];
    const gazda = exterioare.find((e) => inPoligon(proba, e.bucla));
    if (gazda) gazda.gauri.push(g);
  }
  // ordinea de desen: de sus în jos, apoi de la stânga, ca linia să curgă natural
  // fără Math.min(...): o buclă cu sute de mii de puncte depășește stiva
  const sus = (e) => e.bucla.reduce((m, p) => (p[1] < m ? p[1] : m), Infinity);
  return exterioare.sort((a, b) => sus(a) - sus(b) || a.bucla[0][0] - b.bucla[0][0]);
}

export class DesenNefolosibil extends Error {}

/**
 * Imaginea (gri) → SVG cu silueta albă și cerneala neagră, gata pentru normalizeazaSvg din mg desen adauga.
 * Silueta e tot ce închide cerneala, după ce golurile mici din contur se leagă. Un desen cu linie subțire care rămâne
 * deschis (tăiat de margine, cu un gol mare) iese doar cu cerneală, cu `avertisment`; o pată plină e refuzată.
 * Zonele groase de cerneală (păr, pantaloni) se repetă deasupra, în drumuri cu clasa `pata`: pe panoul inversat de pe
 * noapte, cerneala ia culoarea fundalului, iar petele ar dispărea în el; reelul le dă acolo un gri (decizia din 2026-10-26).
 * @param {{latime: number, inaltime: number, gri: Uint8Array}} img
 * @param {Partial<typeof OPTIUNI_IMPLICITE>} [optiuni]
 * @returns {{svg: string, trasee: number, acoperire: number | null, cutie: {w: number, h: number}, avertisment?: string}}
 */
export function vectorizeaza({ latime, inaltime, gri }, optiuni = {}) {
  const o = { ...OPTIUNI_IMPLICITE, ...optiuni };
  const arieMin = Math.max(4, Math.round(o.ariaMinima * latime * inaltime));
  const cerneala = new Uint8Array(gri.length);
  for (let i = 0; i < gri.length; i++) cerneala[i] = gri[i] < o.pragCerneala ? 1 : 0;
  curataComponente(cerneala, latime, inaltime, 1, arieMin);
  curataComponente(cerneala, latime, inaltime, 0, arieMin);
  const f = fundal(inchide(cerneala, latime, inaltime, Math.round(o.inchidere * Math.max(latime, inaltime))), latime, inaltime);
  const silueta = new Uint8Array(gri.length);
  let ariaSiluetei = 0;
  let ariaCernelii = 0;
  let perimetru = 0;
  let x0 = latime, y0 = inaltime, x1 = -1, y1 = -1;
  for (let i = 0; i < gri.length; i++) {
    const x = i % latime;
    if (cerneala[i]) {
      ariaCernelii++;
      perimetru += (x === 0 || !cerneala[i - 1]) + (x === latime - 1 || !cerneala[i + 1])
        + (i < latime || !cerneala[i - latime]) + (i + latime >= gri.length || !cerneala[i + latime]);
    }
    if (f[i]) continue;
    silueta[i] = 1;
    ariaSiluetei++;
    const y = (i - x) / latime;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (ariaSiluetei === 0) throw new DesenNefolosibil('imaginea nu are niciun desen (doar fundal alb)');
  const acoperire = ariaCernelii / ariaSiluetei;
  if (ariaSiluetei > 0.97 * latime * inaltime) throw new DesenNefolosibil('desenul atinge marginile imaginii sau are fundal închis');
  const grupuriCerneala = grupeaza(traseazaContururi(cerneala, latime, inaltime));
  if (grupuriCerneala.length > o.maxTrasee) {
    throw new DesenNefolosibil(`desenul are ${grupuriCerneala.length} pete de cerneală separate (peste ${o.maxTrasee}); e prea zgomotos pentru o piesă`);
  }
  // în bibliotecă, cea mai plină piesă are 0,705; peste 0,8 cerneala nu închide nimic: e o pată plină sau un desen deschis
  let avertisment;
  let grupuriSilueta = [];
  if (acoperire > 0.8) {
    // grosimea medie a cernelii, 2 x aria / perimetru: la o linie de pensulă e mică față de desen, la o pată nu
    const grosime = (2 * ariaCernelii) / Math.max(1, perimetru);
    if (grosime > o.grosimeMaxima * Math.max(x1 - x0 + 1, y1 - y0 + 1)) {
      throw new DesenNefolosibil(`cerneala acoperă ${Math.round(acoperire * 100)}% din desen; arată ca o siluetă plină sau o fotografie, nu ca un desen cu linie`);
    }
    avertisment = 'conturul desenului nu se închide (desenul e tăiat de margine sau are un gol mare), deci n-are silueta albă: în film apare doar linia, fără fondul de autocolant';
  } else {
    // silueta: doar contururile exterioare (găurile ei ar fi fundal, deci nu există)
    grupuriSilueta = grupeaza(traseazaContururi(silueta, latime, inaltime));
  }

  const pete = deschide(cerneala, latime, inaltime, Math.round(o.pata * Math.max(latime, inaltime)));
  curataComponente(pete, latime, inaltime, 1, arieMin);
  const grupuriPete = grupeaza(traseazaContururi(pete, latime, inaltime));

  const ox = Math.max(0, x0 - o.margine);
  const oy = Math.max(0, y0 - o.margine);
  const w = Math.min(latime, x1 + 1 + o.margine) - ox;
  const h = Math.min(inaltime, y1 + 1 + o.margine) - oy;
  const drum = (g) => [g.bucla, ...g.gauri].map((b) => drumNeted(simplificaBucla(b, o.toleranta), [ox, oy])).join('');
  const randuri = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`,
    ...grupuriSilueta.map((g) => `<path fill="#ffffff" d="${drum(g)}"/>`),
    ...grupuriCerneala.map((g) => `<path fill="#000000" fill-rule="evenodd" d="${drum(g)}"/>`),
    ...grupuriPete.map((g) => `<path class="pata" fill="#000000" fill-rule="evenodd" d="${drum(g)}"/>`),
    '</svg>',
  ];
  const rezultat = { svg: `${randuri.join('\n')}\n`, trasee: grupuriCerneala.length, pete: grupuriPete.length, acoperire: avertisment ? null : Math.round(acoperire * 1000) / 1000, cutie: { w, h } };
  return avertisment ? { ...rezultat, avertisment } : rezultat;
}
