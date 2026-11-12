// mg genereaza (felia 5): decodorul PNG și vectorizarea de contur (desenul generat devine o formă umplută).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeazaPng, PngNeacceptat } from '../../nucleu/lib/genereaza/png.mjs';
import { vectorizeaza, traseazaContururi, arieCuSemn, DesenNefolosibil } from '../../nucleu/lib/genereaza/contur.mjs';
import { normalizeazaSvg } from '../../nucleu/lib/desen/adauga.mjs';
import { codificaPng, imagineGri, inel } from '../ajutoare/png.mjs';

const REFERINTA = fileURLToPath(new URL('../../nucleu/lib/genereaza/referinta-stil.png', import.meta.url));

test('decodorul citește gri, gri cu alfa, RGB, RGBA și paletă, cu toate cele 5 filtre', () => {
  const latime = 5;
  const inaltime = 5;
  const filtre = [0, 1, 2, 3, 4];
  const lum = (x, y) => (x * 50 + y * 3) % 256;
  const gri = Uint8Array.from({ length: 25 }, (_, i) => lum(i % 5, Math.floor(i / 5)));
  assert.deepEqual([...decodeazaPng(codificaPng({ latime, inaltime, canale: 1, date: gri, filtre })).gri], [...gri]);

  const rgb = new Uint8Array(75);
  for (let i = 0; i < 25; i++) rgb.set([gri[i], gri[i], gri[i]], i * 3);
  assert.deepEqual([...decodeazaPng(codificaPng({ latime, inaltime, canale: 3, date: rgb, filtre })).gri], [...gri]);

  // alfa 0 = alb, oricare ar fi culoarea; alfa 255 = culoarea
  const rgba = new Uint8Array(100);
  for (let i = 0; i < 25; i++) rgba.set([0, 0, 0, i % 2 ? 255 : 0], i * 4);
  const d = decodeazaPng(codificaPng({ latime, inaltime, canale: 4, date: rgba, filtre }));
  assert.deepEqual([...d.gri], Array.from({ length: 25 }, (_, i) => (i % 2 ? 0 : 255)));

  const ga = new Uint8Array(50);
  for (let i = 0; i < 25; i++) ga.set([0, 128], i * 2);
  assert.ok(decodeazaPng(codificaPng({ latime, inaltime, canale: 2, date: ga })).gri.every((v) => v === 127));

  const paleta = Buffer.from([255, 255, 255, 0, 0, 0]);
  const idx = Uint8Array.from({ length: 25 }, (_, i) => i % 2);
  assert.deepEqual([...decodeazaPng(codificaPng({ latime, inaltime, canale: 1, date: idx, paleta })).gri], Array.from({ length: 25 }, (_, i) => (i % 2 ? 0 : 255)));
});

test('decodorul refuză clar ce nu acceptă', () => {
  const date = new Uint8Array(4);
  assert.throws(() => decodeazaPng(Buffer.from('nu e png deloc, doar text simplu aici')), PngNeacceptat);
  assert.throws(() => decodeazaPng(codificaPng({ latime: 2, inaltime: 2, canale: 1, date, intretesere: 1 })), /întrețesut/);
  assert.throws(() => decodeazaPng(codificaPng({ latime: 1, inaltime: 2, canale: 1, date, adancime: 16 })), /16 biți/);
});

test('referința de stil livrată se decodează (paletă, 1024x1024)', () => {
  const r = decodeazaPng(readFileSync(REFERINTA));
  assert.equal(r.latime, 1024);
  assert.equal(r.inaltime, 1024);
  assert.ok(r.gri.some((v) => v === 0));
});

// Punctele sunt mijloacele muchiilor, deci fiecare colț pierde un triunghi de 1/8 de pixel.
test('contururile: un pătrat dă o buclă exterioară pozitivă, o gaură dă arie negativă', () => {
  const masca = new Uint8Array(16);
  for (const p of [5, 6, 9, 10]) masca[p] = 1;
  const [b] = traseazaContururi(masca, 4, 4);
  assert.equal(arieCuSemn(b), 3.5);
  // 3x3 plin cu centrul gol: o buclă exterioară și o gaură
  const m2 = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  const bucle = traseazaContururi(m2, 3, 3).map(arieCuSemn).sort((a, b2) => a - b2);
  assert.deepEqual(bucle, [-0.5, 8.5]);
});

test('contururile: doi pixeli atinși doar în colț sunt două forme (interiorul e 4-conex)', () => {
  const masca = Uint8Array.from([1, 0, 0, 1]);
  const bucle = traseazaContururi(masca, 2, 2);
  assert.equal(bucle.length, 2);
  assert.ok(bucle.every((b) => arieCuSemn(b) === 0.5));
});

test('un inel devine silueta albă plină și cerneala neagră cu gaură, iar adauga îi pune rolurile fond și ink', () => {
  const img = imagineGri(200, 200, inel(100, 100, 40, 60));
  const r = vectorizeaza(img);
  assert.equal(r.trasee, 1);
  assert.match(r.svg, /<path fill="#ffffff" d="M[^"]+Z"\/>/);
  assert.match(r.svg, /<path fill="#000000" fill-rule="evenodd" d="M[^"]+ZM[^"]+Z"\/>/);
  // inelul are aria 2000π, silueta discul plin 3600π
  assert.ok(Math.abs(r.acoperire - 2000 / 3600) < 0.03, String(r.acoperire));
  assert.deepEqual(r.cutie, { w: 144, h: 144 });
  const n = normalizeazaSvg(r.svg);
  assert.deepEqual(n.erori, []);
  assert.match(n.svg, /class="fond"/);
  assert.match(n.svg, /class="ink" fill-rule="evenodd"/);
});

test('petele mici se șterg, iar găurile mici din cerneală se umplu', () => {
  const pete = (x, y) => inel(100, 100, 40, 60)(x, y) || (x === 10 && y === 10) || (x === 190 && y === 190);
  const gaura = (x, y) => pete(x, y) && !(x === 100 && y === 50);
  const r = vectorizeaza(imagineGri(200, 200, gaura));
  assert.equal(r.trasee, 1);
  // silueta (1 buclă) și cerneala (exterior + gaură); petele groase sunt separate, cu clasa pata
  const faraPete = r.svg.split('\n').filter((l) => !l.includes('class="pata"')).join('\n');
  assert.equal((faraPete.match(/M/g) ?? []).length, 3);
});

test('imaginile care nu sunt desene sunt refuzate cu motivul', () => {
  assert.throws(() => vectorizeaza(imagineGri(50, 50, () => false)), (e) => e instanceof DesenNefolosibil && /doar fundal/.test(e.message));
  assert.throws(() => vectorizeaza(imagineGri(50, 50, () => true)), DesenNefolosibil);
  // un disc plin: cerneala acoperă tot desenul
  assert.throws(() => vectorizeaza(imagineGri(100, 100, inel(50, 50, 0, 30))), /siluetă plină/);
  // zgomot: o tablă de șah rară, cu sute de pete
  const tabla = (x, y) => x % 6 < 3 && y % 6 < 3 && x > 2 && y > 2 && x < 197 && y < 197;
  assert.throws(() => vectorizeaza(imagineGri(200, 200, tabla), { ariaMinima: 0 }), /zgomotos/);
});

test('un gol mic în contur se închide pentru siluetă, fără să schimbe cerneala', () => {
  // inelul subțire (linie de 6 px) cu o tăietură de 4 px: fără închidere, interiorul ar fi fundal
  const cuGol = (x, y) => inel(200, 200, 114, 120)(x, y) && !(y >= 80 && y <= 120 && x >= 198 && x < 202);
  const r = vectorizeaza(imagineGri(400, 400, cuGol));
  assert.equal(r.avertisment, undefined);
  assert.match(r.svg, /<path fill="#ffffff"/);
  // silueta e discul plin (r 120), nu doar linia
  assert.ok(r.acoperire < 0.15, String(r.acoperire));
});

test('un desen cu linie subțire tăiat de margine iese doar cu cerneală și cu avertisment, nu e refuzat', () => {
  // un U deschis spre marginea de jos: două picioare și o arcadă, linie de 6 px
  const u = (x, y) => (y >= 100 && ((x >= 100 && x < 106) || (x >= 294 && x < 300))) || (y >= 100 && y < 106 && x >= 100 && x < 300);
  const r = vectorizeaza(imagineGri(400, 400, u));
  assert.match(r.avertisment, /nu se închide/);
  assert.doesNotMatch(r.svg, /#ffffff/);
  assert.match(r.svg, /<path fill="#000000"/);
  assert.equal(r.acoperire, null);
  // o pată plină tăiată de margine rămâne refuzată
  assert.throws(() => vectorizeaza(imagineGri(400, 400, (x, y) => y >= 100 && x >= 100 && x < 300)), /siluetă plină/);
});

test('decodorul oprește o bombă de compresie la mărimea imaginii', () => {
  const mic = codificaPng({ latime: 4, inaltime: 4, canale: 1, date: new Uint8Array(16) });
  // același antet, dar un IDAT care se umflă mult peste 4x4
  const mare = codificaPng({ latime: 2000, inaltime: 2000, canale: 1, date: new Uint8Array(4e6) });
  const idat = mare.subarray(mare.indexOf('IDAT') - 4, mare.indexOf('IEND') - 4);
  const bomba = Buffer.concat([mic.subarray(0, mic.indexOf('IDAT') - 4), idat, mic.subarray(mic.indexOf('IEND') - 4)]);
  assert.throws(() => decodeazaPng(bomba), /stricate sau prea mari/);
});

test('zonele groase de cerneală se repetă ca pete (clasa pata), liniile subțiri nu', () => {
  // un inel subțire (linie de 6 px) și, înăuntru, un disc plin (pata, ca părul sau pantalonii), pe 1000 px: pragul e ~15 px
  const desen = (x, y) => inel(500, 500, 294, 300)(x, y) || inel(500, 500, 0, 60)(x, y);
  const r = vectorizeaza(imagineGri(1000, 1000, desen));
  assert.equal(r.pete, 1);
  const pata = r.svg.split('\n').find((l) => l.includes('class="pata"'));
  assert.match(pata, /^<path class="pata" fill="#000000" fill-rule="evenodd" d="M[^"]+Z"\/>$/);
  // pata e discul, nu inelul: o singură buclă
  assert.equal((pata.match(/M/g) ?? []).length, 1);
  // adauga păstrează clasa și îi pune rolul ink, deci reelul o trasează și o umple ca pe cerneală
  assert.match(normalizeazaSvg(r.svg).svg, /class="pata ink"/);
  // doar linii subțiri: nicio pată
  assert.equal(vectorizeaza(imagineGri(1000, 1000, inel(500, 500, 294, 300))).pete, 0);
});
