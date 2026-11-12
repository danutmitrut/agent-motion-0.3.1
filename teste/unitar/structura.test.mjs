import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));

const git = (...argumente) => execFileSync('git', argumente, { cwd: RADACINA, encoding: 'utf8' });

/** true dacă regulile din .gitignore ignoră calea (indiferent dacă fișierul există sau e urmărit). */
function esteIgnorat(cale) {
  const r = spawnSync('git', ['check-ignore', '--no-index', '-q', '--', cale], { cwd: RADACINA, encoding: 'utf8' });
  if (r.status !== 0 && r.status !== 1) throw new Error(`git check-ignore a eșuat pentru ${cale}: ${r.stderr}`);
  return r.status === 0;
}

// Fișierele cursantului (spec 5.2, harta 3): ignorate de git din prima versiune.
const ALE_CURSANTULUI = [
  'USER.md',
  'MEMORY.md',
  'CLAUDE.local.md',
  '.claude/settings.local.json',
  '.instalat',
  'nucleu/.stare.json',
  'nucleu/.canar',
  'node_modules/x/index.js',
  'nucleu/node_modules/ajv/package.json',
  'motoare/hyperframes/node_modules/hyperframes/package.json',
  'video/x/date.json',
  'video/programari/build/index.html',
  'branduri/studio-lemn/vizual.md',
  'proprii/trasee/p-cana.json',
  'unelte/ffmpeg/darwin-arm64/ffprobe',
  'unelte/vectorizare/autotrace/autotrace.exe',
];

// Fișiere ale kitului care trebuie să rămână urmărite, chiar dacă seamănă cu cele de mai sus.
const ALE_KITULUI = [
  'CLAUDE.md',
  'USER.exemplu.md',
  'MEMORY.exemplu.md',
  'INSTALARE.md',
  '.claude/settings.json',
  '.claude/agents/revizor-cadre.md',
  'nucleu/mg.mjs',
  'nucleu/package-lock.json',
  'nucleu/VERSIUNI.json',
  'motoare/hyperframes/package-lock.json',
  'docs/interfete/erori.md',
  'teste/fixtures/branduri/studio-lemn/vizual.md',
  'teste/fixtures/date/proba-minim.json',
  'unelte/import-biblioteci/import.py',
  'unelte/versiuni/actualizeaza-hashuri.mjs',
  'biblioteci/catalog.json',
];

test('repo-ul nu conține symlinkuri (mod 120000)', () => {
  const intrari = git('ls-files', '-s', '-z').split('\0').filter(Boolean);
  const symlinkuri = intrari.filter((linie) => linie.startsWith('120000 '));
  assert.deepEqual(symlinkuri, [], 'Pe o clonare Windows, un symlink devine fișier text.');
});

test('fișierele cursantului sunt ignorate de git', () => {
  const neignorate = ALE_CURSANTULUI.filter((cale) => !esteIgnorat(cale));
  assert.deepEqual(neignorate, []);
});

test('fișierele kitului nu sunt ignorate', () => {
  const ignorate = ALE_KITULUI.filter((cale) => esteIgnorat(cale));
  assert.deepEqual(ignorate, []);
});

test('.gitattributes: LF pe sursă, CSV neatins, binarele marcate', () => {
  const iesire = git('check-attr', 'text', 'eol', 'diff', '--',
    'nucleu/mg.mjs', 'teste/fixtures/date/proba-minim.json', 'teste/fixtures/serie.csv',
    'motoare/comun/fonturi/inter/inter-400-latin.woff2', 'a.png', 'a.jpg', 'a.mp4', 'a.gz');
  const atribute = {};
  for (const linie of iesire.trim().split(/\r?\n/)) {
    const [cale, atribut, valoare] = linie.split(': ');
    atribute[`${cale} ${atribut}`] = valoare;
  }
  assert.equal(atribute['nucleu/mg.mjs text'], 'auto');
  assert.equal(atribute['nucleu/mg.mjs eol'], 'lf');
  assert.equal(atribute['teste/fixtures/date/proba-minim.json eol'], 'lf');
  assert.equal(atribute['teste/fixtures/serie.csv text'], 'unset');
  for (const binar of ['motoare/comun/fonturi/inter/inter-400-latin.woff2', 'a.png', 'a.jpg', 'a.mp4', 'a.gz']) {
    assert.equal(atribute[`${binar} text`], 'unset', `${binar} trebuie marcat binary`);
    assert.equal(atribute[`${binar} diff`], 'unset', `${binar} trebuie marcat binary`);
  }
});

test('creeazaRadacinaTemp: cale cu spațiu și diacritice, fișiere scrise, curățare', () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    copiaza: ['.gitattributes'],
    fisiere: { 'video/p/date.json': '{"sablon":"proba"}\n', 'branduri/b/vizual.md': Buffer.from('---\nmg: 1\n---\n') },
  });
  try {
    assert.ok(basename(radacina).startsWith('mg test Ăîș '), basename(radacina));
    assert.equal(readFileSync(join(radacina, '.gitattributes'), 'utf8'), readFileSync(join(RADACINA, '.gitattributes'), 'utf8'));
    assert.equal(readFileSync(join(radacina, 'video/p/date.json'), 'utf8'), '{"sablon":"proba"}\n');
    assert.equal(readFileSync(join(radacina, 'branduri/b/vizual.md'), 'utf8'), '---\nmg: 1\n---\n');
  } finally {
    curata();
  }
  assert.equal(existsSync(radacina), false);
});

test('creeazaRadacinaTemp refuză căile care ies din repo', () => {
  assert.throws(() => creeazaRadacinaTemp({ copiaza: ['../altceva'] }), /relativă/);
  assert.throws(() => creeazaRadacinaTemp({ fisiere: { '../x.txt': 'x' } }), /relativă/);
});
