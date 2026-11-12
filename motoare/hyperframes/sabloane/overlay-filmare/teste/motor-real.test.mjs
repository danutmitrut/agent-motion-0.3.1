// hyperframes check real pe exemple, cu argumentele lui argumenteMotor (decizia 13): --strict face din orice avertisment
// un eșec (C10), iar --caption-zone verifică banda subtitrărilor la momentele din seek. Rulează Chromium-ul lui
// HyperFrames, deci durează (zeci de secunde pe exemplu): rulează doar cu MG_TESTE_INTEGRARE=1, ca acceptările.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ruleazaHyperframes } from '../../../../../nucleu/lib/motor-hf.mjs';
import { buildExemplu, EXEMPLE, REPO } from './ajutoare.mjs';

async function check(dirBuild, argumente) {
  const r = await ruleazaHyperframes(['check', dirBuild, '--json', ...argumente], { radacina: REPO, timeoutMs: 300000 });
  return { cod: r.cod, json: JSON.parse(r.stdout) };
}

const OPT = { skip: process.env.MG_TESTE_INTEGRARE !== '1' && 'setează MG_TESTE_INTEGRARE=1', timeout: 600000 };
const gasiri = (j) => ['lint', 'runtime', 'layout', 'motion', 'contrast'].flatMap((k) => (j[k]?.findings ?? []).map((f) => `${k}/${f.severity}/${f.code} ${f.selector ?? ''} ${f.message ?? ''}`));

for (const nume of EXEMPLE) {
  test(`check --strict pe exemplul ${nume}: cod 0, nicio găsire`, OPT, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mg-overlay-check-${nume}-`));
    const b = await buildExemplu(nume, dir);
    t.after(() => { b.proiect.curata(); fs.rmSync(dir, { recursive: true, force: true }); });
    const m = (await import('../motor.mjs')).argumenteMotor(b.plan, b.proiect.dir);
    const { cod, json } = await check(dir, m.check.argumente);
    assert.deepEqual(gasiri(json), []);
    assert.equal(json.ok, true);
    assert.equal(cod, 0);
  });
}

test('check --strict prinde subtitrările fără data-layout-allow-caption-zone (banda e chiar verificată)', OPT, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-overlay-check-neg-'));
  const b = await buildExemplu('vertical', dir);
  t.after(() => { b.proiect.curata(); fs.rmSync(dir, { recursive: true, force: true }); });
  const html = path.join(dir, 'index.html');
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('<div id="subtitrari" data-layout-allow-caption-zone>', '<div id="subtitrari">'));
  const m = (await import('../motor.mjs')).argumenteMotor(b.plan, b.proiect.dir);
  const { cod, json } = await check(dir, m.check.argumente);
  assert.notEqual(cod, 0);
  assert.ok(json.layout.findings.some((f) => f.code === 'caption_zone_collision' && f.severity === 'error'), gasiri(json).join('\n'));
});
