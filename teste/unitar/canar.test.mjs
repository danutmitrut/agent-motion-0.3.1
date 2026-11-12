import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scrieCanar, confirmaCanar } from '../../nucleu/lib/doctor/canar.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { scrieChitantaCanar } from '../../nucleu/lib/garda/canar.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const ACUM = new Date('2026-10-01T10:00:00.000Z');

function stareCu(sha256) {
  return { versiune: 1, verificari: [], canar: { scris_la: ACUM.toISOString(), sha256, confirmat: false, confirmat_la: null } };
}

test('scrieCanar scrie nucleu/.canar cu marcaj de timp și sha256 corect', () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const r = scrieCanar(radacina, ACUM);
    assert.equal(r.cale, 'nucleu/.canar');
    const fisier = path.join(radacina, 'nucleu', '.canar');
    const continut = fs.readFileSync(fisier, 'utf8');
    assert.match(continut, /^canar 2026-10-01T10:00:00\.000Z [0-9a-f]{32}\n$/);
    assert.equal(r.sha256, sha256Fisier(fisier));
  } finally {
    curata();
  }
});

test('două canare scrise la același moment diferă (conținut aleator)', () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    assert.notEqual(scrieCanar(radacina, ACUM).sha256, scrieCanar(radacina, ACUM).sha256);
  } finally {
    curata();
  }
});

test('canarul neatins, cu chitanța gărzii pentru o scriere prin terminal, e confirmat', () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const { sha256 } = scrieCanar(radacina, ACUM);
    // D1: fără chitanță, confirmarea dă canar-nefacut (teste/unitar/doctor-canar-chitanta.test.mjs).
    assert.equal(scrieChitantaCanar(radacina, 'Bash', ACUM), true);
    assert.deepEqual(confirmaCanar(radacina, stareCu(sha256)), { id: 'canar', ok: true, nivel: 'ok', valoare: 'neatins', eroare: null });
  } finally {
    curata();
  }
});

test('un canar modificat dă canar-esuat', () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const { sha256 } = scrieCanar(radacina, ACUM);
    fs.writeFileSync(path.join(radacina, 'nucleu', '.canar'), 'test\n');
    const r = confirmaCanar(radacina, stareCu(sha256));
    assert.equal(r.ok, false);
    assert.equal(r.valoare, 'modificat');
    assert.equal(r.eroare.cod, 'canar-esuat');
    assert.equal(r.eroare.camp, 'mediu.canar');
  } finally {
    curata();
  }
});

test('un canar șters dă canar-esuat', () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const { sha256 } = scrieCanar(radacina, ACUM);
    fs.rmSync(path.join(radacina, 'nucleu', '.canar'));
    const r = confirmaCanar(radacina, stareCu(sha256));
    assert.equal(r.valoare, 'lipsă');
    assert.equal(r.eroare.cod, 'canar-esuat');
  } finally {
    curata();
  }
});

test('fără canar în stare (sau fără stare) dă canar-nefacut', () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    assert.equal(confirmaCanar(radacina, null).eroare.cod, 'canar-nefacut');
    assert.equal(confirmaCanar(radacina, { versiune: 1, verificari: [], canar: null }).eroare.cod, 'canar-nefacut');
  } finally {
    curata();
  }
});
