// Copiii pornați de mg (ffmpeg, hyperframes) se opresc când se oprește mg: semnal, excepție, process.exit,
// termen depășit. Copilul e node însuși, prin ruleazaFfmpeg (teste/fixtures/procese/parinte.mjs), deci testul
// nu cere ffmpeg; varianta cu ffmpeg-ul real e în teste/integrare/procese-ffmpeg.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { argumenteTaskkill, copiiVii, inregistreaza, opresteArbore, opresteToti } from '../../nucleu/lib/procese.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const PARINTE = fileURLToPath(new URL('../fixtures/procese/parinte.mjs', import.meta.url));
const POSIX = process.platform !== 'win32';

function traieste(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function asteapta(conditie, ms = 10000) {
  const capat = Date.now() + ms;
  while (Date.now() < capat) {
    if (conditie()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return conditie();
}

/** Pornește părintele, așteaptă pid-ul copilului și întoarce-le pe amândouă; după test, nimic nu rămâne viu. */
async function pornesteParinte(t, mod) {
  const { radacina: dir, curata } = creeazaRadacinaTemp();
  const fisierPid = path.join(dir, 'copil.pid');
  const parinte = spawn(process.execPath, [PARINTE, mod, fisierPid], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '';
  let stderr = '';
  parinte.stdout.on('data', (b) => { stdout += b; });
  parinte.stderr.on('data', (b) => { stderr += b; });
  const iesire = new Promise((r) => parinte.once('exit', (cod, semnal) => r({ cod, semnal })));
  let pid = null;
  t.after(() => {
    if (pid !== null && traieste(pid)) process.kill(pid, 'SIGKILL');
    if (parinte.exitCode === null && parinte.signalCode === null) parinte.kill('SIGKILL');
    curata();
  });
  const citit = () => fs.existsSync(fisierPid) && fs.readFileSync(fisierPid, 'utf8') !== '';
  assert.ok(await asteapta(citit), `copilul nu și-a scris pid-ul; stderr: ${stderr}`);
  pid = Number(fs.readFileSync(fisierPid, 'utf8'));
  assert.ok(traieste(pid), 'copilul rulează înainte de oprirea părintelui');
  return { parinte, pid, iesire, iesiri: () => ({ stdout, stderr }) };
}

test('argumenteTaskkill opresc tot arborele pe Windows', () => {
  assert.deepEqual(argumenteTaskkill(4242), ['/T', '/F', '/PID', '4242']);
});

test('SIGTERM pe mg: copilul pornit prin ruleazaFfmpeg se oprește și el', { skip: !POSIX && 'semnalele POSIX' }, async (t) => {
  const { parinte, pid, iesire } = await pornesteParinte(t, 'semnal');
  parinte.kill('SIGTERM');
  const { semnal } = await iesire;
  assert.equal(semnal, 'SIGTERM', 'mg se oprește tot cu SIGTERM, ca fără ascultător');
  assert.ok(await asteapta(() => !traieste(pid), 5000), `copilul ${pid} rulează încă după oprirea lui mg`);
});

test('SIGINT (Ctrl+C) pe mg: copilul se oprește și el', { skip: !POSIX && 'semnalele POSIX' }, async (t) => {
  const { parinte, pid, iesire } = await pornesteParinte(t, 'semnal');
  parinte.kill('SIGINT');
  assert.equal((await iesire).semnal, 'SIGINT');
  assert.ok(await asteapta(() => !traieste(pid), 5000), `copilul ${pid} rulează încă`);
});

test('o excepție neprinsă în mg oprește și copilul', async (t) => {
  const { pid, iesire, iesiri } = await pornesteParinte(t, 'exceptie');
  const { cod } = await iesire;
  assert.notEqual(cod, 0);
  assert.match(iesiri().stderr, /excepție neprinsă, intenționată/);
  assert.ok(await asteapta(() => !traieste(pid), 5000), `copilul ${pid} rulează încă`);
});

test('process.exit în mg oprește și copilul', async (t) => {
  const { pid, iesire } = await pornesteParinte(t, 'exit');
  assert.equal((await iesire).cod, 3);
  assert.ok(await asteapta(() => !traieste(pid), 5000), `copilul ${pid} rulează încă`);
});

test('la termenul depășit, ruleazaFfmpeg oprește copilul și întoarce codul 1', async (t) => {
  const { pid, iesire, iesiri } = await pornesteParinte(t, 'termen');
  assert.ok(await asteapta(() => !traieste(pid), 10000), `copilul ${pid} rulează încă după termen`);
  assert.equal((await iesire).cod, 0);
  const r = JSON.parse(iesiri().stdout);
  assert.equal(r.cod, 1);
  assert.match(r.stderr, /nu a răspuns la timp/);
});

test('inregistreaza ține evidența până la ieșire; opresteArbore pe un proces oprit nu aruncă', async () => {
  const copil = inregistreaza(spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }));
  const inainte = copiiVii();
  assert.ok(inainte >= 1);
  const iesit = new Promise((r) => copil.once('exit', r));
  opresteArbore(copil);
  await iesit;
  assert.equal(copiiVii(), inainte - 1);
  opresteArbore(copil);
});

test('ascultătorii de semnal nu se adună: mai multe copii înregistrați, câte un singur ascultător', async () => {
  const copii = [inregistreaza(spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }))];
  const numar = ['SIGINT', 'SIGTERM', 'exit'].map((s) => process.listenerCount(s));
  for (let i = 0; i < 3; i += 1) copii.push(inregistreaza(spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })));
  assert.deepEqual(['SIGINT', 'SIGTERM', 'exit'].map((s) => process.listenerCount(s)), numar);
  const iesiri = copii.map((c) => new Promise((r) => c.once('exit', r)));
  for (const c of copii) opresteArbore(c, { termenMs: 200 });
  await Promise.all(iesiri);
  opresteToti({ termenMs: 200 });
  assert.equal(copiiVii(), 0);
});

test('POSIX: un copil care ignoră SIGTERM primește SIGKILL după termen (asincron și sincron)', { skip: !POSIX && 'semnalele POSIX' }, async () => {
  const incapatanat = () => {
    const c = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); process.stdout.write('gata'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'pipe', 'ignore'] });
    return new Promise((r) => c.stdout.once('data', () => r(c)));
  };
  const a = await incapatanat();
  const iesitA = new Promise((r) => a.once('exit', (cod, semnal) => r(semnal)));
  const t0 = Date.now();
  opresteArbore(a, { termenMs: 300 });
  assert.equal(await iesitA, 'SIGKILL');
  assert.ok(Date.now() - t0 >= 250, 'SIGKILL vine abia după termen');

  const b = await incapatanat();
  const iesitB = new Promise((r) => b.once('exit', (cod, semnal) => r(semnal)));
  opresteArbore(b, { sincron: true, termenMs: 300 });
  assert.equal(await iesitB, 'SIGKILL');
});

test('POSIX: un copil care iese pe SIGTERM nu mai primește SIGKILL', { skip: !POSIX && 'semnalele POSIX' }, async () => {
  const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const iesit = new Promise((r) => c.once('exit', (cod, semnal) => r(semnal)));
  opresteArbore(c, { termenMs: 5000 });
  assert.equal(await iesit, 'SIGTERM');
});

test('ramura win32 a lui opresteArbore: fără taskkill, procesul direct tot se oprește', async () => {
  const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const iesit = new Promise((r) => c.once('exit', r));
  opresteArbore(c, { platforma: 'win32' });
  await iesit;
  assert.ok(c.exitCode !== null || c.signalCode !== null);
});
