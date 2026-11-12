// Exemplele trec pe drumul lui mg randeaza (pregatesteBuild, fără motor) și diacriticele trec C05 pe toate
// fonturile de titlu (spec 7.2, „Testul de acceptare”, punctele 1 și 3). complet rulează aici fără muzică:
// validarea muzicii cere ffprobe, iar muzica e acoperită de acceptarea pe motorul real (G10).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { radacinaCuMotoare } from '../../../../../teste/ajutoare/radacina-motoare.mjs';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { pregateste } from './ajutoare.mjs';

const DIR_SABLON = fileURLToPath(new URL('../', import.meta.url));
const exemplu = (nume) => JSON.parse(fs.readFileSync(path.join(DIR_SABLON, 'exemple', `${nume}.json`), 'utf8'));
const FONTURI = ['instrument-sans', 'inter', 'montserrat', 'playfair-display'];

let temp;
let sablon;

before(async () => {
  temp = radacinaCuMotoare();
  sablon = await incarcaSablon(temp.radacina, 'text-animat');
});

after(() => temp?.curata());

function verde(p) {
  assert.deepEqual(p.erori, [], JSON.stringify(p.erori, null, 2));
  const picate = p.rezultate.filter((r) => !r.ok);
  assert.deepEqual(picate, [], JSON.stringify(picate, null, 2));
  assert.equal(p.rezultate.find((r) => r.cod === 'C05')?.ok, true, 'C05 lipsește sau e roșu');
}

test('minim trece', async () => {
  verde(await pregateste(temp.radacina, sablon, 'minim', exemplu('minim')));
});

test('complet (toate cele 7 tipuri, degradeu, aliniat la stânga) trece, fără muzică', async () => {
  const date = exemplu('complet');
  delete date.muzica;
  verde(await pregateste(temp.radacina, sablon, 'complet', date));
});

test('patrat (hârtie, ceață, ritm calm, siglă) trece', async () => {
  const dir = path.join(temp.radacina, 'video', 'patrat', 'resurse');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(DIR_SABLON, 'exemple', 'resurse', 'sigla-exemplu.svg'), path.join(dir, 'sigla-exemplu.svg'));
  verde(await pregateste(temp.radacina, sablon, 'patrat', exemplu('patrat')));
});

for (const font of FONTURI) {
  test(`diacriticele (ă â î ș ț Ă Â Î Ș Ț, „ ”, %) trec C05 cu font_titlu ${font}`, async () => {
    const date = {
      sablon: 'text-animat',
      versiune_schema: 1,
      stil: { font_titlu: font },
      scene: [
        { tip: 'titlu', eticheta: 'Șapte țări', titlu: ['ĂÂÎȘȚ și ăâîșț', '„Așa” e 100%'] },
        { tip: 'final', titlu: ['Mulțumim!'], detaliu: 'încă o întâlnire' },
      ],
    };
    verde(await pregateste(temp.radacina, sablon, `diacritice-${font}`, date));
  });
}
