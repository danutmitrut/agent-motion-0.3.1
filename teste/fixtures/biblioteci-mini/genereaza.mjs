// Generează biblioteca sintetică de test: teste/fixtures/biblioteci-mini/biblioteci/.
// Piesele sunt forme geometrice (dreptunghiuri, elipse, spirale, valuri) calculate aici, cu id-urile folosite de exemple.
// Nu se copiază niciodată în biblioteci/ (vezi teste/unitar/fara-fixture-in-biblioteci.test.mjs).
// Rulare: node teste/fixtures/biblioteci-mini/genereaza.mjs [dir-destinație]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rulatDirect } from '../../../nucleu/lib/cai.mjs';

const AICI = path.dirname(fileURLToPath(import.meta.url));
const z = (x) => x.toFixed(1);

function spirala(cx, cy, ture, raza) {
  const puncte = [];
  for (let i = 0; i <= ture * 24; i += 1) {
    const u = (i / 24) * 2 * Math.PI;
    const r = (raza * i) / (ture * 24);
    puncte.push(`${z(cx + r * Math.cos(u))} ${z(cy + r * Math.sin(u))}`);
  }
  return `M${puncte[0]} L${puncte.slice(1).join(' L')}`;
}

function val(x0, y0, latime, amplitudine, perioade) {
  const puncte = [];
  for (let i = 0; i <= perioade * 16; i += 1) {
    const x = x0 + (latime * i) / (perioade * 16);
    const y = y0 + amplitudine * Math.sin((i / 16) * 2 * Math.PI);
    puncte.push(`${z(x)} ${z(y)}`);
  }
  return `M${puncte[0]} L${puncte.slice(1).join(' L')}`;
}

// la Open Peeps, fiecare traseu din g.ink poartă data-grup (corp, cap, fata), ca în importul real (8.7, decizia 10);
// grup poate fi un text (același pentru toate) sau o listă paralelă cu cerneala. Path-urile fond vin înaintea lui g.ink.
function forma(id, w, h, accent, cerneala, grup = null, fond = []) {
  const grupDe = (i) => (Array.isArray(grup) ? grup[i] : grup);
  const atribut = (i) => (grupDe(i) ? ` data-grup="${grupDe(i)}"` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" data-piesa="${id}">`
    + fond.map((d) => `<path class="fond" d="${d}"/>`).join('')
    + (accent ? `<path class="acc" d="${accent}"/>` : '')
    + `<g class="ink">${cerneala.map((d, i) => `<path${atribut(i)} d="${d}"/>`).join('')}</g></svg>\n`;
}

const dreptunghi = (x, y, l, i) => `M${z(x)} ${z(y)} L${z(x + l)} ${z(y)} L${z(x + l)} ${z(y + i)} L${z(x)} ${z(y + i)} Z`;
const elipsa = (cx, cy, rx, ry) => `M${z(cx - rx)} ${z(cy)} A${z(rx)} ${z(ry)} 0 1 0 ${z(cx + rx)} ${z(cy)} A${z(rx)} ${z(ry)} 0 1 0 ${z(cx - rx)} ${z(cy)} Z`;

// Inel (bandă închisă): conturul exterior în sensul acelor de ceas, cel interior, retras cu g, invers; cu regula de umplere
// implicită (nonzero), doar banda e plină.
const inelDreptunghi = (x, y, l, i, g) => `${dreptunghi(x, y, l, i)} M${z(x + g)} ${z(y + g)} L${z(x + g)} ${z(y + i - g)}`
  + ` L${z(x + l - g)} ${z(y + i - g)} L${z(x + l - g)} ${z(y + g)} Z`;
const inelElipsa = (cx, cy, rx, ry, g) => `${elipsa(cx, cy, rx, ry)} M${z(cx - rx + g)} ${z(cy)}`
  + ` A${z(rx - g)} ${z(ry - g)} 0 1 1 ${z(cx + rx - g)} ${z(cy)} A${z(rx - g)} ${z(ry - g)} 0 1 1 ${z(cx - rx + g)} ${z(cy)} Z`;
// Bandă îngustă în formă de val (gura): valul la dus, apoi același val, coborât cu g, la întors.
function bandaVal(x0, y0, latime, amplitudine, g) {
  const puncte = [];
  for (let i = 0; i <= 16; i += 1) puncte.push([x0 + (latime * i) / 16, y0 + amplitudine * Math.sin((i / 16) * 2 * Math.PI)]);
  const dus = puncte.map(([x, y]) => `${z(x)} ${z(y)}`);
  const intors = puncte.slice().reverse().map(([x, y]) => `${z(x)} ${z(y + g)}`);
  return `M${dus[0]} L${dus.slice(1).join(' L')} L${intors.join(' L')} Z`;
}

// Open Peeps sintetic, cu structura importului real: două path-uri fond (silueta: corpul și capul), apoi g.ink cu corp, cap
// și fata, trăsături subțiri în interiorul siluetei, ca pe noapte, pe panoul inversat, cerneala închisă să lase silueta
// deschisă vizibilă. Densitatea trăsăturilor imită piesele reale (multe muchii, nu câteva forme mari): corpul are
// INELE_CORP benzi concentrice, capul INELE_CAP, fiecare grup într-un singur path (subpath-uri), iar fata e o bandă în
// formă de val (gura). Benzile sunt distribuite uniform spre interior, iar grosimea lor se alege ca aria cernelii să fie
// acoperirea din metadate (fracțiunea din cutie, acoperire_cerneala).
const INELE_CORP = 4;
const INELE_CAP = 3;
function peeps(id, w, h, acoperire) {
  const [x, y, l, i] = [w * 0.12, h * 0.38, w * 0.76, h * 0.6];
  const [cx, cy, rx, ry] = [w * 0.5, h * 0.2, w * 0.2, h * 0.15];
  const gura = [w * 0.44, h * 0.2, w * 0.12, h * 0.01, h * 0.012];
  const pasCorp = (0.9 * Math.min(l, i)) / 2 / INELE_CORP;
  const pasCap = (0.9 * Math.min(rx, ry)) / INELE_CAP;
  const retrageri = (n, pas) => Array.from({ length: n }, (_, k) => k * pas);
  const arie = (g) => retrageri(INELE_CORP, pasCorp).reduce((s, d) => s + (l - 2 * d) * (i - 2 * d) - (l - 2 * d - 2 * g) * (i - 2 * d - 2 * g), 0)
    + retrageri(INELE_CAP, pasCap).reduce((s, d) => s + Math.PI * ((rx - d) * (ry - d) - (rx - d - g) * (ry - d - g)), 0)
    + gura[2] * gura[4];
  let [jos, sus] = [0, Math.min(pasCorp, pasCap)];
  if (arie(sus) < acoperire * w * h) throw new Error(`${id}: acoperirea ${acoperire} nu încape în benzile siluetei`);
  for (let k = 0; k < 40; k += 1) {
    const g = (jos + sus) / 2;
    if (arie(g) < acoperire * w * h) jos = g; else sus = g;
  }
  const g = jos;
  const fond = [dreptunghi(x, y, l, i), elipsa(cx, cy, rx, ry)];
  const cerneala = [
    retrageri(INELE_CORP, pasCorp).map((d) => inelDreptunghi(x + d, y + d, l - 2 * d, i - 2 * d, g)).join(' '),
    retrageri(INELE_CAP, pasCap).map((d) => inelElipsa(cx, cy, rx - d, ry - d, g)).join(' '),
    bandaVal(...gura),
  ];
  return forma(id, w, h, null, cerneala, ['corp', 'cap', 'fata'], fond);
}

// Open Doodles sintetic: accentul și cerneala în cutia reală; nCerneala path-uri în g.ink
function doodle(id, w, h, nCerneala) {
  const cerneala = [dreptunghi(w * 0.1, h * 0.15, w * 0.8, h * 0.7)];
  if (nCerneala > 1) cerneala.push(spirala(w * 0.3, h * 0.4, 2, Math.min(w, h) * 0.15));
  if (nCerneala > 2) cerneala.push(val(w * 0.1, h * 0.9, w * 0.8, h * 0.03, 3));
  if (nCerneala > 3) cerneala.push(elipsa(w * 0.7, h * 0.4, w * 0.1, h * 0.1));
  return forma(id, w, h, elipsa(w * 0.5, h * 0.5, w * 0.35, h * 0.3), cerneala);
}

const FORME = {
  'od-meditating': forma('od-meditating', 400, 400,
    'M200.0 40.0 L360.0 360.0 L40.0 360.0 Z',
    ['M120.0 120.0 L280.0 120.0 L280.0 280.0 L120.0 280.0 Z', 'M180.0 180.0 L220.0 180.0 L220.0 220.0 L180.0 220.0 Z']),
  'op-picioare-arata': forma('op-picioare-arata', 300, 600,
    'M150.0 20.0 L170.0 60.0 L130.0 60.0 Z',
    ['M60.0 80.0 L240.0 80.0 L240.0 580.0 L60.0 580.0 Z'], 'corp'),
  'op-bust-laptop': peeps('op-bust-laptop', 220, 245, 0.12),
  'od-chilling': doodle('od-chilling', 970, 618, 1),
  'od-running': doodle('od-running', 963, 638, 1),
  'od-strolling': doodle('od-strolling', 772, 747, 4),
  'op-bust-telefon': peeps('op-bust-telefon', 164, 253, 0.243),
  'op-picioare-explica-ochelari': peeps('op-picioare-explica-ochelari', 334, 718, 0.273),
  'op-bust-cafea': peeps('op-bust-cafea', 172, 251, 0.21),
};

// dovada celor două surse CC0 din fixture: un text sintetic, scris în biblioteci/dovezi/ (ca în biblioteca reală)
const DOVADA_CC0 = 'Text sintetic de test, în locul textului licenței CC0 1.0.\nGenerat de genereaza.mjs; nu e o dovadă reală de licență.\n';
// sursa iconițelor, ca în biblioteca reală (C07 cere licența Lucide pentru iconițele înghețate); dovada e tot un text sintetic
const DOVADA_LUCIDE = 'Text sintetic de test, în locul licenței ISC a iconițelor Lucide.\nGenerat de genereaza.mjs; nu e o dovadă reală de licență.\n';

const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const kb = (t) => Math.round(Buffer.byteLength(t, 'utf8') / 102.4) / 10;

// meta: metadatele copiate de mână din biblioteci/catalog.json real (generatorul nu citește catalogul real la rulare)
const AN_TEME = ['noapte', 'hartie', 'curat'];
const ANIMATIE_FORMA = { implicit: 'contur-umplere', alternative: ['aparitie'], esalonare: 0.06, accent: 'aparitie' };
const POZA_VECHE = { numar: 1, gen: 'ambiguu', poza: 'in-picioare', orientare: 'fata' };

function piesaForma(id, sursa, meta, etichete, descriere) {
  const t = FORME[id];
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(t).map(Number);
  const { noapte, acoperire, roluri = ['ink', 'acc'], personaj = POZA_VECHE, teme } = meta;
  return {
    id, tip: 'forma', familie: 'cerneala', sursa, original: `sintetic/${id}.svg`,
    fisier: `forme/${id}.svg`, sha256: sha(t), kb: kb(t), cutie: meta.cutie ?? { w, h },
    roluri, recolorabil: true, acoperire_cerneala: acoperire,
    personaj,
    etichete, descriere, noapte,
    teme_potrivite: teme ?? (noapte === 'evita' ? ['hartie', 'curat'] : AN_TEME),
    animatie: ANIMATIE_FORMA,
  };
}

const RO_OP = ['ink', 'fond'];
export function catalogMini() {
  return {
    versiune: 1,
    surse: {
      'open-doodles': { nume: 'Forme sintetice de test', autor: 'teste', url: '', descarcat_din: '', licenta: 'CC0-1.0', licenta_url: 'https://creativecommons.org/publicdomain/zero/1.0/', dovada: ['dovezi/cc0-1.0.txt'], verificat: '2026-10-01', nota: 'sintetic' },
      'open-peeps': { nume: 'Forme sintetice de test', autor: 'teste', url: '', descarcat_din: '', licenta: 'CC0-1.0', licenta_url: 'https://creativecommons.org/publicdomain/zero/1.0/', dovada: ['dovezi/cc0-1.0.txt'], verificat: '2026-10-01', nota: 'sintetic' },
      lucide: { nume: 'Lucide', autor: 'teste', url: '', descarcat_din: '', licenta: 'ISC', licenta_url: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE', dovada: ['dovezi/licenta-lucide.txt'], nota: 'sintetic', versiune: '1.49.0', catalog: 'motoare/comun/iconite/lucide-1.49.0.json', verificat: '2026-10-01' },
    },
    piese: [
      piesaForma('od-meditating', 'open-doodles', { noapte: 'autocolant', acoperire: 0.08 }, ['meditație', 'calm', 'liniște', 'respirație'], 'Pătrat sintetic cu triunghi de accent.'),
      piesaForma('op-picioare-arata', 'open-peeps', { noapte: 'evita', acoperire: 0.42 }, ['în picioare', 'arată', 'prezentare', 'explică'], 'Dreptunghi sintetic plin de cerneală.'),
      piesaForma('op-bust-laptop', 'open-peeps', { noapte: 'autocolant', acoperire: 0.12, roluri: RO_OP, personaj: { numar: 1, gen: 'ambiguu', poza: 'bust', orientare: 'dreapta' } }, ['laptop', 'calculator', 'lucru', 'tastat', 'concentrare'], 'Bust sintetic la laptop, cu fond și cerneală.'),
      piesaForma('od-chilling', 'open-doodles', { noapte: 'bun', acoperire: 0.351, personaj: { numar: 1, gen: 'ambiguu', poza: 'intins', orientare: 'fata' } }, ['relaxare', 'pauză', 'odihnă', 'lenevit', 'întins'], 'Formă sintetică lată, cu un singur traseu de cerneală.'),
      piesaForma('od-running', 'open-doodles', { noapte: 'bun', acoperire: 0.374, personaj: { numar: 1, gen: 'ambiguu', poza: 'in-miscare', orientare: 'dreapta' } }, ['alergare', 'fugă', 'grabă', 'viteză', 'energie'], 'Formă sintetică în mișcare, cu un singur traseu de cerneală.'),
      piesaForma('od-strolling', 'open-doodles', { noapte: 'bun', acoperire: 0.162, personaj: { numar: 1, gen: 'ambiguu', poza: 'in-miscare', orientare: 'dreapta' } }, ['plimbare', 'mers', 'relaxare', 'nepăsare', 'lejer'], 'Formă sintetică cu patru trasee de cerneală.'),
      piesaForma('op-bust-telefon', 'open-peeps', { noapte: 'autocolant', acoperire: 0.243, roluri: RO_OP, personaj: { numar: 1, gen: 'barbat', poza: 'bust', orientare: 'dreapta' } }, ['telefon', 'mobil', 'mesaj', 'barbă', 'plictiseală'], 'Bust sintetic cu telefonul, cu fond și cerneală.'),
      piesaForma('op-picioare-explica-ochelari', 'open-peeps', { noapte: 'autocolant', acoperire: 0.273, roluri: RO_OP, personaj: { numar: 1, gen: 'ambiguu', poza: 'in-miscare', orientare: 'dreapta' } }, ['explicație', 'mers', 'gest', 'ochelari', 'zâmbet larg'], 'Siluetă sintetică înaltă care explică, cu fond și cerneală.'),
      piesaForma('op-bust-cafea', 'open-peeps', { noapte: 'autocolant', acoperire: 0.21, roluri: RO_OP, personaj: { numar: 1, gen: 'barbat', poza: 'bust', orientare: 'fata' } }, ['cafea', 'cană', 'pălărie', 'mustață', 'dimineață'], 'Bust sintetic cu cafea, cu fond și cerneală.'),
    ],
    sinonime: { 'plictiseală': ['obosit', 'epuizat', 'plictisit'], cafea: ['coffee', 'cană'] },
  };
}

export function genereaza(dirBiblioteci) {
  fs.mkdirSync(path.join(dirBiblioteci, 'forme'), { recursive: true });
  fs.mkdirSync(path.join(dirBiblioteci, 'dovezi'), { recursive: true });
  fs.writeFileSync(path.join(dirBiblioteci, 'dovezi', 'cc0-1.0.txt'), DOVADA_CC0);
  fs.writeFileSync(path.join(dirBiblioteci, 'dovezi', 'licenta-lucide.txt'), DOVADA_LUCIDE);
  for (const [id, t] of Object.entries(FORME)) fs.writeFileSync(path.join(dirBiblioteci, 'forme', `${id}.svg`), t);
  fs.writeFileSync(path.join(dirBiblioteci, 'catalog.json'), JSON.stringify(catalogMini(), null, 2) + '\n');
}

if (rulatDirect(import.meta.url)) {
  genereaza(process.argv[2] ?? path.join(AICI, 'biblioteci'));
}
