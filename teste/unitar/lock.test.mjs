import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { citesteLock, lockNou, scrieLock } from '../../nucleu/lib/lock.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const SABLON = { nume: 'proba', motor: 'hyperframes', meta: { versiune_schema: 1 }, sha256: 'a'.repeat(64) };
const VERSIUNI = { motoare: { hyperframes: { versiune: '0.8.96' } } };
const ACUM = new Date('2026-10-02T10:00:00.000Z');

test('lockNou are forma din harta 5.3', () => {
  assert.deepEqual(lockNou({ proiect: 'test', sablon: SABLON, versiuni: VERSIUNI, acum: ACUM }), {
    versiune: 1,
    proiect: 'test',
    creat_la: '2026-10-02T10:00:00.000Z',
    motor: { nume: 'hyperframes', versiune: '0.8.96' },
    sablon: { nume: 'proba', versiune_schema: 1, sha256: 'a'.repeat(64) },
    versiuni_sha256: null,
    active: {},
    aprobare: null,
    randari: { ultima_completa: null },
  });
});

test('lockNou refuză un motor fără versiune în VERSIUNI.json', () => {
  assert.throws(() => lockNou({ proiect: 'test', sablon: { ...SABLON, motor: 'remotion' }, versiuni: VERSIUNI, acum: ACUM }), /remotion/);
});

test('scrieLock și citesteLock păstrează conținutul, cu JSON indentat și LF final', () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const cale = join(radacina, 'video', 'test', 'motor.lock');
    const lock = lockNou({ proiect: 'test', sablon: SABLON, versiuni: VERSIUNI, acum: ACUM });
    scrieLock(cale, lock);
    assert.deepEqual(citesteLock(cale), lock);
    assert.equal(readFileSync(cale, 'utf8'), `${JSON.stringify(lock, null, 2)}\n`);
  } finally {
    curata();
  }
});
