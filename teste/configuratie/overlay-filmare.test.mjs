// Agentul află de overlay-filmare din FLUX.md (tabelul „Alegerea”), din TOOLS.md, din rubrica 2 a celorlalte două șabloane
// și din SABLON.md al șablonului (planul H, H16).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { numaraCuvinte } from '../ajutoare/configuratie.mjs';
import { CODURI } from '../../nucleu/lib/erori.mjs';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const citeste = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const SABLON = 'motoare/hyperframes/sabloane/overlay-filmare/SABLON.md';
const RUBRICI = [
  'Ce face', 'Când se alege', 'Câmpurile din date.json', 'Dicționarul de stil', 'Elementele și ce se vede', 'Cum calculează mg timpii',
  'Verificările și erorile', 'Ce verifică revizorul', 'Ce scrie agentul și ce nu', 'Comenzi', 'Capcane și abateri deliberate de la referință',
  'Exemple și referințe',
];

/** Textul unei rubrici din SABLON.md (de la „## N. ” până la rubrica următoare). */
function rubrica(text, n) {
  return text.split(`\n## ${n}. `)[1].split(`\n## ${n + 1}. `)[0];
}

test('FLUX.md: tabelul „Alegerea” are rândul overlay-filmare, iar fluxul rămâne sub 250 de cuvinte', () => {
  const flux = citeste('FLUX.md');
  const alegerea = flux.split('\n## Alegerea\n')[1].split('\n## ')[0];
  assert.match(alegerea, /^\| filmarea cursantului, vertical sau orizontal, 5-90 s \| `overlay-filmare` \|$/m);
  assert.match(alegerea, /^\| doar text, vertical sau pătrat, 5-60 s \| `text-animat` \|$/m);
  assert.match(alegerea, /^\| poveste desenată, verticală, maximum 60 s \| `reel-ilustrat` \|$/m);
  assert.ok(numaraCuvinte(flux) <= 250, `FLUX.md are ${numaraCuvinte(flux)} de cuvinte`);
});

test('TOOLS.md: mg nou cu --sablon overlay-filmare și --filmare, cu acordul pentru transcriere', () => {
  const rand = citeste('TOOLS.md').split('\n').find((l) => l.startsWith('| `node nucleu/mg.mjs nou <proiect> --sablon overlay-filmare'));
  assert.ok(rand, 'lipsește rândul overlay-filmare');
  assert.match(rand, /^\| `node nucleu\/mg\.mjs nou <proiect> --sablon overlay-filmare --filmare <cale>` \| .+ \| activă \|$/);
  assert.match(rand, /--instaleaza-transcrierea/);
  assert.match(rand, /acordul cursantului/);
});

test('reel-ilustrat și text-animat, rubrica 2: filmarea proprie merge la overlay-filmare', () => {
  const reel = rubrica(citeste('motoare/hyperframes/sabloane/reel-ilustrat/SABLON.md'), 2);
  assert.match(reel, /^\| Filmare proprie, cu subtitrări sau text peste ea \| `overlay-filmare`: /m);
  assert.doesNotMatch(reel, /^\| Filmare proprie, serie de numere/m);
  const text = rubrica(citeste('motoare/hyperframes/sabloane/text-animat/SABLON.md'), 2);
  assert.match(text, /^\| Are filmare proprie \| `overlay-filmare`: /m);
  assert.doesNotMatch(text.split('\n').find((l) => l.startsWith('| Are filmare proprie')), /când va exista/);
});

test('overlay-filmare/SABLON.md: frontmatter-ul din H08 și cele 12 rubrici, în ordine', async () => {
  const sab = await incarcaSablon(REPO, 'overlay-filmare');
  assert.equal(sab.meta.intrare, 'filmare');
  assert.deepEqual(sab.meta.stadii, { S09: 'mp4', S10: 'mp4' });
  const titluri = [...citeste(SABLON).matchAll(/^## (\d+)\. (.+)$/gm)].map((x) => [Number(x[1]), x[2]]);
  assert.deepEqual(titluri, RUBRICI.map((r, i) => [i + 1, r]));
});

test('overlay-filmare/SABLON.md: ghidul de filmare, acordul pentru transcriere și timpul de randare măsurat', () => {
  const text = citeste(SABLON);
  const ghid = rubrica(text, 2).split('\n### Ghidul de filmare\n')[1];
  assert.ok(ghid, 'lipsește „### Ghidul de filmare” din rubrica 2');
  assert.ok(ghid.split('\n').filter((l) => l.startsWith('- ')).length >= 5, 'ghidul are cel puțin 5 sfaturi');
  for (const s of ['90 s', 'HDR', 'muzică']) assert.ok(ghid.includes(s), s);
  const comenzi = rubrica(text, 10);
  for (const s of ['--filmare <cale>', '--instaleaza-transcrierea', '~670 MB', 'transcriere-neinstalata', '--transcriere', '--din']) assert.ok(comenzi.includes(s), s);
  assert.doesNotMatch(text, /\{\{|\}\}/, 'a rămas un marcaj de completat');
  assert.match(comenzi, /randarea exemplului vertical \(`exemple\/vertical\/`\) a durat (sub un minut|cam \d+ (de )?minute?)/);
  assert.match(comenzi, /pe un laptop Windows cu 8 GB RAM, fără placă video dedicată, a durat (sub un minut|cam \d+ (de )?minute?)\./);
});

test('overlay-filmare/SABLON.md: fiecare verificare proprie declarată și fiecare cod overlay-filmare-* are rândul lui', async () => {
  const sab = await incarcaSablon(REPO, 'overlay-filmare');
  const r7 = rubrica(citeste(SABLON), 7);
  for (const id of sab.meta.verificari.filter((v) => v.startsWith('S'))) assert.match(r7, new RegExp(`^\\| ${id} \\|`, 'm'), id);
  const coduri = Object.keys(CODURI).filter((c) => c.startsWith('overlay-filmare-'));
  assert.ok(coduri.length >= 11, coduri.join(', '));
  for (const c of coduri) assert.ok(r7.includes(`\`${c}\``), c);
  for (const [, c] of r7.matchAll(/`([a-z]+(?:-[a-z]+)+)` \(C\d\d\)/g)) assert.ok(Object.hasOwn(CODURI, c), `${c} nu e în erori.mjs`);
  assert.doesNotMatch(r7, /^\| (S07|S08) \|/m, 'S07 și S08 nu se declară (decizia 4)');
});

test('overlay-filmare/SABLON.md: dicționarul folosește doar fonturile din catalog (decizia 18)', () => {
  const catalog = new Set(fs.readdirSync(path.join(REPO, 'motoare', 'comun', 'fonturi')));
  const r4 = rubrica(citeste(SABLON), 4);
  const fonturi = [...r4.matchAll(/font_titlu: "([a-z-]+)"/g)].map((x) => x[1]);
  assert.ok(fonturi.length >= 2, fonturi.join(', '));
  for (const f of fonturi) assert.ok(catalog.has(f), `${f} nu e în motoare/comun/fonturi/`);
  assert.doesNotMatch(r4, /caveat|jetbrains-mono/);
  assert.match(r4, /scris de mână nu există în v1/);
});

test('cronologie.md: paragraful overlay-filmare descrie sursa_video, benzile, ref-ul (id-ul elementului) și detalii.ancora', () => {
  const par = citeste('docs/interfete/cronologie.md').split('\n## La overlay-filmare\n')[1]?.split('\n## ')[0];
  assert.ok(par, 'lipsește „## La overlay-filmare”');
  for (const s of ['sursa_video', '`banda`', 'detalii.ancora', 'id-ul elementului', 'implicit `eN`', 'overlay-filmare-id-dublu', '„Filmarea”', 'sortate după `start`']) assert.ok(par.includes(s), s);
});
