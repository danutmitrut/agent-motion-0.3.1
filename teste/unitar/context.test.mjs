import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { citesteLock } from '../../nucleu/lib/lock.mjs';
import { creeazaCtx, MODURI } from '../../nucleu/lib/context.mjs';

const BAZA = { radacina: '/r', proiect: 'p', dirProiect: '/r/video/p', sablon: { nume: 'proba' } };

test('M6: creeazaCtx are mereu aceleași chei, cu null pentru ce nu există încă', () => {
  const ctx = creeazaCtx({ ...BAZA, mod: 'schita' });
  assert.deepEqual(Object.keys(ctx).sort(), ['brand', 'catalog', 'dirProiect', 'ff', 'ingheataActiv', 'intern', 'mod', 'proiect', 'radacina', 'sablon', 'stil']);
  assert.equal(ctx.mod, 'schita');
  for (const k of ['brand', 'catalog', 'ff', 'intern', 'stil']) assert.equal(ctx[k], null, k);
  assert.equal(typeof ctx.ingheataActiv, 'function');
});

test('M6: un mod necunoscut aruncă', () => {
  assert.deepEqual(MODURI, ['doar-verificare', 'schita', 'complet']);
  assert.throws(() => creeazaCtx({ ...BAZA, mod: 'doar_verificare' }), TypeError);
});

test('M8: ctx.ingheataActiv scrie activul în video/<p>/active/ și în motor.lock', () => {
  const lock = {
    versiune: 1, proiect: 'p', creat_la: '2026-10-01T00:00:00.000Z',
    motor: { nume: 'hyperframes', versiune: '0.8.96' },
    sablon: { nume: 'reel-ilustrat', versiune_schema: 1, sha256: 'x' },
    versiuni_sha256: 'x', active: {}, aprobare: null, randari: { ultima_completa: null },
  };
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'video/p/motor.lock': `${JSON.stringify(lock, null, 2)}\n` } });
  try {
    const dirProiect = path.join(radacina, 'video', 'p');
    const ctx = creeazaCtx({ radacina, proiect: 'p', dirProiect, sablon: { nume: 'proba' }, mod: 'schita' });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 10"/></svg>\n';
    const { cale, sha256 } = ctx.ingheataActiv({ tip: 'desen', id: 'proba', continut: svg, extensie: 'svg' });
    assert.equal(cale, 'active/desen/proba.svg');
    assert.equal(fs.readFileSync(path.join(dirProiect, 'active', 'desen', 'proba.svg'), 'utf8'), svg);
    assert.equal(citesteLock(path.join(dirProiect, 'motor.lock')).active[cale], sha256);
  } finally { curata(); }
});
