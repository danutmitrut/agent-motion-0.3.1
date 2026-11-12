// Capcanele runtime-ului reelului (spec 7.1, 8.4.4, harta 2): determinism, fără stilul linia-continua,
// fără comentarii de linie, marcajele pe care le înlocuiește compileaza.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SABLON = path.join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat');
const FISIERE = [
  path.join(SABLON, 'runtime', 'linia.js'),
  path.join(SABLON, 'runtime', 'regizor-runtime.js'),
  path.join(SABLON, 'sablon.html'),
  path.join(SABLON, 'runtime', 'miscare-plin.js'),
];
const INTERZISE = [
  { tipar: /Math\.random/, motiv: 'numere aleatoare: cadrele nu mai sunt deterministe' },
  { tipar: /Date\.now/, motiv: 'ceasul sistemului: cadrele nu mai sunt deterministe' },
  { tipar: /vector-effect/, motiv: 'vector-effect strică desenarea cu dash; grosimea se compensează prin scară' },
  { tipar: /#0A0B0E/i, motiv: 'fundalul stilului linia-continua al lui Dănuț' },
  { tipar: /#E08A5E/i, motiv: 'accentul stilului linia-continua al lui Dănuț' },
  { tipar: /\/\/ /, motiv: 'comentariu de linie sau prefixul de etichetă „// ” al stilului linia-continua' },
];
const MARCAJE = [
  '/*MG_FONTURI*/', '/*MG_CULORI*/', '/*MG_ROLURI*/', '{{MG_ATMOSFERA}}', '<!--MG_SCENA-->', '<!--MG_CARDURI-->',
  '<!--MG_SEMNATURA-->', '/*MG_LINIA*/', '/*MG_DATE*/', '/*MG_REGIZOR*/', '<!--MG_AUDIO-->',
];

function corpFunctie(text, nume) {
  const start = text.search(new RegExp(`function ${nume}\\s*\\(`));
  assert.notEqual(start, -1, `lipsește funcția ${nume}`);
  let i = text.indexOf('{', start);
  let adancime = 0;
  for (let j = i; j < text.length; j += 1) {
    if (text[j] === '{') adancime += 1;
    if (text[j] === '}') adancime -= 1;
    if (adancime === 0) return text.slice(i, j + 1);
  }
  throw new Error(`funcția ${nume} nu se închide`);
}

for (const fisier of FISIERE) {
  test(`${path.basename(fisier)} nu conține capcane`, () => {
    const text = fs.readFileSync(fisier, 'utf8');
    for (const { tipar, motiv } of INTERZISE) {
      const gasit = tipar.exec(text);
      assert.equal(gasit, null, `${path.basename(fisier)} conține ${gasit?.[0]}: ${motiv}`);
    }
  });
}

test('runtime-ul nu conține adrese de rețea (C10)', () => {
  for (const fisier of [FISIERE[0], FISIERE[1], FISIERE[3]]) {
    assert.doesNotMatch(fs.readFileSync(fisier, 'utf8'), /https?:\/\//, path.basename(fisier));
  }
});

test('funcțiile apelate la fiecare cadru nu măsoară nimic', () => {
  const text = fs.readFileSync(FISIERE[0], 'utf8');
  for (const nume of ['renderSet', 'place', 'frame']) {
    assert.doesNotMatch(corpFunctie(text, nume),
      /getTotalLength|getPointAtLength|getBBox|getBoundingClientRect|getComputedStyle|offsetWidth|offsetHeight/,
      `${nume} rulează în onUpdate și nu are voie să măsoare`);
  }
});

test('linia.js expune API-ul portat, plus forma și panou', () => {
  const text = fs.readFileSync(FISIERE[0], 'utf8');
  for (const nume of ['desen', 'forma', 'panou', 'iconite', 'retea', 'linie', 'card', 'cuvinte', 'scanteie', 'semnatura', 'atmosfera', 'gata']) {
    assert.match(text, new RegExp(`api\\.${nume} = function`), `lipsește L.${nume}`);
  }
  assert.match(text, /window\.__timelines\["main"\] = tl/);
});

test('regizor-runtime.js citește doar planul și desenele', () => {
  const text = fs.readFileSync(FISIERE[1], 'utf8');
  assert.match(text, /window\.__MG_PLAN/);
  assert.match(text, /window\.__MG_DESENE/);
  assert.doesNotMatch(text, /\d+\.\d+\s*[*+-]/, 'regizorul nu face calcule de timp cu constante proprii');
});

test('sablon.html are fiecare marcaj o singură dată și rădăcina main', () => {
  const text = fs.readFileSync(FISIERE[2], 'utf8');
  for (const m of MARCAJE) {
    assert.equal(text.split(m).length - 1, 1, `marcajul ${m} trebuie să apară exact o dată`);
  }
  assert.equal(text.split('{{MG_DURATA}}').length - 1, 2, '{{MG_DURATA}} apare pe rădăcină și pe stage');
  assert.match(text, /<div id="root" class="\{\{MG_ATMOSFERA\}\}" data-composition-id="main" data-start="0" data-duration="\{\{MG_DURATA\}\}" data-width="1080" data-height="1920">/);
  assert.match(text, /<script src="gsap\.min\.js"><\/script>/);
  assert.doesNotMatch(text, /https?:\/\//, 'GSAP vine din copia locală, nu din rețea');
});
