// Textele pentru oameni: fără em dash, en dash, s/t cu sedilă și emoji (harta 2).
// Caracterele interzise sunt construite din coduri numerice, ca fișierul să nu se prindă singur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));

const INTERZISE = new Map([
  [0x2014, 'em dash (U+2014)'],
  [0x2013, 'en dash (U+2013)'],
  [0x015F, 's cu sedilă (U+015F), folosește U+0219'],
  [0x0163, 't cu sedilă (U+0163), folosește U+021B'],
  [0x015E, 'S cu sedilă (U+015E), folosește U+0218'],
  [0x0162, 'T cu sedilă (U+0162), folosește U+021A'],
].map(([cod, descriere]) => [String.fromCodePoint(cod), descriere]));
const PICTOGRAMA = /\p{Extended_Pictographic}/u;

const FOLDERE = ['nucleu', 'motoare', 'docs', '.claude'];
const FISIERE_IDENTITATE = [
  'CLAUDE.md', 'IDENTITY.md', 'SOUL.md', 'FLUX.md', 'TOOLS.md',
  'USER.exemplu.md', 'MEMORY.exemplu.md', 'INSTALARE.md',
];
// Ce nu e scris de noi: dependențe, copii fixate ale altor proiecte, binare, licențe preluate.
const FOLDERE_SARITE = new Set(['node_modules', '.git', 'referinta', 'vendor']);
const EXTENSII_BINARE = new Set(['.woff2', '.woff', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp4', '.m4a', '.mp3', '.wav', '.gz', '.zip', '.pdf']);
const FISIERE_SARITE = new Set(['OFL.txt', 'LICENSE-lucide.txt', 'NOTICE']);

/** Întoarce problemele dintr-un text: {linie, coloana, descriere}, numărate de la 1. */
function problemeText(text) {
  const probleme = [];
  text.split('\n').forEach((rand, i) => {
    let coloana = 0;
    for (const caracter of rand) {
      coloana += 1;
      if (INTERZISE.has(caracter)) probleme.push({ linie: i + 1, coloana, descriere: INTERZISE.get(caracter) });
      else if (PICTOGRAMA.test(caracter)) {
        const cod = caracter.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        probleme.push({ linie: i + 1, coloana, descriere: `pictogramă sau emoji (U+${cod})` });
      }
    }
  });
  return probleme;
}

function fisiereDeVerificat() {
  const rezultat = [];
  const parcurge = (dir) => {
    for (const nume of readdirSync(dir).sort()) {
      const cale = join(dir, nume);
      if (statSync(cale).isDirectory()) {
        if (!FOLDERE_SARITE.has(nume)) parcurge(cale);
      } else if (!EXTENSII_BINARE.has(extname(nume).toLowerCase()) && !FISIERE_SARITE.has(nume)) {
        rezultat.push(cale);
      }
    }
  };
  for (const folder of FOLDERE) {
    const cale = join(RADACINA, folder);
    if (existsSync(cale)) parcurge(cale);
  }
  for (const fisier of FISIERE_IDENTITATE) {
    const cale = join(RADACINA, fisier);
    if (existsSync(cale)) rezultat.push(cale);
  }
  return rezultat;
}

test('detectorul prinde fiecare caracter interzis și lasă diacriticele corecte', () => {
  assert.deepEqual(problemeText('Mașină, țară, ȘI, ȚARĂ, ăâî ĂÂÎ; „citat”, 1-2, 3,5'), []);
  for (const cod of [0x2014, 0x2013, 0x015F, 0x0163, 0x015E, 0x0162, 0x1F600, 0x2705, 0x00A9]) {
    const text = `ab${String.fromCodePoint(cod)}c`;
    const probleme = problemeText(text);
    assert.equal(probleme.length, 1, `U+${cod.toString(16)}`);
    assert.equal(probleme[0].linie, 1);
    assert.equal(probleme[0].coloana, 3);
  }
  assert.equal(problemeText(`rândul 1\nrândul 2 ${String.fromCodePoint(0x2014)} aici`)[0].linie, 2);
});

test('textele din kit sunt în română corectă, fără caractere interzise', () => {
  const gasite = [];
  for (const cale of fisiereDeVerificat()) {
    const continut = readFileSync(cale, 'utf8');
    for (const p of problemeText(continut)) {
      gasite.push(`${relative(RADACINA, cale).replaceAll('\\', '/')}:${p.linie}:${p.coloana} ${p.descriere}`);
    }
  }
  assert.deepEqual(gasite, []);
});
