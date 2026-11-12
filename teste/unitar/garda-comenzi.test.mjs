import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imparteComanda, decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WIN = 'C:\\agent-motion';
const POSIX = '/Users/x/agent motion';
const UNELTE = ['Bash', 'PowerShell'];

function decizie(comanda, unealta = 'Bash', radacina = POSIX) {
  return decideComanda(comanda, unealta, radacina).decizie;
}

function fixture(nume) {
  return fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'hook', nume), 'utf8');
}

test('imparteComanda: separatori, ghilimele și redirecționări', () => {
  assert.deepEqual(imparteComanda('echo x > nucleu/mg.mjs'), [['echo', 'x', '>', 'nucleu/mg.mjs']]);
  assert.deepEqual(imparteComanda('echo x>>f'), [['echo', 'x', '>>', 'f']]);
  assert.deepEqual(imparteComanda('cmd 2>&1'), [['cmd', '2>', '&1']]);
  assert.deepEqual(imparteComanda('a && b || c; d | e & f'), [['a'], ['b'], ['c'], ['d'], ['e'], ['f']]);
  assert.deepEqual(imparteComanda('a\nb'), [['a'], ['b']]);
  assert.deepEqual(imparteComanda(`echo "a b" 'c d'`), [['echo', 'a b', 'c d']]);
  assert.deepEqual(imparteComanda('echo a\\ b'), [['echo', 'a b']]);
  assert.deepEqual(imparteComanda('echo `"a`"'), [['echo', '"a"']]);
  assert.deepEqual(imparteComanda('(rm nucleu/x)'), [['rm', 'nucleu/x']]);
  assert.deepEqual(imparteComanda(''), []);
});

test('imparteComanda: backslash-ul din căile Windows rămâne', () => {
  assert.deepEqual(imparteComanda('Set-Content nucleu\\mg.mjs x'), [['Set-Content', 'nucleu\\mg.mjs', 'x']]);
  assert.deepEqual(imparteComanda('Get-Content C:\\agent-motion\\nucleu\\mg.mjs'), [['Get-Content', 'C:\\agent-motion\\nucleu\\mg.mjs']]);
});

test('imparteComanda: ghilimelele neînchise dau null', () => {
  assert.equal(imparteComanda('echo "neînchis'), null);
  assert.equal(imparteComanda("echo 'neînchis"), null);
});

test('scrierea în mg.mjs prin redirecționare sau verb e refuzată', () => {
  assert.equal(decizie('echo x > nucleu/mg.mjs', 'Bash', POSIX), 'refuza');
  assert.equal(decizie('echo x > nucleu/mg.mjs', 'Bash', WIN), 'refuza');
  assert.equal(decizie('Set-Content nucleu\\mg.mjs x', 'PowerShell', WIN), 'refuza');
  assert.equal(decizie('Set-Content -Path nucleu\\mg.mjs -Value x', 'PowerShell', WIN), 'refuza');
  assert.equal(decizie('Set-Content C:\\agent-motion\\nucleu\\mg.mjs x', 'PowerShell', WIN), 'refuza');
  assert.equal(decizie('Set-Content c:/AGENT-MOTION/nucleu/mg.mjs x', 'PowerShell', WIN), 'refuza');
  assert.equal(decizie('echo x > "/Users/x/agent motion/nucleu/mg.mjs"', 'Bash', POSIX), 'refuza');
  assert.equal(decizie('echo x > "$CLAUDE_PROJECT_DIR/nucleu/mg.mjs"', 'Bash', POSIX), 'refuza');
  assert.equal(decizie('echo x > /c/agent-motion/nucleu/mg.mjs', 'Bash', WIN), 'refuza');
  assert.equal(decizie('echo x > C:/agent-motion/nucleu/mg.mjs', 'Bash', WIN), 'refuza');
  const d = decideComanda('echo x > nucleu/mg.mjs', 'Bash', POSIX);
  assert.match(d.motiv, /nucleu\/mg\.mjs/);
});

test('motoarele, upgrade-urile, skillurile, telemetria și publicarea sunt refuzate pe ambele unelte', () => {
  const comenzi = [
    'npx hyperframes render',
    'hyperframes upgrade',
    'npx skills add hyperframes',
    'remotion upgrade',
    'npm update',
    'hyperframes feedback',
    'node unelte/raport.mjs --file-issue',
    'hyperframes publish',
    'git push',
    'git push origin stabil',
    'git -C . push',
    'npm publish',
    'npm install -g hyperframes',
    'npx create-video@latest',
    'ffmpeg -i a.mp4 b.mp4',
    'C:\\unelte\\ffprobe.exe x.mp4',
    'npm exec hyperframes render',
    'FOO=1 npx hyperframes render',
    'node motoare/hyperframes/node_modules/hyperframes/bin/hyperframes.mjs render',
  ];
  for (const unealta of UNELTE) {
    for (const radacina of [WIN, POSIX]) {
      for (const comanda of comenzi) {
        assert.equal(decizie(comanda, unealta, radacina), 'refuza', `${unealta}: ${comanda}`);
      }
    }
  }
  assert.match(decideComanda('npx hyperframes render', 'Bash', POSIX).motiv, /doar prin mg/);
  assert.match(decideComanda('hyperframes upgrade', 'Bash', POSIX).motiv, /mg actualizeaza/);
  assert.match(decideComanda('git push', 'PowerShell', WIN).motiv, /git push/);
});

test('mg genereaza primește intreaba, pe ambele unelte', () => {
  for (const unealta of UNELTE) {
    const d = decideComanda('node nucleu/mg.mjs genereaza desen x "y" --proiect p', unealta, POSIX);
    assert.equal(d.decizie, 'intreaba', unealta);
    assert.match(d.motiv, /Kie/);
  }
  assert.equal(decizie('node .\\nucleu\\mg.mjs genereaza desen x "y" --proiect p', 'PowerShell', WIN), 'intreaba');
  assert.equal(decizie('node C:\\agent-motion\\nucleu\\mg.mjs genereaza desen x "y"', 'PowerShell', WIN), 'intreaba');
  assert.equal(decizie('cd video && node ../nucleu/mg.mjs genereaza desen x "y"', 'Bash', POSIX), 'intreaba');
});

test('mg genereaza --estimeaza trece fără aprobare; după -- sau altfel scris, cere aprobare (felia 5)', () => {
  for (const unealta of UNELTE) {
    assert.equal(decizie('node nucleu/mg.mjs genereaza desen p-x "y" --etichete "a,b,c,d" --estimeaza', unealta), 'permite', unealta);
    assert.equal(decizie('node nucleu/mg.mjs genereaza desen p-x "y" -- --estimeaza', unealta), 'intreaba', unealta);
    assert.equal(decizie('node nucleu/mg.mjs genereaza desen p-x "y --estimeaza"', unealta), 'intreaba', unealta);
    assert.equal(decizie('node nucleu/mg.mjs genereaza desen p-x "y" --estimeaza=false', unealta), 'intreaba', unealta);
  }
  assert.equal(decizie('bash -c "node nucleu/mg.mjs genereaza desen p-x y"'), 'intreaba');
});

test('mg actualizeaza --verifica trece fără aprobare; aplicarea și --inapoi cer aprobare (felia 6)', () => {
  for (const unealta of UNELTE) {
    assert.equal(decizie('node nucleu/mg.mjs actualizeaza --verifica', unealta), 'permite', unealta);
    assert.equal(decizie('node nucleu/mg.mjs actualizeaza --json --verifica', unealta), 'permite', unealta);
    for (const c of ['actualizeaza', 'actualizeaza --inapoi', 'actualizeaza --chiar-daca-e-in-lucru', 'actualizeaza -- --verifica', 'actualizeaza --verifica=false']) {
      const d = decideComanda(`node nucleu/mg.mjs ${c}`, unealta, POSIX);
      assert.equal(d.decizie, 'intreaba', `${unealta}: ${c}`);
      assert.match(d.motiv, /versiunea agentului/);
    }
  }
  assert.equal(decizie('node .\\nucleu\\mg.mjs actualizeaza --inapoi', 'PowerShell', WIN), 'intreaba');
  assert.equal(decizie('bash -c "node nucleu/mg.mjs actualizeaza --verifica"'), 'intreaba');
});

test('git care mută sau rescrie arborele de lucru al agentului e refuzat; citirile și alte foldere trec (felia 6)', () => {
  const refuzate = ['git pull', 'git pull origin stabil', 'git reset --hard origin/stabil', 'git reset --keep HEAD~1', 'git merge origin/stabil',
    'git switch stabil', 'git checkout stabil', 'git checkout HEAD~3', 'git rebase origin/stabil', 'git stash', 'git stash pop',
    'git cherry-pick abc123', 'git revert HEAD', 'git -c x=y read-tree -u -m HEAD', 'git checkout-index -a -f', 'git -C . reset --hard',
    // ocolirile găsite la review: subfolder neprotejat, --git-dir/--work-tree, aliasuri, config, remote, refs, sparse-checkout
    'git -C docs pull', 'git -C branduri reset --hard origin/stabil', 'git -C video/p/x checkout stabil', 'git -C unelte checkout HEAD~2',
    'git -c alias.x=reset x --hard origin/stabil', 'git -c "alias.x=!git reset --hard" x', 'git --config-env=alias.x=Y x',
    'git config alias.x reset', 'git config --global alias.x reset', 'git x --hard', 'git remote set-url origin https://e.com/x.git',
    'git config remote.origin.url https://e.com/x.git', 'git config core.hooksPath h', 'git -c core.hooksPath=h fetch',
    'git sparse-checkout set docs', 'git submodule update', 'git update-ref HEAD abc', 'git symbolic-ref HEAD refs/heads/x', 'git worktree add w'];
  for (const unealta of UNELTE) {
    for (const c of refuzate) {
      const d = decideComanda(c, unealta, unealta === 'Bash' ? POSIX : WIN);
      assert.equal(d.decizie, 'refuza', `${unealta}: ${c}`);
      assert.match(d.motiv, /mg\.mjs actualizeaza/, c);
    }
  }
  for (const c of ['git status', 'git log --oneline -5', 'git fetch origin stabil', 'git diff', 'git rev-parse HEAD', 'git -C /tmp/alt-depozit pull',
    'git -C /tmp/alt reset --hard', 'git config --get remote.origin.url', 'git config user.name', 'git remote -v', 'git remote get-url origin',
    'git -c color.ui=always log', 'git branch', 'git -C docs log']) {
    assert.equal(decizie(c), 'permite', c);
  }
  assert.equal(decizie('git -C $D reset --hard'), 'refuza');
  assert.equal(decizie(`git --git-dir="${POSIX}/.git" --work-tree="${POSIX}" -C /tmp reset --hard`), 'refuza');
  for (const unealta of UNELTE) {
    assert.equal(decizie('echo x > .git/config', unealta, unealta === 'Bash' ? POSIX : WIN), 'refuza', unealta);
    assert.equal(decizie('echo x > .git/hooks/reference-transaction', unealta, unealta === 'Bash' ? POSIX : WIN), 'refuza', unealta);
  }
});

test('valoarea cheii din seif nu ajunge la agent: cheie.py citeste și citirile directe sunt refuzate (felia 5)', () => {
  const refuzate = [
    ['unelte/python/bin/python nucleu/cheie.py citeste kie', 'Bash'],
    ['bash -c "unelte/python/bin/python nucleu/cheie.py citeste kie"', 'Bash'],
    ['python3 -c "import keyring; print(keyring.get_password(\'agent-motion\', \'kie\'))"', 'Bash'],
    ['security find-generic-password -s agent-motion -w', 'Bash'],
    ['.\\unelte\\python\\Scripts\\python.exe nucleu\\cheie.py CITESTE kie', 'PowerShell'],
    ['[Windows.Security.Credentials.PasswordVault]::new().RetrieveAll()', 'PowerShell'],
  ];
  for (const [comanda, unealta] of refuzate) {
    const d = decideComanda(comanda, unealta, unealta === 'Bash' ? POSIX : WIN);
    assert.equal(d.decizie, 'refuza', comanda);
    assert.match(d.motiv, /doctor --generare/, comanda);
  }
  // nici verifica nu trece: agentul află starea cheii doar prin doctor --generare
  assert.equal(decizie('unelte/python/bin/python nucleu/cheie.py verifica kie'), 'refuza');
  assert.equal(decizie('node nucleu/mg.mjs doctor --generare'), 'permite');
  assert.equal(decizie('node nucleu/mg.mjs doctor --generare --instaleaza-keyring'), 'permite');
});

test('seiful nu se citește nici prin unelte ocolite: python -m keyring, keyring.exe, glob, variabile (felia 5)', () => {
  const refuzate = [
    ['unelte/python/bin/python -m keyring get agent-motion kie', 'Bash'],
    ['unelte/python/bin/keyring get agent-motion kie', 'Bash'],
    ['python nucleu/chei?.py citeste kie', 'Bash'],
    ['A=citeste; python nucleu/cheie.py $A kie', 'Bash'],
    ["python3 -c \"import keyring as k; print(getattr(k,'get_'+'password')(1,2))\"", 'Bash'],
    ['.\\unelte\\python\\Scripts\\keyring.exe get agent-motion kie', 'PowerShell'],
  ];
  for (const [comanda, unealta] of refuzate) {
    assert.equal(decideComanda(comanda, unealta, unealta === 'Bash' ? POSIX : WIN).decizie, 'refuza', comanda);
  }
});

test('mg genereaza scris indirect cere aprobare, iar node redefinit e refuzat (felia 5)', () => {
  const intrebate = [
    ['X=genereaza; node nucleu/mg.mjs $X desen p-a "un brutar" --etichete "a,b,c,d"', 'Bash'],
    ['node nucleu/mg.mjs "$X" desen p-a x', 'Bash'],
    ['node nucleu/mg.mjs $(echo genereaza) desen p-a x', 'Bash'],
    ['node nucleu/mg.mjs `echo genereaza` desen p-a x', 'Bash'],
    ['echo genereaza desen p-a x --etichete a,b,c,d | xargs node nucleu/mg.mjs', 'Bash'],
    ['xargs node nucleu/mg.mjs < args.txt', 'Bash'],
    ['$s="genereaza"; node nucleu\\mg.mjs $s desen p-a x', 'PowerShell'],
    ['node nucleu\\mg.mjs ("gene"+"reaza") desen p-a x', 'PowerShell'],
    ['node nucleu\\mg.mjs @("genereaza","desen")', 'PowerShell'],
    ['Start-Process node -ArgumentList "nucleu\\mg.mjs genereaza desen p-a x"', 'PowerShell'],
  ];
  for (const [comanda, unealta] of intrebate) {
    assert.equal(decideComanda(comanda, unealta, unealta === 'Bash' ? POSIX : WIN).decizie, 'intreaba', comanda);
  }
  assert.equal(decizie('node(){ command node "${@/--estimeaza/}"; }; node nucleu/mg.mjs genereaza desen p-a x --estimeaza'), 'refuza');
  assert.equal(decizie('node "/Users/x/agent motion/nucleu/mg.mjs" randeaza p'), 'permite');
  assert.equal(decizie('cd video && node ../nucleu/mg.mjs randeaza p'), 'permite');
  // reia nu poate porni o sarcină nouă, deci nu costă
  assert.equal(decizie('node nucleu/mg.mjs genereaza reia p-brutar'), 'permite');
  assert.equal(decizie('node nucleu/mg.mjs genereaza desen reia "un brutar" --etichete a,b,c,d'), 'intreaba');
});

test('comenzile permise', () => {
  const permise = [
    ['node nucleu/mg.mjs randeaza p', 'Bash'],
    ['node nucleu/mg.mjs randeaza p', 'PowerShell'],
    ['node nucleu/mg.mjs randeaza p > video/p/randare.txt', 'Bash'],
    ['cat nucleu/mg.mjs', 'Bash'],
    ['Get-Content nucleu\\mg.mjs', 'PowerShell'],
    ['git status', 'Bash'],
    ['git -C /tmp/alt commit -m "push"', 'Bash'],
    ['ls video && git log --oneline', 'Bash'],
    ['echo x > video/p/date.json', 'Bash'],
    ['mkdir video/p/resurse', 'Bash'],
    ['Copy-Item resurse\\a.png video\\p\\resurse\\', 'PowerShell'],
    ['sed s/a/b/ nucleu/mg.mjs', 'Bash'],
    ['rm notite.txt', 'Bash'],
    ['touch *.md', 'Bash'],
    ['rm /tmp/x', 'Bash'],
    ['cmd 2>&1', 'Bash'],
    ['', 'Bash'],
  ];
  for (const [comanda, unealta] of permise) {
    assert.equal(decizie(comanda, unealta, POSIX), 'permite', `${unealta}: ${comanda}`);
  }
  assert.equal(decizie('Set-Content D:\\alt\\x.txt x', 'PowerShell', WIN), 'permite');
});

test('scrierea în zonele protejate prin verbe, eval și interpretoare e refuzată', () => {
  const refuzate = [
    ['cp a.txt video/p/verificare.json', 'Bash'],
    ['rm -rf nucleu', 'Bash'],
    ['rm -rf *', 'Bash'],
    ['rm -rf .', 'Bash'],
    ['Remove-Item -Recurse -Force .\\motoare', 'PowerShell'],
    ['ri video\\p\\p.mp4', 'PowerShell'],
    ['sed -i s/a/b/ nucleu/mg.mjs', 'Bash'],
    ['echo x | tee video/p/cadre/revizie-1.md', 'Bash'],
    ['echo x | Out-File -FilePath video\\p\\motor.lock', 'PowerShell'],
    ['dd if=/dev/zero of=nucleu/x', 'Bash'],
    ['mkdir video/p/build', 'Bash'],
    ['chmod 777 biblioteci/catalog.json', 'Bash'],
    ['echo x > video/p/p.mp4', 'Bash'],
    [`node -e "require('fs').writeFileSync('nucleu/x', 'y')"`, 'Bash'],
    [`python3 -c "open('motoare/a', 'w')"`, 'Bash'],
    ['bash -c "rm nucleu/mg.mjs"', 'Bash'],
    ['echo `rm nucleu/mg.mjs`', 'Bash'],
    ['echo $(npx hyperframes render)', 'Bash'],
    ['pwsh -NoProfile -Command "Remove-Item nucleu\\x"', 'PowerShell'],
    ['powershell -EncodedCommand AAAA', 'PowerShell'],
    ['cmd /c "npx hyperframes render"', 'PowerShell'],
    ['iex "hyperframes upgrade"', 'PowerShell'],
    ["python3 - <<'EOF'\nopen('nucleu/x', 'w')\nEOF", 'Bash'],
  ];
  for (const [comanda, unealta] of refuzate) {
    assert.equal(decizie(comanda, unealta, POSIX), 'refuza', `${unealta}: ${comanda}`);
  }
});

test('scenariu.md se scrie doar cu Write sau Edit: prin Bash și PowerShell e refuzat, citirea e permisă', () => {
  const refuzate = [
    ['sed -i s/a/b/ video/p/scenariu.md', 'Bash'],
    ['echo x > video/p/scenariu.md', 'Bash'],
    ['echo x >> video/p/scenariu.md', 'Bash'],
    ['echo x | tee video/p/scenariu.md', 'Bash'],
    ['Set-Content video\\p\\scenariu.md x', 'PowerShell'],
    ['Add-Content -Path video\\p\\scenariu.md -Value x', 'PowerShell'],
    [`python3 -c "open('video/p/scenariu.md', 'w')"`, 'Bash'],
  ];
  for (const [comanda, unealta] of refuzate) {
    for (const radacina of [WIN, POSIX]) {
      const d = decideComanda(comanda, unealta, radacina);
      assert.equal(d.decizie, 'refuza', `${unealta}: ${comanda}`);
    }
  }
  assert.match(decideComanda('sed -i s/a/b/ video/p/scenariu.md', 'Bash', POSIX).motiv, /Write sau Edit/);
  const permise = [
    ['cat video/p/scenariu.md', 'Bash'],
    ['Get-Content video\\p\\scenariu.md', 'PowerShell'],
    ['grep -n mg:start video/p/scenariu.md', 'Bash'],
    ["sed -n '1,20p' video/p/scenariu.md", 'Bash'],
  ];
  for (const [comanda, unealta] of permise) {
    assert.equal(decizie(comanda, unealta, POSIX), 'permite', `${unealta}: ${comanda}`);
  }
});

test('configurația lui Claude Code (.claude/settings.json, settings.local.json, agents/) nu se scrie prin comenzi; citirea e permisă (A-Î3)', () => {
  const refuzate = [
    ['echo {} > .claude/settings.json', 'Bash'],
    ['sed -i s/deny/allow/ .claude/settings.json', 'Bash'],
    ['cp /tmp/x.json .claude/settings.local.json', 'Bash'],
    ['rm -rf .claude/agents', 'Bash'],
    ['rm -rf .claude', 'Bash'],
    ['mv .claude .claude-vechi', 'Bash'],
    ['rm -rf .cl*', 'Bash'],
    ['echo x > .claude/agents/revizor-cadre.md', 'Bash'],
    [`node -e "require('fs').writeFileSync('.claude/settings.json', '{}')"`, 'Bash'],
    ['Set-Content .claude\\settings.local.json x', 'PowerShell'],
    ['Remove-Item -Recurse .claude\\agents', 'PowerShell'],
    ['Copy-Item x.md .Claude\\Agents\\revizor-cadre.md', 'PowerShell'],
  ];
  for (const [comanda, unealta] of refuzate) {
    for (const radacina of [WIN, POSIX]) {
      assert.equal(decideComanda(comanda, unealta, radacina).decizie, 'refuza', `${unealta}: ${comanda}`);
    }
  }
  assert.match(decideComanda('echo {} > .claude/settings.json', 'Bash', POSIX).motiv, /o modifică doar cursantul/);
  const permise = [
    ['cat .claude/settings.json', 'Bash'],
    ['Get-Content .claude\\settings.local.json', 'PowerShell'],
    ['ls .claude/agents', 'Bash'],
    ['grep -n deny .claude/settings.json', 'Bash'],
  ];
  for (const [comanda, unealta] of permise) {
    assert.equal(decizie(comanda, unealta, POSIX), 'permite', `${unealta}: ${comanda}`);
  }
});

test('cheia în comandă și ghilimelele neînchise sunt refuzate', () => {
  assert.equal(decizie('export KIE_API_KEY=abcdefghijklmnopqrstuvwxyz123456'), 'refuza');
  for (const unealta of UNELTE) {
    const d = decideComanda('echo "neînchis', unealta, POSIX);
    assert.equal(d.decizie, 'refuza');
    assert.match(d.motiv, /ghilimele/);
  }
});

test('proceseazaHook: fixture-urile PreToolUse pe Bash și PowerShell dau deny cu exit 2', async () => {
  const bash = await proceseazaHook(fixture('pretooluse-bash.json'), { radacina: POSIX, env: {}, acum: new Date() });
  assert.equal(bash.cod, 2);
  assert.equal(JSON.parse(bash.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const ps = await proceseazaHook(fixture('pretooluse-powershell.json'), { radacina: WIN, env: {}, acum: new Date() });
  assert.equal(ps.cod, 2);
  assert.equal(JSON.parse(ps.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('proceseazaHook: mg genereaza dă ask cu exit 0, iar o comandă permisă dă stdout gol', async () => {
  const intrare = (command, tool_name) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input: { command } });
  const ask = await proceseazaHook(intrare('node nucleu/mg.mjs genereaza desen x "y" --proiect p', 'PowerShell'), { radacina: WIN, env: {}, acum: new Date() });
  assert.equal(ask.cod, 0);
  assert.equal(JSON.parse(ask.stdout).hookSpecificOutput.permissionDecision, 'ask');
  const ok = await proceseazaHook(intrare('Get-Content nucleu\\mg.mjs', 'PowerShell'), { radacina: WIN, env: {}, acum: new Date() });
  assert.deepEqual([ok.cod, ok.stdout], [0, '']);
  const faraComanda = await proceseazaHook(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: {} }), { radacina: WIN, env: {}, acum: new Date() });
  assert.equal(faraComanda.cod, 2);
});

test('SEC-3 (2026-10-06): ștergerea unui strămoș al rădăcinii e refuzată, cu motivul că ar lua tot agentul', () => {
  const refuzate = [
    ['rm -rf ..', 'Bash', POSIX],
    ['rm -rf ../', 'Bash', POSIX],
    ['rm -rf "/Users/x"', 'Bash', POSIX],
    ['rm -rf /Users', 'Bash', POSIX],
    ['rm -rf /', 'Bash', POSIX],
    ['rm -rf "/USERS/X"', 'Bash', POSIX],
    ['rm -rf "$CLAUDE_PROJECT_DIR/.."', 'Bash', POSIX],
    ['rm -rf ../*', 'Bash', POSIX],
    ['rm -rf ../agent*', 'Bash', POSIX],
    ['mv .. /tmp/vechi', 'Bash', POSIX],
    ['Remove-Item -Recurse -Force ..', 'PowerShell', WIN],
    ['Remove-Item -Recurse ..\\', 'PowerShell', WIN],
    ['ri -r -fo C:\\', 'PowerShell', WIN],
    ['Remove-Item -Recurse -Force \\', 'PowerShell', WIN],
    ['Remove-Item -Recurse -LiteralPath C:\\', 'PowerShell', WIN],
    ['Remove-Item -Recurse c:/', 'PowerShell', WIN],
    ['rm -rf /c', 'Bash', WIN],
  ];
  for (const [comanda, unealta, radacina] of refuzate) {
    const d = decideComanda(comanda, unealta, radacina);
    assert.equal(d.decizie, 'refuza', `${unealta}: ${comanda}`);
    assert.match(d.motiv, /tot agentul/, `${unealta}: ${comanda}: ${d.motiv}`);
  }
  // dintr-un proiect, cwd-ul dat de hook
  for (const [comanda, unealta, radacina, cwd] of [
    ['Remove-Item -Recurse ..\\..\\..', 'PowerShell', WIN, 'C:\\agent-motion\\video\\p'],
    ['rm -rf ../../..', 'Bash', POSIX, `${POSIX}/video/p`],
  ]) {
    const d = decideComanda(comanda, unealta, radacina, cwd);
    assert.equal(d.decizie, 'refuza', comanda);
    assert.match(d.motiv, /tot agentul/, comanda);
  }
  // cu un cd în față, garda refuza deja (motivul vechi, mai puțin precis); rămâne refuzat
  assert.equal(decizie('cd video/p && rm -rf ../../..'), 'refuza');
});

test('SEC-3 (2026-10-06): ștergerea unui proiect întreg din video/ e refuzată, consecvent cu find -delete', () => {
  const refuzate = [
    ['rm -rf video/p', 'Bash'],
    ['rm -rf video/p/', 'Bash'],
    ['rm -r ./video/p', 'Bash'],
    ['rm -rf video/p/.', 'Bash'],
    ['rmdir video/p', 'Bash'],
    ['mv video/p /tmp/p', 'Bash'],
    ['mv video/p video/p-vechi', 'Bash'],
    ['rm -rf "/Users/x/agent motion/video/p"', 'Bash'],
    ['Remove-Item -Recurse -Force video\\p', 'PowerShell'],
    ['Remove-Item -Path video\\p -Recurse', 'PowerShell'],
    ['ri -r video\\p\\', 'PowerShell'],
    ['Move-Item video\\p C:\\temp\\p', 'PowerShell'],
  ];
  for (const [comanda, unealta] of refuzate) {
    for (const radacina of [WIN, POSIX]) {
      const d = decideComanda(comanda.replace('/Users/x/agent motion', radacina), unealta, radacina);
      assert.equal(d.decizie, 'refuza', `${unealta} ${radacina}: ${comanda}`);
      assert.match(d.motiv, /tot proiectul .*video[\\/]p\b/, `${unealta} ${radacina}: ${comanda}: ${d.motiv}`);
      assert.match(d.motiv, /node nucleu\/mg\.mjs nou <alt-nume> --din p /, `${unealta} ${radacina}: ${comanda}: ${d.motiv}`);
    }
  }
  assert.equal(decideComanda('rm -rf p', 'Bash', POSIX, `${POSIX}/video`).decizie, 'refuza');
  assert.equal(decideComanda('find video/p -delete', 'Bash', POSIX).decizie, 'refuza');
});

test('SEC-3 (2026-10-06): ce e în interiorul unui proiect, în afara agentului sau destinația unei mutări rămâne permis', () => {
  const permise = [
    ['rm -rf video/p/resurse/vechi', 'Bash', POSIX],
    ['rm -f video/p/note.txt', 'Bash', POSIX],
    ['rm -rf ../alt-folder', 'Bash', POSIX],
    ['rm -rf /tmp/mg-proba', 'Bash', POSIX],
    ['rm -rf ../alt*', 'Bash', POSIX],
    ['mv /Users/x/Downloads/poza.png video/p/', 'Bash', POSIX],
    ['mv video/p/resurse/a.png ..', 'Bash', POSIX],
    ['mv -t video/p /tmp/a.png', 'Bash', POSIX],
    ['cp -r video/p /tmp/copie', 'Bash', POSIX],
    ['Move-Item C:\\Users\\Ana\\Downloads\\poza.png video\\p', 'PowerShell', WIN],
    ['Move-Item -Path C:\\temp\\a.png -Destination video\\p', 'PowerShell', WIN],
    ['Remove-Item -Recurse D:\\alt\\x', 'PowerShell', WIN],
    ['Remove-Item video\\p\\resurse\\*.png', 'PowerShell', WIN],
  ];
  for (const [comanda, unealta, radacina] of permise) {
    assert.equal(decizie(comanda, unealta, radacina), 'permite', `${unealta}: ${comanda}`);
  }
});

test('SEC-3, corectura 1: redenumirea unui proiect e refuzată cu drumul care nu pierde munca (--din), iar calea păstrează majusculele', () => {
  for (const [comanda, unealta, radacina] of [
    ['mv video/Lansare video/Lansare-2', 'Bash', POSIX],
    ['Rename-Item video\\Lansare Lansare-2', 'PowerShell', WIN],
    ['ren video\\Lansare Lansare-2', 'PowerShell', WIN],
  ]) {
    const d = decideComanda(comanda, unealta, radacina);
    assert.equal(d.decizie, 'refuza', comanda);
    assert.match(d.motiv, /tot proiectul video[\\/]Lansare \(/, `${comanda}: ${d.motiv}`);
    assert.match(d.motiv, /Pentru o variantă, o copie sau alt nume, fă un proiect nou din el: node nucleu\/mg\.mjs nou <alt-nume> --din Lansare \(proiectul vechi rămâne neatins\)\./, d.motiv);
    assert.match(d.motiv, /Dacă proiectul chiar trebuie redenumit sau șters, o face cursantul, singur, în Finder sau în Explorer\./, d.motiv);
    assert.doesNotMatch(d.motiv, /--sablon reel-ilustrat|video\/lansare/, d.motiv);
  }
});

test('SEC-3, corectura 1: un fișier existent aflat direct în video/ nu e „tot proiectul”; mutarea și ștergerea lui rămân permise', () => {
  const radacina = fs.mkdtempSync(path.join(os.tmpdir(), 'garda-video-'));
  try {
    fs.mkdirSync(path.join(radacina, 'video', 'p', 'resurse'), { recursive: true });
    for (const f of ['poza.png', '.DS_Store', 'Thumbs.db', 'p.zip']) fs.writeFileSync(path.join(radacina, 'video', f), 'x');
    for (const [comanda, unealta] of [
      ['mv video/poza.png video/p/resurse/', 'Bash'],
      ['rm video/.DS_Store', 'Bash'],
      ['rm -f video/p.zip', 'Bash'],
      ['Move-Item video\\poza.png video\\p\\resurse\\', 'PowerShell'],
      ['Remove-Item video\\Thumbs.db', 'PowerShell'],
    ]) {
      const d = decideComanda(comanda, unealta, radacina);
      assert.equal(d.decizie, 'permite', `${unealta}: ${comanda}: ${d.motiv}`);
    }
    // proiectul real (folder) rămâne refuzat; o cale care nu există pe disc, la fel
    assert.equal(decideComanda('rm -rf video/p', 'Bash', radacina).decizie, 'refuza');
    assert.equal(decideComanda('rm -rf video/nu-exista', 'Bash', radacina).decizie, 'refuza');
  } finally {
    fs.rmSync(radacina, { recursive: true, force: true });
  }
});

test('decizia din 2026-10-06: node …/@anthropic-ai/claude-code/cli.js e tratat ca sesiunea Claude Code (comanda claude)', () => {
  const refuzate = [
    ['node /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js -p aprob', 'Bash', POSIX],
    ['node --no-warnings /opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js --print aprob', 'Bash', POSIX],
    ['echo aprob | node "$HOME/.npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js" -p', 'Bash', POSIX],
    ['node node_modules/@anthropic-ai/claude-code/cli.js -p aprob', 'Bash', POSIX],
    ['node /c/Users/Ana/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js -p aprob', 'Bash', WIN],
    ['node C:\\Users\\Ana\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js -p aprob', 'PowerShell', WIN],
    ['node.exe C:\\Users\\Ana\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js -p aprob', 'PowerShell', WIN],
    ['& "C:\\Program Files\\nodejs\\node.exe" "$env:APPDATA\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js" --print "aprob"', 'PowerShell', WIN],
    ['C:\\PROGRA~1\\nodejs\\NODE.EXE C:\\Users\\Ana\\AppData\\Roaming\\npm\\node_modules\\@Anthropic-AI\\Claude-Code\\CLI.JS -p aprob', 'PowerShell', WIN],
  ];
  const motivClaude = decideComanda('claude -p aprob', 'Bash', POSIX).motiv;
  for (const [comanda, unealta, radacina] of refuzate) {
    const d = decideComanda(comanda, unealta, radacina);
    assert.equal(d.decizie, 'refuza', `${unealta}: ${comanda}`);
    assert.equal(d.motiv, motivClaude, `${unealta}: ${comanda}`);
  }
  assert.match(motivClaude, /cli\.js/);
  // alte cli.js și mg rămân permise
  for (const comanda of ['node unelte/proba/cli.js', 'node node_modules/@anthropic-ai/sdk/cli.js', 'node nucleu/mg.mjs randeaza p']) {
    assert.equal(decizie(comanda), 'permite', comanda);
  }
});
