import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copiazaDosar } from '../ajutoare/copiaza.mjs';

test('copiazaDosar copiază fișierele și subfolderele, și într-o cale cu spațiu și diacritice', (t) => {
  const radacina = fs.mkdtempSync(path.join(os.tmpdir(), 'mg copie Ăîș '));
  t.after(() => fs.rmSync(radacina, { recursive: true, force: true }));
  const sursa = path.join(radacina, 'sursă');
  fs.mkdirSync(path.join(sursa, 'sub', 'adânc'), { recursive: true });
  fs.writeFileSync(path.join(sursa, 'a.txt'), 'unu');
  fs.writeFileSync(path.join(sursa, 'sub', 'adânc', 'ș.txt'), 'doi');
  const dest = path.join(radacina, 'destinație', 'aici');
  copiazaDosar(sursa, dest);
  assert.equal(fs.readFileSync(path.join(dest, 'a.txt'), 'utf8'), 'unu');
  assert.equal(fs.readFileSync(path.join(dest, 'sub', 'adânc', 'ș.txt'), 'utf8'), 'doi');
  assert.deepEqual(fs.readdirSync(dest).sort(), ['a.txt', 'sub']);
});
