// Pasul Remotion din mg doctor (planul I, I05): nimic cât timp nu e cerut; altfel npm ci în motoare/remotion
// (sau „la zi”) și Chrome Headless Shell al lui Remotion.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pasRemotion } from '../../nucleu/lib/doctor/index.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

// Un npm-cli.js de probă, ca rezolvaNpmCli să găsească npm (ca în doctor-npm-ffmpeg.test.mjs).
let npmFals;
before(() => {
  npmFals = creeazaRadacinaTemp({ fisiere: { 'npm/bin/npm-cli.js': '// npm' } });
});
after(() => npmFals.curata());
let salvat;
beforeEach(() => {
  salvat = process.env.npm_execpath;
  process.env.npm_execpath = path.join(npmFals.radacina, 'npm', 'bin', 'npm-cli.js');
});
afterEach(() => {
  if (salvat === undefined) delete process.env.npm_execpath;
  else process.env.npm_execpath = salvat;
});

const LOCK = {
  name: 'motor-remotion', version: '1.0.0', lockfileVersion: 3, requires: true,
  packages: {
    '': { name: 'motor-remotion', version: '1.0.0', dependencies: { remotion: '4.0.529' } },
    'node_modules/remotion': { version: '4.0.529', resolved: 'https://registry.npmjs.org/remotion/-/remotion-4.0.529.tgz', integrity: 'sha512-test', license: 'SEE LICENSE IN LICENSE.md' },
  },
};
const ascuns = () => {
  const packages = { ...LOCK.packages };
  delete packages[''];
  return JSON.stringify({ name: LOCK.name, version: LOCK.version, lockfileVersion: 3, requires: true, packages });
};

/** ctx de doctor cu ruleaza spion; `raspunsuri` se dau pe rând, ultimul se repetă. */
function ctxSpion(radacina, raspunsuri = [{ cod: 0, stdout: '', stderr: '' }]) {
  const apeluri = [];
  return {
    apeluri,
    ctx: {
      radacina,
      platforma: process.platform,
      ruleaza: async (comanda, argumente, optiuni) => {
        apeluri.push({ comanda, argumente, cwd: optiuni.cwd });
        return raspunsuri[Math.min(apeluri.length - 1, raspunsuri.length - 1)];
      },
    },
  };
}

test('Remotion necerut (fără node_modules și fără proiecte Remotion): un rând ok, niciun proces', async (t) => {
  const r = creeazaRadacinaTemp({ fisiere: { 'motoare/remotion/package-lock.json': JSON.stringify(LOCK), 'video/p/motor.lock': '{"motor":{"nume":"hyperframes"}}' } });
  t.after(r.curata);
  const { apeluri, ctx } = ctxSpion(r.radacina);
  assert.deepEqual(await pasRemotion(ctx), [
    { id: 'remotion', ok: true, nivel: 'ok', valoare: 'neinstalat (se instalează la primul proiect Remotion, cu acordul cursantului)', eroare: null },
  ]);
  assert.equal(apeluri.length, 0);
});

test('un proiect Remotion fără motor instalat: npm ci în motoare/remotion, apoi browser ensure', async (t) => {
  const r = creeazaRadacinaTemp({ fisiere: { 'motoare/remotion/package-lock.json': JSON.stringify(LOCK), 'video/p/motor.lock': '{"motor":{"nume":"remotion"}}' } });
  t.after(r.curata);
  const { apeluri, ctx } = ctxSpion(r.radacina);
  const rez = await pasRemotion(ctx);
  assert.deepEqual(rez.map((x) => [x.id, x.nivel, x.valoare]), [['npm-ci:motoare/remotion', 'ok', 'instalat'], ['chrome-remotion', 'ok', 'adus']]);
  const dir = path.join(r.radacina, 'motoare', 'remotion');
  assert.deepEqual(apeluri.map((a) => a.cwd), [dir, dir]);
  assert.deepEqual(apeluri[0].argumente.slice(1), ['ci', '--no-audit', '--no-fund']);
  assert.deepEqual(apeluri[1].argumente, [path.join(dir, 'node_modules', '@remotion', 'cli', 'remotion-cli.js'), 'browser', 'ensure']);
});

test('instalare la zi și browserul pe disc: „la zi” de două ori, niciun proces', async (t) => {
  const r = creeazaRadacinaTemp({
    fisiere: {
      'motoare/remotion/package-lock.json': JSON.stringify(LOCK),
      'motoare/remotion/node_modules/.package-lock.json': ascuns(),
      'motoare/remotion/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell': 'binar',
    },
  });
  t.after(r.curata);
  const { apeluri, ctx } = ctxSpion(r.radacina);
  assert.deepEqual((await pasRemotion(ctx)).map((x) => [x.id, x.nivel, x.valoare]), [['npm-ci:motoare/remotion', 'ok', 'la zi'], ['chrome-remotion', 'ok', 'la zi']]);
  assert.equal(apeluri.length, 0);
});

test('browserul nu se poate aduce: chrome-lipsa pe mediu.chrome-remotion; npm ci picat oprește pasul', async (t) => {
  const r = creeazaRadacinaTemp({ fisiere: { 'motoare/remotion/package-lock.json': JSON.stringify(LOCK), 'motoare/remotion/node_modules/.package-lock.json': ascuns() } });
  t.after(r.curata);
  let { ctx } = ctxSpion(r.radacina, [{ cod: 1, stdout: '', stderr: 'Error: getaddrinfo ENOTFOUND storage.googleapis.com' }]);
  let rez = await pasRemotion(ctx);
  assert.deepEqual(rez.map((x) => [x.id, x.nivel]), [['npm-ci:motoare/remotion', 'ok'], ['chrome-remotion', 'eroare']]);
  assert.equal(rez[1].eroare.cod, 'chrome-lipsa');
  assert.equal(rez[1].eroare.camp, 'mediu.chrome-remotion');
  assert.match(rez[1].eroare.mesaj, /ENOTFOUND/);

  const r2 = creeazaRadacinaTemp({ fisiere: { 'motoare/remotion/package-lock.json': JSON.stringify(LOCK), 'video/p/motor.lock': '{"motor":{"nume":"remotion"}}' } });
  t.after(r2.curata);
  const spion = ctxSpion(r2.radacina, [{ cod: 1, stdout: '', stderr: 'npm error code ECONNRESET' }]);
  rez = await pasRemotion(spion.ctx);
  assert.deepEqual(rez.map((x) => [x.id, x.nivel]), [['npm-ci:motoare/remotion', 'eroare']]);
  assert.equal(spion.apeluri.length, 1, 'browserul nu se mai încearcă');
});
