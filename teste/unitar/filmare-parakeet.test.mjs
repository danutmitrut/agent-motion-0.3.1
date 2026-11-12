import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stareParakeet, mediuNpm } from '../../nucleu/lib/filmare/parakeet.mjs';
import { citesteVersiuni } from '../../nucleu/lib/versiuni.mjs';

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSIUNI = citesteVersiuni(RADACINA);

test('VERSIUNI.transcriere e aceeași cu constantele din HyperFrames-ul fixat', () => {
  const dist = path.join(RADACINA, 'motoare', 'hyperframes', 'node_modules', 'hyperframes', 'dist');
  const fisier = fs.readdirSync(dist).find((f) => /^sherpa-.*\.js$/.test(f));
  assert.ok(fisier, 'hyperframes/dist nu mai are modulul sherpa; versiunea HyperFrames s-a schimbat');
  const text = fs.readFileSync(path.join(dist, fisier), 'utf8');
  const t = VERSIUNI.transcriere;
  assert.match(text, new RegExp(`var RUNTIME = "${t.runtime}"`));
  assert.match(text, new RegExp(`var RUNTIME_VERSION = "${t.versiune.replace(/\./g, '\\.')}"`));
  assert.match(text, new RegExp(`var MODEL_REPO = "${t.model}"`));
  assert.match(text, new RegExp(`var MODEL_REVISION = "${t.revizie}"`));
  for (const [nume, { octeti, sha256 }] of Object.entries(t.fisiere)) {
    assert.ok(text.includes(`name: "${nume}",\n    bytes: ${octeti},\n    sha256: "${sha256}"`), nume);
  }
});

export function acasaFalsa(t, { runtime = true, model = true, trunchiat = false } = {}) {
  const acasa = fs.mkdtempSync(path.join(os.tmpdir(), 'mg acasa Ăîș '));
  t.after(() => fs.rmSync(acasa, { recursive: true, force: true }));
  const tr = VERSIUNI.transcriere;
  if (runtime) {
    const dir = path.join(acasa, '.cache', 'hyperframes', 'optional', `${tr.runtime}@${tr.versiune}-${process.platform}-${process.arch}`, 'node_modules', tr.runtime);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  }
  if (model) {
    const dir = path.join(acasa, '.cache', 'hyperframes', 'parakeet', tr.dir_model);
    fs.mkdirSync(dir, { recursive: true });
    for (const [nume, { octeti }] of Object.entries(tr.fisiere)) {
      const fd = fs.openSync(path.join(dir, nume), 'w');
      fs.ftruncateSync(fd, trunchiat && nume === 'tokens.txt' ? octeti - 1 : octeti);
      fs.closeSync(fd);
    }
  }
  return acasa;
}

test('stareParakeet: instalat când există runtime-ul și fișierele modelului, cu mărimile exacte', (t) => {
  assert.equal(stareParakeet({ acasa: acasaFalsa(t), versiuni: VERSIUNI }).instalat, true);
});

test('stareParakeet: lipsurile numite', (t) => {
  assert.deepEqual(stareParakeet({ acasa: acasaFalsa(t, { runtime: false }), versiuni: VERSIUNI }).lipsa, ['runtime']);
  const fara = stareParakeet({ acasa: acasaFalsa(t, { model: false }), versiuni: VERSIUNI });
  assert.equal(fara.instalat, false);
  assert.deepEqual(fara.lipsa, ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt']);
  assert.deepEqual(stareParakeet({ acasa: acasaFalsa(t, { trunchiat: true }), versiuni: VERSIUNI }).lipsa, ['tokens.txt']);
});

test('mediuNpm: folderul lui node primul în PATH, restul neschimbat', () => {
  const sep = path.delimiter;
  const m = mediuNpm({ PATH: `a${sep}b`, ALTCEVA: '1' });
  assert.equal(m.PATH.split(sep)[0], path.dirname(process.execPath));
  assert.ok(m.PATH.endsWith(`a${sep}b`));
  assert.equal(m.ALTCEVA, '1');
  const w = mediuNpm({ Path: 'x' });
  assert.equal(w.Path.split(sep)[0], path.dirname(process.execPath), 'pe Windows cheia e Path');
});
