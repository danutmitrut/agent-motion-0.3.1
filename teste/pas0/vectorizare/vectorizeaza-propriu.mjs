// Vectorizarea proprie, candidatul (b) al testului de la pasul 0, doar cu module native.
// Pași: citirea PNG, prag, subțiere Zhang-Suen, urmărirea liniei de mijloc pe graful scheletului,
// simplificare (Ramer-Douglas-Peucker), curbe Bézier (Catmull-Rom), apoi aceeași ordonare și
// normalizare ca în kit/linia-continua/tools/vectorizeaza.py.
// Ieșire: {w, h, paths, lengths, origine}, forma citită de linia.js (w, h, paths).
// Folosire: node teste/pas0/vectorizare/vectorizeaza-propriu.mjs <intrare.png> <iesire.json> [--start left|right|bottom]
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { basename } from 'node:path';
import { rulatDirect } from '../../../nucleu/lib/cai.mjs';

export const MIN_LUNGIME = 18; // px în imaginea sursă, ca în vectorizeaza.py

/**
 * Citește un PNG neîntrețesut pe 8 biți (gri, gri cu alfa, RGB, RGBA) și îl întoarce în gri.
 * @param {Buffer} octeti
 * @returns {{latime: number, inaltime: number, pixeli: Uint8Array}}
 */
export function decodificaPng(octeti) {
  const semnatura = '89504e470d0a1a0a';
  if (octeti.subarray(0, 8).toString('hex') !== semnatura) throw new Error('Fișierul nu e PNG.');
  let poz = 8;
  let latime = 0;
  let inaltime = 0;
  let tipCuloare = -1;
  const idat = [];
  while (poz < octeti.length) {
    const lungime = octeti.readUInt32BE(poz);
    const tip = octeti.subarray(poz + 4, poz + 8).toString('latin1');
    const date = octeti.subarray(poz + 8, poz + 8 + lungime);
    if (tip === 'IHDR') {
      latime = date.readUInt32BE(0);
      inaltime = date.readUInt32BE(4);
      const adancime = date[8];
      tipCuloare = date[9];
      const intretesut = date[12];
      if (adancime !== 8) throw new Error(`PNG cu adâncimea ${adancime} nu e acceptat (doar 8 biți).`);
      if (intretesut !== 0) throw new Error('PNG întrețesut nu e acceptat.');
      if (![0, 2, 4, 6].includes(tipCuloare)) throw new Error(`PNG cu tipul de culoare ${tipCuloare} nu e acceptat.`);
    } else if (tip === 'IDAT') {
      idat.push(date);
    } else if (tip === 'IEND') {
      break;
    }
    poz += 12 + lungime;
  }
  const canale = { 0: 1, 2: 3, 4: 2, 6: 4 }[tipCuloare];
  const brut = inflateSync(Buffer.concat(idat));
  const pasRand = latime * canale;
  const rand = new Uint8Array(pasRand);
  const anterior = new Uint8Array(pasRand);
  const pixeli = new Uint8Array(latime * inaltime);
  for (let y = 0; y < inaltime; y++) {
    const inceput = y * (pasRand + 1);
    const filtru = brut[inceput];
    for (let i = 0; i < pasRand; i++) {
      const x = brut[inceput + 1 + i];
      const a = i >= canale ? rand[i - canale] : 0;
      const b = anterior[i];
      const c = i >= canale ? anterior[i - canale] : 0;
      let v;
      if (filtru === 0) v = x;
      else if (filtru === 1) v = x + a;
      else if (filtru === 2) v = x + b;
      else if (filtru === 3) v = x + ((a + b) >> 1);
      else if (filtru === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`Filtru PNG necunoscut: ${filtru}.`);
      rand[i] = v & 0xff;
    }
    for (let xPix = 0; xPix < latime; xPix++) {
      const o = xPix * canale;
      let gri;
      if (canale <= 2) gri = rand[o];
      else gri = Math.round(0.299 * rand[o] + 0.587 * rand[o + 1] + 0.114 * rand[o + 2]);
      if (canale === 2 || canale === 4) {
        const alfa = rand[o + canale - 1];
        gri = Math.round((gri * alfa + 255 * (255 - alfa)) / 255);
      }
      pixeli[y * latime + xPix] = gri;
    }
    anterior.set(rand);
  }
  return { latime, inaltime, pixeli };
}

/** @param {string} cale */
export function citestePng(cale) {
  return decodificaPng(readFileSync(cale));
}

/**
 * @param {{latime: number, inaltime: number, pixeli: Uint8Array}} img
 * @param {number} [nivel] gri sub nivel înseamnă cerneală
 * @returns {Uint8Array} 1 cerneală, 0 fond
 */
export function prag({ pixeli }, nivel = 128) {
  const bin = new Uint8Array(pixeli.length);
  for (let i = 0; i < pixeli.length; i++) bin[i] = pixeli[i] < nivel ? 1 : 0;
  return bin;
}

/**
 * Subțierea Zhang-Suen (1984). Marginea imaginii e tratată ca fond.
 * @param {Uint8Array} bin @param {number} w @param {number} h
 * @returns {Uint8Array} scheletul, gros de 1 px
 */
export function zhangSuen(bin, w, h) {
  const s = Uint8Array.from(bin);
  for (let x = 0; x < w; x++) {
    s[x] = 0;
    s[(h - 1) * w + x] = 0;
  }
  for (let y = 0; y < h; y++) {
    s[y * w] = 0;
    s[y * w + w - 1] = 0;
  }
  const deSters = [];
  let schimbat = true;
  while (schimbat) {
    schimbat = false;
    for (const pas of [0, 1]) {
      deSters.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!s[i]) continue;
          const p2 = s[i - w], p3 = s[i - w + 1], p4 = s[i + 1], p5 = s[i + w + 1];
          const p6 = s[i + w], p7 = s[i + w - 1], p8 = s[i - 1], p9 = s[i - w - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (a !== 1) continue;
          if (pas === 0) {
            if (p2 && p4 && p6) continue;
            if (p4 && p6 && p8) continue;
          } else {
            if (p2 && p4 && p8) continue;
            if (p2 && p6 && p8) continue;
          }
          deSters.push(i);
        }
      }
      if (deSters.length) {
        schimbat = true;
        for (const i of deSters) s[i] = 0;
      }
    }
  }
  return s;
}

const VECINI = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Graful scheletului: noduri = pixeli, muchii = vecini în 8 direcții, fără diagonalele
 * redundante (o diagonală se scoate când cei doi pixeli au un vecin comun pe 4 direcții).
 * Urmărirea consumă muchii, nu pixeli, deci o încrucișare se traversează de două ori.
 * La fiecare nod se alege muchia care continuă cel mai drept direcția de mers.
 * @param {Uint8Array} schelet @param {number} w @param {number} h
 * @returns {Array<Array<[number, number]>>} polilinii în coordonate de pixel (centrul pixelului)
 */
export function urmaresteTrasee(schelet, w, h) {
  const vecini = new Map();
  const are = (x, y) => x >= 0 && y >= 0 && x < w && y < h && schelet[y * w + x] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!are(x, y)) continue;
      const lista = [];
      for (const [dx, dy] of VECINI) {
        if (!are(x + dx, y + dy)) continue;
        if (dx !== 0 && dy !== 0 && (are(x + dx, y) || are(x, y + dy))) continue;
        lista.push((y + dy) * w + (x + dx));
      }
      vecini.set(y * w + x, lista);
    }
  }
  const folosite = new Set();
  const cheie = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const libere = (n) => vecini.get(n).filter((m) => !folosite.has(cheie(n, m)));
  const coord = (n) => [n % w, Math.floor(n / w)];
  const trasee = [];
  const mergi = (start) => {
    const drum = [start];
    let curent = start;
    for (;;) {
      const optiuni = libere(curent);
      if (!optiuni.length) break;
      let ales = optiuni[0];
      if (optiuni.length > 1 && drum.length > 1) {
        const [cx, cy] = coord(curent);
        const [px, py] = coord(drum[Math.max(0, drum.length - 4)]);
        let dx = cx - px;
        let dy = cy - py;
        const n = Math.hypot(dx, dy) || 1;
        dx /= n;
        dy /= n;
        let maxim = -Infinity;
        for (const o of optiuni) {
          const [ox, oy] = coord(o);
          const ex = ox - cx;
          const ey = oy - cy;
          const scor = (ex * dx + ey * dy) / Math.hypot(ex, ey);
          if (scor > maxim) {
            maxim = scor;
            ales = o;
          }
        }
      }
      folosite.add(cheie(curent, ales));
      drum.push(ales);
      curent = ales;
    }
    return drum;
  };
  const noduri = [...vecini.keys()];
  for (const n of noduri) {
    if (vecini.get(n).length === 1 && libere(n).length === 1) trasee.push(mergi(n));
  }
  for (const n of noduri) {
    while (libere(n).length > 0) trasee.push(mergi(n));
  }
  return trasee.filter((d) => d.length > 1).map((d) => d.map((n) => { const [x, y] = coord(n); return [x + 0.5, y + 0.5]; }));
}

/**
 * Ramer-Douglas-Peucker.
 * @param {Array<[number, number]>} puncte @param {number} toleranta
 */
export function simplifica(puncte, toleranta) {
  if (puncte.length < 3) return puncte.slice();
  const pastreaza = new Uint8Array(puncte.length);
  pastreaza[0] = 1;
  pastreaza[puncte.length - 1] = 1;
  const stiva = [[0, puncte.length - 1]];
  while (stiva.length) {
    const [i, j] = stiva.pop();
    const [ax, ay] = puncte[i];
    const [bx, by] = puncte[j];
    const lung = Math.hypot(bx - ax, by - ay);
    let maxim = -1;
    let k = -1;
    for (let m = i + 1; m < j; m++) {
      const [px, py] = puncte[m];
      const d = lung === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / lung;
      if (d > maxim) {
        maxim = d;
        k = m;
      }
    }
    if (maxim > toleranta) {
      pastreaza[k] = 1;
      stiva.push([i, k], [k, j]);
    }
  }
  return puncte.filter((_, i) => pastreaza[i]);
}

/**
 * Polilinie → subtraseu cu segmente Bézier cubice (Catmull-Rom uniform).
 * @param {Array<[number, number]>} p
 * @returns {{start: [number, number], segs: Array<{tip: 'C'|'L', puncte: Array<[number, number]>}>}}
 */
export function inBezier(p) {
  const segs = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    segs.push({ tip: 'C', puncte: [c1, c2, p2] });
  }
  return { start: p[0], segs };
}

/** Capătul unui subtraseu. */
export function capat(s) {
  return s.segs[s.segs.length - 1].puncte.at(-1);
}

/** Lungimea pe coardă, ca length() din vectorizeaza.py. */
export function lungime(s) {
  let total = 0;
  let p = s.start;
  for (const seg of s.segs) {
    const q = seg.puncte.at(-1);
    total += Math.hypot(q[0] - p[0], q[1] - p[1]);
    p = q;
  }
  return total;
}

/** Același subtraseu, parcurs invers (ca reverse() din vectorizeaza.py). */
export function inversa(s) {
  const capete = [s.start, ...s.segs.map((seg) => seg.puncte.at(-1))];
  const segs = [];
  for (let k = s.segs.length - 1; k >= 0; k--) {
    const { tip, puncte } = s.segs[k];
    const tinta = capete[k];
    segs.push(tip === 'C' ? { tip: 'C', puncte: [puncte[1], puncte[0], tinta] } : { tip: 'L', puncte: [tinta] });
  }
  return { start: capat(s), segs };
}

/**
 * Ordonarea din vectorizeaza.py: primul pornește dinspre intrare, apoi mereu cel mai apropiat, întors dacă ajută.
 * @param {Array<object>} subtrasee @param {'left'|'right'|'bottom'} mod
 */
export function ordoneaza(subtrasee, mod = 'left') {
  const cheieSort = (s) => {
    const a = s.start;
    const b = capat(s);
    if (mod === 'right') return -Math.max(a[0], b[0]);
    if (mod === 'bottom') return -Math.max(a[1], b[1]);
    return Math.min(a[0], b[0]);
  };
  const rest = subtrasee.slice().sort((x, y) => cheieSort(x) - cheieSort(y));
  let primul = rest.shift();
  const a = primul.start;
  const b = capat(primul);
  const alegeB = mod === 'left' ? b[0] < a[0] : mod === 'right' ? b[0] > a[0] : b[1] > a[1];
  if (alegeB) primul = inversa(primul);
  const iesire = [primul];
  while (rest.length) {
    const p = capat(iesire.at(-1));
    let cel = Infinity;
    let indice = -1;
    let intoarce = false;
    rest.forEach((s, i) => {
      const d1 = Math.hypot(p[0] - s.start[0], p[1] - s.start[1]);
      const e = capat(s);
      const d2 = Math.hypot(p[0] - e[0], p[1] - e[1]);
      if (d1 < cel) {
        cel = d1;
        indice = i;
        intoarce = false;
      }
      if (d2 < cel) {
        cel = d2;
        indice = i;
        intoarce = true;
      }
    });
    const s = rest.splice(indice, 1)[0];
    iesire.push(intoarce ? inversa(s) : s);
  }
  return iesire;
}

/** Atributul d, în forma din vectorizeaza.py: "M0.0 10.0 C5.0 9.0, 12.0 10.0, 20.0 10.0". */
export function laD(s, ox, oy) {
  const f = (p) => `${(p[0] - ox).toFixed(1)} ${(p[1] - oy).toFixed(1)}`;
  let d = `M${f(s.start)}`;
  for (const seg of s.segs) d += seg.tip === 'C' ? ` C${seg.puncte.map(f).join(', ')}` : ` L${f(seg.puncte[0])}`;
  return d;
}

/**
 * Filtrul de firimituri, ordonarea și normalizarea la cutia desenului (comune ambilor candidați).
 * @param {Array<object>} subtrasee @param {{start?: 'left'|'right'|'bottom', minLungime?: number}} [o]
 * @returns {{w: number, h: number, paths: string[], lengths: number[], origine: [number, number]}}
 */
export function finalizeaza(subtrasee, { start = 'left', minLungime = MIN_LUNGIME } = {}) {
  const pastrate = subtrasee.filter((s) => s.segs.length && lungime(s) >= minLungime);
  if (!pastrate.length) return { w: 0, h: 0, paths: [], lengths: [], origine: [0, 0] };
  const ordonate = ordoneaza(pastrate, start);
  let ox = Infinity;
  let oy = Infinity;
  let mx = -Infinity;
  let my = -Infinity;
  for (const s of ordonate) {
    for (const p of [s.start, ...s.segs.flatMap((seg) => seg.puncte)]) {
      ox = Math.min(ox, p[0]);
      oy = Math.min(oy, p[1]);
      mx = Math.max(mx, p[0]);
      my = Math.max(my, p[1]);
    }
  }
  const rot = (x) => Math.round(x * 10) / 10;
  return {
    w: rot(mx - ox),
    h: rot(my - oy),
    paths: ordonate.map((s) => laD(s, ox, oy)),
    lengths: ordonate.map((s) => rot(lungime(s))),
    origine: [rot(ox), rot(oy)],
  };
}

/**
 * Tot drumul, de la imagine la trasee.
 * @param {{latime: number, inaltime: number, pixeli: Uint8Array}} img
 * @param {{start?: 'left'|'right'|'bottom', nivel?: number, toleranta?: number}} [o]
 */
export function vectorizeaza(img, { start = 'left', nivel = 128, toleranta = 1.0 } = {}) {
  const schelet = zhangSuen(prag(img, nivel), img.latime, img.inaltime);
  const polilinii = urmaresteTrasee(schelet, img.latime, img.inaltime);
  const subtrasee = polilinii.map((p) => simplifica(p, toleranta)).filter((p) => p.length > 1).map(inBezier);
  return finalizeaza(subtrasee, { start });
}

if (rulatDirect(import.meta.url)) {
  const [intrare, iesire] = process.argv.slice(2);
  const iStart = process.argv.indexOf('--start');
  const start = iStart > 0 ? process.argv[iStart + 1] : 'left';
  if (!intrare || !iesire || !['left', 'right', 'bottom'].includes(start)) {
    console.error('Folosire: node teste/pas0/vectorizare/vectorizeaza-propriu.mjs <intrare.png> <iesire.json> [--start left|right|bottom]');
    process.exitCode = 3;
  } else {
    const t0 = performance.now();
    const rezultat = vectorizeaza(citestePng(intrare), { start });
    const timpMs = Math.round(performance.now() - t0);
    writeFileSync(iesire, JSON.stringify(rezultat) + '\n');
    const total = rezultat.lengths.reduce((a, b) => a + b, 0);
    console.log(`${basename(intrare)}: ${rezultat.paths.length} trasee, cutie ${rezultat.w}x${rezultat.h}, lungime totală ${Math.round(total)} px, ${timpMs} ms`);
  }
}
