import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { argumenteMotor, momenteBanda } from '../motor.mjs';

const plan = (elemente, banda = [72, 1240, 858, 300]) => ({ latime: 1080, inaltime: 1920, durata: 20, banda_subtitrari: banda, elemente: elemente.map((complet) => ({ complet })) });

test('banda subtitrărilor în fracțiuni 0-1 din cadru, momentele în fracțiuni din durată', () => {
  const m = argumenteMotor(plan([3, 0.75]), '/tmp/proiect');
  assert.deepEqual(m.check.argumente, ['--strict', '--caption-zone', 'x0=0.0667;y0=0.6458;x1=0.8611;y1=0.8021;severity=error;seek=0.0375,0.15,0.5', '--frame-check', 'severity=error']);
  assert.deepEqual(m.randare.argumente, ['--no-best-effort', '--frames-cache-dir', path.join('/tmp/proiect', '.cache')]);
});

test('momentele: fără dubluri, sortate, cel mult 12', () => {
  assert.deepEqual(momenteBanda(plan([10, 10, 2])), [0.1, 0.5]);
  assert.equal(momenteBanda(plan(Array.from({ length: 12 }, (_, i) => i + 0.3))).length, 12);
});
