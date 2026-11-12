// SABLON.md al lui date-serie (planul I, I06): frontmatter-ul, cele 12 rubrici, verificările proprii și codurile lor,
// dicționarul de stil din spec 7.3 și nota de licență (decizia 15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODURI } from '../../nucleu/lib/erori.mjs';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { numaraCuvinte } from '../ajutoare/configuratie.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SABLON = 'motoare/remotion/sabloane/date-serie/SABLON.md';
const citeste = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const RUBRICI = [
  'Ce face', 'Când se alege', 'Câmpurile din date.json', 'Dicționarul de stil', 'Tipurile de scenă și ce se vede', 'Cum calculează mg timpii',
  'Verificările și erorile', 'Ce verifică revizorul', 'Ce scrie agentul și ce nu', 'Comenzi', 'Capcane și abateri deliberate de la referință',
  'Exemple și referințe',
];

function rubrica(text, n) {
  return text.split(`\n## ${n}. `)[1].split(`\n## ${n + 1}. `)[0];
}

test('date-serie/SABLON.md: cele 12 rubrici, în ordine, fără marcaje de completat', () => {
  const text = citeste(SABLON);
  const titluri = [...text.matchAll(/^## (\d+)\. (.+)$/gm)].map((x) => [Number(x[1]), x[2]]);
  assert.deepEqual(titluri, RUBRICI.map((r, i) => [i + 1, r]));
  assert.doesNotMatch(text, /\{\{|\}\}/);
});

test('date-serie/SABLON.md: fiecare verificare proprie și fiecare cod date-serie-* are rândul lui în rubrica 7', async () => {
  const sab = await incarcaSablon(REPO, 'date-serie');
  const r7 = rubrica(citeste(SABLON), 7);
  for (const id of sab.meta.verificari.filter((v) => v.startsWith('S'))) assert.match(r7, new RegExp(`^\\| ${id} \\|`, 'm'), id);
  const coduri = Object.keys(CODURI).filter((c) => c.startsWith('date-serie-'));
  assert.ok(coduri.length >= 3, coduri.join(', '));
  for (const c of coduri) assert.ok(r7.includes(`\`${c}\``), c);
  for (const [, c] of r7.matchAll(/`([a-z]+(?:-[a-z]+)+)` \(C\d\d\)/g)) assert.ok(Object.hasOwn(CODURI, c), `${c} nu e în erori.mjs`);
  for (const s of ['cadre-goale', 'text-invizibil', 'video-inghetat']) assert.ok(r7.includes(`\`${s}\``), `rubrica erorilor numește ${s} (C12-C14)`);
});

test('date-serie/SABLON.md: dicționarul din spec 7.3 și limitele v1', () => {
  const r4 = rubrica(citeste(SABLON), 4);
  for (const t of ['noapte', 'hartie', 'curat']) assert.match(r4, new RegExp(`stil\\.tema: "${t}"`), t);
  assert.match(r4, /stil\.culori\.accent/);
  assert.match(r4, /### Limitele v1/);
  assert.doesNotMatch(r4, /font_titlu: "/, 'fontul titlului e fix în v1');
});

test('date-serie/SABLON.md: nota de licență Remotion (decizia 15), fără atribuire cerută', () => {
  const r11 = rubrica(citeste(SABLON), 11);
  assert.match(r11, /Company License/);
  assert.match(r11, /cel mult 3 oameni/);
  assert.match(r11, /nu cer atribuire/);
});

test('FLUX.md: tabelul „Alegerea” are rândul date-serie, iar fluxul rămâne sub 250 de cuvinte', () => {
  const flux = citeste('FLUX.md');
  const alegerea = flux.split('\n## Alegerea\n')[1].split('\n## ')[0];
  assert.match(alegerea, /^\| cifre sau testimoniale, vertical, 6-60 s \| `date-serie` \|$/m);
  assert.match(alegerea, /^\| filmarea cursantului, vertical sau orizontal, 5-90 s \| `overlay-filmare` \|$/m);
  assert.match(alegerea, /^\| doar text, vertical sau pătrat, 5-60 s \| `text-animat` \|$/m);
  assert.match(alegerea, /^\| poveste desenată, verticală, maximum 60 s \| `reel-ilustrat` \|$/m);
  assert.match(flux, /Nu reinstalez nimic fără aprobare\./);
  assert.ok(numaraCuvinte(flux) <= 250, `FLUX.md are ${numaraCuvinte(flux)} de cuvinte`);
});

test('TOOLS.md: mg nou cu --sablon date-serie, cu acordul pentru descărcarea lui Remotion, și versiunea fixată', () => {
  const tools = citeste('TOOLS.md');
  const rand = tools.split('\n').find((l) => l.startsWith('| `node nucleu/mg.mjs nou <proiect> --sablon date-serie'));
  assert.ok(rand, 'lipsește rândul date-serie');
  assert.match(rand, /^\| `node nucleu\/mg\.mjs nou <proiect> --sablon date-serie` \| .+ \| activă \|$/);
  assert.match(rand, /--instaleaza-motorul/);
  assert.match(rand, /acordul cursantului/);
  assert.match(rand, /~340 MB/);
  assert.match(tools, /Versiuni fixate \(sursa: `nucleu\/VERSIUNI\.json`\): HyperFrames 0\.8\.96, Remotion 4\.0\.529, /);
});

test('INSTALARE.md: Remotion se descarcă la primul grafic, cu acord, și licența lui', () => {
  const inst = citeste('INSTALARE.md').split('\n## Pentru cursant\n')[1];
  assert.match(inst, /primul video `date-serie`/);
  assert.match(inst, /~340 MB/);
  assert.match(inst, /cel mult 3 oameni/);
  assert.match(inst, /Company License/);
});

test('text-animat și reel-ilustrat, rubrica 2: graficul din cifre merge la date-serie', () => {
  const text = rubrica(citeste('motoare/hyperframes/sabloane/text-animat/SABLON.md'), 2);
  const randText = text.split('\n').find((l) => l.startsWith('| Grafic, sau cel puțin 3 valori'));
  assert.match(randText, /^\| Grafic, sau cel puțin 3 valori de aceeași unitate, pe aceeași axă \| `date-serie`: /);
  assert.doesNotMatch(randText, /când va exista/);
  const reel = rubrica(citeste('motoare/hyperframes/sabloane/reel-ilustrat/SABLON.md'), 2);
  assert.match(reel, /^\| Serie de numere, grafic din cifre \| `date-serie`: /m);
  assert.match(reel, /^\| Desene în format pătrat sau orizontal, voce sincronizată, morf între forme \| o frază despre limită/m);
});

test('cronologie.md: paragraful date-serie descrie tranziția de 12 cadre, segmentele lipite și complet = intrarea', () => {
  const par = citeste('docs/interfete/cronologie.md').split('\n## La date-serie\n')[1]?.split('\n## ')[0];
  assert.ok(par, 'lipsește „## La date-serie”');
  for (const s of ['12 cadre', 'inceput[i] + 6', 'cadreIntrare', '„Scena N”', '`scene[i]`', 'props.json']) assert.ok(par.includes(s), s);
});

test('sablon.md și verificare.md: contractul cu ambele motoare și schița fără check la tranziții', () => {
  const contract = citeste('docs/interfete/sablon.md').split('\n## Contractul cu motorul\n')[1].split('\n## ')[0];
  for (const s of ['adaptorMotor', 'meta.motor', 'motor.props', 'motor.compozitie', '--public-dir', '--color-space=bt709', 'bundle-', '.gata', '--concurrency=1', 'schita.mp4']) assert.ok(contract.includes(s), s);
  assert.doesNotMatch(contract, /rezervat/);
  assert.match(citeste('docs/interfete/verificare.md'), /`check_la_tranzitii`: `\{ ok, erori \}` la HyperFrames, `null` la Remotion/);
  assert.doesNotMatch(citeste('docs/interfete/erori.md'), /Exemplu: `date-serie` raportează la S02/);
});

test('ajutorul lui mg nu mai pomenește hyperframes check la randeaza', () => {
  const ajutor = citeste('nucleu/mg.mjs').split('const AJUTOR = `')[1].split('`;')[0];
  const randeaza = ajutor.split('\n').filter((l, i, a) => l.includes('randeaza <proiect>') || a[i - 1]?.includes('randeaza <proiect>')).join('\n');
  assert.doesNotMatch(randeaza, /hyperframes check|check la tranziții/);
  assert.match(randeaza, /verificarea motorului/);
});

test('date-serie/SABLON.md: timpul de randare măsurat pe laptopul Windows', () => {
  const comenzi = rubrica(citeste(SABLON), 10);
  assert.match(comenzi, /Pe un laptop Windows cu 8 GB RAM, fără placă video dedicată, randarea exemplului \(22,4 s\) a durat (sub un minut|cam \d+ (de )?minute?)\./);
});
