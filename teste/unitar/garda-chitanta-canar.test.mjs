// D1 (decizia lui Dănuț, partea gărzii): când garda refuză o comandă de terminal care țintește nucleu/.canar,
// lasă o chitanță în nucleu/.canar-refuzuri, cu unealta și sha256-ul canarului curent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';
import { citesteChitanteCanar, CALE_CHITANTE_CANAR } from '../../nucleu/lib/garda/canar.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { fisiereUrmarite } from '../../nucleu/lib/versiuni.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { ruleazaGarda } from '../ajutoare/garda.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const ACUM = new Date('2026-10-02T10:00:00.000Z');
const SCRIERE_CANAR = `node -e "require('fs').appendFileSync('nucleu/.canar','x')"`;

const intrare = (tool_name, command) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input: { command } });

async function cuCanar(corp, { canar = true } = {}) {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'nucleu/mg.mjs': '// mg\n', ...(canar ? { 'nucleu/.canar': 'canar 2026 abc\n' } : {}) } });
  try {
    await corp(radacina, path.join(radacina, 'nucleu', '.canar-refuzuri'));
  } finally {
    curata();
  }
}

test('calea chitanței e nucleu/.canar-refuzuri', () => {
  assert.equal(CALE_CHITANTE_CANAR, 'nucleu/.canar-refuzuri');
});

test('refuzul unei scrieri prin terminal în canar lasă chitanța, pe Bash și pe PowerShell', async () => {
  await cuCanar(async (radacina, chitante) => {
    const sha = sha256Fisier(path.join(radacina, 'nucleu', '.canar'));
    const bash = await proceseazaHook(intrare('Bash', SCRIERE_CANAR), { radacina, env: {}, acum: ACUM });
    assert.equal(bash.cod, 2);
    assert.equal(JSON.parse(bash.stdout).hookSpecificOutput.permissionDecision, 'deny');
    const ps = await proceseazaHook(intrare('PowerShell', SCRIERE_CANAR), { radacina, env: {}, acum: ACUM });
    assert.equal(ps.cod, 2);
    assert.ok(fs.existsSync(chitante));
    assert.deepEqual(citesteChitanteCanar(radacina), [
      { unealta: 'Bash', sha256: sha, la: ACUM.toISOString() },
      { unealta: 'PowerShell', sha256: sha, la: ACUM.toISOString() },
    ]);
    assert.equal(sha256Fisier(path.join(radacina, 'nucleu', '.canar')), sha, 'canarul rămâne neatins');
  });
});

test('și o redirecționare sau Set-Content pe canar lasă chitanța', async () => {
  await cuCanar(async (radacina) => {
    await proceseazaHook(intrare('Bash', 'echo x > nucleu/.canar'), { radacina, env: {}, acum: ACUM });
    await proceseazaHook(intrare('PowerShell', 'Set-Content nucleu\\.canar x'), { radacina, env: {}, acum: ACUM });
    assert.deepEqual(citesteChitanteCanar(radacina).map((c) => c.unealta), ['Bash', 'PowerShell']);
  });
});

test('un refuz care nu ține de canar și o comandă permisă nu lasă chitanță', async () => {
  await cuCanar(async (radacina, chitante) => {
    const r = await proceseazaHook(intrare('Bash', 'echo x > nucleu/mg.mjs'), { radacina, env: {}, acum: ACUM });
    assert.equal(r.cod, 2);
    const citire = await proceseazaHook(intrare('Bash', 'cat nucleu/.canar'), { radacina, env: {}, acum: ACUM });
    assert.deepEqual(citire, { stdout: '', cod: 0 });
    assert.equal(fs.existsSync(chitante), false);
    assert.deepEqual(citesteChitanteCanar(radacina), []);
  });
});

test('fără canar pe disc, refuzul rămâne și nu apare nicio chitanță', async () => {
  await cuCanar(async (radacina, chitante) => {
    const r = await proceseazaHook(intrare('Bash', SCRIERE_CANAR), { radacina, env: {}, acum: ACUM });
    assert.equal(r.cod, 2);
    assert.equal(fs.existsSync(chitante), false);
  }, { canar: false });
});

test('o eroare la scrierea chitanței nu transformă refuzul în permitere', async () => {
  await cuCanar(async (radacina, chitante) => {
    fs.mkdirSync(path.join(chitante, 'blocat'), { recursive: true });
    const r = await proceseazaHook(intrare('Bash', SCRIERE_CANAR), { radacina, env: {}, acum: ACUM });
    assert.equal(r.cod, 2);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
  });
});

test('garda.mjs ca proces scrie chitanța în rădăcina din CLAUDE_PROJECT_DIR', async () => {
  await cuCanar(async (radacina) => {
    const r = await ruleazaGarda({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: SCRIERE_CANAR } }, { radacina });
    assert.equal(r.cod, 2);
    const lista = citesteChitanteCanar(radacina);
    assert.equal(lista.length, 1);
    assert.equal(lista[0].unealta, 'Bash');
    assert.equal(lista[0].sha256, sha256Fisier(path.join(radacina, 'nucleu', '.canar')));
  });
});

test('citesteChitanteCanar sare peste rândurile stricate', async () => {
  await cuCanar(async (radacina, chitante) => {
    fs.writeFileSync(chitante, 'stricat\n{"unealta":"Bash","sha256":"abc","la":"x"}\n{"unealta":1}\n');
    assert.deepEqual(citesteChitanteCanar(radacina), [{ unealta: 'Bash', sha256: 'abc', la: 'x' }]);
  });
});

test('chitanța e ignorată de git și nu intră în integritatea kitului', () => {
  const r = spawnSync('git', ['check-ignore', '--no-index', '-q', '--', 'nucleu/.canar-refuzuri'], { cwd: REPO, encoding: 'utf8' });
  assert.equal(r.status, 0, 'nucleu/.canar-refuzuri trebuie să fie în .gitignore');
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'nucleu/mg.mjs': 'x\n', 'nucleu/.canar-refuzuri': '{}\n' } });
  try {
    assert.deepEqual(fisiereUrmarite(radacina), ['nucleu/mg.mjs']);
  } finally {
    curata();
  }
});

test('comandaTintesteCanar recunoaște canarul, dar nu și chitanța sau alte fișiere', async () => {
  const { comandaTintesteCanar } = await import('../../nucleu/lib/garda/canar.mjs');
  for (const c of ['echo x > nucleu/.canar', 'Set-Content NUCLEU\\.Canar x', 'rm "$CLAUDE_PROJECT_DIR/nucleu/.canar"', 'cd nucleu && rm .canar', 'cd nucleu; echo x > ./.canar']) {
    assert.equal(comandaTintesteCanar(c), true, c);
  }
  for (const c of ['echo x > nucleu/.canar-refuzuri', 'echo x > nucleu/mg.mjs', 'rm .canar', 'echo x > video/p/.canarul']) {
    assert.equal(comandaTintesteCanar(c), false, c);
  }
});
