import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  citesteVersiuni, fisiereUrmarite, calculeazaIntegritate, verificaIntegritate,
} from '../../nucleu/lib/versiuni.mjs';
import { sha256Fisier, existaFisier } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const HEX64 = /^[0-9a-f]{64}$/;

function areGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

test('VERSIUNI.json are forma din harta 5.15 și valorile fixate', () => {
  const v = citesteVersiuni(RADACINA);
  assert.match(v.versiune_kit, /^\d+\.\d+\.\d+$/);
  assert.equal(v.node.minim, '22.0.0');
  assert.equal(v.claude_code.minim, '2.1.271');
  assert.equal(v.motoare.hyperframes.versiune, '0.8.96');
  assert.equal(v.motoare.remotion.versiune, '4.0.529');
  assert.deepEqual(
    { ajv: v.nucleu.ajv, fontkit: v.nucleu.fontkit, yaml: v.nucleu.yaml, ff: v.nucleu['ffmpeg-static'], fp: v.nucleu['ffprobe-static'] },
    { ajv: '8.20.0', fontkit: '2.0.4', yaml: '2.9.1', ff: '5.3.0', fp: '3.1.0' });
  assert.equal(v.gsap.versiune, '3.14.2');
  assert.equal(v.gsap.sha256, 'c174bfce53a729418d57a8ad8625e7247c793a22fef8e2851e3cfa3de9cd8280');
  assert.equal(v.ffmpeg.release, 'b6.1.1');
  for (const platforma of ['darwin-arm64', 'win32-x64']) {
    assert.match(v.ffmpeg.binare[platforma].ffmpeg, HEX64);
    assert.match(v.ffmpeg.binare[platforma].ffprobe, HEX64);
    assert.match(v.ffmpeg.rezerva[platforma].ffprobe.url, /^https:\/\/github\.com\/eugeneware\/ffmpeg-static\/releases\/download\/b6\.1\.1\/ffprobe-/);
    assert.match(v.ffmpeg.rezerva[platforma].ffprobe.sha256, HEX64);
  }
  // Pe Mac arm64 rulează rezerva, deci hash-ul binarului e al rezervei.
  assert.equal(v.ffmpeg.binare['darwin-arm64'].ffprobe, v.ffmpeg.rezerva['darwin-arm64'].ffprobe.sha256);
  assert.deepEqual(v.lucide, {
    versiune: '1.49.0',
    fisier: 'motoare/comun/iconite/lucide-1.49.0.json',
    sha256: 'f490eb6a567077aa334dcf1617c0845dde294ab916c44dda9c535fc8355cad6d',
  });
  assert.equal(v.referinta.hyperframes.versiune, '0.8.96');
  assert.equal(v.referinta.hyperframes.licenta, 'Apache-2.0');
  assert.deepEqual(Object.keys(v.referinta.hyperframes.skilluri).sort(), ['hyperframes', 'hyperframes-cli', 'media-use']);
  for (const h of Object.values(v.referinta.hyperframes.skilluri)) assert.match(h, /^[0-9a-f]{64}$/);
});

test('hash-urile lockfile-urilor și ale GSAP sunt la zi (null dacă fișierul nu există încă)', () => {
  const v = citesteVersiuni(RADACINA);
  const sha = (rel) => (existaFisier(path.join(RADACINA, rel)) ? sha256Fisier(path.join(RADACINA, rel)) : null);
  assert.equal(v.nucleu.lockfile_sha256, sha('nucleu/package-lock.json'));
  assert.equal(v.motoare.hyperframes.lockfile_sha256, sha('motoare/hyperframes/package-lock.json'));
  assert.equal(v.motoare.remotion.lockfile_sha256, sha('motoare/remotion/package-lock.json'));
  const gsap = sha(v.gsap.fisier);
  if (gsap !== null) assert.equal(gsap, v.gsap.sha256);
});

test('integritatea din VERSIUNI.json e la zi (altfel: node unelte/versiuni/actualizeaza-hashuri.mjs)', () => {
  const v = citesteVersiuni(RADACINA);
  assert.deepEqual(v.integritate, calculeazaIntegritate(RADACINA));
  assert.deepEqual(verificaIntegritate(RADACINA, v), { ok: true, diferite: [], lipsa: [] });
  assert.ok(!('nucleu/VERSIUNI.json' in v.integritate));
  assert.ok(Object.keys(v.integritate).every((c) => !c.includes('node_modules')));
});

test('fără git: parcurge nucleu/, motoare/, biblioteci/, .claude/ și sare peste ce nu e al kitului', () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: {
      'nucleu/mg.mjs': 'export {};\n',
      'nucleu/VERSIUNI.json': '{}\n',
      'nucleu/.stare.json': '{}\n',
      'nucleu/.canar': 'canar\n',
      'nucleu/node_modules/ajv/index.js': 'x\n',
      'motoare/comun/teme/noapte.json': '{}\n',
      'motoare/hyperframes/node_modules/hyperframes/package.json': '{}\n',
      'biblioteci/catalog.json': '{}\n',
      '.claude/settings.json': '{}\n',
      '.claude/settings.local.json': '{}\n',
      'video/p/date.json': '{}\n',
      'FLUX.md': 'flux\n',
    },
  });
  try {
    assert.deepEqual(fisiereUrmarite(radacina), [
      '.claude/settings.json', 'biblioteci/catalog.json', 'motoare/comun/teme/noapte.json', 'nucleu/mg.mjs',
    ]);
  } finally {
    curata();
  }
});

test('un fișier modificat apare în diferite, unul șters apare în lipsa', () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: { 'nucleu/a.mjs': 'a\n', 'nucleu/lib/b.mjs': 'b\n', 'motoare/c.json': '{}\n' },
  });
  try {
    const versiuni = { integritate: calculeazaIntegritate(radacina) };
    assert.deepEqual(verificaIntegritate(radacina, versiuni), { ok: true, diferite: [], lipsa: [] });
    fs.writeFileSync(path.join(radacina, 'nucleu', 'lib', 'b.mjs'), 'b modificat\n');
    fs.rmSync(path.join(radacina, 'motoare', 'c.json'));
    assert.deepEqual(verificaIntegritate(radacina, versiuni), { ok: false, diferite: ['nucleu/lib/b.mjs'], lipsa: ['motoare/c.json'] });
  } finally {
    curata();
  }
});

test('cu git: doar fișierele urmărite de git intră în integritate', { skip: !areGit() && 'git nu e instalat' }, () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: { 'nucleu/urmarit.mjs': 'u\n', 'nucleu/neurmarit.mjs': 'n\n', 'motoare/m.json': '{}\n' },
  });
  try {
    const git = (...a) => execFileSync('git', a, { cwd: radacina, stdio: 'ignore', windowsHide: true });
    git('init', '-q');
    git('add', 'nucleu/urmarit.mjs', 'motoare/m.json');
    assert.deepEqual(fisiereUrmarite(radacina), ['motoare/m.json', 'nucleu/urmarit.mjs']);
  } finally {
    curata();
  }
});
