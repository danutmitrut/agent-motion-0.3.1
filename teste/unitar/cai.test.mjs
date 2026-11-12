import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  radacinaAgent,
  normalizeazaCale,
  relativaLaRadacina,
  esteNumeProiect,
  caiProiect,
} from '../../nucleu/lib/cai.mjs';

test('radacinaAgent urcă din teste/unitar/ până la rădăcina repo-ului', () => {
  const radacina = radacinaAgent(import.meta.url, 2);
  assert.ok(path.isAbsolute(radacina));
  assert.ok(fs.existsSync(path.join(radacina, 'nucleu', 'lib', 'cai.mjs')));
});

test('normalizeazaCale: Windows, MSYS, POSIX', () => {
  assert.equal(normalizeazaCale('C:\\a\\..\\b'), 'c:/b');
  assert.equal(normalizeazaCale('/c/x'), 'c:/x');
  assert.equal(normalizeazaCale('/C/x'), 'c:/x');
  assert.equal(normalizeazaCale('C:\\x'), 'c:/x');
  assert.equal(normalizeazaCale('D:/Proiecte/agent motion/'), 'd:/Proiecte/agent motion');
  assert.equal(normalizeazaCale('C:\\'), 'c:/');
  assert.equal(normalizeazaCale('c:/a/../..'), 'c:/');
  assert.equal(normalizeazaCale('/'), '/');
  assert.equal(normalizeazaCale('/Users/x/./agent motion//nucleu/'), '/Users/x/agent motion/nucleu');
  assert.equal(normalizeazaCale('video\\p\\.\\date.json'), 'video/p/date.json');
  assert.equal(normalizeazaCale('/cale/lunga'), '/cale/lunga');
});

test('relativaLaRadacina e insensibil la majuscule pe litera de disc', () => {
  assert.equal(relativaLaRadacina('C:\\Agent\\video\\p\\date.json', 'c:/Agent'), 'video/p/date.json');
  assert.equal(relativaLaRadacina('c:/agent/nucleu/mg.mjs', 'C:\\AGENT'), 'nucleu/mg.mjs');
  assert.equal(relativaLaRadacina('/c/agent/nucleu', 'C:\\agent'), 'nucleu');
  assert.equal(relativaLaRadacina('C:\\agent', 'c:/agent/'), '');
  assert.equal(relativaLaRadacina('D:\\agent\\nucleu', 'C:\\agent'), null);
  assert.equal(relativaLaRadacina('C:\\agent-vechi\\x', 'C:\\agent'), null);
  assert.equal(relativaLaRadacina('C:\\agent\\..\\altceva', 'C:\\agent'), null);
});

test('relativaLaRadacina pe POSIX rămâne sensibil la majuscule', () => {
  assert.equal(relativaLaRadacina('/Users/x/agent motion/video/p', '/Users/x/agent motion'), 'video/p');
  assert.equal(relativaLaRadacina('/users/x/agent motion/video/p', '/Users/x/agent motion'), null);
});

test('esteNumeProiect', () => {
  for (const bun of ['programari', 'p', 'reel-2', '0-start', 'a'.repeat(40)]) {
    assert.equal(esteNumeProiect(bun), true, bun);
  }
  for (const rau of ['', '-x', 'Programari', 'cu spatiu', 'a'.repeat(41), '../x', 'programări', 'a_b']) {
    assert.equal(esteNumeProiect(rau), false, rau);
  }
});

test('caiProiect dă căile absolute din video/<proiect>/', () => {
  const radacina = path.join(os.tmpdir(), 'agent motion');
  const c = caiProiect(radacina, 'programari');
  const dir = path.join(radacina, 'video', 'programari');
  assert.deepEqual(c, {
    dir,
    date: path.join(dir, 'date.json'),
    scenariu: path.join(dir, 'scenariu.md'),
    jurnal: path.join(dir, 'jurnal.md'),
    cerereSablon: path.join(dir, 'cerere-sablon.md'),
    lock: path.join(dir, 'motor.lock'),
    verificare: path.join(dir, 'verificare.json'),
    mp4: path.join(dir, 'programari.mp4'),
    resurse: path.join(dir, 'resurse'),
    active: path.join(dir, 'active'),
    build: path.join(dir, 'build'),
    cadre: path.join(dir, 'cadre'),
    cache: path.join(dir, '.cache'),
    mesajCursant: path.join(dir, '.cache', 'mesaj-cursant.json'),
  });
});
