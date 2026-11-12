import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasificaCale, TIPARE_TEXT_PROTEJAT } from '../../nucleu/lib/garda/cai.mjs';

const RADACINA = '/Users/x/agent motion';
const PROTEJATE = [
  'nucleu/mg.mjs', 'nucleu/.canar', 'motoare/hyperframes/x.json', 'biblioteci/b/x.svg',
  'video/p/build/index.html', 'video/p/.cache/f.png', 'video/p/active/a.json', 'video/p/cadre/c.png', 'video/p/serie/s.json',
  'video/p/verificare.json', 'video/p/motor.lock', 'video/p/final.mp4',
  'video/p/revizie-3.md', 'video/p/revizie-schita-2.md', 'video/p/scenariu.md',
  '.claude/settings.json', '.claude/settings.local.json', '.claude/agents/x.md',
];
const LIBERE = ['video/p/date.json', 'notite.txt', '.claude/commands/x.md', 'branduri/b/vizual.md'];

test('tiparele de text din cai.mjs acoperă exact zonele protejate', () => {
  for (const cale of [...PROTEJATE, ...LIBERE]) {
    const zona = clasificaCale(cale, RADACINA).zona;
    const asteptat = ['kit', 'generat', 'scenariu', 'configuratie'].includes(zona);
    const text = `open('${cale}', 'w')`;
    assert.equal(TIPARE_TEXT_PROTEJAT.some((r) => r.test(text)), asteptat, `${cale} (zona ${zona})`);
  }
  assert.equal(PROTEJATE.every((c) => clasificaCale(c, RADACINA).zona !== 'liber'), true);
  assert.equal(LIBERE.every((c) => clasificaCale(c, RADACINA).zona === 'liber'), true);
});
