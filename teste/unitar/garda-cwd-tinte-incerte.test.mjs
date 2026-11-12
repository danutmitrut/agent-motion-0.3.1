// F1, F5 și D2 (revizuirea finală): garda pornește din cwd-ul hook-ului, urmărește cd-urile literale din comandă
// și refuză scrierile a căror țintă nu o poate stabili sigur (variabile, expansiuni, cd neliteral, ținte date prin pipeline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';

const POSIX = '/Users/x/agent motion';
const WIN = 'C:\\agent-motion';
const MOTIV_INCERT = 'Garda nu poate verifica unde scrie comanda; scrie calea literal, de exemplu nucleu/x sau video/p/x, fără variabile, fără cd înainte și fără blocuri.';

const rad = (unealta) => (unealta === 'Bash' ? POSIX : WIN);
const decizie = (comanda, unealta = 'Bash', baza) => decideComanda(comanda, unealta, rad(unealta), baza).decizie;

test('F1: un cd literal în comandă mută folderul față de care se judecă scrierile', () => {
  for (const [c, u] of [
    ['cd nucleu && echo x > mg.mjs', 'Bash'],
    ['cd nucleu; rm -rf lib', 'Bash'],
    ['cd video/p && rm -rf build verificare.json', 'Bash'],
    ['cd .claude && echo {} > settings.json', 'Bash'],
    ['cd "$CLAUDE_PROJECT_DIR/nucleu" && rm mg.mjs', 'Bash'],
    ['cd video && rm -rf p/build', 'Bash'],
    ['pushd nucleu && rm mg.mjs', 'Bash'],
    ['(cd video); cd nucleu; echo x > mg.mjs', 'Bash'],
    ['if [ -d video/p ]; then cd video/p; fi; rm -rf build', 'Bash'],
    ['cd nucleu && bash -c "rm mg.mjs"', 'Bash'],
    ['cd nucleu; echo $(rm mg.mjs)', 'Bash'],
    ['Set-Location nucleu; Set-Content mg.mjs x', 'PowerShell'],
    ['Push-Location .claude; Remove-Item settings.json', 'PowerShell'],
    ['sl -Path nucleu; sc mg.mjs x', 'PowerShell'],
    ['Set-Location -LiteralPath video\\p; Remove-Item build -Recurse', 'PowerShell'],
    ['cd nucleu; rm mg.mjs', 'PowerShell'],
  ]) assert.equal(decizie(c, u), 'refuza', `${u}: ${c}`);
});

test('F1: folderul curent din hook (cwd) e baza căilor relative', () => {
  assert.equal(decizie('rm -rf build cadre', 'Bash', `${POSIX}/video/reel1`), 'refuza');
  assert.equal(decizie('echo x > mg.mjs', 'Bash', `${POSIX}/nucleu`), 'refuza');
  assert.equal(decizie('Remove-Item build -Recurse', 'PowerShell', `${WIN}\\video\\p`), 'refuza');
  assert.equal(decizie('echo x > note.txt', 'Bash', `${POSIX}/video/p`), 'permite');
  assert.equal(decizie('cat date.json', 'Bash', `${POSIX}/video/p`), 'permite');
  assert.equal(decizie('rm -rf nucleu', 'Bash', '/tmp'), 'permite');
  assert.equal(decizie('cd .. && rm -rf build', 'Bash', `${POSIX}/video/p/resurse`), 'refuza');
});

test('F1: cd-urile care nu ating zone protejate rămân permise', () => {
  for (const [c, u] of [
    ['cd video/p && cat date.json', 'Bash'],
    ['cd video/p && echo x > note.txt', 'Bash'],
    ['cd /tmp && rm -rf x', 'Bash'],
    ['cd .. && ls', 'Bash'],
    ['cd video && node ../nucleu/mg.mjs randeaza p', 'Bash'],
    ['Set-Location video\\p; Get-Content date.json', 'PowerShell'],
  ]) assert.equal(decizie(c, u), 'permite', `${u}: ${c}`);
});

test('D2: un cd neliteral înaintea unei scrieri relative se refuză cu motivul gărzii', () => {
  for (const [c, u] of [
    ['cd $X && echo x > a.txt', 'Bash'],
    ['cd ~ && rm -rf x', 'Bash'],
    ['cd - && rm x', 'Bash'],
    ['cd && rm x', 'Bash'],
    ['cd "$(dirname $0)" && rm x', 'Bash'],
    ['Set-Location $env:TEMP; Remove-Item x', 'PowerShell'],
    ['Pop-Location; Remove-Item x', 'PowerShell'],
    ['cd video/p && node -e "require(\'fs\').writeFileSync(\'verificare.json\',\'{}\')"', 'Bash'],
  ]) {
    const d = decideComanda(c, u, rad(u));
    assert.equal(d.decizie, 'refuza', `${u}: ${c}`);
    assert.equal(d.motiv, MOTIV_INCERT, `${u}: ${c}`);
  }
  assert.equal(decizie('cd $X && ls', 'Bash'), 'permite');
});

test('F5 și D2: ținte de scriere cu variabile sau expansiuni se refuză', () => {
  for (const [c, u] of [
    ['echo x > $PWD/nucleu/mg.mjs', 'Bash'],
    ['echo x > "$(pwd)/nucleu/mg.mjs"', 'Bash'],
    ['echo x > `pwd`/nucleu/mg.mjs', 'Bash'],
    ['echo x > ~/PROIECTE/nucleu/mg.mjs', 'Bash'],
    ['D=nucleu; echo x > $D/mg.mjs', 'Bash'],
    ["echo x > $'nucleu'/mg.mjs", 'Bash'],
    ['echo x | tee {nucleu,tmp}/mg.mjs', 'Bash'],
    ['rm -rf $PWD/.claude/agents', 'Bash'],
    ['cp /tmp/a "$PWD/.claude/settings.json"', 'Bash'],
    ['rm "$F"', 'Bash'],
    ['echo nucleu/mg.mjs | xargs rm', 'Bash'],
    ['Set-Content "$PWD\\nucleu\\mg.mjs" x', 'PowerShell'],
    ['Set-Content ~\\agent-motion\\nucleu\\mg.mjs x', 'PowerShell'],
    ['Set-Content (Join-Path nucleu mg.mjs) x', 'PowerShell'],
    ['Remove-Item -Recurse "$PWD\\.claude\\agents"', 'PowerShell'],
    ['$f="nucleu\\mg.mjs"; Remove-Item $f', 'PowerShell'],
    ['Get-ChildItem video\\p\\build | ForEach-Object { Remove-Item $_.FullName }', 'PowerShell'],
    ['Get-ChildItem video\\p\\build | Remove-Item', 'PowerShell'],
    ['Remove-Item @argumente', 'PowerShell'],
    ['Set-Content -Path C:nucleu\\mg.mjs -Value x', 'PowerShell'],
    ["Set-Content '\\\\localhost\\c$\\agent-motion\\nucleu\\mg.mjs' x", 'PowerShell'],
    ['cmd /c "echo x > %CD%\\nucleu\\mg.mjs"', 'PowerShell'],
  ]) {
    const d = decideComanda(c, u, rad(u));
    assert.equal(d.decizie, 'refuza', `${u}: ${c}`);
  }
  assert.equal(decideComanda('echo x > $PWD/nucleu/mg.mjs', 'Bash', POSIX).motiv, MOTIV_INCERT);
  assert.equal(decideComanda('Set-Content ${env:CLAUDE_PROJECT_DIR}\\nucleu\\mg.mjs x', 'PowerShell', WIN).decizie, 'refuza');
  assert.match(decideComanda('Set-Content ${env:CLAUDE_PROJECT_DIR}\\nucleu\\mg.mjs x', 'PowerShell', WIN).motiv, /nucleu\/mg\.mjs/);
});

test('D2: citirile cu variabile și valorile care nu sunt ținte rămân permise', () => {
  for (const [c, u] of [
    ['echo $HOME', 'Bash'],
    ['cat "$PWD/nucleu/mg.mjs"', 'Bash'],
    ['ls', 'Bash'],
    ['cmd 2>&1', 'Bash'],
    ['cmd > /dev/null 2>&1', 'Bash'],
    ['echo "$HOME" > note.txt', 'Bash'],
    ["sed -i 's/$/;/' video/p/date.json", 'Bash'],
    ['chmod +x unelte/x.sh', 'Bash'],
    ['for f in video/*/date.json; do echo $f; done', 'Bash'],
    ['node nucleu/mg.mjs randeaza p > video/p/randare.txt', 'Bash'],
    ['Get-Content x 2>$null', 'PowerShell'],
    ['node nucleu/mg.mjs randeaza p > $null', 'PowerShell'],
    ['Set-Content -Path video\\p\\date.json -Value $json', 'PowerShell'],
    ['Set-Content -Value $json -Path video\\p\\date.json', 'PowerShell'],
    ['Add-Content notite.txt "Linia $i"', 'PowerShell'],
    ['Get-ChildItem video | ForEach-Object { $_.Name }', 'PowerShell'],
    ['cmd /c "dir %CD%"', 'PowerShell'],
  ]) assert.equal(decizie(c, u), 'permite', `${u}: ${c}`);
});

test('F1: proceseazaHook folosește câmpul cwd din intrare, cu rădăcina ca rezervă', async () => {
  const mediu = { radacina: POSIX, env: {}, acum: new Date('2026-10-02T10:00:00.000Z') };
  const intrare = (command, cwd) => JSON.stringify({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } });
  const refuz = await proceseazaHook(intrare('rm -rf build', `${POSIX}/video/p`), mediu);
  assert.equal(refuz.cod, 2);
  assert.equal(JSON.parse(refuz.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const mg = await proceseazaHook(intrare('echo x > mg.mjs', `${POSIX}/nucleu`), mediu);
  assert.equal(mg.cod, 2);
  assert.deepEqual(await proceseazaHook(intrare('echo x > note.txt', `${POSIX}/video/p`), mediu), { stdout: '', cod: 0 });
  assert.deepEqual(await proceseazaHook(intrare('rm -rf build', undefined), mediu), { stdout: '', cod: 0 });
});
