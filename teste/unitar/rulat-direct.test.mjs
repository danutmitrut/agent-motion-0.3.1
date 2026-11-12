// Paza „rulat direct” (nucleu/lib/cai.mjs): mg pornit printr-o legătură (symlink pe Mac și Linux, junction pe Windows)
// trebuie să lucreze, nu să iasă cu cod 0 și stdout gol (revizuirea B22, I1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { radacinaAgent, rulatDirect } from '../../nucleu/lib/cai.mjs';

const REPO = radacinaAgent(import.meta.url, 2);

function printrOLegatura(tinta, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mg legatura Ăîș '));
  const legatura = join(dir, 'nucleu');
  symlinkSync(tinta, legatura, 'junction');
  try {
    return fn(legatura);
  } finally {
    unlinkSync(legatura);
    rmdirSync(dir);
  }
}

test('mg --help printr-o legătură scrie text nevid și iese cu 0', () => {
  printrOLegatura(join(REPO, 'nucleu'), (legatura) => {
    const iesire = execFileSync(process.execPath, [join(legatura, 'mg.mjs'), '--help'], { encoding: 'utf8', windowsHide: true });
    assert.ok(iesire.trim().length > 0, 'mg --help prin legătură n-a scris nimic');
  });
});

test('mg --help pe calea reală și pe cea relativă scrie text nevid', () => {
  const real = execFileSync(process.execPath, [join(REPO, 'nucleu', 'mg.mjs'), '--help'], { encoding: 'utf8', windowsHide: true });
  const relativ = execFileSync(process.execPath, ['nucleu/mg.mjs', '--help'], { cwd: REPO, encoding: 'utf8', windowsHide: true });
  assert.ok(real.trim().length > 0);
  assert.equal(relativ, real);
});

test('rulatDirect: false fără argv[1] sau pentru alt fișier, true pentru fișierul însuși', () => {
  const url = pathToFileURL(join(REPO, 'nucleu', 'mg.mjs')).href;
  const argv1 = process.argv[1];
  try {
    process.argv[1] = '';
    assert.equal(rulatDirect(url), false);
    process.argv[1] = join(REPO, 'nucleu', 'inexistent.mjs');
    assert.equal(rulatDirect(url), false);
    process.argv[1] = join(REPO, 'nucleu', 'mg.mjs');
    assert.equal(rulatDirect(url), true);
  } finally {
    process.argv[1] = argv1;
  }
});
