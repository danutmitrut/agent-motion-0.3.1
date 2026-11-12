import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const ASTEPTATE = ['node', 'platforma', 'claude', 'cale', 'spatiu', 'memorie', 'npm-ci:nucleu', 'npm-ci:motoare/hyperframes',
  'integritate', 'ffmpeg', 'ffprobe', 'chrome', 'fonturi', 'pluginuri-globale', 'pluginuri-hookuri', 'actualizare-hyperframes', 'randare-proba'];

/** @param {string} cale */
function amprenta(cale) {
  return fs.existsSync(cale) ? sha256Fisier(cale) : null;
}

function mg(argumente) {
  return new Promise((rezolva) => {
    execFile(process.execPath, [path.join(RADACINA, 'nucleu', 'mg.mjs'), ...argumente], {
      cwd: RADACINA, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000,
    }, (err, stdout, stderr) => {
      rezolva({ cod: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

test('node nucleu/mg.mjs doctor --ci --json iese cu 0 și nu atinge canarul, nici .instalat', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 30 * 60 * 1000 }, async () => {
  const canar = path.join(RADACINA, 'nucleu', '.canar');
  const instalat = path.join(RADACINA, '.instalat');
  const inainte = { canar: amprenta(canar), instalat: amprenta(instalat) };
  const r = await mg(['doctor', '--ci', '--json']);
  assert.equal(r.cod, 0, `${r.stdout}\n${r.stderr}`);
  const iesire = JSON.parse(r.stdout);
  assert.equal(iesire.ok, true);
  assert.equal(iesire.comanda, 'doctor');
  const ids = iesire.rezultat.verificari.map((v) => v.id);
  for (const id of ASTEPTATE) assert.ok(ids.includes(id), `lipsește verificarea ${id}`);
  assert.equal(iesire.rezultat.verificari.find((v) => v.id === 'claude').nivel, 'sarit');
  assert.equal(iesire.rezultat.verificari.find((v) => v.id === 'randare-proba').nivel, 'ok');
  assert.equal(iesire.rezultat.instalat, false);
  assert.deepEqual({ canar: amprenta(canar), instalat: amprenta(instalat) }, inainte);
  assert.ok(fs.existsSync(path.join(RADACINA, 'USER.md')));
  assert.ok(fs.existsSync(path.join(RADACINA, 'MEMORY.md')));
  const stare = JSON.parse(fs.readFileSync(path.join(RADACINA, 'nucleu', '.stare.json'), 'utf8'));
  assert.equal(stare.ok, true);
  assert.equal(stare.versiune, 1);
});
