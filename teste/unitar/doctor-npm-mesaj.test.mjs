// F16: mesajul npm-ci-esuat păstrează codul, syscall-ul, calea, cauza și jurnalul npm, nu ultimele 3 linii
// (care la npm 10/11 sunt mereu sfatul generic și, la EACCES/EPERM, „rulează ca Administrator”).
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleazaNpmCi } from '../../nucleu/lib/doctor/npm.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

// stderr-ul real al lui npm 11.12.1 (Node 25.9.0) pentru npm ci într-un folder read-only, cu căile anonimizate.
const STDERR_EACCES = fs.readFileSync(fileURLToPath(new URL('../fixtures/npm/ci-eacces-stderr.txt', import.meta.url)), 'utf8');

// stderr-ul real al lui npm 11.12.1 (Node 25.9.0) la un script install care pică la DNS, cu căile anonimizate.
const STDERR_INSTALL_DNS = fs.readFileSync(fileURLToPath(new URL('../fixtures/npm/ci-install-enotfound-stderr.txt', import.meta.url)), 'utf8');

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

async function mesajPentru(raspuns) {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'nucleu/package-lock.json': JSON.stringify({ name: 'n', lockfileVersion: 3, packages: { '': {} } }) } });
  try {
    const ctx = { radacina, platforma: process.platform, ruleaza: async () => raspuns };
    const r = await ruleazaNpmCi(path.join(radacina, 'nucleu'), ctx);
    assert.equal(r.eroare.cod, 'npm-ci-esuat');
    return r.eroare.mesaj;
  } finally {
    curata();
  }
}

test('la EACCES mesajul are codul, syscall-ul, calea, cauza și jurnalul, fără sfatul „Administrator”', async () => {
  const mesaj = await mesajPentru({ cod: 243, stdout: '', stderr: STDERR_EACCES });
  assert.match(mesaj, /^npm ci a eșuat în nucleu \(cod 243\): /);
  assert.match(mesaj, /code EACCES/);
  assert.match(mesaj, /syscall mkdir/);
  assert.match(mesaj, /path \/Users\/cursant\/agent-motion\/nucleu\/node_modules/);
  assert.match(mesaj, /Error: EACCES: permission denied, mkdir/);
  assert.match(mesaj, /A complete log of this run can be found in: \/Users\/cursant\/\.npm\/_logs\/[^ ]+-debug-0\.log/);
  assert.doesNotMatch(mesaj, /Administrator/);
  assert.doesNotMatch(mesaj, /\bat async\b/, 'stack-ul npm nu intră în mesaj');
});

test('la o eroare de rețea mesajul păstrează codul (ECONNREFUSED), chiar dacă nu e printre ultimele linii', async () => {
  const stderr = [
    'npm error code ECONNREFUSED',
    'npm error syscall connect',
    'npm error errno ECONNREFUSED',
    'npm error FetchError: request to http://127.0.0.1:9/yaml failed, reason: connect ECONNREFUSED 127.0.0.1:9',
    'npm error',
    'npm error If you are behind a proxy, please make sure that the',
    "npm error 'proxy' config is set properly.  See: 'npm help config'",
    'npm error A complete log of this run can be found in: C:\\Users\\cursant\\AppData\\Local\\npm-cache\\_logs\\x-debug-0.log',
  ].join('\r\n');
  const mesaj = await mesajPentru({ cod: 1, stdout: '', stderr });
  assert.match(mesaj, /code ECONNREFUSED/);
  assert.match(mesaj, /FetchError: request to http:\/\/127\.0\.0\.1:9\/yaml failed/);
  assert.match(mesaj, /x-debug-0\.log/);
});

test('la un script install eșuat cauza e linia „Error: getaddrinfo ENOTFOUND”, nu „command failed”', async () => {
  const mesaj = await mesajPentru({ cod: 1, stdout: '', stderr: STDERR_INSTALL_DNS });
  assert.match(mesaj, /code 1/);
  assert.match(mesaj, /path \/Users\/cursant\/agent-motion\/nucleu\/node_modules\/ffmpeg-static/);
  assert.match(mesaj, /Error: getaddrinfo ENOTFOUND nu-exista\.invalid/);
  assert.doesNotMatch(mesaj, /command failed/);
  assert.match(mesaj, /-debug-0\.log/);
  assert.doesNotMatch(mesaj, /\bat GetAddrInfoReqWrap\b/, 'stack-ul nu intră în mesaj');
});

test('un „<Nume>Error:” are prioritate față de liniile de dinaintea lui, iar fără el rămâne prima linie de cauză', async () => {
  const cuNume = await mesajPentru({ cod: 1, stdout: '', stderr: 'npm error code 1\nnpm error command failed\nnpm error TypeError: x e undefined\nnpm error A complete log of this run can be found in: /a/b-debug-0.log' });
  assert.match(cuNume, /TypeError: x e undefined/);
  assert.doesNotMatch(cuNume, /command failed/);
  const fara = await mesajPentru({ cod: 1, stdout: '', stderr: 'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/x\nnpm error A complete log of this run can be found in: /a/b-debug-0.log' });
  assert.match(fara, /404 Not Found/);
});

test('un stderr fără formatul npm păstrează ultimele linii, ca înainte', async () => {
  const mesaj = await mesajPentru({ cod: 1, stdout: '', stderr: 'unu\ndoi\ntrei\npatru\nCommand failed: npm ci (timeout)' });
  assert.equal(mesaj, 'npm ci a eșuat în nucleu (cod 1): trei | patru | Command failed: npm ci (timeout)');
});

test('fără stderr se folosește stdout, iar fără nimic apare „fără mesaj”', async () => {
  assert.match(await mesajPentru({ cod: 1, stdout: 'npm error code E404\nnpm error 404 Not Found', stderr: '' }), /code E404 \| 404 Not Found/);
  assert.match(await mesajPentru({ cod: 1, stdout: '', stderr: '' }), /: fără mesaj$/);
});
