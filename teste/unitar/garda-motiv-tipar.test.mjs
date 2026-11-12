// B00-7 (revizuirea lui B00-6): o ștergere cu tipar în ultimul segment e refuzată cu un motiv care numește tiparul
// scris în comandă și tipul de fișier protejat pe care îl poate atinge, nu un fișier inventat de gardă.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';

const POSIX = '/Users/x/agent motion';
const WIN = 'C:\\agent-motion';

test('rm -rf video/p/resurse/* e refuzat, cu tiparul real și MP4-ul produs de mg în motiv', () => {
  const d = decideComanda('rm -rf video/p/resurse/*', 'Bash', POSIX);
  assert.equal(d.decizie, 'refuza');
  assert.match(d.motiv, /Tiparul video\/p\/resurse\/\* poate atinge un fișier protejat/);
  assert.match(d.motiv, /MP4/);
  assert.match(d.motiv, /extensie sau un nume precis/);
  assert.doesNotMatch(d.motiv, /x\.mp4|node nucleu\/mg\.mjs/);
});

test('tiparul care poate da un verdict revizie-N.md îl numește așa', () => {
  const d = decideComanda('rm -rf tmp/*', 'Bash', POSIX);
  assert.equal(d.decizie, 'refuza');
  assert.match(d.motiv, /Tiparul tmp\/\* poate atinge/);
  assert.match(d.motiv, /revizie-N\.md/);
  assert.doesNotMatch(d.motiv, /revizie-1\.md/);
});

test('tiparul din .claude numește configurația, și la PowerShell', () => {
  const bash = decideComanda('rm -f .claude/*.json', 'Bash', POSIX);
  assert.equal(bash.decizie, 'refuza');
  assert.match(bash.motiv, /Tiparul \.claude\/\*\.json poate atinge/);
  assert.match(bash.motiv, /configurația/);
  const ps = decideComanda('Remove-Item .claude\\*.json', 'PowerShell', WIN);
  assert.equal(ps.decizie, 'refuza');
  assert.match(ps.motiv, /Tiparul \.claude\\\*\.json poate atinge/);
});

test('o redirecționare cu tipar primește același motiv', () => {
  const d = decideComanda('echo x > verificare.*', 'Bash', POSIX, `${POSIX}/video/p`);
  assert.equal(d.decizie, 'refuza');
  assert.match(d.motiv, /Tiparul verificare\.\* poate atinge/);
});

test('un nume protejat scris întreg păstrează motivul obișnuit', () => {
  const d = decideComanda('rm video/p/verificare.json', 'Bash', POSIX);
  assert.equal(d.decizie, 'refuza');
  assert.doesNotMatch(d.motiv, /Tiparul/);
});

test('env -C mută folderul doar pentru comanda pe care o rulează env', () => {
  assert.equal(decideComanda('env -C nucleu ls && rm video/p/note.txt', 'Bash', POSIX).decizie, 'permite');
  assert.equal(decideComanda('env -C nucleu rm mg.mjs && ls', 'Bash', POSIX).decizie, 'refuza');
  assert.equal(decideComanda('env --chdir=video/p rm -rf build', 'Bash', POSIX).decizie, 'refuza');
  assert.equal(decideComanda('env -C $X rm note.txt', 'Bash', POSIX).decizie, 'refuza');
});
