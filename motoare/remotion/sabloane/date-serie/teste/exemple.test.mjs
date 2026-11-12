// Exemplele trec pe drumul lui mg randeaza --doar-verificare (pregatesteBuild, fără bundle și fără randare: C10 și
// C17 le dă adaptorul Remotion, în I03): C01-C09, S03-S05 verzi, pe fiecare temă.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { creeazaRadacinaTemp } from '../../../../../teste/ajutoare/radacina-temp.mjs';
import { legaDinRepo } from '../../../../../teste/ajutoare/radacina-motoare.mjs';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { lockNou, scrieLock } from '../../../../../nucleu/lib/lock.mjs';
import { citesteVersiuni } from '../../../../../nucleu/lib/versiuni.mjs';
import { pregatesteBuild } from '../../../../../nucleu/lib/randeaza/pregatire.mjs';
import { exemplu } from './ajutoare.mjs';

let temp;
let legaturi;
let sablon;

before(async () => {
  temp = creeazaRadacinaTemp({
    copiaza: ['nucleu/lib', 'nucleu/VERSIUNI.json', 'nucleu/package.json', 'motoare/comun', 'motoare/remotion/sabloane/date-serie'],
    biblioteciMini: true,
  });
  legaturi = legaDinRepo(temp.radacina, ['nucleu/node_modules']);
  sablon = await incarcaSablon(temp.radacina, 'date-serie');
});

after(() => {
  legaturi?.scoateLegaturile();
  temp?.curata();
});

async function pregateste(nume, date) {
  const dir = path.join(temp.radacina, 'video', nume);
  fs.mkdirSync(dir, { recursive: true });
  scrieLock(path.join(dir, 'motor.lock'), lockNou({ proiect: nume, sablon, versiuni: citesteVersiuni(temp.radacina), acum: new Date('2026-10-20T00:00:00.000Z') }));
  fs.writeFileSync(path.join(dir, 'date.json'), `${JSON.stringify(date, null, 2)}\n`);
  return pregatesteBuild({ radacina: temp.radacina, proiect: nume, mod: 'doar-verificare' });
}

function verde(p) {
  assert.deepEqual(p.erori, [], JSON.stringify(p.erori, null, 2));
  assert.deepEqual(p.rezultate.map((r) => `${r.cod}:${r.ok}`),
    ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C09', 'S01', 'S02', 'S03', 'S04', 'S05'].map((c) => `${c}:true`));
}

test('minim trece', async () => {
  const p = await pregateste('minim', exemplu('minim'));
  verde(p);
  assert.equal(p.cronologie.durata, 7.1);
});

for (const tema of ['noapte', 'hartie', 'curat']) {
  test(`grafic.date trece pe tema ${tema}, cu 672 de cadre și props.json în build/`, async () => {
    const date = exemplu('grafic.date');
    date.stil.tema = tema;
    const p = await pregateste(`grafic-${tema}`, date);
    verde(p);
    assert.equal(Math.round(p.cronologie.durata * 30), 672);
    assert.deepEqual(p.construit.motor, { props: 'props.json', compozitie: 'Grafic' });
    assert.ok(fs.existsSync(path.join(p.cai.build, 'props.json')));
    assert.ok(fs.existsSync(path.join(p.cai.build, 'cronologie.json')));
    assert.equal(fs.existsSync(path.join(p.cai.build, 'index.motion.json')), false);
  });
}

test('diacriticele (ă â î ș ț Ă Â Î Ș Ț, „ ”, %) trec C05 în toate fonturile desenate', async () => {
  const date = exemplu('minim');
  date.scene[0] = { tip: 'cifra', eticheta: 'Șapte țări', valoare: 62, sufix: '%', text: 'ĂÂÎȘȚ și ăâîșț, „așa” e' };
  date.scene[1] = { tip: 'final', titlu: ['ĂÂÎȘȚ ăâîșț'], cta: 'Încă o întâlnire', durata: 4 };
  for (const tema of ['noapte', 'hartie']) {
    date.stil.tema = tema;
    verde(await pregateste(`diacritice-${tema}`, date));
  }
});
