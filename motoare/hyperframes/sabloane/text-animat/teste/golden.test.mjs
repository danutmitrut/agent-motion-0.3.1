// Golden-urile: build/plan.json și build/index.html ale fiecărui exemplu, byte cu byte, pe orice sistem.
// Rescrise doar cu MG_GOLDEN_SCRIE=1, apoi verificate de om (diff-ul intră în commit). Acceptarea (G10) compară
// build-ul real al lui mg randeaza cu aceleași fișiere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExemplu, DIR_EXEMPLE, EXEMPLE } from './ajutoare.mjs';

const DIR_SABLON = fileURLToPath(new URL('../', import.meta.url));
const SCRIE = process.env.MG_GOLDEN_SCRIE === '1';

for (const nume of EXEMPLE) {
  test(`golden ${nume}: plan.json și index.html identice byte cu byte`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mg-text-golden-${nume}-`));
    await buildExemplu(nume, dir);
    const dirGolden = path.join(DIR_SABLON, 'teste', 'golden', nume);
    for (const fisier of ['plan.json', 'index.html']) {
      const nou = fs.readFileSync(path.join(dir, fisier));
      const golden = path.join(dirGolden, fisier);
      if (SCRIE) {
        fs.mkdirSync(dirGolden, { recursive: true });
        fs.writeFileSync(golden, nou);
        continue;
      }
      assert.ok(fs.existsSync(golden), `lipsește teste/golden/${nume}/${fisier} (rulează o dată cu MG_GOLDEN_SCRIE=1)`);
      // la diferență, build-ul rămâne în dir, pentru comparație
      assert.ok(nou.equals(fs.readFileSync(golden)), `build/${fisier} al exemplului ${nume} diferă de golden; build-ul e în ${dir}`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('golden-urile și exemplele sunt cu LF și fără BOM', () => {
  const fisiere = [
    ...EXEMPLE.map((n) => path.join(DIR_EXEMPLE, `${n}.json`)),
    ...EXEMPLE.flatMap((n) => ['plan.json', 'index.html'].map((f) => path.join(DIR_SABLON, 'teste', 'golden', n, f))),
  ];
  for (const f of fisiere) {
    const text = fs.readFileSync(f, 'utf8');
    assert.equal(text.charCodeAt(0) === 0xfeff, false, `${f} are BOM`);
    assert.equal(text.includes('\r'), false, `${f} are CRLF`);
  }
});
