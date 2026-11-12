// F6 (revizuirea finală): PowerShell nu folosește backslash ca escape; comentariile și ghilimelele tipografice
// se citesc ca în PowerShell, iar în Bash un „#” la început de cuvânt deschide un comentariu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imparteComanda, decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';

const POSIX = '/Users/x/agent motion';
const WIN = 'C:\\agent-motion';

test('imparteComanda în modul powershell: backslash literal, comentarii, \'\' și ghilimele tipografice', () => {
  assert.deepEqual(imparteComanda('Set-Content -Value "a\\" nucleu\\mg.mjs #"', { powershell: true }), [['Set-Content', '-Value', 'a\\', 'nucleu\\mg.mjs']]);
  assert.deepEqual(imparteComanda("echo 'it''s'", { powershell: true }), [['echo', "it's"]]);
  assert.deepEqual(imparteComanda('echo "a""b" `"c', { powershell: true }), [['echo', 'a"b', '"c']]);
  assert.deepEqual(imparteComanda('echo “a b”', { powershell: true }), [['echo', 'a b']]);
  assert.deepEqual(imparteComanda('echo a <# comentariu #> b', { powershell: true }), [['echo', 'a', 'b']]);
  assert.equal(imparteComanda('echo a <# neînchis', { powershell: true }), null);
  assert.deepEqual(imparteComanda('echo a#b # rest\nls', { powershell: true }), [['echo', 'a#b'], ['ls']]);
});

test('PowerShell: backslash-ul nu mai ascunde ținta scrierii', () => {
  for (const c of [
    'Set-Content -Value "a\\" nucleu\\mg.mjs #"',
    'Set-Content -Value "a\\" -Path .claude\\settings.json #"',
    'echo x\; Remove-Item -Recurse -Force nucleu',
    'echo x\; Set-Content .claude\\settings.json y',
    'Set-Content -Value x\\ nucleu\\mg.mjs',
  ]) assert.equal(decideComanda(c, 'PowerShell', WIN).decizie, 'refuza', c);
});

test('PowerShell: comentariile și ghilimelele tipografice nu mai ascund o comandă', () => {
  for (const c of [
    'echo hi # "\nRemove-Item -Recurse -Force nucleu\n# "',
    "echo “ ' ”; Remove-Item -Recurse -Force nucleu; echo “ ' ”",
    "Write-Output a <# ' #> ; Remove-Item nucleu\\mg.mjs <# ' #>",
  ]) assert.equal(decideComanda(c, 'PowerShell', WIN).decizie, 'refuza', JSON.stringify(c));
});

test('Bash: un comentariu cu ghilimele nu mai ascunde rândul următor', () => {
  assert.equal(decideComanda('echo hi # "\nrm -rf nucleu\n# "', 'Bash', POSIX).decizie, 'refuza');
  assert.equal(decideComanda('echo hi # un comentariu', 'Bash', POSIX).decizie, 'permite');
  assert.equal(decideComanda('echo a#b > note.txt', 'Bash', POSIX).decizie, 'permite');
});

test('PowerShell: comenzile obișnuite rămân permise', () => {
  for (const c of ['Get-Content nucleu\\mg.mjs', 'Get-ChildItem video # listează proiectele', "Write-Output 'it''s ok'"]) {
    assert.equal(decideComanda(c, 'PowerShell', WIN).decizie, 'permite', c);
  }
});
