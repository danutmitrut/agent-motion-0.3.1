// F2 (revizuirea finală): cuvintele cheie (if/then/do/else/!, try/finally) și blocurile { ... } nu mai ascund verbul.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';

const POSIX = '/Users/x/agent motion';
const WIN = 'C:\\agent-motion';

const decizie = (comanda, unealta, radacina = unealta === 'Bash' ? POSIX : WIN) => decideComanda(comanda, unealta, radacina).decizie;

test('Bash: verbul din if/then, do, else, { ...; } și ! e judecat', () => {
  for (const c of [
    'if [ -d video/p/build ]; then rm -rf video/p/build; fi',
    'for f in a; do rm -rf video/p/build; done',
    '{ rm nucleu/mg.mjs; }',
    '! rm nucleu/mg.mjs',
    'if true; then cp /tmp/v.json video/p/verificare.json; fi',
    'while true; do sed -i s/a/b/ video/p/scenariu.md; break; done',
    'until false; do rm nucleu/mg.mjs; done',
    'if false; then :; elif true; then rm nucleu/mg.mjs; fi',
    'if false; then :; else rm nucleu/mg.mjs; fi',
    'if true; then npx hyperframes render; fi',
    'if true; then git push; fi',
    'rm nucleu/{a,b}',
  ]) assert.equal(decizie(c, 'Bash'), 'refuza', c);
});

test('PowerShell: verbul din if, else, try, catch, finally și scriptblock-uri e judecat', () => {
  for (const c of [
    'if (Test-Path video\\p\\build) { Remove-Item -Recurse -Force video\\p\\build }',
    'try { Remove-Item video\\p\\verificare.json } catch {}',
    'try {} catch { Remove-Item nucleu\\mg.mjs }',
    'try {} finally { Remove-Item nucleu\\mg.mjs }',
    'if ($false) {} else { Remove-Item nucleu\\mg.mjs }',
    '1|%{sc nucleu\\mg.mjs x}',
    '& { Set-Content nucleu\\mg.mjs x }',
    'Start-Job { sc nucleu\\mg.mjs x }',
    'Invoke-Command -ScriptBlock {Remove-Item nucleu\\mg.mjs}',
    'if ($true) { Set-Content .claude\\settings.json "{}" }',
    'if ($true) { Set-Content video\\p\\verificare.json "{}" }',
  ]) assert.equal(decizie(c, 'PowerShell'), 'refuza', c);
});

test('citirile și comenzile fără scriere din blocuri rămân permise', () => {
  assert.equal(decizie('for f in video/*/date.json; do echo $f; done', 'Bash'), 'permite');
  assert.equal(decizie('if [ -f video/p/date.json ]; then cat video/p/date.json; fi', 'Bash'), 'permite');
  assert.equal(decizie('Get-ChildItem video | ForEach-Object { $_.Name }', 'PowerShell'), 'permite');
  assert.equal(decizie('if (Test-Path video\\p\\date.json) { Get-Content video\\p\\date.json }', 'PowerShell'), 'permite');
  assert.equal(decizie('cat nucleu/mg.mjs', 'Bash'), 'permite');
});

test('acoladele de variabilă și mg genereaza din bloc nu se schimbă', () => {
  assert.equal(decizie('rm ${CLAUDE_PROJECT_DIR}/nucleu/mg.mjs', 'Bash'), 'refuza');
  assert.equal(decizie('echo {} > .claude/settings.json', 'Bash'), 'refuza');
  assert.equal(decizie('if true; then node nucleu/mg.mjs genereaza desen x "y"; fi', 'Bash'), 'intreaba');
});
