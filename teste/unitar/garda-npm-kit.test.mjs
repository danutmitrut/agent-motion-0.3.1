// F14 (revizuirea finală): npm, pnpm și yarn nu instalează, nu dezinstalează și nu reinstalează nimic în kit;
// dependențele kitului le pune doar mg doctor, iar versiunile se schimbă doar prin mg actualizeaza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideComanda } from '../../nucleu/lib/garda/comenzi.mjs';

const POSIX = '/Users/x/agent motion';
const WIN = 'C:\\agent-motion';
const rad = (u) => (u === 'Bash' ? POSIX : WIN);

test('instalările în kit se refuză cu motivul de upgrade', () => {
  for (const [c, u] of [
    ['npm install hyperframes@latest --prefix motoare/hyperframes', 'Bash'],
    ['npm i hyperframes@0.9.1 -C motoare/hyperframes', 'PowerShell'],
    ['cd motoare/hyperframes && npm install hyperframes@0.9.1', 'Bash'],
    ['cd nucleu && npm install left-pad', 'Bash'],
    ['npm uninstall ffmpeg-static --prefix nucleu', 'Bash'],
    ['Set-Location motoare\\hyperframes; npm i hyperframes@latest', 'PowerShell'],
    ['npm ci --prefix motoare/hyperframes', 'Bash'],
    ['cd motoare/hyperframes && npm ci', 'Bash'],
    ['npm --prefix motoare/hyperframes install x', 'Bash'],
    ['npm install --prefix=nucleu x', 'Bash'],
    ['pnpm add x --dir nucleu', 'Bash'],
    ['yarn --cwd nucleu add x', 'Bash'],
    ['cd nucleu && yarn', 'Bash'],
  ]) {
    const d = decideComanda(c, u, rad(u));
    assert.equal(d.decizie, 'refuza', `${u}: ${c}`);
    assert.match(d.motiv, /mg actualizeaza/, `${u}: ${c}`);
  }
  assert.equal(decideComanda('npm install x', 'Bash', POSIX, `${POSIX}/nucleu`).decizie, 'refuza');
  assert.equal(decideComanda('npm --prefix motoare/hyperframes update', 'Bash', POSIX).decizie, 'refuza');
});

test('o instalare cu folder nesigur se refuză', () => {
  assert.equal(decideComanda('npm install --prefix $D x', 'Bash', POSIX).decizie, 'refuza');
  assert.equal(decideComanda('cd $D && npm install x', 'Bash', POSIX).decizie, 'refuza');
});

test('npm în afara kitului și comenzile npm care nu instalează rămân permise', () => {
  for (const c of [
    'npm install left-pad',
    'npm install',
    'npm test',
    'npm run build --prefix nucleu',
    'npm ls --prefix nucleu',
    'npm view hyperframes version',
    'cd video/p && npm install left-pad',
  ]) assert.equal(decideComanda(c, 'Bash', POSIX).decizie, 'permite', c);
});
