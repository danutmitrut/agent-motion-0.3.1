import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { alegeTintaVerdict, extrageFoaia, extrageVerdict, decideVerdict, numaraRunde, plafonRunde, RUNDE_MAXIME } from '../../nucleu/lib/garda/revizor.mjs';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixture(nume) {
  return fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'hook', nume), 'utf8');
}

function laData(radacina, rel, secunde) {
  const cale = path.join(radacina, ...rel.split('/'));
  const t = new Date(Date.UTC(2026, 9, 2, 10, 0, secunde));
  fs.utimesSync(cale, t, t);
}

function citeste(radacina, rel) {
  return fs.readFileSync(path.join(radacina, ...rel.split('/')), 'utf8');
}

function exista(radacina, rel) {
  return fs.existsSync(path.join(radacina, ...rel.split('/')));
}

const SUBAGENT_STOP = (mesaj, agent_type = 'revizor-cadre') => ({ hook_event_name: 'SubagentStop', agent_type, last_assistant_message: mesaj });
const HANDBACK = (mesaj, agent_type = 'revizor-cadre') => ({ hook_event_name: 'PostToolUse', agent_type, tool_name: 'SubagentHandback', tool_input: { message: mesaj } });

test('extrageVerdict: de la prima linie cu verdict până la final, în forma canonică', () => {
  assert.equal(extrageVerdict('Am verificat.\nVerdict: TRECE\nToate scenele se citesc.'), 'Verdict: TRECE\nToate scenele se citesc.');
  assert.equal(extrageVerdict('Verdict: REPARA\n- Scena 2: titlul e prea lung.'), 'Verdict: REPARĂ\n- Scena 2: titlul e prea lung.');
  assert.equal(extrageVerdict('**Verdict: REPARĂ**\n- Scena 1'), 'Verdict: REPARĂ\n- Scena 1');
  assert.equal(extrageVerdict('Verdict: REPARA\u0306'.normalize('NFD')), 'Verdict: REPARĂ');
  assert.equal(extrageVerdict('Verdictul meu: TRECE'), null);
  assert.equal(extrageVerdict('Fără niciun verdict aici.'), null);
  assert.equal(extrageVerdict(undefined), null);
});

test('alegeTintaVerdict: foaia fără verdict, cea mai nouă, cu schița separată', () => {
  const t = creeazaRadacinaTemp({
    fisiere: {
      'video/a/cadre/foaie-1.jpg': 'x',
      'video/a/cadre/revizie-1.md': 'Verdict: REPARĂ\n',
      'video/a/cadre/foaie-2.jpg': 'x',
      'video/b/cadre/foaie-schita-1.jpg': 'x',
    },
  });
  try {
    laData(t.radacina, 'video/a/cadre/foaie-2.jpg', 10);
    laData(t.radacina, 'video/b/cadre/foaie-schita-1.jpg', 20);
    assert.deepEqual(alegeTintaVerdict(t.radacina), { proiect: 'b', fisier: 'video/b/cadre/revizie-schita-1.md' });
    laData(t.radacina, 'video/a/cadre/foaie-2.jpg', 30);
    assert.deepEqual(alegeTintaVerdict(t.radacina), { proiect: 'a', fisier: 'video/a/cadre/revizie-2.md' });
  } finally {
    t.curata();
  }
  const gol = creeazaRadacinaTemp();
  try {
    assert.equal(alegeTintaVerdict(gol.radacina), null);
  } finally {
    gol.curata();
  }
});

test('decideVerdict: handback-ul cu „Verdict: TRECE” scrie revizie-1.md lângă foaie-1.jpg', () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/cadre/foaie-1.jpg': 'x' } });
  try {
    assert.deepEqual(decideVerdict(HANDBACK('Verdict: TRECE\nToate scenele se citesc.'), t.radacina), { stdout: '', cod: 0 });
    assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-1.md'), 'Verdict: TRECE\nToate scenele se citesc.\n');
    // SubagentStop-ul care urmează are doar textul de închidere: nu mai e nicio foaie în așteptare, deci nu blochează
    assert.deepEqual(decideVerdict(SUBAGENT_STOP('Am predat raportul.'), t.radacina), { stdout: '', cod: 0 });
  } finally {
    t.curata();
  }
});

test('decideVerdict: SubagentStop cu verdict scrie fișierul; după foaia schiței, scrie revizie-schita-N.md', () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/cadre/foaie-schita-1.jpg': 'x' } });
  try {
    decideVerdict(SUBAGENT_STOP('Verdict: REPARĂ\n- Scena 3: mai mare.'), t.radacina);
    assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-schita-1.md'), 'Verdict: REPARĂ\n- Scena 3: mai mare.\n');
    assert.equal(exista(t.radacina, 'video/p/cadre/revizie-1.md'), false);
  } finally {
    t.curata();
  }
});

test('decideVerdict: SubagentStop fără verdict, cu foaie în așteptare, dă block', () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/cadre/foaie-1.jpg': 'x' } });
  try {
    const r = decideVerdict(SUBAGENT_STOP('Am terminat de citit.'), t.radacina);
    assert.equal(r.cod, 0);
    const json = JSON.parse(r.stdout);
    assert.equal(json.decision, 'block');
    assert.match(json.reason, /Verdict: TRECE/);
    assert.equal(exista(t.radacina, 'video/p/cadre/revizie-1.md'), false);
    // la PostToolUse, lipsa verdictului nu blochează
    assert.deepEqual(decideVerdict(HANDBACK('Raport fără verdict.'), t.radacina), { stdout: '', cod: 0 });
  } finally {
    t.curata();
  }
});

test('decideVerdict: un agent_type diferit nu scrie nimic', () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/cadre/foaie-1.jpg': 'x' } });
  try {
    assert.deepEqual(decideVerdict(SUBAGENT_STOP('Verdict: TRECE', 'Explore'), t.radacina), { stdout: '', cod: 0 });
    assert.deepEqual(decideVerdict(HANDBACK('Verdict: TRECE', ''), t.radacina), { stdout: '', cod: 0 });
    assert.equal(exista(t.radacina, 'video/p/cadre/revizie-1.md'), false);
  } finally {
    t.curata();
  }
});

test('numaraRunde: numără verdictele din fișiere, separat pentru schiță (T3)', () => {
  const t = creeazaRadacinaTemp({
    fisiere: {
      'video/p/cadre/revizie-1.md': 'Verdict: REPARĂ\n',
      'video/p/cadre/revizie-2.md': 'Verdict: REPARĂ\n',
      'video/p/cadre/revizie-schita-1.md': 'Verdict: TRECE\n',
      'video/p/cadre/revizie-note.md': 'nu e verdict\n',
    },
  });
  try {
    assert.equal(RUNDE_MAXIME, 3);
    assert.equal(numaraRunde(t.radacina, 'p'), 2);
    assert.equal(numaraRunde(t.radacina, 'p', { schita: true }), 1);
    assert.equal(numaraRunde(t.radacina, 'nimeni'), 0);
  } finally {
    t.curata();
  }
});

test('decideVerdict: după 3 runde nu scrie a patra revizie și nu blochează (spec 4.3)', () => {
  const fisiere = {};
  for (const n of [1, 2, 3]) {
    fisiere[`video/p/cadre/foaie-${n}.jpg`] = 'x';
    fisiere[`video/p/cadre/revizie-${n}.md`] = 'Verdict: REPARĂ\n';
  }
  fisiere['video/p/cadre/foaie-4.jpg'] = 'x';
  const t = creeazaRadacinaTemp({ fisiere });
  try {
    const r = decideVerdict(HANDBACK('Verdict: REPARĂ\n- Scena 1: tot prea mic.'), t.radacina);
    assert.equal(r.cod, 0);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /3 runde/);
    assert.match(r.stderr, /predă cu observațiile revizorului la vedere/);
    assert.match(r.stderr, /doar la cererea lui explicită/);
    assert.equal(exista(t.radacina, 'video/p/cadre/revizie-4.md'), false);
    // nici SubagentStop fără verdict nu mai blochează: revizorul nu e ținut în buclă
    assert.deepEqual([decideVerdict(SUBAGENT_STOP('Am terminat.'), t.radacina).stdout], ['']);
  } finally {
    t.curata();
  }
});

test('plafonRunde: 3, plus rundele suplimentare din motor.lock, separat pentru schiță (P1)', () => {
  const t = creeazaRadacinaTemp({
    fisiere: {
      'video/a/motor.lock': JSON.stringify({ versiune: 1, runde_suplimentare: { complet: 1, schita: 2 } }) + '\n',
      'video/b/motor.lock': JSON.stringify({ versiune: 1, aprobare: null }) + '\n',
      'video/c/motor.lock': JSON.stringify({ versiune: 1, runde_suplimentare: { complet: -1, schita: 1.5 } }) + '\n',
      'video/d/motor.lock': '{ stricat',
    },
  });
  try {
    assert.equal(plafonRunde(t.radacina, 'a'), 4);
    assert.equal(plafonRunde(t.radacina, 'a', { schita: true }), 5);
    assert.equal(plafonRunde(t.radacina, 'b'), RUNDE_MAXIME);
    assert.equal(plafonRunde(t.radacina, 'c'), RUNDE_MAXIME);
    assert.equal(plafonRunde(t.radacina, 'c', { schita: true }), RUNDE_MAXIME);
    assert.equal(plafonRunde(t.radacina, 'd'), RUNDE_MAXIME);
    assert.equal(plafonRunde(t.radacina, 'nimeni'), RUNDE_MAXIME);
  } finally {
    t.curata();
  }
});

test('decideVerdict: a patra rundă, cerută explicit de cursant în motor.lock, se scrie; a cincea nu (P1)', () => {
  const fisiere = { 'video/p/motor.lock': JSON.stringify({ versiune: 1, runde_suplimentare: { complet: 1, schita: 0 } }) + '\n' };
  for (const n of [1, 2, 3]) {
    fisiere[`video/p/cadre/foaie-${n}.jpg`] = 'x';
    fisiere[`video/p/cadre/revizie-${n}.md`] = 'Verdict: REPARĂ\n';
  }
  fisiere['video/p/cadre/foaie-4.jpg'] = 'x';
  const t = creeazaRadacinaTemp({ fisiere });
  try {
    assert.deepEqual(decideVerdict(HANDBACK('Verdict: TRECE\nAcum se citește.'), t.radacina), { stdout: '', cod: 0 });
    assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-4.md'), 'Verdict: TRECE\nAcum se citește.\n');
    fs.writeFileSync(path.join(t.radacina, 'video', 'p', 'cadre', 'foaie-5.jpg'), 'x');
    const r = decideVerdict(HANDBACK('Verdict: REPARĂ\n- Scena 1'), t.radacina);
    assert.match(r.stderr, /4 runde/);
    assert.equal(exista(t.radacina, 'video/p/cadre/revizie-5.md'), false);
  } finally {
    t.curata();
  }
});

test('proceseazaHook: fixture-urile SubagentStop și PostToolUse ajung la același fișier', async () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/programari/cadre/foaie-1.jpg': 'x' } });
  try {
    const mediu = { radacina: t.radacina, env: {}, acum: new Date() };
    const r1 = await proceseazaHook(fixture('posttooluse-handback.json'), mediu);
    assert.deepEqual([r1.cod, r1.stdout], [0, '']);
    assert.match(citeste(t.radacina, 'video/programari/cadre/revizie-1.md'), /^Verdict: TRECE\n/);
    fs.writeFileSync(path.join(t.radacina, 'video', 'programari', 'cadre', 'foaie-2.jpg'), 'x');
    const r2 = await proceseazaHook(fixture('subagentstop-revizor.json'), mediu);
    assert.deepEqual([r2.cod, r2.stdout], [0, '']);
    assert.match(citeste(t.radacina, 'video/programari/cadre/revizie-2.md'), /^Verdict: REPARĂ\n- Scena 2/);
  } finally {
    t.curata();
  }
});

// G3: revizorul scrie în verdict rândul „Foaia: <nume>”; garda pune verdictul la foaia aceea.

/** Două foi în așteptare în proiectul p: foaie-1.jpg (mai veche) și foaie-schita-1.jpg (mai nouă). */
function douaFoiInAsteptare(extra = {}) {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/p/cadre/foaie-1.jpg': 'x', 'video/p/cadre/foaie-schita-1.jpg': 'x', ...extra } });
  laData(t.radacina, 'video/p/cadre/foaie-1.jpg', 10);
  laData(t.radacina, 'video/p/cadre/foaie-schita-1.jpg', 20);
  return t;
}

test('extrageFoaia: numele foii din rândul „Foaia:”, strict pe foaie-N.jpg și foaie-schita-N.jpg', () => {
  assert.equal(extrageFoaia('Verdict: TRECE\nFoaia: foaie-2.jpg\nTotul se citește.'), 'foaie-2.jpg');
  assert.equal(extrageFoaia('Foaia: foaie-schita-1.jpg\nVerdict: REPARĂ'), 'foaie-schita-1.jpg');
  assert.equal(extrageFoaia('Verdict: TRECE\n**Foaia:** `foaie-3.jpg`'), 'foaie-3.jpg');
  assert.equal(extrageFoaia('Verdict: TRECE\r\nfoaia: foaie-3.jpg  \r\n'), 'foaie-3.jpg');
  // o cale care se termină cu numele: se ia doar numele
  assert.equal(extrageFoaia('Foaia: video/p/cadre/foaie-4.jpg'), 'foaie-4.jpg');
  assert.equal(extrageFoaia('Foaia: C:\\agent-motion\\video\\p\\cadre\\foaie-schita-2.jpg'), 'foaie-schita-2.jpg');
  // tiparele invalide nu dau nume
  for (const valoare of ['../x.jpg', 'foaie-2.png', 'foaie-2.jpg.md', 'foaie-.jpg', 'foaie-a.jpg', 'foaie-2.jpg.', 'Foaie-2.jpg', 'foaie-2.jpg/', 'foaie-2.jpg x', '']) {
    assert.equal(extrageFoaia(`Verdict: TRECE\nFoaia: ${valoare}`), null, valoare);
  }
  // doar primul rând „Foaia:” contează
  assert.equal(extrageFoaia('Foaia: foaie-2.png\nFoaia: foaie-1.jpg'), null);
  assert.equal(extrageFoaia('Verdict: TRECE\nPe foaia: foaie-1.jpg'), null);
  assert.equal(extrageFoaia('Verdict: TRECE'), null);
  assert.equal(extrageFoaia(undefined), null);
});

test('alegeTintaVerdict: cu foaia numită în așteptare, ținta e verdictul ei; altfel, regula de acum', () => {
  const t = douaFoiInAsteptare({ 'video/p/cadre/foaie-2.jpg': 'x', 'video/p/cadre/revizie-2.md': 'Verdict: REPARĂ\n' });
  try {
    laData(t.radacina, 'video/p/cadre/foaie-2.jpg', 5);
    const veche = { proiect: 'p', fisier: 'video/p/cadre/revizie-1.md' };
    const noua = { proiect: 'p', fisier: 'video/p/cadre/revizie-schita-1.md' };
    assert.deepEqual(alegeTintaVerdict(t.radacina, { foaie: 'foaie-1.jpg' }), veche);
    assert.deepEqual(alegeTintaVerdict(t.radacina, { foaie: 'foaie-schita-1.jpg' }), noua);
    assert.deepEqual(alegeTintaVerdict(t.radacina), noua);
    assert.deepEqual(alegeTintaVerdict(t.radacina, { foaie: null }), noua);
    // inexistentă sau cu tipar invalid: regula de acum
    for (const foaie of ['foaie-9.jpg', '../x.jpg', 'foaie-1.png', '../cadre/foaie-1.jpg']) {
      assert.deepEqual(alegeTintaVerdict(t.radacina, { foaie }), noua, foaie);
    }
    // cu verdict deja scris: nicio țintă, e a doua livrare a aceluiași verdict (F1)
    assert.equal(alegeTintaVerdict(t.radacina, { foaie: 'foaie-2.jpg' }), null);
  } finally {
    t.curata();
  }
});

test('alegeTintaVerdict: același nume în două proiecte, cea mai nouă dintre foile cu numele acela', () => {
  const t = creeazaRadacinaTemp({
    fisiere: { 'video/a/cadre/foaie-1.jpg': 'x', 'video/b/cadre/foaie-1.jpg': 'x', 'video/c/cadre/foaie-2.jpg': 'x' },
  });
  try {
    laData(t.radacina, 'video/a/cadre/foaie-1.jpg', 20);
    laData(t.radacina, 'video/b/cadre/foaie-1.jpg', 10);
    laData(t.radacina, 'video/c/cadre/foaie-2.jpg', 30);
    assert.deepEqual(alegeTintaVerdict(t.radacina, { foaie: 'foaie-1.jpg' }), { proiect: 'a', fisier: 'video/a/cadre/revizie-1.md' });
    assert.deepEqual(alegeTintaVerdict(t.radacina), { proiect: 'c', fisier: 'video/c/cadre/revizie-2.md' });
  } finally {
    t.curata();
  }
});

for (const [cale, intrare] of [['SubagentStop', SUBAGENT_STOP], ['SubagentHandback', HANDBACK]]) {
  test(`decideVerdict (${cale}): verdictul cu „Foaia:” pe foaia mai veche ajunge la ea (G3)`, () => {
    const t = douaFoiInAsteptare();
    try {
      const r = decideVerdict(intrare('Verdict: REPARĂ\nFoaia: foaie-1.jpg\n- Scena 2: titlul e prea lung.'), t.radacina);
      assert.deepEqual(r, { stdout: '', cod: 0 });
      assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-1.md'), 'Verdict: REPARĂ\nFoaia: foaie-1.jpg\n- Scena 2: titlul e prea lung.\n');
      assert.equal(exista(t.radacina, 'video/p/cadre/revizie-schita-1.md'), false);
    } finally {
      t.curata();
    }
  });

  test(`decideVerdict (${cale}): fără „Foaia:”, verdictul ajunge la foaia cea mai nouă, ca înainte`, () => {
    const t = douaFoiInAsteptare();
    try {
      decideVerdict(intrare('Verdict: TRECE\nSe citește.'), t.radacina);
      assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-schita-1.md'), 'Verdict: TRECE\nSe citește.\n');
      assert.equal(exista(t.radacina, 'video/p/cadre/revizie-1.md'), false);
    } finally {
      t.curata();
    }
  });

  test(`decideVerdict (${cale}): nume inexistent sau cu tipar invalid, regula de acum`, () => {
    for (const valoare of ['foaie-9.jpg', '../x.jpg', 'foaie-2.png', '../../../../x/foaie-1.png']) {
      const t = douaFoiInAsteptare({ 'video/p/cadre/foaie-2.jpg': 'x', 'video/p/cadre/revizie-2.md': 'Verdict: REPARĂ\n' });
      try {
        laData(t.radacina, 'video/p/cadre/foaie-2.jpg', 5);
        laData(t.radacina, 'video/p/cadre/revizie-2.md', 6);
        decideVerdict(intrare(`Verdict: TRECE\nFoaia: ${valoare}`), t.radacina);
        assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-schita-1.md'), `Verdict: TRECE\nFoaia: ${valoare}\n`, valoare);
        assert.equal(exista(t.radacina, 'video/p/cadre/revizie-1.md'), false, valoare);
        assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-2.md'), 'Verdict: REPARĂ\n', valoare);
        assert.deepEqual(fs.readdirSync(path.join(t.radacina, 'video', 'p', 'cadre')).sort(), ['foaie-1.jpg', 'foaie-2.jpg', 'foaie-schita-1.jpg', 'revizie-2.md', 'revizie-schita-1.md'], valoare);
      } finally {
        t.curata();
      }
    }
  });

  test(`decideVerdict (${cale}): „Foaia:” pe o foaie cu verdict deja scris nu scrie nimic (F1)`, () => {
    const t = douaFoiInAsteptare({ 'video/p/cadre/foaie-2.jpg': 'x', 'video/p/cadre/revizie-2.md': 'Verdict: REPARĂ\n' });
    try {
      laData(t.radacina, 'video/p/cadre/foaie-2.jpg', 5);
      laData(t.radacina, 'video/p/cadre/revizie-2.md', 6);
      assert.deepEqual(decideVerdict(intrare('Verdict: TRECE\nFoaia: foaie-2.jpg'), t.radacina), { stdout: '', cod: 0 });
      assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-2.md'), 'Verdict: REPARĂ\n');
      assert.deepEqual(fs.readdirSync(path.join(t.radacina, 'video', 'p', 'cadre')).sort(), ['foaie-1.jpg', 'foaie-2.jpg', 'foaie-schita-1.jpg', 'revizie-2.md']);
    } finally {
      t.curata();
    }
  });
}

test('decideVerdict: SubagentStop fără verdict, cu „Foaia:” pe o foaie în așteptare, dă block și nu scrie', () => {
  const t = douaFoiInAsteptare();
  try {
    const r = decideVerdict(SUBAGENT_STOP('Foaia: foaie-1.jpg\nAm terminat de citit.'), t.radacina);
    assert.equal(JSON.parse(r.stdout).decision, 'block');
    assert.deepEqual(fs.readdirSync(path.join(t.radacina, 'video', 'p', 'cadre')).sort(), ['foaie-1.jpg', 'foaie-schita-1.jpg']);
  } finally {
    t.curata();
  }
});

test('decideVerdict: plafonul se socotește pe foaia numită (schița are rundele ei)', () => {
  const fisiere = { 'video/p/cadre/foaie-schita-1.jpg': 'x' };
  for (const n of [1, 2, 3]) {
    fisiere[`video/p/cadre/foaie-${n}.jpg`] = 'x';
    fisiere[`video/p/cadre/revizie-${n}.md`] = 'Verdict: REPARĂ\n';
  }
  fisiere['video/p/cadre/foaie-4.jpg'] = 'x';
  const t = creeazaRadacinaTemp({ fisiere });
  try {
    laData(t.radacina, 'video/p/cadre/foaie-schita-1.jpg', 10);
    laData(t.radacina, 'video/p/cadre/foaie-4.jpg', 20);
    assert.deepEqual(decideVerdict(HANDBACK('Verdict: TRECE\nFoaia: foaie-schita-1.jpg'), t.radacina), { stdout: '', cod: 0 });
    assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-schita-1.md'), 'Verdict: TRECE\nFoaia: foaie-schita-1.jpg\n');
    assert.equal(exista(t.radacina, 'video/p/cadre/revizie-4.md'), false);
  } finally {
    t.curata();
  }
});

test('proceseazaHook: „Foaia:” duce verdictul la foaia numită pe ambele căi (SubagentStop și SubagentHandback)', async () => {
  for (const [nume, camp] of [['subagentstop-revizor.json', 'last_assistant_message'], ['posttooluse-handback.json', 'message']]) {
    const t = douaFoiInAsteptare();
    try {
      const intrare = JSON.parse(fixture(nume));
      if (camp === 'message') intrare.tool_input.message = 'Verdict: TRECE\nFoaia: foaie-1.jpg';
      else intrare.last_assistant_message = 'Verdict: TRECE\nFoaia: foaie-1.jpg';
      const r = await proceseazaHook(JSON.stringify(intrare), { radacina: t.radacina, env: {}, acum: new Date() });
      assert.deepEqual([r.cod, r.stdout], [0, ''], nume);
      assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-1.md'), 'Verdict: TRECE\nFoaia: foaie-1.jpg\n', nume);
      assert.equal(exista(t.radacina, 'video/p/cadre/revizie-schita-1.md'), false, nume);
    } finally {
      t.curata();
    }
  }
});

// F1: în modul auto, revizorul livrează verdictul prin SubagentHandback, apoi se oprește (SubagentStop). A doua
// livrare nu mai scrie nimic și nu blochează: verdictul se numără o singură dată, pe foaia lui.

/** Foaia veche în așteptare (`veche`, nerevizuită) și foaia nouă (`noua`), din același proiect p. */
function foaieVecheSiNoua(veche, noua) {
  const t = creeazaRadacinaTemp({ fisiere: { [`video/p/cadre/${veche}`]: 'x', [`video/p/cadre/${noua}`]: 'x' } });
  laData(t.radacina, `video/p/cadre/${veche}`, 10);
  laData(t.radacina, `video/p/cadre/${noua}`, 20);
  return t;
}

const fisiereCadre = (t) => fs.readdirSync(path.join(t.radacina, 'video', 'p', 'cadre')).sort();

for (const [veche, noua, revizieNoua] of [
  ['foaie-1.jpg', 'foaie-2.jpg', 'revizie-2.md'],
  ['foaie-schita-1.jpg', 'foaie-1.jpg', 'revizie-1.md'],
]) {
  test(`decideVerdict (F1): handback cu „Foaia: ${noua}”, apoi SubagentStop cu verdictul repetat: o singură revizie`, () => {
    const t = foaieVecheSiNoua(veche, noua);
    try {
      const verdict = `Verdict: TRECE\nFoaia: ${noua}\nToate scenele se citesc.`;
      assert.deepEqual(decideVerdict(HANDBACK(verdict), t.radacina), { stdout: '', cod: 0 });
      assert.deepEqual(decideVerdict(SUBAGENT_STOP(verdict), t.radacina), { stdout: '', cod: 0 });
      assert.deepEqual(fisiereCadre(t), [veche, noua, revizieNoua].sort());
      assert.equal(numaraRunde(t.radacina, 'p') + numaraRunde(t.radacina, 'p', { schita: true }), 1);
    } finally {
      t.curata();
    }
  });

  test(`decideVerdict (F1): handback cu „Foaia: ${noua}”, apoi SubagentStop doar cu textul de închidere: nu blochează`, () => {
    const t = foaieVecheSiNoua(veche, noua);
    try {
      decideVerdict(HANDBACK(`Verdict: REPARĂ\nFoaia: ${noua}\n- Scena 2: titlul e prea lung.`), t.radacina);
      assert.deepEqual(decideVerdict(SUBAGENT_STOP('Am predat verdictul.'), t.radacina), { stdout: '', cod: 0 });
      assert.deepEqual(fisiereCadre(t), [veche, noua, revizieNoua].sort());
    } finally {
      t.curata();
    }
  });
}

test('decideVerdict (F1): handback fără „Foaia:”, apoi SubagentStop cu același verdict: foaia veche rămâne fără verdict', () => {
  const t = foaieVecheSiNoua('foaie-1.jpg', 'foaie-2.jpg');
  try {
    decideVerdict(HANDBACK('Verdict: TRECE\nSe citește.'), t.radacina);
    assert.deepEqual(decideVerdict(SUBAGENT_STOP('Verdict: TRECE\nSe citește.'), t.radacina), { stdout: '', cod: 0 });
    assert.deepEqual(fisiereCadre(t), ['foaie-1.jpg', 'foaie-2.jpg', 'revizie-2.md']);
  } finally {
    t.curata();
  }
});

test('decideVerdict (F1): „Foaia:” pe o foaie care are deja verdict nu scrie nimic, pe nicio cale', () => {
  for (const intrare of [SUBAGENT_STOP, HANDBACK]) {
    const t = foaieVecheSiNoua('foaie-schita-1.jpg', 'foaie-1.jpg');
    try {
      fs.writeFileSync(path.join(t.radacina, 'video', 'p', 'cadre', 'revizie-1.md'), 'Verdict: REPARĂ\n');
      assert.equal(alegeTintaVerdict(t.radacina, { foaie: 'foaie-1.jpg' }), null);
      assert.deepEqual(decideVerdict(intrare('Verdict: TRECE\nFoaia: foaie-1.jpg'), t.radacina), { stdout: '', cod: 0 });
      assert.deepEqual(fisiereCadre(t), ['foaie-1.jpg', 'foaie-schita-1.jpg', 'revizie-1.md']);
      assert.equal(citeste(t.radacina, 'video/p/cadre/revizie-1.md'), 'Verdict: REPARĂ\n');
    } finally {
      t.curata();
    }
  }
});

test('decideVerdict (F1): fără modul auto, SubagentStop pe o foaie nouă se scrie, chiar cu o foaie veche nerevizuită', () => {
  const t = foaieVecheSiNoua('foaie-schita-1.jpg', 'foaie-1.jpg');
  try {
    assert.deepEqual(decideVerdict(SUBAGENT_STOP('Verdict: TRECE\nSe citește.'), t.radacina), { stdout: '', cod: 0 });
    assert.deepEqual(fisiereCadre(t), ['foaie-1.jpg', 'foaie-schita-1.jpg', 'revizie-1.md']);
    // o nouă randare: foaia 2, mai nouă decât revizia 1, e ținta următorului SubagentStop, iar lipsa verdictului blochează
    fs.writeFileSync(path.join(t.radacina, 'video', 'p', 'cadre', 'foaie-2.jpg'), 'x');
    const viitor = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(t.radacina, 'video', 'p', 'cadre', 'foaie-2.jpg'), viitor, viitor);
    assert.equal(JSON.parse(decideVerdict(SUBAGENT_STOP('Am terminat.'), t.radacina).stdout).decision, 'block');
  } finally {
    t.curata();
  }
});
