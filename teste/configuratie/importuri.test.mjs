import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALE_CURSANTULUI, extrageImporturi } from '../ajutoare/configuratie.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FISIERE_AGENT = ['CLAUDE.md', 'IDENTITY.md', 'SOUL.md', 'FLUX.md', 'TOOLS.md', 'INSTALARE.md', 'USER.exemplu.md', 'MEMORY.exemplu.md'];

const claude = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
const importuri = extrageImporturi(claude);

test('CLAUDE.md importă exact fișierele din spec 5.3, în ordine', () => {
  assert.deepEqual(importuri, ['IDENTITY.md', 'SOUL.md', 'FLUX.md', 'TOOLS.md', 'USER.md', 'MEMORY.md']);
});

test('fiecare @import există (pentru fișierele cursantului, exemplul lor)', () => {
  for (const imp of importuri) {
    const fisier = fs.existsSync(path.join(REPO, imp)) ? imp : ALE_CURSANTULUI[imp];
    assert.ok(fisier && fs.existsSync(path.join(REPO, fisier)), `lipsește ${imp}`);
  }
});

test('CLAUDE.md are verificarea de primă pornire și regula de precedență', () => {
  assert.match(claude, /`\.instalat`/);
  assert.match(claude, /`INSTALARE\.md`/);
  assert.match(claude, /node nucleu\/mg\.mjs doctor/);
  assert.match(claude, /FLUX\.md este procesul/);
  assert.match(claude, /mg actualizeaza/);
  assert.equal(importuri.includes('INSTALARE.md'), false, 'INSTALARE.md se citește doar la nevoie, nu se importă');
});

test('fișierele agentului nu conțin nimic din stilul linia-continua', () => {
  const interzise = [/linia[- ]continu/i, /linie continu/i, /Personality and Cognitive/i, /copper/i, /#0A0B0E/i, /#E08A5E/i, /#EDE6DA/i, /Unde se întâlnesc/i];
  for (const f of FISIERE_AGENT) {
    const text = fs.readFileSync(path.join(REPO, f), 'utf8');
    for (const r of interzise) assert.doesNotMatch(text, r, `${f}: ${r}`);
  }
});

test('FLUX.md are plafonul de 3 runde, predarea cu observațiile la vedere (P1), regula fără cifre inventate și predarea refuzată fără „Predare:”', () => {
  const flux = fs.readFileSync(path.join(REPO, 'FLUX.md'), 'utf8');
  assert.match(flux, /Cel mult 3 runde, numărate din `cadre\/revizie-N\.md`/);
  assert.match(flux, /a patra doar când cursantul o cere explicit/);
  assert.match(flux, /observațiile nereparate ale revizorului; cursantul decide/);
  assert.match(flux, /Nu inventez cifre, citate sau surse/);
  assert.match(flux, /după 8 refuzuri la rând/);
  assert.match(flux, /scriu fără „Predare:” că videoul nu e predat și de ce/);
});
