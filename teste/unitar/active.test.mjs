// Înghețarea activelor și verificarea C07 (spec 6.11, harta 4.15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { ingheataActiv, verificaActive } from '../../nucleu/lib/active.mjs';
import { citesteLock } from '../../nucleu/lib/lock.mjs';
import { stergeRecursiv } from '../../nucleu/lib/fisiere.mjs';

const LOCK = {
  versiune: 1, proiect: 'p', creat_la: '2026-10-01T00:00:00.000Z',
  motor: { nume: 'hyperframes', versiune: '0.8.96' },
  sablon: { nume: 'reel-ilustrat', versiune_schema: 1, sha256: 'x' },
  versiuni_sha256: 'x', active: {}, aprobare: null, randari: { ultima_completa: null },
};
const CATALOG = {
  versiune: 1,
  surse: {
    'open-doodles': { nume: 'Open Doodles', licenta: 'CC0-1.0' },
    'fara-licenta': { nume: 'Sursă de probă', licenta: '' },
    lucide: { nume: 'Lucide', licenta: 'ISC' },
  },
  piese: [
    { id: 'od-proba', tip: 'forma', familie: 'cerneala', sursa: 'open-doodles', fisier: 'forme/od-proba.svg' },
    { id: 'od-fara', tip: 'forma', familie: 'cerneala', sursa: 'fara-licenta', fisier: 'forme/od-fara.svg' },
  ],
  sinonime: {},
};
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g class="ink"><path d="M0 0 L10 10"/></g></svg>\n';

function radacinaCuProiect() {
  return creeazaRadacinaTemp({
    fisiere: {
      'video/p/motor.lock': `${JSON.stringify(LOCK, null, 2)}\n`,
      'biblioteci/catalog.json': `${JSON.stringify(CATALOG, null, 2)}\n`,
    },
  });
}

test('ingheataActiv scrie fișierul o dată și pune sha256 în motor.lock', () => {
  const { radacina, curata } = radacinaCuProiect();
  try {
    const r = ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-proba', continut: SVG, extensie: 'svg' });
    assert.equal(r.cale, 'active/desen/od-proba.svg');
    assert.match(r.sha256, /^[0-9a-f]{64}$/);
    const fisier = path.join(radacina, 'video', 'p', 'active', 'desen', 'od-proba.svg');
    assert.equal(fs.readFileSync(fisier, 'utf8'), SVG);
    assert.deepEqual(citesteLock(path.join(radacina, 'video', 'p', 'motor.lock')).active, { 'active/desen/od-proba.svg': r.sha256 });

    const aDoua = ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-proba', continut: '<svg>alt conținut</svg>', extensie: 'svg' });
    assert.deepEqual(aDoua, r, 'al doilea apel păstrează copia înghețată');
    assert.equal(fs.readFileSync(fisier, 'utf8'), SVG);
  } finally {
    curata();
  }
});

test('ingheataActiv refuză tipuri și extensii nepermise', () => {
  const { radacina, curata } = radacinaCuProiect();
  try {
    assert.throws(() => ingheataActiv(radacina, 'p', { tip: 'video', id: 'x', continut: 'x', extensie: 'mp4' }), TypeError);
    assert.throws(() => ingheataActiv(radacina, 'p', { tip: 'iconita', id: 'phone', continut: 'x', extensie: 'png' }), TypeError);
    assert.throws(() => ingheataActiv(radacina, 'p', { tip: 'desen', id: 'p-anim', continut: 'x', extensie: 'gif' }), TypeError);
    assert.throws(() => ingheataActiv(radacina, 'p', { tip: 'desen', id: '../x', continut: 'x', extensie: 'svg' }), TypeError);
  } finally {
    curata();
  }
});

test('verificaActive trece pe activele înghețate, cu licență', () => {
  const { radacina, curata } = radacinaCuProiect();
  try {
    ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-proba', continut: SVG, extensie: 'svg' });
    ingheataActiv(radacina, 'p', { tip: 'iconita', id: 'phone', continut: SVG, extensie: 'svg' });
    const lock = citesteLock(path.join(radacina, 'video', 'p', 'motor.lock'));
    const r = verificaActive(radacina, 'p', lock);
    assert.equal(r.cod, 'C07');
    assert.equal(r.ok, true, JSON.stringify(r.erori));
    assert.deepEqual(r.valoare, { active: 2 });
  } finally {
    curata();
  }
});

test('un activ modificat după înghețare dă resursa-hash, iar reînghețarea nu-l „repară”', () => {
  const { radacina, curata } = radacinaCuProiect();
  try {
    ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-proba', continut: SVG, extensie: 'svg' });
    const fisier = path.join(radacina, 'video', 'p', 'active', 'desen', 'od-proba.svg');
    fs.writeFileSync(fisier, SVG.replace('M0 0', 'M1 1'));
    ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-proba', continut: SVG, extensie: 'svg' });
    const r = verificaActive(radacina, 'p', citesteLock(path.join(radacina, 'video', 'p', 'motor.lock')));
    assert.equal(r.ok, false);
    assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['resursa-hash', 'fisier:video/p/active/desen/od-proba.svg']]);
  } finally {
    curata();
  }
});

test('un activ șters dă resursa-lipsa; o piesă fără licență dă licenta-lipsa', () => {
  const { radacina, curata } = radacinaCuProiect();
  try {
    ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-proba', continut: SVG, extensie: 'svg' });
    ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-fara', continut: SVG, extensie: 'svg' });
    stergeRecursiv(path.join(radacina, 'video', 'p', 'active', 'desen', 'od-proba.svg'));
    const r = verificaActive(radacina, 'p', citesteLock(path.join(radacina, 'video', 'p', 'motor.lock')));
    assert.deepEqual(r.erori.map((e) => e.cod).sort(), ['licenta-lipsa', 'resursa-lipsa']);
  } finally {
    curata();
  }
});

test('T4: cu lista activelor folosite de plan, C07 verifică doar intrările din ea; motor.lock și fișierele rămân', () => {
  const { radacina, curata } = radacinaCuProiect();
  try {
    ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-proba', continut: SVG, extensie: 'svg' });
    ingheataActiv(radacina, 'p', { tip: 'desen', id: 'od-fara', continut: SVG, extensie: 'svg' });
    const caleLock = path.join(radacina, 'video', 'p', 'motor.lock');
    const lock = citesteLock(caleLock);
    const r = verificaActive(radacina, 'p', lock, ['active/desen/od-proba.svg']);
    assert.equal(r.ok, true, JSON.stringify(r.erori));
    assert.deepEqual(r.valoare, { active: 1 });
    // fără listă (apelanții vechi), toate intrările, ca înainte
    assert.deepEqual(verificaActive(radacina, 'p', lock).erori.map((e) => e.cod), ['licenta-lipsa']);
    assert.deepEqual(Object.keys(citesteLock(caleLock).active), ['active/desen/od-fara.svg', 'active/desen/od-proba.svg']);
  } finally {
    curata();
  }
});
