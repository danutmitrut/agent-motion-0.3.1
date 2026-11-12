// F12: binarul ffmpeg vine din scriptul install al lui ffmpeg-static, nu din tarball. Doctorul nu are voie
// să declare instalarea „la zi” fără binar și nici să lase un ignore-scripts=true din .npmrc să sară scriptul.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ruleazaNpmCi } from '../../nucleu/lib/doctor/npm.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

// Un npm-cli.js de probă, ca rezolvaNpmCi să găsească npm și pentru platforma simulată (win32 pe Mac sau invers).
let npmFals;
before(() => {
  npmFals = creeazaRadacinaTemp({ fisiere: { 'npm/bin/npm-cli.js': '// npm' } });
});
after(() => npmFals.curata());

let npmExecpathSalvat;
beforeEach(() => {
  npmExecpathSalvat = process.env.npm_execpath;
  process.env.npm_execpath = path.join(npmFals.radacina, 'npm', 'bin', 'npm-cli.js');
});
afterEach(() => {
  if (npmExecpathSalvat === undefined) delete process.env.npm_execpath;
  else process.env.npm_execpath = npmExecpathSalvat;
});

const LOCK = {
  name: 'nucleu',
  version: '0.1.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'nucleu', version: '0.1.0', dependencies: { 'ffmpeg-static': '5.3.0' } },
    'node_modules/ffmpeg-static': { version: '5.3.0', resolved: 'https://registry.npmjs.org/ffmpeg-static/-/ffmpeg-static-5.3.0.tgz', integrity: 'sha512-test', hasInstallScript: true, license: 'GPL-3.0-or-later' },
  },
};

function ascunsDin(lock) {
  const packages = { ...lock.packages };
  delete packages[''];
  return { name: lock.name, version: lock.version, lockfileVersion: lock.lockfileVersion, requires: true, packages };
}

/** O instalare „la zi” după fișierul ascuns, cu sau fără binarul ffmpeg al lui ffmpeg-static. */
function pregateste(binare = []) {
  const fisiere = {
    'nucleu/package-lock.json': JSON.stringify(LOCK, null, 2),
    'nucleu/node_modules/.package-lock.json': JSON.stringify(ascunsDin(LOCK), null, 2),
    'nucleu/node_modules/ffmpeg-static/package.json': '{"name":"ffmpeg-static","version":"5.3.0"}',
  };
  for (const b of binare) fisiere[`nucleu/node_modules/ffmpeg-static/${b}`] = 'binar';
  return creeazaRadacinaTemp({ fisiere });
}

function ctxCuSpion(radacina, platforma, raspuns = { cod: 0, stdout: '', stderr: '' }) {
  const apeluri = [];
  return {
    apeluri,
    ctx: {
      radacina,
      platforma,
      ruleaza: async (comanda, argumente, optiuni) => { apeluri.push({ comanda, argumente, optiuni }); return raspuns; },
    },
  };
}

const ALTA_PLATFORMA = process.platform === 'win32' ? 'darwin' : 'win32';

test('npm ci rulează cu npm_config_ignore_scripts=false, ca .npmrc-ul cursantului să nu sară scriptul install', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'nucleu/package-lock.json': JSON.stringify(LOCK) } });
  try {
    const { apeluri, ctx } = ctxCuSpion(radacina, process.platform);
    await ruleazaNpmCi(path.join(radacina, 'nucleu'), ctx);
    assert.equal(apeluri.length, 1);
    assert.equal(apeluri[0].optiuni.env.npm_config_ignore_scripts, 'false');
    assert.equal(apeluri[0].optiuni.env.npm_config_update_notifier, 'false');
    assert.deepEqual(apeluri[0].argumente.slice(1), ['ci', '--no-audit', '--no-fund']);
  } finally {
    curata();
  }
});

test('o instalare la zi fără binarul ffmpeg (șters sau pus în carantină) reia npm ci', async () => {
  const { radacina, curata } = pregateste();
  try {
    const { apeluri, ctx } = ctxCuSpion(radacina, 'darwin');
    await ruleazaNpmCi(path.join(radacina, 'nucleu'), ctx);
    assert.equal(apeluri.length, 1, 'npm ci trebuie reluat când binarul lipsește');
  } finally {
    curata();
  }
});

test('o instalare la zi cu binarul ffmpeg rămâne la zi, fără npm ci', async () => {
  const { radacina, curata } = pregateste(['ffmpeg']);
  try {
    const { apeluri, ctx } = ctxCuSpion(radacina, 'darwin');
    const r = await ruleazaNpmCi(path.join(radacina, 'nucleu'), ctx);
    assert.deepEqual(r, { id: 'npm-ci:nucleu', ok: true, nivel: 'ok', valoare: 'la zi', eroare: null });
    assert.equal(apeluri.length, 0);
  } finally {
    curata();
  }
});

test('pe win32 binarul cerut e ffmpeg.exe', async () => {
  const { radacina, curata } = pregateste(['ffmpeg']);
  try {
    const { apeluri, ctx } = ctxCuSpion(radacina, 'win32');
    await ruleazaNpmCi(path.join(radacina, 'nucleu'), ctx);
    assert.equal(apeluri.length, 1, 'ffmpeg fără .exe nu ajunge pe win32');
  } finally {
    curata();
  }
  const cuExe = pregateste(['ffmpeg.exe']);
  try {
    const { apeluri, ctx } = ctxCuSpion(cuExe.radacina, 'win32');
    const r = await ruleazaNpmCi(path.join(cuExe.radacina, 'nucleu'), ctx);
    assert.equal(r.valoare, 'la zi');
    assert.equal(apeluri.length, 0);
  } finally {
    cuExe.curata();
  }
});

test('npm ci reușit, dar fără binarul ffmpeg, dă npm-ci-esuat cu o cauză clară, nu „instalat”', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'nucleu/package-lock.json': JSON.stringify(LOCK) } });
  try {
    const { ctx } = ctxCuSpion(radacina, ALTA_PLATFORMA);
    const r = await ruleazaNpmCi(path.join(radacina, 'nucleu'), ctx);
    assert.equal(r.ok, false);
    assert.equal(r.nivel, 'eroare');
    assert.equal(r.eroare.cod, 'npm-ci-esuat');
    assert.equal(r.eroare.camp, 'mediu.npm-ci:nucleu');
    assert.match(r.eroare.mesaj, /ffmpeg-static/);
    assert.match(r.eroare.mesaj, /node_modules\/ffmpeg-static\/ffmpeg/);
    assert.doesNotMatch(r.eroare.sugestie, /Rulează node nucleu\/mg\.mjs doctor, care instalează/);
  } finally {
    curata();
  }
});

test('un lock fără ffmpeg-static (motoare/hyperframes) nu cere binarul', async () => {
  const lock = { name: 'm', lockfileVersion: 3, packages: { '': {}, 'node_modules/yaml': { version: '2.9.1' } } };
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: {
      'motoare/hyperframes/package-lock.json': JSON.stringify(lock),
      'motoare/hyperframes/node_modules/.package-lock.json': JSON.stringify({ name: 'm', lockfileVersion: 3, packages: { 'node_modules/yaml': { version: '2.9.1' } } }),
    },
  });
  try {
    const { apeluri, ctx } = ctxCuSpion(radacina, 'win32');
    const r = await ruleazaNpmCi(path.join(radacina, 'motoare', 'hyperframes'), ctx);
    assert.equal(r.valoare, 'la zi');
    assert.equal(apeluri.length, 0);
  } finally {
    curata();
  }
});
