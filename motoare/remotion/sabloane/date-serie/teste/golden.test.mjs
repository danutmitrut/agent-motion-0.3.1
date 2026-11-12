// Golden-ul șablonului (decizia 16): build/props.json și build/cronologie.json ale lui exemple/grafic.date.json,
// în teste/golden/grafic/ (aceleași nume ca în build/; testele React din partea C citesc golden/grafic/props.json),
// byte cu byte, pe orice sistem. Rescrise doar cu MG_GOLDEN_SCRIE=1, apoi verificate de om (diff-ul intră în commit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scrieJsonAtomic } from '../../../../../nucleu/lib/fisiere.mjs';
import { DIR_SABLON, DIR_EXEMPLE, exemplu, buildExemplu } from './ajutoare.mjs';

const SCRIE = process.env.MG_GOLDEN_SCRIE === '1';
const DIR_GOLDEN = path.join(DIR_SABLON, 'teste', 'golden', 'grafic');
const GOLDEN = ['props.json', 'cronologie.json'];

test('golden grafic: props.json și cronologie.json identice byte cu byte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-date-serie-golden-'));
  const { cronologie } = await buildExemplu(exemplu('grafic.date'), dir);
  scrieJsonAtomic(path.join(dir, 'cronologie.json'), cronologie); // ca nucleul, după construieste
  for (const fisier of GOLDEN) {
    const nou = fs.readFileSync(path.join(dir, fisier));
    const golden = path.join(DIR_GOLDEN, fisier);
    if (SCRIE) {
      fs.mkdirSync(DIR_GOLDEN, { recursive: true });
      fs.writeFileSync(golden, nou);
      continue;
    }
    assert.ok(fs.existsSync(golden), `lipsește teste/golden/grafic/${fisier} (rulează o dată cu MG_GOLDEN_SCRIE=1)`);
    // la diferență, build-ul rămâne în dir, pentru comparație
    assert.ok(nou.equals(fs.readFileSync(golden)), `build/${fisier} diferă de teste/golden/grafic/${fisier}; build-ul e în ${dir}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('golden-urile și exemplele sunt cu LF și fără BOM', () => {
  const fisiere = [
    ...['minim', 'grafic.date'].map((n) => path.join(DIR_EXEMPLE, `${n}.json`)),
    ...GOLDEN.map((f) => path.join(DIR_GOLDEN, f)),
  ];
  for (const f of fisiere) {
    const text = fs.readFileSync(f, 'utf8');
    assert.equal(text.charCodeAt(0) === 0xfeff, false, `${f} are BOM`);
    assert.equal(text.includes('\r'), false, `${f} are CRLF`);
  }
});
