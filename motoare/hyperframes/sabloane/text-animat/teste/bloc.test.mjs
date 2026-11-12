import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../../../../nucleu/lib/teme.mjs';
import { planifica } from '../plan.mjs';
import { blocScenariu } from '../bloc.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const sablon = await incarcaSablon(REPO, 'text-animat');
const citeste = (rel) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const minim = citeste('../exemple/minim.json');

function bloc(date) {
  const { stil } = rezolvaStil({ radacina: REPO, sablon, date, brand: null });
  const ctx = { radacina: REPO, dirProiect: REPO, sablon, brand: null };
  const r = planifica(date, stil, ctx);
  assert.deepEqual(r.erori, []);
  return blocScenariu(date, stil, r.cronologie, { ...ctx, intern: r.plan, stil });
}

test('textele minimului: câte o linie pe câmp, cu textul de pe ecran, fontul și greutatea', () => {
  const { texte } = bloc(minim);
  assert.deepEqual(texte[0], { ref: 'Scena 1', camp: 'scene[0].eticheta', eticheta: 'eticheta', text: 'PENTRU SOLOPRENORI', accent: false, separat: false, font: 'text', greutate: 500 });
  assert.deepEqual(texte[2], { ref: 'Scena 1', camp: 'scene[0].titlu[1]', eticheta: 'titlu, rândul 2', text: 'și tot nu ajungi?', accent: true, separat: false, font: 'titlu', greutate: 700 });
  assert.deepEqual(texte.filter((t) => t.ref === 'Scena 2').map((t) => t.eticheta), ['titlu, rândul 1', 'punctul 1', 'punctul 2', 'punctul 3']);
  assert.deepEqual(texte.at(-1), { ref: 'Scena 3', camp: 'scene[2].detaliu', eticheta: 'detaliu', text: 'exemplu.ro/atelier', accent: false, separat: false, font: 'text', greutate: 500 });
});

test('cuvintele sunt o singură linie separată; citatul are ghilimelele de pe ecran; cifra are textul final', () => {
  const date = { ...minim, stil: { font_titlu: 'montserrat' }, scene: [
    { tip: 'cuvinte', cuvinte: ['zilnic.', 'corect.', '*fără tine*.'] },
    { tip: 'cifra', valoare: 3.5, zecimale: 1, sufix: ' ore', text: 'pe zi, câștigate' },
    { tip: 'citat', text: 'Am recuperat o zi pe săptămână încă din prima lună.', autor: 'Ioana Pop' },
    minim.scene[2],
  ] };
  const { texte } = bloc(date);
  assert.deepEqual(texte[0], { ref: 'Scena 1', camp: 'scene[0].cuvinte', eticheta: 'cuvinte', text: 'zilnic.\ncorect.\nfără tine.', accent: true, separat: true, font: 'titlu', greutate: 800 });
  assert.equal(texte.find((t) => t.camp === 'scene[1].valoare').text, '3,5 ore');
  assert.equal(texte.find((t) => t.camp === 'scene[2].text').text, '„Am recuperat o zi pe săptămână încă din prima lună.”');
});

test('stilul și timpii: tema, culorile cu sursa lor, ritmul, atmosfera, alinierea, câte un rând pe scenă', () => {
  const { stil } = bloc(minim);
  assert.match(stil[0], /^Tema: noapte; accent #[0-9A-F]{6} \(din temă\); fundal #0E0F13 \(din temă\)$/);
  assert.equal(stil[1], 'Ritm: normal; atmosferă: ceață; aliniere: centru; format: vertical 1080x1920');
  assert.deepEqual(stil.slice(2), [
    'Scena 1 (titlu): 0,0-4,4 s, complet la 1,35 s',
    'Scena 2 (listă): 4,4-9,2 s, complet la 6,7 s',
    'Scena 3 (final): 9,2-12,7 s, complet la 11,21 s',
  ]);
});
