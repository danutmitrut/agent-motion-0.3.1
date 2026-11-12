// Remotion la cerere (planul I, I02): starea instalării, instalarea cu npm ci și browser ensure (ruleaza injectat),
// semnalul pentru mg doctor și versiunile fixate din motoare/remotion.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { COD_IESIRE, EroareFatala } from '../../nucleu/lib/erori.mjs';
import { instalareLaZi } from '../../nucleu/lib/doctor/npm.mjs';
import {
  CLI_REMOTION, DIR_REMOTION, instaleazaRemotion, mediuRemotion, remotionCerut, stareRemotion,
} from '../../nucleu/lib/motoare/remotion-instalare.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = radacinaAgent(import.meta.url, 2);
const REL = DIR_REMOTION.join('/');

// Un npm-cli.js de probă, ca rezolvaNpmCi să găsească npm (ca în doctor-npm-ffmpeg.test.mjs).
let npmFals;
let npmExecpathSalvat;
before(() => {
  npmFals = creeazaRadacinaTemp({ fisiere: { 'npm/bin/npm-cli.js': '// npm' } });
});
after(() => npmFals.curata());
beforeEach(() => {
  npmExecpathSalvat = process.env.npm_execpath;
  process.env.npm_execpath = path.join(npmFals.radacina, 'npm', 'bin', 'npm-cli.js');
});
afterEach(() => {
  if (npmExecpathSalvat === undefined) delete process.env.npm_execpath;
  else process.env.npm_execpath = npmExecpathSalvat;
});

const LOCK = {
  name: 'agent-motion-motor-remotion',
  version: '0.1.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': { name: 'agent-motion-motor-remotion', version: '0.1.0', dependencies: { remotion: '4.0.529' } },
    'node_modules/remotion': { version: '4.0.529', resolved: 'https://registry.npmjs.org/remotion/-/remotion-4.0.529.tgz', integrity: 'sha512-test', license: 'SEE LICENSE IN LICENSE.md' },
  },
};

function lockAscuns() {
  const packages = { ...LOCK.packages };
  delete packages[''];
  return { name: LOCK.name, version: LOCK.version, lockfileVersion: LOCK.lockfileVersion, requires: true, packages };
}

/** Ce lasă pe disc un npm ci reușit: fișierul ascuns al lui npm și pachetul remotion. */
function scrieInstalare(radacina) {
  const dir = path.join(radacina, ...DIR_REMOTION, 'node_modules');
  fs.mkdirSync(path.join(dir, 'remotion'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.package-lock.json'), JSON.stringify(lockAscuns()));
  fs.writeFileSync(path.join(dir, 'remotion', 'package.json'), '{"name":"remotion","version":"4.0.529"}');
}

/** Ce lasă pe disc un browser ensure reușit. */
function scrieBrowser(radacina) {
  const dir = path.join(radacina, ...DIR_REMOTION, 'node_modules', '.remotion', 'chrome-headless-shell');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'VERSION'), 'test');
}

const radacinaCuLock = () => creeazaRadacinaTemp({ fisiere: { [`${REL}/package-lock.json`]: JSON.stringify(LOCK) } });

test('stareRemotion: fără nimic lipsesc pachetele și browserul; un folder gol de browser nu ajunge', (t) => {
  const r = radacinaCuLock();
  t.after(r.curata);
  assert.deepEqual(stareRemotion(r.radacina), { instalat: false, lipsa: ['pachete', 'browser'] });
  scrieInstalare(r.radacina);
  assert.equal(instalareLaZi(path.join(r.radacina, ...DIR_REMOTION)), true);
  assert.deepEqual(stareRemotion(r.radacina), { instalat: false, lipsa: ['browser'] });
  fs.mkdirSync(path.join(r.radacina, ...DIR_REMOTION, 'node_modules', '.remotion', 'chrome-headless-shell'), { recursive: true });
  assert.deepEqual(stareRemotion(r.radacina).lipsa, ['browser']);
  scrieBrowser(r.radacina);
  assert.deepEqual(stareRemotion(r.radacina), { instalat: true, lipsa: [] });
});

test('instaleazaRemotion: npm ci în motoare/remotion, apoi browser ensure, fără cheile API în mediu', async (t) => {
  const r = radacinaCuLock();
  t.after(r.curata);
  const cheie = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'valoare-de-test';
  t.after(() => {
    if (cheie === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = cheie;
  });
  const apeluri = [];
  const ruleaza = async (comanda, argumente, optiuni) => {
    apeluri.push({ comanda, argumente, optiuni });
    if (argumente[1] === 'ci') scrieInstalare(r.radacina);
    else scrieBrowser(r.radacina);
    return { cod: 0, stdout: 'Has browser at /x', stderr: '' };
  };
  const dir = path.join(r.radacina, ...DIR_REMOTION);
  assert.deepEqual(await instaleazaRemotion(r.radacina, { ruleaza }), { instalat: true, lipsa: [] });
  assert.equal(apeluri.length, 2);
  assert.deepEqual(apeluri[0].argumente.slice(1), ['ci', '--no-audit', '--no-fund']);
  assert.equal(apeluri[0].optiuni.cwd, dir);
  assert.equal(apeluri[1].comanda, process.execPath);
  assert.deepEqual(apeluri[1].argumente, [path.join(dir, ...CLI_REMOTION), 'browser', 'ensure']);
  assert.equal(apeluri[1].optiuni.cwd, dir);
  assert.equal(apeluri[1].optiuni.env.GEMINI_API_KEY, undefined);
  assert.equal(apeluri[1].optiuni.env.DO_NOT_TRACK, '1');
});

test('instaleazaRemotion: npm ci picat sau browserul picat dau remotion-instalare-esuata (cod 2)', async (t) => {
  const r = radacinaCuLock();
  t.after(r.curata);
  const picaNpm = async () => ({ cod: 1, stdout: '', stderr: 'npm error code ENOTFOUND\nnpm error network request failed' });
  await assert.rejects(instaleazaRemotion(r.radacina, { ruleaza: picaNpm }), (e) => {
    assert.ok(e instanceof EroareFatala);
    assert.equal(e.codIesire, COD_IESIRE.MEDIU);
    assert.equal(e.eroareMg.cod, 'remotion-instalare-esuata');
    assert.equal(e.eroareMg.camp, 'mediu.remotion');
    assert.match(e.eroareMg.mesaj, /npm ci a eșuat în motoare\/remotion/);
    assert.match(e.eroareMg.sugestie, /--instaleaza-motorul/);
    return true;
  });
  const picaBrowser = async (comanda, argumente) => {
    if (argumente[1] === 'ci') {
      scrieInstalare(r.radacina);
      return { cod: 0, stdout: '', stderr: '' };
    }
    return { cod: 1, stdout: '', stderr: 'Error: getaddrinfo ENOTFOUND storage.googleapis.com' };
  };
  await assert.rejects(instaleazaRemotion(r.radacina, { ruleaza: picaBrowser }), (e) => {
    assert.equal(e.eroareMg.cod, 'remotion-instalare-esuata');
    assert.match(e.eroareMg.mesaj, /remotion browser ensure a ieșit cu codul 1: Error: getaddrinfo ENOTFOUND/);
    return true;
  });
});

test('remotionCerut: node_modules în motoare/remotion sau un proiect pe Remotion în video/', (t) => {
  const r = creeazaRadacinaTemp({
    fisiere: {
      'video/a/motor.lock': JSON.stringify({ motor: { nume: 'hyperframes', versiune: '0.8.96' } }),
      'video/stricat/motor.lock': '{ nu e json',
    },
  });
  t.after(r.curata);
  assert.equal(remotionCerut(r.radacina), false);
  fs.mkdirSync(path.join(r.radacina, 'video', 'b'));
  fs.writeFileSync(path.join(r.radacina, 'video', 'b', 'motor.lock'), JSON.stringify({ motor: { nume: 'remotion', versiune: '4.0.529' } }));
  assert.equal(remotionCerut(r.radacina), true);
  fs.rmSync(path.join(r.radacina, 'video'), { recursive: true });
  assert.equal(remotionCerut(r.radacina), false);
  fs.mkdirSync(path.join(r.radacina, ...DIR_REMOTION, 'node_modules'), { recursive: true });
  assert.equal(remotionCerut(r.radacina), true);
});

test('mediuRemotion: fără cheile API și fără REMOTION_LICENSE_KEY, cu DO_NOT_TRACK=1', () => {
  assert.deepEqual(
    mediuRemotion({ PATH: '/bin', Remotion_License_Key: 'x', GOOGLE_API_KEY: 'y', DO_NOT_TRACK: '0' }),
    { PATH: '/bin', DO_NOT_TRACK: '1' },
  );
});

test('motoare/remotion/package.json fixează versiunile exacte, fără @remotion/layout-utils', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'motoare', 'remotion', 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies, {
    '@remotion/cli': '4.0.529',
    '@remotion/fonts': '4.0.529',
    '@remotion/media': '4.0.529',
    '@remotion/transitions': '4.0.529',
    react: '19.2.3',
    'react-dom': '19.2.3',
    remotion: '4.0.529',
    zod: '4.5.4',
  });
  const lock = JSON.parse(fs.readFileSync(path.join(REPO, 'motoare', 'remotion', 'package-lock.json'), 'utf8'));
  assert.equal(lock.name, 'agent-motion-motor-remotion');
  assert.equal(lock.packages['node_modules/remotion'].version, '4.0.529');
  assert.equal(lock.packages['node_modules/@remotion/cli'].version, '4.0.529');
  assert.equal(lock.packages['node_modules/@remotion/layout-utils'], undefined);
});
