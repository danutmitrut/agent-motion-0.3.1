// Cu ffmpeg-ul real al kitului: după SIGTERM pe mg, ffmpeg-ul pornit de ruleazaFfmpeg nu mai rulează
// (fără oprire, ar merge încă 120 s pe sursa lavfi citită în timp real). Doar POSIX: pid-ul lui ffmpeg se află cu ps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const PARINTE = fileURLToPath(new URL('../fixtures/procese/parinte.mjs', import.meta.url));

function traieste(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** Pid-urile copiilor directi ai unui proces, cu numele comenzii. */
function copii(pidParinte) {
  return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8' })
    .split('\n').map((r) => r.trim().split(/\s+/)).filter((c) => Number(c[1]) === pidParinte)
    .map((c) => ({ pid: Number(c[0]), comanda: c.slice(2).join(' ') }));
}

async function asteapta(conditie, ms) {
  const capat = Date.now() + ms;
  while (Date.now() < capat) {
    if (conditie()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return conditie();
}

test('SIGTERM pe mg oprește ffmpeg-ul real pornit de ruleazaFfmpeg', { skip: (sari && 'setează MG_TESTE_INTEGRARE=1') || (process.platform === 'win32' && 'doar POSIX'), timeout: 60000 }, async (t) => {
  const { radacina: dir, curata } = creeazaRadacinaTemp();
  const fisierPid = path.join(dir, 'ffmpeg.pid');
  const parinte = spawn(process.execPath, [PARINTE, 'ffmpeg', fisierPid], { stdio: 'ignore' });
  const iesire = new Promise((r) => parinte.once('exit', (cod, semnal) => r({ cod, semnal })));
  let ffmpeg = null;
  t.after(() => {
    if (ffmpeg && traieste(ffmpeg)) process.kill(ffmpeg, 'SIGKILL');
    if (parinte.exitCode === null && parinte.signalCode === null) parinte.kill('SIGKILL');
    curata();
  });
  assert.ok(await asteapta(() => fs.existsSync(`${fisierPid}.parinte`) && copii(parinte.pid).some((c) => /ffmpeg/.test(c.comanda)), 20000),
    'ffmpeg nu a pornit sub mg');
  ffmpeg = copii(parinte.pid).find((c) => /ffmpeg/.test(c.comanda)).pid;
  assert.ok(traieste(ffmpeg));
  parinte.kill('SIGTERM');
  assert.equal((await iesire).semnal, 'SIGTERM');
  assert.ok(await asteapta(() => !traieste(ffmpeg), 5000), `ffmpeg ${ffmpeg} rulează încă după oprirea lui mg`);
});

/** Toți descendenții unui proces (copii, nepoți), cu numele comenzii, după ps. */
function descendenti(pidRadacina) {
  const randuri = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], { encoding: 'utf8' })
    .split('\n').map((r) => r.trim().split(/\s+/)).filter((c) => c.length >= 3)
    .map((c) => ({ pid: Number(c[0]), ppid: Number(c[1]), comanda: c.slice(2).join(' ') }));
  const gasiti = [];
  const coada = [pidRadacina];
  while (coada.length > 0) {
    const p = coada.shift();
    for (const r of randuri) {
      if (r.ppid === p) {
        gasiti.push(r);
        coada.push(r.pid);
      }
    }
  }
  return gasiti;
}

for (const semnal of ['SIGTERM', 'SIGINT', 'process.exit']) test(`${semnal} pe mg în timpul unei randări reale: nu rămâne niciun chrome-headless-shell pornit de ea`, { skip: (sari && 'setează MG_TESTE_INTEGRARE=1') || (process.platform === 'win32' && 'doar POSIX'), timeout: 180000 }, async (t) => {
  const { radacinaCuMotoare } = await import('../ajutoare/radacina-motoare.mjs');
  const { comandaNou } = await import('../../nucleu/lib/nou.mjs');
  const { comandaRandeaza } = await import('../../nucleu/lib/randeaza/index.mjs');
  const { decideAprobare } = await import('../../nucleu/lib/garda/aprobare.mjs');
  const { radacina, curata } = radacinaCuMotoare();
  // marcajul: pid-urile descendenților acestei comenzi, adunate înainte de oprire (nu Chrome-ul altcuiva)
  let urmariti = [];
  let parinte = null;
  t.after(() => {
    for (const p of urmariti) if (traieste(p.pid)) process.kill(p.pid, 'SIGKILL');
    if (parinte && parinte.exitCode === null && parinte.signalCode === null) parinte.kill('SIGKILL');
    curata();
  });
  const proiect = 'oprire-chrome';
  assert.equal((await comandaNou({ radacina, proiect, sablon: 'reel-ilustrat' })).ok, true);
  assert.deepEqual((await comandaRandeaza({ radacina, proiect, mod: 'doar-verificare' })).erori, []);
  decideAprobare({ hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}` }, radacina, new Date());

  const fisierPid = path.join(radacina, 'mg.pid');
  parinte = spawn(process.execPath, [PARINTE, 'randare', fisierPid, radacina, proiect], { stdio: 'ignore' });
  const iesire = new Promise((r) => parinte.once('exit', (cod, semnal) => r({ cod, semnal })));
  const cuChrome = () => descendenti(parinte.pid).filter((c) => /chrome-headless-shell/.test(c.comanda));
  assert.ok(await asteapta(() => cuChrome().length > 0, 90000), 'randarea nu a pornit Chrome');
  // încă puțin, ca toate procesele Chrome (și ffmpeg-ul de encodare) să apară în arbore
  await new Promise((r) => setTimeout(r, 1500));
  urmariti = descendenti(parinte.pid);
  const chrome = urmariti.filter((c) => /chrome-headless-shell/.test(c.comanda));
  assert.ok(chrome.length > 0);
  if (semnal === 'process.exit') {
    fs.writeFileSync(`${fisierPid}.opreste`, '');
    assert.equal((await iesire).cod, 3);
  } else {
    parinte.kill(semnal);
    assert.equal((await iesire).semnal, semnal);
  }
  const ramasi = () => urmariti.filter((p) => traieste(p.pid));
  assert.ok(await asteapta(() => ramasi().length === 0, 15000),
    `după oprirea lui mg rulează încă: ${JSON.stringify(ramasi())}`);
});
