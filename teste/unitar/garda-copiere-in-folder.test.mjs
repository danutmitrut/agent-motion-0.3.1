// F3 (revizuirea finală): o copiere sau o mutare într-un folder scrie fișierul cu numele sursei; garda verifică și acel nume.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';

const POSIX = '/Users/x/agent motion';
const WIN = 'C:\\agent-motion';
const rad = (u) => (u === 'Bash' ? POSIX : WIN);

test('copierea sau mutarea într-un folder nu poate pune un nume protejat acolo', () => {
  for (const [c, u] of [
    ['cp /tmp/verificare.json video/p/', 'Bash'],
    ['cp /tmp/p.mp4 video/p/', 'Bash'],
    ['mv /tmp/motor.lock video/p', 'Bash'],
    ['cp -r /tmp/build video/p/', 'Bash'],
    ['cp /tmp/settings.json .claude/', 'Bash'],
    ['cp -r /tmp/agents .claude/', 'Bash'],
    ['mv /tmp/x/scenariu.md video/p/', 'Bash'],
    ['cp -t video/p /tmp/verificare.json', 'Bash'],
    ['cp --target-directory=.claude /tmp/settings.json', 'Bash'],
    ['ln -s /tmp/verificare.json video/p/', 'Bash'],
    ['cd video/p && cp /tmp/verificare.json .', 'Bash'],
    ['cp -r /tmp/x/. video/p/', 'Bash'],
    ['cp -r /tmp/x/* video/p/', 'Bash'],
    ['Copy-Item C:\\tmp\\verificare.json video\\p\\', 'PowerShell'],
    ['Copy-Item -Path C:\\tmp\\settings.json -Destination .claude', 'PowerShell'],
    ['Move-Item C:\\tmp\\motor.lock -Destination video\\p', 'PowerShell'],
    ['copy C:\\tmp\\verificare.json video\\p\\', 'PowerShell'],
  ]) assert.equal(decideComanda(c, u, rad(u)).decizie, 'refuza', `${u}: ${c}`);
});

test('fără destinație, Copy-Item copiază în folderul curent', () => {
  assert.equal(decideComanda('Copy-Item C:\\tmp\\verificare.json', 'PowerShell', WIN, `${WIN}\\video\\p`).decizie, 'refuza');
  assert.equal(decideComanda('Copy-Item C:\\tmp\\a.png', 'PowerShell', WIN, `${WIN}\\video\\p`).decizie, 'permite');
});

test('copierile cu nume libere rămân permise', () => {
  for (const [c, u] of [
    ['Copy-Item resurse\\a.png video\\p\\resurse\\', 'PowerShell'],
    ['cp /tmp/a.png video/p/resurse/', 'Bash'],
    ['cp /tmp/date.json video/p/', 'Bash'],
    ['mv video/p/resurse/a.png video/p/resurse/b.png', 'Bash'],
    ['cp /tmp/x/*.png video/p/', 'Bash'],
    ['cp -r /tmp/x/*.png video/p/resurse/', 'Bash'],
  ]) assert.equal(decideComanda(c, u, rad(u)).decizie, 'permite', `${u}: ${c}`);
});
