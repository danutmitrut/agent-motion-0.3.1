// C05 în verificariDate cu un font de brand (spec 7.1 punctul 3): diacriticele se verifică pe tot fontul,
// nu doar pe caracterele textului de acum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../nucleu/lib/teme.mjs';
import { textAfisat } from '../../nucleu/lib/text.mjs';
import { verificariDate, verificaC09 } from '../../nucleu/lib/verificari/date.mjs';
import { creeazaCtx } from '../../nucleu/lib/context.mjs';
import { eroare, avertisment } from '../../nucleu/lib/erori.mjs';
import { valideazaPeSchema } from '../../nucleu/lib/schema.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const MINIM = JSON.parse(fs.readFileSync(
  path.join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat', 'exemple', 'minim.json'), 'utf8'));
// inter-700-latin.woff2 nu are ă ș ț Ă Ș Ț (sunt în latin-ext): fontul de brand „stricat”, ca în testul din A07.
const FARA_DIACRITICE = fs.readFileSync(path.join(REPO, 'motoare', 'comun', 'fonturi', 'inter', 'inter-700-latin.woff2'));
const FONT_BRAND = { fisier: 'branduri/b/titlu.woff2', familie: 'Studio Titlu' };

/** Ctx-ul unic (M6) și rezultatul apelului unic al lui valideaza, ca în pregatesteBuild; valideaza nu rulează pe date care nu trec de schemă. */
function ctxSiValidare(radacina, sablon, date, brand = null) {
  const ctx = creeazaCtx({ radacina, proiect: 'x', dirProiect: path.join(radacina, 'video', 'x'), sablon, mod: 'doar-verificare', brand });
  const validare = valideazaPeSchema(sablon.schema, date).length === 0 ? sablon.modul.valideaza(date, ctx) : { erori: [], avertismente: [] };
  return { ctx, validare };
}

/** Rezultatul C05 pe exemplul minim; cu fontTitlu dat, titlul folosește acel font (ca dintr-un brand). */
async function c05(fontTitlu = null) {
  const { radacina, curata } = creeazaRadacinaTemp({
    copiaza: ['motoare/comun/fonturi'],
    fisiere: { 'branduri/b/titlu.woff2': FARA_DIACRITICE },
  });
  try {
    const sablon = await incarcaSablon(REPO, 'reel-ilustrat');
    const { stil, erori } = rezolvaStil({ radacina: REPO, sablon, date: MINIM, brand: null });
    assert.deepEqual(erori, []);
    if (fontTitlu) stil.font_titlu = { valoare: fontTitlu, sursa: 'brand' };
    const cronologie = { durata: sablon.meta.durata.min, segmente: [] };
    const rezultate = await verificariDate({ ...ctxSiValidare(radacina, sablon, MINIM), date: MINIM, stil, cronologie, lock: { active: {} }, texte: [] });
    return rezultate.find((r) => r.cod === 'C05');
  } finally {
    curata();
  }
}

test('C05: fontul de brand fără ă ș ț pică pe brand, deși textul de acum nu are diacritice', async () => {
  const texte = MINIM.scene.flatMap((s) => s.titlu ?? []).map(textAfisat).join(' ');
  assert.doesNotMatch(texte, /[ăâîșțĂÂÎȘȚ]/, 'premisa: textele exemplului minim nu au diacritice');
  const r = await c05(FONT_BRAND);
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['glifa-lipsa', 'brand']]);
  assert.match(r.erori[0].mesaj, /Studio Titlu/);
  assert.equal(r.camp, 'brand');
});

test('C05: același text, cu fontul titlului din catalog, trece', async () => {
  const r = await c05();
  assert.equal(r.ok, true);
  assert.deepEqual(r.erori, []);
});

// F11 (preflight P2-1, P2-2): cu brand, erorile C05 și C06 pentru valori din brand numesc brandul, nu stil.* din date.json.
const TEXTE_TITLU = [{ ref: 'Scena 1', camp: 'scene[0].titlu[0]', eticheta: null, text: 'Faci totul singur.', accent: false, separat: false, font: 'titlu', greutate: 700 }];
async function rezultateCuBrand(brand, schimba = (stil) => stil) {
  const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['motoare/comun/fonturi'] });
  try {
    const sablon = await incarcaSablon(REPO, 'reel-ilustrat');
    const date = { ...MINIM, brand: brand.nume };
    assert.deepEqual(valideazaPeSchema(sablon.schema, date), [], 'premisa: datele cu brand trec de schemă');
    const { stil, erori } = rezolvaStil({ radacina: REPO, sablon, date, brand });
    assert.deepEqual(erori, []);
    const cronologie = { durata: sablon.meta.durata.min, segmente: [] };
    return await verificariDate({ ...ctxSiValidare(radacina, sablon, date, brand), date, stil: schimba(stil), cronologie, lock: { active: {} }, texte: TEXTE_TITLU });
  } finally {
    curata();
  }
}

test('C06: accentul din brand cu contrast slab dă contrast-slab pe camp brand, cu fișa brandului în sugestie', async () => {
  const r = (await rezultateCuBrand({ nume: 'studio-b', mg: 1, culori: { accent: '#141414' } })).find((x) => x.cod === 'C06');
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['contrast-slab', 'brand']]);
  assert.match(r.erori[0].sugestie, /branduri\/studio-b\/vizual\.md/);
});

test('C05: un font de catalog necunoscut venit din brand oprește pe camp brand, nu pe stil.font_titlu', async () => {
  await assert.rejects(
    rezultateCuBrand({ nume: 'studio-b', mg: 1 }, (stil) => ({ ...stil, font_titlu: { valoare: 'nu-exista', sursa: 'brand' } })),
    (e) => e.eroareMg?.cod === 'font-necunoscut' && e.eroareMg.camp === 'brand',
  );
});

// Runda 1 (I1, M2): C03 și C04 sunt rezultatele lui valideaza din șablon, grupate pe coduri, nu o copie în nucleu;
// C03 rulează numai după un C02 fără erori.
async function rezultate(date, sablonDeTest = (s) => s) {
  const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['motoare/comun/fonturi'] });
  try {
    const sablon = sablonDeTest(await incarcaSablon(REPO, 'reel-ilustrat'));
    const { stil } = rezolvaStil({ radacina: REPO, sablon, date, brand: null });
    const cronologie = { durata: sablon.meta.durata.min, segmente: [] };
    return await verificariDate({ ...ctxSiValidare(radacina, sablon, date), date, stil, cronologie, lock: { active: {} }, texte: [] });
  } finally {
    curata();
  }
}

test('C04 are acoperirea șablonului: un cuvânt peste plafonul de 16 caractere pică', async () => {
  const date = structuredClone(MINIM);
  date.scene[1] = { tip: 'card', cuvinte: ['Abcdefghijklmnopq', 'Doi'] };
  const c04 = (await rezultate(date)).find((r) => r.cod === 'C04');
  assert.equal(c04.ok, false);
  assert.deepEqual(c04.erori.map((e) => [e.cod, e.camp]), [['rand-nu-incape', 'scene[1].cuvinte[0]']]);
});

test('C03 și C04 sunt exact erorile și avertismentele lui valideaza, grupate după CODURI[cod].verificare', async () => {
  const sedila = eroare('sedila', 'scene[0].titlu[0]', 'Scena 1: sedilă.', 'Scrie ș cu virgulă.');
  const diacritice = avertisment('fara-diacritice', 'scene[0].titlu[0]', 'Fără diacritice.', 'Pune diacriticele.');
  const cuValideaza = (sablon) => ({ ...sablon, modul: { ...sablon.modul, valideaza: () => ({ erori: [sedila], avertismente: [diacritice] }) } });
  const r = await rezultate(structuredClone(MINIM), cuValideaza);
  const c03 = r.find((x) => x.cod === 'C03');
  assert.equal(c03.ok, false);
  assert.deepEqual(c03.erori, [sedila]);
  assert.deepEqual(c03.avertismente, [diacritice]);
  const c04 = r.find((x) => x.cod === 'C04');
  assert.equal(c04.ok, true);
  assert.deepEqual(c04.erori, []);
});

test('cu C02 picat, verificariDate se oprește la C01 și C02, fără să ruleze C03 pe valori care nu sunt șiruri', async () => {
  const date = structuredClone(MINIM);
  date.scene[0].titlu = [123];
  const r = await rezultate(date);
  assert.deepEqual(r.map((x) => [x.cod, x.ok]), [['C01', true], ['C02', false]]);
});

// M7: C05 verifică exact textele primite (LinieText), pe fontul și greutatea fiecăruia, nu câmpurile reelului.
async function c05PeTexte(texte, date = { elemente: [] }) {
  const { radacina, curata } = creeazaRadacinaTemp({ copiaza: ['motoare/comun/fonturi'] });
  try {
    const sablon = await incarcaSablon(REPO, 'reel-ilustrat');
    const { stil } = rezolvaStil({ radacina: REPO, sablon, date: MINIM, brand: null });
    const cronologie = { durata: sablon.meta.durata.min, segmente: [] };
    // date fără scene (forma altui șablon): C02 pică pe schema reelului, deci rulează schema goală a unui șablon fără reguli
    const fara = { ...sablon, schema: { type: 'object' } };
    const ctx = creeazaCtx({ radacina, proiect: 'x', dirProiect: path.join(radacina, 'video', 'x'), sablon: fara, mod: 'doar-verificare', brand: null });
    const r = await verificariDate({ ctx, date, stil, cronologie, lock: { active: {} }, validare: { erori: [], avertismente: [] }, texte });
    return r.find((x) => x.cod === 'C05');
  } finally {
    curata();
  }
}

const linie = (camp, text, font, greutate) => ({ ref: 'Elementul', camp, eticheta: null, text, accent: false, separat: false, font, greutate });

test('M7: C05 verifică textele primite, pe fontul și greutatea fiecăruia, nu câmpurile reelului', async () => {
  const c05 = await c05PeTexte([
    linie('elemente[0].text', 'Ține minte', 'titlu', 700),
    linie('elemente[1].text', 'Gata \u{1D11E}', 'text', 400),
  ]);
  assert.equal(c05.ok, false);
  assert.deepEqual(c05.erori.map((e) => e.camp), ['elemente[1].text']);
});

test('M7: rândurile despărțite prin \\n se verifică fără caracterul de rând nou', async () => {
  const c05 = await c05PeTexte([linie('semnatura', 'Ana Pop,\ncoach de carieră', 'text', 400)]);
  assert.equal(c05.ok, true);
  assert.deepEqual(c05.erori, []);
});

// Review final (E7): texte e obligatoriu; un apel fără el ar face C05 verde fără nicio verificare.
test('E7: verificariDate fără texte (sau cu texte care nu e listă) aruncă TypeError', async () => {
  const sablon = await incarcaSablon(REPO, 'reel-ilustrat');
  const ctx = creeazaCtx({ radacina: REPO, proiect: 'x', dirProiect: path.join(REPO, 'video', 'x'), sablon, mod: 'doar-verificare' });
  const baza = { ctx, date: MINIM, stil: {}, cronologie: { durata: 10, segmente: [] }, lock: { active: {} }, validare: { erori: [], avertismente: [] } };
  for (const texte of [undefined, null, 'text', { length: 0 }]) {
    await assert.rejects(verificariDate({ ...baza, texte }), (e) => e instanceof TypeError && /verificariDate cere texte/.test(e.message), String(texte));
  }
});

test('C09: două segmente cu text care se suprapun trec doar în benzi diferite', () => {
  const sablon = { meta: { durata: { min: 5, max: 90 } } };
  const seg = (ref, start, sfarsit, banda) => ({ ref, camp: ref, tip: 't', start, complet: start, sfarsit, zona_text: [0, 0, 10, 10], texte: ['Bună ziua'], ...(banda ? { banda } : {}) });
  const cron = (segmente) => ({ durata: 10, segmente });
  assert.equal(verificaC09(sablon, cron([seg('a', 0, 3, 'sus'), seg('b', 1, 4, 'nume')])).ok, true);
  assert.deepEqual(verificaC09(sablon, cron([seg('a', 0, 3, 'sus'), seg('b', 1, 4, 'sus')])).erori.map((e) => e.cod), ['cronologie-suprapunere']);
  assert.deepEqual(verificaC09(sablon, cron([seg('a', 0, 3), seg('b', 1, 4)])).erori.map((e) => e.cod), ['cronologie-suprapunere']);
});
