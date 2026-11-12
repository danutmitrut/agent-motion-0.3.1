// Spec 7.2, „Testul de acceptare”, punctul 4: durata, numărul de scene, textele și momentele cadrelor de control
// ale fiecărui exemplu, scrise în teste/asteptari/<exemplu>.json (MG_GOLDEN_SCRIE=1 le rescrie, omul le verifică).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExemplu, EXEMPLE } from './ajutoare.mjs';

const DIR_ASTEPTARI = fileURLToPath(new URL('./asteptari/', import.meta.url));
const SCRIE = process.env.MG_GOLDEN_SCRIE === '1';

function asteptariDin(cron) {
  return {
    durata: cron.durata,
    scene: cron.segmente.length,
    texte: cron.segmente.flatMap((s) => s.texte),
    momente: cron.momente_foaie.map((m) => m.t),
  };
}

for (const nume of EXEMPLE) {
  test(`asteptari ${nume}: durata, scenele, textele și momentele foii`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mg-text-asteptari-${nume}-`));
    try {
      const a = asteptariDin(await buildExemplu(nume, dir));
      const cale = path.join(DIR_ASTEPTARI, `${nume}.json`);
      if (SCRIE) {
        fs.mkdirSync(DIR_ASTEPTARI, { recursive: true });
        fs.writeFileSync(cale, `${JSON.stringify(a, null, 2)}\n`);
        return;
      }
      assert.deepEqual(a, JSON.parse(fs.readFileSync(cale, 'utf8')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('asteptari minim: valorile calculate de mână în G07', () => {
  const a = JSON.parse(fs.readFileSync(path.join(DIR_ASTEPTARI, 'minim.json'), 'utf8'));
  assert.equal(a.durata, 12.7);
  assert.equal(a.scene, 3);
  assert.deepEqual(a.momente, [1.35, 4.4, 6.7, 9.2, 11.21, 12.667]);
  assert.ok(a.texte.includes('Lucrezi 12 ore') && a.texte.includes('nu ajungi'));
});
