import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rezolvaNpmCli, ruleazaNpmCi } from '../../nucleu/lib/doctor/npm.mjs';
import { EroareFatala } from '../../nucleu/lib/erori.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

let npmExecpathSalvat;
beforeEach(() => {
  npmExecpathSalvat = process.env.npm_execpath;
  delete process.env.npm_execpath;
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
    '': { name: 'nucleu', version: '0.1.0', dependencies: { yaml: '2.9.1' } },
    'node_modules/yaml': { version: '2.9.1', resolved: 'https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz', integrity: 'sha512-test', license: 'ISC' },
    'node_modules/@esbuild/win32-arm64': { version: '0.25.0', optional: true, os: ['win32'], cpu: ['arm64'] },
  },
};

/** Fișierul ascuns scris de npm: fără intrarea rădăcinii și fără pachetele opționale neinstalate. */
function ascunsDin(lock) {
  const packages = { ...lock.packages };
  delete packages[''];
  delete packages['node_modules/@esbuild/win32-arm64'];
  return { name: lock.name, version: lock.version, lockfileVersion: lock.lockfileVersion, requires: true, packages };
}

function ctxCuSpion(radacina, raspuns = { cod: 0, stdout: '', stderr: '' }) {
  const apeluri = [];
  return {
    apeluri,
    ctx: {
      radacina,
      platforma: process.platform,
      ruleaza: async (comanda, argumente, optiuni) => { apeluri.push({ comanda, argumente, optiuni }); return raspuns; },
    },
  };
}

test('rezolvaNpmCli găsește npm-cli.js în structura Windows (lângă node.exe)', () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: { 'nodejs/node.exe': '', 'nodejs/node_modules/npm/bin/npm-cli.js': '// npm' },
  });
  try {
    const gasit = rezolvaNpmCli(path.join(radacina, 'nodejs', 'node.exe'), 'win32');
    assert.equal(gasit, path.resolve(radacina, 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  } finally {
    curata();
  }
});

test('rezolvaNpmCli găsește npm-cli.js în structura de pe Mac (bin/node și lib/node_modules)', () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: { 'node22/bin/node': '', 'node22/lib/node_modules/npm/bin/npm-cli.js': '// npm' },
  });
  try {
    const gasit = rezolvaNpmCli(path.join(radacina, 'node22', 'bin', 'node'), 'darwin');
    assert.equal(gasit, path.resolve(radacina, 'node22', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  } finally {
    curata();
  }
});

test('rezolvaNpmCli urmează legătura bin/npm spre npm-cli.js (Homebrew)', { skip: process.platform === 'win32' && 'symlinkurile cer drepturi pe Windows' }, () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: { 'Cellar/node/bin/node': '', 'lib/node_modules/npm/bin/npm-cli.js': '// npm' },
  });
  try {
    fs.symlinkSync(path.join(radacina, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(radacina, 'Cellar', 'node', 'bin', 'npm'));
    const gasit = rezolvaNpmCli(path.join(radacina, 'Cellar', 'node', 'bin', 'node'), 'darwin');
    assert.equal(gasit, fs.realpathSync(path.join(radacina, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')));
  } finally {
    curata();
  }
});

test('rezolvaNpmCli preferă npm_execpath când arată spre npm-cli.js', () => {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'altundeva/npm-cli.js': '// npm' } });
  try {
    process.env.npm_execpath = path.join(radacina, 'altundeva', 'npm-cli.js');
    assert.equal(rezolvaNpmCli(path.join(radacina, 'nodejs', 'node.exe'), 'win32'), path.resolve(radacina, 'altundeva', 'npm-cli.js'));
  } finally {
    curata();
  }
});

test('rezolvaNpmCli aruncă EroareFatala npm-ci-esuat când nu găsește nimic', () => {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'gol/node.exe': '' } });
  try {
    assert.throws(() => rezolvaNpmCli(path.join(radacina, 'gol', 'node.exe'), 'win32'),
      (e) => e instanceof EroareFatala && e.eroareMg.cod === 'npm-ci-esuat' && e.eroareMg.camp === 'mediu.npm');
  } finally {
    curata();
  }
});

test('ruleazaNpmCi sare peste instalare când node_modules/.package-lock.json e la zi', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: {
      'nucleu/package-lock.json': JSON.stringify(LOCK, null, 2),
      'nucleu/node_modules/.package-lock.json': JSON.stringify(ascunsDin(LOCK), null, 2),
    },
  });
  try {
    const { apeluri, ctx } = ctxCuSpion(radacina);
    const r = await ruleazaNpmCi(path.join(radacina, 'nucleu'), ctx);
    assert.deepEqual(r, { id: 'npm-ci:nucleu', ok: true, nivel: 'ok', valoare: 'la zi', eroare: null });
    assert.equal(apeluri.length, 0);
  } finally {
    curata();
  }
});

test('ruleazaNpmCi rulează npm ci prin node și npm-cli.js când instalarea diferă', async () => {
  const altaVersiune = ascunsDin(LOCK);
  altaVersiune.packages['node_modules/yaml'] = { ...altaVersiune.packages['node_modules/yaml'], version: '2.8.0' };
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: {
      'motoare/hyperframes/package-lock.json': JSON.stringify(LOCK, null, 2),
      'motoare/hyperframes/node_modules/.package-lock.json': JSON.stringify(altaVersiune, null, 2),
    },
  });
  try {
    const { apeluri, ctx } = ctxCuSpion(radacina);
    const dir = path.join(radacina, 'motoare', 'hyperframes');
    const r = await ruleazaNpmCi(dir, ctx);
    assert.equal(r.id, 'npm-ci:motoare/hyperframes');
    assert.equal(r.nivel, 'ok');
    assert.equal(apeluri.length, 1);
    assert.equal(apeluri[0].comanda, process.execPath);
    assert.match(apeluri[0].argumente[0], /npm-cli\.js$/);
    assert.deepEqual(apeluri[0].argumente.slice(1), ['ci', '--no-audit', '--no-fund']);
    assert.equal(apeluri[0].optiuni.cwd, dir);
  } finally {
    curata();
  }
});

test('ruleazaNpmCi rulează npm ci când lipsește node_modules și raportează npm-ci-esuat la cod 1', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'nucleu/package-lock.json': JSON.stringify(LOCK) } });
  try {
    const { apeluri, ctx } = ctxCuSpion(radacina, { cod: 1, stdout: '', stderr: 'npm error code ECONNRESET\nnpm error network' });
    const r = await ruleazaNpmCi(path.join(radacina, 'nucleu'), ctx);
    assert.equal(apeluri.length, 1);
    assert.equal(r.nivel, 'eroare');
    assert.equal(r.ok, false);
    assert.equal(r.eroare.cod, 'npm-ci-esuat');
    assert.equal(r.eroare.camp, 'mediu.npm-ci:nucleu');
    assert.match(r.eroare.mesaj, /ECONNRESET/);
  } finally {
    curata();
  }
});
