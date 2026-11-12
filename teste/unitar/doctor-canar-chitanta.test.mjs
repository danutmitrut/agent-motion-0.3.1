// D1, F13, F15 (partea doctorului): canarul se confirmă doar cu o chitanță a gărzii pentru o scriere prin terminal
// (Bash sau PowerShell) pe canarul curent. Write și Edit pe nucleu/.canar le refuză permissions.deny înainte de hook,
// deci nu pot dovedi că garda rulează; o comandă node -e nu o vede deny-ul, ci doar garda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as canarDoctor from '../../nucleu/lib/doctor/canar.mjs';
import { comandaDoctor } from '../../nucleu/lib/doctor/index.mjs';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';
import { citesteChitanteCanar } from '../../nucleu/lib/garda/canar.mjs';
import { citesteStare, scrieStare } from '../../nucleu/lib/stare.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const { scrieCanar, confirmaCanar } = canarDoctor;
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const ACUM = new Date('2026-10-02T10:00:00.000Z');
const COMANDA = `node -e "require('fs').appendFileSync('nucleu/.canar','x')"`;
const MOTIV_FARA_CHITANTA = 'garda nu a raportat niciun refuz pentru scrierea prin terminal';

const stareCu = (sha256) => ({ versiune: 1, verificari: [], canar: { scris_la: ACUM.toISOString(), sha256, confirmat: false, confirmat_la: null } });
const caleChitante = (radacina) => path.join(radacina, 'nucleu', '.canar-refuzuri');
const chitanta = (unealta, sha256) => `${JSON.stringify({ unealta, sha256, la: ACUM.toISOString() })}\n`;

function cuRadacina(corp, optiuni = {}) {
  const { radacina, curata } = creeazaRadacinaTemp(optiuni);
  return Promise.resolve().then(() => corp(radacina)).finally(curata);
}

/** Garda reală refuză comanda și lasă chitanța, exact cum o face în sesiunea Claude Code. */
async function refuzulGarzii(radacina, unealta, comanda = COMANDA) {
  const intrare = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: unealta, tool_input: { command: comanda }, cwd: radacina });
  return proceseazaHook(intrare, { radacina, env: {}, acum: ACUM });
}

test('canarul neatins, dar fără nicio chitanță, dă canar-nefacut cu motivul D1', async () => {
  await cuRadacina((radacina) => {
    const { sha256 } = scrieCanar(radacina, ACUM);
    const r = confirmaCanar(radacina, stareCu(sha256));
    assert.equal(r.ok, false);
    assert.equal(r.nivel, 'eroare');
    assert.equal(r.eroare.cod, 'canar-nefacut');
    assert.equal(r.eroare.camp, 'mediu.canar');
    assert.ok(r.eroare.mesaj.includes(MOTIV_FARA_CHITANTA), r.eroare.mesaj);
    assert.ok(r.eroare.sugestie.includes(COMANDA), r.eroare.sugestie);
  });
});

test('o chitanță pentru alt canar (alt sha256) nu ajunge', async () => {
  await cuRadacina((radacina) => {
    const { sha256 } = scrieCanar(radacina, ACUM);
    fs.writeFileSync(caleChitante(radacina), chitanta('Bash', 'a'.repeat(64)));
    assert.equal(confirmaCanar(radacina, stareCu(sha256)).eroare?.cod, 'canar-nefacut');
  });
});

test('o chitanță de Write sau Edit nu ajunge: doar Bash sau PowerShell dovedesc că garda rulează', async () => {
  await cuRadacina((radacina) => {
    const { sha256 } = scrieCanar(radacina, ACUM);
    fs.writeFileSync(caleChitante(radacina), chitanta('Write', sha256) + chitanta('Edit', sha256));
    assert.equal(confirmaCanar(radacina, stareCu(sha256)).eroare?.cod, 'canar-nefacut');
  });
});

test('o chitanță Bash sau PowerShell pe canarul curent confirmă canarul', async () => {
  for (const unealta of ['Bash', 'PowerShell']) {
    await cuRadacina((radacina) => {
      const { sha256 } = scrieCanar(radacina, ACUM);
      fs.writeFileSync(caleChitante(radacina), 'stricat\n' + chitanta('Bash', 'b'.repeat(64)) + chitanta(unealta, sha256));
      assert.deepEqual(confirmaCanar(radacina, stareCu(sha256)), { id: 'canar', ok: true, nivel: 'ok', valoare: 'neatins', eroare: null });
    });
  }
});

test('canarul modificat rămâne canar-esuat, chiar dacă există o chitanță', async () => {
  await cuRadacina((radacina) => {
    const { sha256 } = scrieCanar(radacina, ACUM);
    fs.writeFileSync(caleChitante(radacina), chitanta('Bash', sha256));
    fs.appendFileSync(path.join(radacina, 'nucleu', '.canar'), 'x');
    assert.equal(confirmaCanar(radacina, stareCu(sha256)).eroare?.cod, 'canar-esuat');
  });
});

test('de la cap la coadă: garda refuză comanda din instrucțiune, lasă chitanța, iar canarul se confirmă', async () => {
  for (const unealta of ['Bash', 'PowerShell']) {
    await cuRadacina(async (radacina) => {
      const { sha256 } = scrieCanar(radacina, ACUM);
      assert.equal(confirmaCanar(radacina, stareCu(sha256)).eroare?.cod, 'canar-nefacut', 'înainte de încercare');
      const r = await refuzulGarzii(radacina, unealta);
      assert.equal(r.cod, 2);
      const iesire = JSON.parse(r.stdout).hookSpecificOutput;
      assert.equal(iesire.permissionDecision, 'deny');
      assert.match(iesire.permissionDecisionReason, /[ăâîșț]/, 'motivul gărzii e în română');
      assert.deepEqual(citesteChitanteCanar(radacina).map((c) => [c.unealta, c.sha256]), [[unealta, sha256]]);
      assert.equal(confirmaCanar(radacina, stareCu(sha256)).ok, true);
    }, { fisiere: { 'nucleu/mg.mjs': '// mg\n' } });
  }
});

test('o rulare nouă a doctorului (canar nou) cere o chitanță nouă', async () => {
  await cuRadacina(async (radacina) => {
    const vechi = scrieCanar(radacina, ACUM);
    await refuzulGarzii(radacina, 'Bash');
    assert.equal(confirmaCanar(radacina, stareCu(vechi.sha256)).ok, true);
    const nou = scrieCanar(radacina, ACUM);
    assert.equal(confirmaCanar(radacina, stareCu(nou.sha256)).eroare?.cod, 'canar-nefacut');
  }, { fisiere: { 'nucleu/mg.mjs': '// mg\n' } });
});

/** O stare verde, ca după o rulare completă fără --ci. */
function stareVerde(radacina, { claude = 'ok' } = {}) {
  const { sha256 } = scrieCanar(radacina, ACUM);
  const rezultat = (id) => ({ id, ok: true, nivel: id === 'claude' ? claude : 'ok', valoare: null, eroare: null });
  scrieStare(radacina, {
    versiune: 1,
    scris_la: ACUM.toISOString(),
    platforma: 'win32-x64',
    node: '22.11.0',
    claude_code: claude === 'ok' ? '2.1.282' : null,
    ok: true,
    verificari: ['node', 'platforma', 'claude', 'cale', 'spatiu', 'memorie', 'integritate', 'ffmpeg', 'ffprobe', 'chrome', 'fonturi', 'randare-proba'].map(rezultat),
    canar: { scris_la: ACUM.toISOString(), sha256, confirmat: false, confirmat_la: null },
    versiuni_sha256: sha256Fisier(path.join(radacina, 'nucleu', 'VERSIUNI.json')),
  });
  return sha256;
}

test('--confirma-canar fără nicio încercare prin terminal nu scrie .instalat (F13, punctul 3)', async () => {
  await cuRadacina(async (radacina) => {
    stareVerde(radacina);
    const { cod, raport } = await comandaDoctor({ radacina, optiuni: { confirmaCanar: true } });
    assert.equal(cod, 2);
    assert.equal(raport.erori[0].cod, 'canar-nefacut');
    assert.ok(raport.erori[0].mesaj.includes(MOTIV_FARA_CHITANTA));
    assert.equal(fs.existsSync(path.join(radacina, '.instalat')), false);
    assert.equal(citesteStare(radacina).canar.confirmat, false);
  }, { copiaza: ['nucleu/VERSIUNI.json'] });
});

test('--confirma-canar cu chitanța gărzii scrie .instalat', async () => {
  await cuRadacina(async (radacina) => {
    stareVerde(radacina);
    await refuzulGarzii(radacina, 'PowerShell');
    const { cod, raport } = await comandaDoctor({ radacina, optiuni: { confirmaCanar: true } });
    assert.equal(cod, 0, raport.mesaj);
    assert.equal(raport.instalat, true);
    assert.ok(fs.existsSync(path.join(radacina, '.instalat')));
  }, { copiaza: ['nucleu/VERSIUNI.json'] });
});

test('--confirma-canar pe o stare scrisă de o rulare --ci (claude sărit) nu scrie .instalat, nici cu chitanță', async () => {
  await cuRadacina(async (radacina) => {
    stareVerde(radacina, { claude: 'sarit' });
    await refuzulGarzii(radacina, 'Bash');
    const { cod, raport } = await comandaDoctor({ radacina, optiuni: { confirmaCanar: true } });
    assert.equal(cod, 2);
    assert.equal(raport.erori[0].cod, 'canar-nefacut');
    assert.match(raport.erori[0].mesaj, /--ci/);
    assert.equal(fs.existsSync(path.join(radacina, '.instalat')), false);
  }, { copiaza: ['nucleu/VERSIUNI.json'] });
});

test('instrucțiunea canarului cere Read, Write, Edit și scrierea prin terminal, cu regulile D1', () => {
  const text = canarDoctor.INSTRUCTIUNE_CANAR;
  assert.equal(typeof text, 'string');
  assert.equal(canarDoctor.COMANDA_TERMINAL_CANAR, COMANDA);
  assert.ok(text.includes(COMANDA), 'comanda node -e exactă');
  for (const termen of ['Read', 'Write', 'Edit', 'Bash', 'PowerShell', 'permissions.deny', 'o singură dată', 'ține minte', 'motivul în română', '--confirma-canar']) {
    assert.ok(text.includes(termen), `instrucțiunea nu pomenește „${termen}”`);
  }
});

test('comanda din instrucțiune, scoasă din text, e refuzată de gardă și lasă chitanța', async () => {
  const comanda = /node -e "[^"\n]+"/.exec(String(canarDoctor.INSTRUCTIUNE_CANAR))?.[0];
  assert.equal(comanda, COMANDA);
  await cuRadacina(async (radacina) => {
    const { sha256 } = scrieCanar(radacina, ACUM);
    assert.equal((await refuzulGarzii(radacina, 'PowerShell', comanda)).cod, 2);
    assert.equal(confirmaCanar(radacina, stareCu(sha256)).ok, true);
  }, { fisiere: { 'nucleu/mg.mjs': '// mg\n' } });
});

test('INSTALARE.md, pasul 3, cere aceeași scriere prin terminal, cu regulile D1', () => {
  const text = fs.readFileSync(path.join(REPO, 'INSTALARE.md'), 'utf8');
  const pas3 = text.split('\n').find((l) => l.startsWith('3. '));
  assert.ok(pas3, 'lipsește pasul 3');
  for (const termen of [COMANDA, 'Read', 'Write', 'Edit', 'o singură dată', 'ține minte', 'motivul în română']) {
    assert.ok(pas3.includes(termen), `pasul 3 nu pomenește „${termen}”`);
  }
});

test('protocolul manual de pe Windows: Write și Edit sunt refuzate de deny, iar node -e trece doar cu motivul gărzii', () => {
  const text = fs.readFileSync(path.join(REPO, 'teste', 'manual', 'windows-t1-canar.md'), 'utf8');
  assert.ok(text.includes(COMANDA), 'protocolul nu are comanda node -e');
  assert.ok(text.includes('nucleu/.canar-refuzuri') || text.includes('nucleu\\.canar-refuzuri'), 'protocolul nu verifică chitanța');
  assert.match(text, /refuzate de `permissions\.deny`, nu de gardă/);
  assert.match(text, /\| 3\.3 `node -e` în `nucleu\/` refuzat cu motivul gărzii \|/);
  assert.match(text, /\| 4\.3 `node -e` pe `nucleu\/\.canar` refuzat cu motivul gărzii \|/);
  assert.ok(text.includes('garda nu a raportat niciun refuz pentru scrierea prin terminal'), 'lipsește verificarea negativă');
});

/** Comanda chiar scrie când nimic nu o oprește (deci deny-ul nu o maschează, iar o gardă căzută schimbă sha256). */
function shellDisponibil(comanda) {
  const r = spawnSync(comanda, ['-NoProfile', '-Command', 'exit 0'], { windowsHide: true });
  return !r.error && r.status === 0;
}
const PWSH = ['pwsh', 'powershell'].find(shellDisponibil);
// Pe Windows, Claude Code rulează comenzile în Git Bash. `bash` din PATH poate fi cel din WSL
// (C:\Windows\system32\bash.exe), care ține folderul de lucru ocupat după ieșire (EBUSY la curățenie)
// și nu e shell-ul cursanților, deci testul îl caută pe cel din Git.
function gitBash() {
  const r = spawnSync('git', ['--exec-path'], { windowsHide: true, encoding: 'utf8' });
  const candidati = [];
  if (!r.error && r.status === 0) candidati.push(path.resolve(r.stdout.trim(), '..', '..', '..', 'bin', 'bash.exe'));
  candidati.push('C:\\Program Files\\Git\\bin\\bash.exe');
  return candidati.find((c) => fs.existsSync(c)) ?? null;
}
const BASH = (() => {
  const comanda = process.platform === 'win32' ? gitBash() : 'bash';
  if (!comanda) return null;
  const r = spawnSync(comanda, ['-c', 'exit 0'], { windowsHide: true });
  return !r.error && r.status === 0 ? comanda : null;
})();

test('comanda scrie cu adevărat în canar din PowerShell (ghilimelele trec)', { skip: !PWSH && 'fără PowerShell pe mașină' }, async () => {
  await cuRadacina((radacina) => {
    fs.writeFileSync(path.join(radacina, 'nucleu', '.canar'), 'canar\n');
    const r = spawnSync(PWSH, ['-NoProfile', '-NonInteractive', '-Command', COMANDA], { cwd: radacina, windowsHide: true, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(radacina, 'nucleu', '.canar'), 'utf8'), 'canar\nx');
  }, { fisiere: { 'nucleu/mg.mjs': '// mg\n' } });
});

test('comanda scrie cu adevărat în canar din Bash', { skip: !BASH && 'fără bash pe mașină (pe Windows, fără Git Bash)' }, async () => {
  await cuRadacina((radacina) => {
    fs.writeFileSync(path.join(radacina, 'nucleu', '.canar'), 'canar\n');
    const r = spawnSync(BASH, ['-c', COMANDA], { cwd: radacina, windowsHide: true, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(radacina, 'nucleu', '.canar'), 'utf8'), 'canar\nx');
  }, { fisiere: { 'nucleu/mg.mjs': '// mg\n' } });
});
