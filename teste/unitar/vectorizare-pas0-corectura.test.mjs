import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { combinaRulari, cuJurnal, recomanda } from '../pas0/vectorizare/compara.mjs';
import { stergeFolder } from '../pas0/vectorizare/vectorizeaza-autotrace.mjs';

const COMPARA = join(dirname(fileURLToPath(import.meta.url)), '..', 'pas0', 'vectorizare', 'compara.mjs');
const TRASEU = { w: 100, h: 100, paths: ['M0.0 0.0 L50.0 0.0'], origine: [0, 0] };
const REFERINTA = [[0, 0], [25, 0], [50, 0]];
const BUN = { id: 'x', instalat_fara_admin: true, ok: true, timp_ms: 100, numar_trasee: 1, abatere_medie: 0.5, acoperire: 1 };

test('recomanda: un candidat care a picat într-una din căi nu e recomandat, chiar dacă ok e adevărat', () => {
  const picat = { ...BUN, id: 'a', rulari: [{ cale: 'diacritice', ok: false }, { cale: 'ascii', ok: true }] };
  assert.equal(recomanda([picat]).id, null);
  const bun = { ...BUN, id: 'b', rulari: [{ cale: 'diacritice', ok: true }, { cale: 'ascii', ok: true }] };
  assert.equal(recomanda([picat, bun]).id, 'b');
});

test('combinaRulari: ok doar dacă merge în ambele căi, măsurătorile din prima rulare reușită, eroarea numește calea', () => {
  const candidat = { id: 'x', instalare: { ok: true }, instalat_fara_admin: true, rulari: [], ok: false };
  const rulari = [
    { cale: 'diacritice', ok: false, eroare: 'nu găsește fișierul', timp_ms: 5 },
    { cale: 'ascii', ok: true, eroare: null, timp_ms: 40, traseu: TRASEU },
  ];
  const r = combinaRulari(candidat, rulari, REFERINTA);
  assert.equal(r.ok, false);
  assert.equal(r.timp_ms, 40);
  assert.equal(r.numar_trasee, 1);
  assert.match(r.eroare, /diacritice/);
  assert.match(r.eroare, /nu găsește fișierul/);
  assert.deepEqual(r.rulari.map((x) => x.cale), ['diacritice', 'ascii']);
  assert.equal(recomanda([r]).id, null);

  const amandoua = combinaRulari(candidat, rulari.map((x) => ({ ...x, ok: true, traseu: TRASEU })), REFERINTA);
  assert.equal(amandoua.ok, true);
  assert.equal(amandoua.eroare, undefined);

  const niciuna = combinaRulari(candidat, rulari.map((x) => ({ ...x, ok: false })), REFERINTA);
  assert.equal(niciuna.ok, false);
  assert.match(niciuna.eroare, /diacritice.*ascii/);
});

test('cuJurnal: fișierul apare, conține ieșirea consolei, iar la o eroare conține stack-ul', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg-jurnal-'));
  try {
    const log = console.log;
    console.log = () => {};
    let cod;
    try {
      cod = await cuJurnal(join(dir, 'ok.log'), async () => { console.log('salut', { a: 1 }); return 0; });
    } finally {
      console.log = log;
    }
    assert.equal(cod, 0);
    assert.ok(existsSync(join(dir, 'ok.log')));
    assert.match(readFileSync(join(dir, 'ok.log'), 'utf8'), /salut \{ a: 1 \}/);

    await assert.rejects(
      cuJurnal(join(dir, 'eroare.log'), async function esueazaAici() { throw new Error('a crăpat testul'); }),
      /a crăpat testul/,
    );
    const text = readFileSync(join(dir, 'eroare.log'), 'utf8');
    assert.match(text, /Error: a crăpat testul/);
    assert.match(text, /\n\s+at .*esueazaAici/);
    assert.equal(console.log, log, 'console.log se restaurează');
  } finally {
    stergeFolder(dir);
  }
});

test('compara.mjs sonda scrie sonda.log lângă fișierul JSON, cu ieșirea sondei', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mg-sonda-'));
  try {
    execFileSync(process.execPath, [COMPARA, 'sonda', join(dir, 'sonda.json')], { stdio: 'pipe' });
    assert.ok(existsSync(join(dir, 'sonda.json')));
    assert.match(readFileSync(join(dir, 'sonda.log'), 'utf8'), /"utilizator"/);
  } finally {
    stergeFolder(dir);
  }
});
