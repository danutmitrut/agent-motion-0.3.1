import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideVerdict, extrageFoaia } from '../../nucleu/lib/garda/revizor.mjs';
import { sha256Fisier, sha256Text, jsonStabil } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { numaraCuvinte } from '../ajutoare/configuratie.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVIZOR = '.claude/agents/revizor-cadre.md';
const SABLON = 'motoare/hyperframes/sabloane/reel-ilustrat/SABLON.md';
const RUBRICI = [
  'Ce face', 'Când se alege', 'Câmpurile din date.json', 'Dicționarul de stil', 'Tipurile de scenă și desenele',
  'Cum calculează mg timpii', 'Verificările și erorile', 'Ce verifică revizorul', 'Ce scrie agentul și ce nu',
  'Comenzi', 'Capcane și abateri deliberate de la referință', 'Exemple și referințe',
];

function citeste(rel) {
  return fs.readFileSync(path.join(REPO, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n');
}

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'lipsește frontmatter-ul');
  const campuri = {};
  for (const linie of m[1].split('\n')) {
    const p = /^([A-Za-z_]+):\s*(.*)$/.exec(linie);
    if (p) campuri[p[1]] = p[2].trim();
  }
  return { campuri, corp: text.slice(m[0].length) };
}

function hashSkill(dir) {
  const harta = {};
  const umbla = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) umbla(p);
      else harta[path.relative(dir, p).split(path.sep).join('/')] = sha256Fisier(p);
    }
  };
  umbla(dir);
  return sha256Text(jsonStabil(harta));
}

/** Textul unei rubrici din SABLON.md (de la „## N. ” până la rubrica următoare). */
function rubrica(text, n) {
  return text.split(`\n## ${n}. `)[1].split(`\n## ${n + 1}. `)[0];
}

test('revizor-cadre.md: frontmatter-ul din spec 5.5', () => {
  const { campuri } = frontmatter(citeste(REVIZOR));
  assert.equal(campuri.name, 'revizor-cadre');
  assert.ok(campuri.description.length >= 40, 'descrierea spune când îl pornește agentul');
  assert.deepEqual(campuri.tools.split(',').map((s) => s.trim()), ['Read', 'Glob']);
  assert.equal(campuri.model, 'sonnet');
  assert.equal(campuri.omitClaudeMd, 'true');
});

test('revizor-cadre.md: doar citire, fără unelte de scriere sau de comenzi', () => {
  const unelte = frontmatter(citeste(REVIZOR)).campuri.tools.split(',').map((s) => s.trim());
  for (const u of ['Write', 'Edit', 'NotebookEdit', 'Bash', 'PowerShell', 'WebFetch', 'WebSearch']) assert.equal(unelte.includes(u), false, u);
});

test('settings.json: SubagentStop prinde revizor-cadre, iar PostToolUse prinde SubagentHandback', () => {
  const s = JSON.parse(citeste('.claude/settings.json'));
  assert.ok(s.hooks.SubagentStop.some((h) => h.matcher === 'revizor-cadre'));
  assert.ok(s.hooks.PostToolUse.some((h) => h.matcher === 'SubagentHandback'));
});

test('exemplul de verdict din revizor-cadre.md e scris de gardă în revizie-N.md al foii numite pe rândul „Foaia:” (G3)', () => {
  const { corp } = frontmatter(citeste(REVIZOR));
  const m = /Exemplu:\n\n```\n([\s\S]*?)\n```/.exec(corp);
  assert.ok(m, 'lipsește blocul de exemplu');
  assert.match(m[1], /^Verdict: REPARĂ\nFoaia: foaie-1\.jpg\n/, 'rândul „Foaia:” vine imediat după „Verdict:”, fără punct final');
  assert.equal(extrageFoaia(m[1]), 'foaie-1.jpg');
  assert.match(m[1], /scene\[\d\]\.[a-z_.]+/);
  // Două foi în așteptare: fără rândul „Foaia:”, garda ar alege foaia cea mai nouă (q/foaie-2.jpg).
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/cadre/foaie-1.jpg': 'jpg fals\n', 'video/q/cadre/foaie-2.jpg': 'jpg fals\n' } });
  try {
    fs.utimesSync(path.join(t.radacina, 'video', 'p', 'cadre', 'foaie-1.jpg'), new Date(1000), new Date(1000));
    const r = decideVerdict({ hook_event_name: 'SubagentStop', agent_type: 'revizor-cadre', last_assistant_message: `Am terminat foaia.\n\n${m[1]}` }, t.radacina);
    assert.equal(r.cod, 0);
    assert.equal(r.stdout, '');
    const scris = fs.readFileSync(path.join(t.radacina, 'video', 'p', 'cadre', 'revizie-1.md'), 'utf8');
    assert.ok(scris.startsWith('Verdict: REPARĂ\nFoaia: foaie-1.jpg\n'), scris);
    assert.match(scris, /stil\.atmosfera/);
    assert.equal(fs.existsSync(path.join(t.radacina, 'video', 'q', 'cadre', 'revizie-2.md')), false);
  } finally {
    t.curata();
  }
});

test('SABLON.md: frontmatter-ul din harta 5.8 și cele 12 rubrici, în ordine', () => {
  const { campuri, corp } = frontmatter(citeste(SABLON));
  assert.equal(campuri.nume, 'reel-ilustrat');
  assert.equal(campuri.verificari, '[C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17, S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11, S12]');
  assert.equal(campuri.verificari_partiale, '{ C04: plafon-brut-si-latime-card }');
  const titluri = [...corp.matchAll(/^## (\d+)\. (.+)$/gm)].map((x) => [Number(x[1]), x[2]]);
  assert.deepEqual(titluri, RUBRICI.map((r, i) => [i + 1, r]));
});

test('SABLON.md: trimiterile în referinta/ există, iar rubrica 11 numește abaterea de la regula ieșirilor', () => {
  const text = citeste(SABLON);
  const trimiteri = [...text.matchAll(/motoare\/hyperframes\/referinta\/[A-Za-z0-9._/-]+\.md/g)].map((x) => x[0]);
  assert.ok(trimiteri.length >= 3, trimiteri.join(', '));
  for (const t of trimiteri) assert.ok(fs.existsSync(path.join(REPO, ...t.split('/'))), t);
  const r11 = rubrica(text, 11);
  assert.match(r11, /frame-worker-core\.md/);
  assert.match(r11, /retrag/);
});

test('SABLON.md: verificările descriu codul de acum (deciziile din B17 și B18)', () => {
  const r7 = rubrica(citeste(SABLON), 7);
  // C12: primul conținut e orice desen vizibil; C13: caseta reală a fiecărui text, din sablon.html, cu semnătura
  assert.match(r7, /orice desen vizibil/);
  assert.match(r7, /casete\.mjs/);
  assert.match(r7, /semnătur/);
  // C14 pe plin: deriva lentă a desenelor; C16: N comun cu revizie-N.md; verificare.json verde doar cu toate codurile
  assert.match(r7, /0,85 px\/s/);
  assert.match(r7, /`cadre\/revizie-N\.md`/);
  assert.match(r7, /29/);
  assert.match(rubrica(citeste(SABLON), 5), /fără titlu și fără cuvinte/);
});

test('SABLON.md: recomandarea de sursă pe temă (C14b): Open Doodles pe noapte, Open Peeps pe hartie și curat', () => {
  const text = citeste(SABLON);
  assert.match(text, /Open Doodles pe `noapte`/);
  assert.match(text, /Open Peeps pe `hartie` și `curat`/);
  assert.match(text, /recomandare/);
});

test('SABLON.md: fără urme din stilul personal al lui Dănuț', () => {
  const text = citeste(SABLON);
  for (const re of [/linia[- ]continu/i, /linie continu/i, /copper/i, /#0A0B0E/i, /#E08A5E/i, /#EDE6DA/i]) assert.doesNotMatch(text, re);
});

test('FLUX.md: șablonul activ, revizorul, marcajul de predare, sub 250 de cuvinte', () => {
  const text = citeste('FLUX.md');
  for (const s of ['reel-ilustrat', 'revizor-cadre', 'Predare: video/<p>/<p>.mp4', 'cadre/foaie-N.jpg', 'cerere-sablon.md']) assert.ok(text.includes(s), s);
  // spec 4.7: la reluare, predarea vine doar după un verdict TRECE sau la plafon; altfel, întâi revizorul
  assert.ok(text.includes('ultima revizie „TRECE” sau plafonul atins, pasul 8; altfel, pasul 7'));
  assert.ok(numaraCuvinte(text) <= 250, `FLUX.md are ${numaraCuvinte(text)} de cuvinte`);
});

test('FLUX.md și SABLON.md spun ce face codul (F3, F4, F6, F7 din revizia finală)', () => {
  const flux = citeste('FLUX.md');
  // F4: desenele se aleg înainte de --doar-verificare (S10 le cere valide); după „aprob” urmează randarea completă, cum spune hook-ul
  const pas4 = flux.split('\n').find((l) => l.startsWith('4. '));
  assert.ok(pas4.indexOf('mg desen cauta') !== -1 && pas4.indexOf('mg desen cauta') < pas4.indexOf('--doar-verificare'), pas4);
  assert.match(flux.split('\n').find((l) => l.startsWith('6. ')), /după „aprob”, `mg randeaza`/);
  const sablon = citeste(SABLON);
  // F3: avertismentele lui check nu ajung la revizor (C10 ține doar erorile)
  assert.doesNotMatch(rubrica(sablon, 11), /ajung la revizor/);
  // F6: exemplul 02 nu are card; suma duratelor ține de C09, nu de S01
  assert.doesNotMatch(rubrica(sablon, 12), /toate tipurile de scenă/);
  assert.doesNotMatch(sablon.split('\n').find((l) => l.startsWith('| S01 |')), /suma = /);
  // F7: nu există o iconiță Lucide mare în reel
  assert.doesNotMatch(rubrica(sablon, 9), /iconiță Lucide mare/);
});

test('FLUX.md: fără linia „Stare:”, cu frazele din A18 (P1, A-Î6) păstrate cuvânt cu cuvânt', () => {
  const text = citeste('FLUX.md');
  assert.doesNotMatch(text, /^Stare:/m);
  for (const s of [
    'Cel mult 3 runde, numărate din `cadre/revizie-N.md`',
    'a patra doar când cursantul o cere explicit',
    'observațiile nereparate ale revizorului; cursantul decide',
    'după 8 refuzuri la rând',
    'scriu fără „Predare:” că videoul nu e predat și de ce',
    'Nu inventez cifre, citate sau surse',
  ]) assert.ok(text.includes(s), s);
});

test('CLAUDE.md și TOOLS.md: revizorul imediat după foaia lui (G3), runda în plus cerută explicit (P1) și mg nou --din (T5)', () => {
  const revizia = citeste('CLAUDE.md').split('\n## Revizia vizuală\n')[1] ?? '';
  assert.match(revizia, /imediat după foaia lui/);
  assert.match(revizia, /înainte de predare/);
  assert.match(revizia, /Foaia schiței .* doar dacă vrei o părere/);
  assert.match(revizia, /„încă o rundă <proiect>”/);
  assert.match(revizia, /observațiile lui nereparate la vedere/);
  assert.match(citeste('TOOLS.md'), /nou <proiect-nou> --din <proiect>/);
});

test('referinta/: cele trei skilluri, NOTICE și hash-urile din VERSIUNI.json', () => {
  const ref = JSON.parse(citeste('nucleu/VERSIUNI.json')).referinta.hyperframes;
  assert.equal(ref.versiune, '0.8.96');
  assert.equal(ref.licenta, 'Apache-2.0');
  assert.equal(ref.notice, 'motoare/hyperframes/referinta/NOTICE');
  const baza = path.join(REPO, 'motoare', 'hyperframes', 'referinta');
  assert.deepEqual(fs.readdirSync(baza).sort(), ['NOTICE', 'hyperframes', 'hyperframes-cli', 'media-use']);
  const notice = fs.readFileSync(path.join(baza, 'NOTICE'), 'utf8');
  assert.match(notice, /hyperframes@0\.8\.96/);
  assert.match(notice, /Apache License/);
  assert.match(notice, /Copyright 2026 HeyGen, Inc\./);
  for (const s of ['hyperframes', 'hyperframes-cli', 'media-use']) {
    assert.ok(fs.existsSync(path.join(baza, s, 'SKILL.md')), s);
    assert.equal(hashSkill(path.join(baza, s)), ref.skilluri[s], s);
  }
});
