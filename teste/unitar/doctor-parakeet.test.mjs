import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificaParakeet } from '../../nucleu/lib/doctor/complet.mjs';
import { citesteVersiuni } from '../../nucleu/lib/versiuni.mjs';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSIUNI = citesteVersiuni(RADACINA);

function acasaFalsa(t, { instalat = true } = {}) {
  const acasa = fs.mkdtempSync(path.join(os.tmpdir(), 'mg acasa Ăîș '));
  t.after(() => fs.rmSync(acasa, { recursive: true, force: true }));
  const tr = VERSIUNI.transcriere;
  if (instalat) {
    const rt = path.join(acasa, '.cache', 'hyperframes', 'optional', `${tr.runtime}@${tr.versiune}-${process.platform}-${process.arch}`, 'node_modules', tr.runtime);
    fs.mkdirSync(rt, { recursive: true });
    fs.writeFileSync(path.join(rt, 'package.json'), '{}');
    const dir = path.join(acasa, '.cache', 'hyperframes', 'parakeet', tr.dir_model);
    fs.mkdirSync(dir, { recursive: true });
    for (const [nume, { octeti }] of Object.entries(tr.fisiere)) {
      const fd = fs.openSync(path.join(dir, nume), 'w');
      fs.ftruncateSync(fd, octeti);
      fs.closeSync(fd);
    }
  }
  return acasa;
}

test('doctor: parakeet instalat', (t) => {
  const r = verificaParakeet({ acasa: acasaFalsa(t), versiuni: VERSIUNI, radacina: RADACINA });
  assert.equal(r.id, 'parakeet');
  assert.equal(r.ok, true);
  assert.equal(r.nivel, 'ok');
  assert.ok(r.valoare.includes('1.13.8'));
});

test('doctor: parakeet neinstalat rămâne ok, doar raportează', (t) => {
  const r = verificaParakeet({ acasa: acasaFalsa(t, { instalat: false }), versiuni: VERSIUNI, radacina: RADACINA });
  assert.equal(r.nivel, 'ok');
  assert.equal(r.ok, true);
  assert.ok(r.valoare.includes('neinstalat'));
  assert.ok(r.valoare.includes('670 MB'));
  assert.equal(r.eroare, null);
});
