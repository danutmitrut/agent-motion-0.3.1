import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imparteComanda, decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';

const POSIX = '/Users/x/agent motion';

function decizie(comanda, unealta = 'Bash') {
  return decideComanda(comanda, unealta, POSIX).decizie;
}

test('Bash: backslash într-o cale nu ocolește regula scrierii', () => {
  for (const c of [
    'echo x > n\\ucleu/mg.mjs',
    'echo x > video/p/ver\\ificare.json',
    'echo x > .cl\\aude/settings.json',
  ]) assert.equal(decizie(c), 'refuza', c);
  assert.equal(decizie('cat nucleu\\mg.mjs'), 'permite');
  assert.equal(decizie('C:\\unelte\\ffprobe.exe x.mp4'), 'refuza');
});

test('imparteComanda: fără al doilea argument, comportamentul rămâne cel din fișă', () => {
  assert.deepEqual(imparteComanda('cat n\\ucleu'), [['cat', 'n\\ucleu']]);
  assert.deepEqual(imparteComanda('cat n\\ucleu', { bash: true }), [['cat', 'nucleu']]);
});

test('Bash: redirecționările >| și >& către zone protejate se refuză', () => {
  for (const c of [
    'echo x >| nucleu/mg.mjs',
    'echo x >& nucleu/mg.mjs',
    'echo x >| .claude/settings.json',
  ]) assert.equal(decizie(c), 'refuza', c);
  for (const c of ['cmd >&2', 'echo x >| notite.txt', 'cmd 2>&1', 'cmd 2>&1 | tee log.txt']) {
    assert.equal(decizie(c), 'permite', c);
  }
  assert.deepEqual(imparteComanda('cmd 2>&1'), [['cmd', '2>', '&1']]);
});

test('cod în linie cu flag-uri scurte combinate', () => {
  for (const c of [
    'bash -lc "rm nucleu/mg.mjs"',
    'bash -lc "rm -rf .claude/agents"',
    'node -pe "require(\'fs\').writeFileSync(\'nucleu/x\',\'y\')"',
    'python3 -Ic "open(\'nucleu/x\',\'w\')"',
  ]) assert.equal(decizie(c), 'refuza', c);
  for (const c of ['bash -lc "ls video"', 'node -pe "1+1"', 'python3 -Ic "print(1)"']) {
    assert.equal(decizie(c), 'permite', c);
  }
});
