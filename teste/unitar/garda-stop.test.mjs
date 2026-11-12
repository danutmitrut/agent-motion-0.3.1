import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gasestePredare, gasestePredarile, decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { proceseazaHook } from '../../nucleu/lib/garda/index.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function proiectVerificat(suprascrie = {}) {
  const tmp = creeazaRadacinaTemp({
    fisiere: {
      'video/programari/date.json': '{"sablon": "proba"}\n',
      'video/programari/programari.mp4': 'mp4 fals pentru test\n',
      'video/programari/cadre/predare-1.png': 'png fals 1\n',
      'video/programari/cadre/predare-2.png': 'png fals 2\n',
    },
  });
  const dir = path.join(tmp.radacina, 'video', 'programari');
  const verificare = {
    versiune: 1,
    proiect: 'programari',
    sablon: 'proba',
    mod: 'complet',
    scris_la: '2026-10-02T10:05:00.000Z',
    sha256_date: sha256Fisier(path.join(dir, 'date.json')),
    mp4: 'video/programari/programari.mp4',
    sha256_mp4: sha256Fisier(path.join(dir, 'programari.mp4')),
    ok: true,
    obligatorii: ['C11', 'C16'],
    verificari: [
      { cod: 'C11', ok: true, valoare: null, prag: null, camp: null, erori: [] },
      { cod: 'C16', ok: true, valoare: null, prag: null, camp: null, erori: [] },
    ],
    avertismente: [],
    ...suprascrie,
  };
  fs.writeFileSync(path.join(dir, 'verificare.json'), JSON.stringify(verificare, null, 2) + '\n');
  return { ...tmp, dir };
}

function stop(mesaj) {
  return { hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: mesaj };
}

function motivBlock(raspuns) {
  assert.equal(raspuns.cod, 0);
  const json = JSON.parse(raspuns.stdout);
  assert.equal(json.decision, 'block');
  return json.reason;
}

test('gasestePredare: recunoaște linia „Predare:” și proiectul', () => {
  assert.equal(gasestePredare('Gata, am terminat scenariul.'), null);
  assert.equal(gasestePredare(''), null);
  assert.deepEqual(gasestePredare('Text\n  Predare: `video/p/p.mp4`'), { cale: 'video/p/p.mp4', proiect: 'p' });
  assert.deepEqual(gasestePredare('**Predare:** "video/p/p.mp4".'), { cale: 'video/p/p.mp4', proiect: 'p' });
  assert.deepEqual(gasestePredare('Predare: C:\\agent-motion\\video\\p\\p.mp4'), { cale: 'C:\\agent-motion\\video\\p\\p.mp4', proiect: 'p' });
  assert.deepEqual(gasestePredare('Predare: video/p/serie/'), { cale: 'video/p/serie/', proiect: 'p' });
  assert.deepEqual(gasestePredare('Predare: /Desktop/x.mp4'), { cale: '/Desktop/x.mp4', proiect: '' });
});

test('decideStop: un mesaj fără „Predare:” trece fără blocare, chiar cu un MP4 vechi', () => {
  const t = proiectVerificat({ ok: false });
  try {
    assert.deepEqual(decideStop(stop('Am nevoie de o nouă aprobare: scrie „aprob”.'), t.radacina), { stdout: '', cod: 0 });
    assert.deepEqual(decideStop({ hook_event_name: 'Stop' }, t.radacina), { stdout: '', cod: 0 });
  } finally {
    t.curata();
  }
});

test('decideStop: o predare verificată trece (calea MP4 sau folderul proiectului)', () => {
  const t = proiectVerificat();
  try {
    assert.deepEqual(decideStop(stop('Predare: video/programari/programari.mp4\nAm ales un reel.'), t.radacina), { stdout: '', cod: 0 });
    assert.deepEqual(decideStop(stop('Predare: video/programari/'), t.radacina), { stdout: '', cod: 0 });
    const absolut = path.join(t.radacina, 'video', 'programari', 'programari.mp4');
    assert.deepEqual(decideStop(stop(`Predare: ${absolut}`), t.radacina), { stdout: '', cod: 0 });
  } finally {
    t.curata();
  }
});

test('decideStop: MP4-ul modificat după verificare blochează predarea', () => {
  const t = proiectVerificat();
  try {
    fs.appendFileSync(path.join(t.dir, 'programari.mp4'), 'modificat\n');
    const motiv = motivBlock(decideStop(stop('Predare: video/programari/programari.mp4'), t.radacina));
    assert.match(motiv, /programari\.mp4 s-a schimbat după ultima verificare/);
    assert.match(motiv, /node nucleu\/mg\.mjs randeaza programari/);
  } finally {
    t.curata();
  }
});

test('decideStop: fiecare condiție picată blochează, cu motiv în română', () => {
  const cazuri = [
    [{ ok: false }, /verificări picate/],
    [{ mod: 'schita' }, /rulare „schita”/],
    [{ sha256_date: 'altceva' }, /date\.json s-a schimbat/],
    [{ mp4: 'video/programari/alt.mp4' }, /nu e MP4-ul verificat/],
  ];
  for (const [suprascrie, asteptat] of cazuri) {
    const t = proiectVerificat(suprascrie);
    try {
      assert.match(motivBlock(decideStop(stop('Predare: video/programari/programari.mp4'), t.radacina)), asteptat);
    } finally {
      t.curata();
    }
  }
});

test('decideStop: fără verificare.json, cu cale în afara proiectului sau fără proiect, blochează', () => {
  const t = creeazaRadacinaTemp({ fisiere: { 'video/programari/programari.mp4': 'x\n' } });
  try {
    assert.match(motivBlock(decideStop(stop('Predare: video/programari/programari.mp4'), t.radacina)), /lipsește video\/programari\/verificare\.json/);
    assert.match(motivBlock(decideStop(stop('Predare: /Desktop/x.mp4'), t.radacina)), /video\/<proiect>/);
    assert.match(motivBlock(decideStop(stop('Predare: ../alt/video/p/p.mp4'), t.radacina)), /nu e în video\/p\//);
  } finally {
    t.curata();
  }
});

test('decideStop: după 3 runde cu REPARĂ, predarea verificată nu e blocată de plafon (P1)', () => {
  const t = proiectVerificat();
  try {
    fs.mkdirSync(path.join(t.dir, 'cadre'), { recursive: true });
    for (const n of [1, 2, 3]) {
      fs.writeFileSync(path.join(t.dir, 'cadre', `foaie-${n}.jpg`), 'x');
      fs.writeFileSync(path.join(t.dir, 'cadre', `revizie-${n}.md`), 'Verdict: REPARĂ\n- Scena 2: titlul se citește greu.\n');
    }
    const mesaj = 'Revizorul a semnalat, după 3 runde, că titlul din Scena 2 se citește greu; n-am reparat.\nPredare: video/programari/programari.mp4';
    assert.deepEqual(decideStop(stop(mesaj), t.radacina), { stdout: '', cod: 0 });
  } finally {
    t.curata();
  }
});

test('proceseazaHook: fixture-ul stop-predare.json, fără verificare, dă block cu exit 0', async () => {
  const t = creeazaRadacinaTemp();
  try {
    const text = fs.readFileSync(path.join(REPO, 'teste', 'fixtures', 'hook', 'stop-predare.json'), 'utf8');
    const r = await proceseazaHook(text, { radacina: t.radacina, env: {}, acum: new Date() });
    assert.match(motivBlock(r), /verificare\.json/);
    const invalid = await proceseazaHook('{"hook_event_name": "Stop", "last_assistant_message": "Predare: video/p/p.mp4"', { radacina: t.radacina, env: {}, acum: new Date() });
    assert.equal(JSON.parse(invalid.stdout).decision, 'block');
  } finally {
    t.curata();
  }
});

test('decideStop [B]: lipsa cadrului predare-2.png blochează predarea', () => {
  const t = proiectVerificat();
  try {
    fs.unlinkSync(path.join(t.dir, 'cadre', 'predare-2.png'));
    const motiv = motivBlock(decideStop(stop('Predare: video/programari/programari.mp4'), t.radacina));
    assert.match(motiv, /lipsește video\/programari\/cadre\/predare-2\.png/);
    assert.match(motiv, /node nucleu\/mg\.mjs randeaza programari/);
  } finally {
    t.curata();
  }
});

test('decideStop [B]: un cod obligatoriu fără rezultat blochează predarea', () => {
  const t = proiectVerificat({ verificari: [{ cod: 'C11', ok: true, valoare: null, prag: null, camp: null, erori: [] }] });
  try {
    assert.match(motivBlock(decideStop(stop('Predare: video/programari/programari.mp4'), t.radacina)), /nu are rezultate pentru C16/);
  } finally {
    t.curata();
  }
});

test('decideStop [B]: un cod obligatoriu picat blochează predarea, chiar cu ok: true la rădăcină', () => {
  const t = proiectVerificat({
    verificari: [
      { cod: 'C11', ok: true, valoare: null, prag: null, camp: null, erori: [] },
      { cod: 'C11', ok: false, valoare: null, prag: null, camp: 'mp4.durata', erori: [] },
      { cod: 'C16', ok: true, valoare: null, prag: null, camp: null, erori: [] },
    ],
  });
  try {
    assert.match(motivBlock(decideStop(stop('Predare: video/programari/programari.mp4'), t.radacina)), /verificări obligatorii picate: C11/);
  } finally {
    t.curata();
  }
});

test('decideStop [B]: o listă obligatorie goală sau lipsă blochează predarea', () => {
  for (const suprascrie of [{ obligatorii: [] }, { obligatorii: null }]) {
    const t = proiectVerificat(suprascrie);
    try {
      assert.match(motivBlock(decideStop(stop('Predare: video/programari/programari.mp4'), t.radacina)), /lista verificărilor obligatorii/);
    } finally {
      t.curata();
    }
  }
});

test('decideStop [B]: după 3 runde cu REPARĂ, predarea completă, cu toate verificările obligatorii verzi, trece (P1)', () => {
  const t = proiectVerificat();
  try {
    for (const n of [1, 2, 3]) {
      fs.writeFileSync(path.join(t.dir, 'cadre', `foaie-${n}.jpg`), 'x');
      fs.writeFileSync(path.join(t.dir, 'cadre', `revizie-${n}.md`), 'Verdict: REPARĂ\n- Scena 2: titlul se citește greu.\n');
    }
    // Hook-ul nu cere un verdict TRECE: observațiile nereparate stau în mesajul de predare, iar cursantul decide.
    const mesaj = [
      'Observațiile nereparate ale revizorului, după 3 runde: Scena 2, titlul se citește greu.',
      'Decizi tu: folosești videoul, schimbăm scenariul sau scrii „încă o rundă programari”.',
      'Predare: video/programari/programari.mp4',
    ].join('\n');
    assert.deepEqual(decideStop(stop(mesaj), t.radacina), { stdout: '', cod: 0 });
    fs.unlinkSync(path.join(t.dir, 'cadre', 'predare-1.png'));
    assert.match(motivBlock(decideStop(stop(mesaj), t.radacina)), /lipsește video\/programari\/cadre\/predare-1\.png/,
      'plafonul nu slăbește celelalte condiții ale predării');
  } finally {
    t.curata();
  }
});

test('gasestePredarile: întoarce toate liniile „Predare:”, în ordine (SEC-2)', () => {
  assert.deepEqual(gasestePredarile('Gata.'), []);
  assert.deepEqual(gasestePredarile('Predare: video/a/a.mp4\nText\n- Predare: video/b/b.mp4'), [
    { cale: 'video/a/a.mp4', proiect: 'a' },
    { cale: 'video/b/b.mp4', proiect: 'b' },
  ]);
});

test('decideStop: două linii „Predare:”, a doua neverificată, blochează, cu proiectul ei în mesaj (SEC-2)', () => {
  const t = proiectVerificat();
  try {
    fs.mkdirSync(path.join(t.radacina, 'video', 'varianta'), { recursive: true });
    fs.writeFileSync(path.join(t.radacina, 'video', 'varianta', 'varianta.mp4'), 'x\n');
    const mesaj = 'Predare: video/programari/programari.mp4\nPredare: video/varianta/varianta.mp4';
    const motiv = motivBlock(decideStop(stop(mesaj), t.radacina));
    assert.match(motiv, /lipsește video\/varianta\/verificare\.json/);
    assert.match(motiv, /node nucleu\/mg\.mjs randeaza varianta/);
    assert.doesNotMatch(motiv, /randeaza programari/);
    // ordinea liniilor nu contează: prima problemă găsită blochează
    const invers = 'Predare: video/varianta/varianta.mp4\nPredare: video/programari/programari.mp4';
    assert.match(motivBlock(decideStop(stop(invers), t.radacina)), /randeaza varianta/);
    // două predări verificate trec
    assert.deepEqual(decideStop(stop('Predare: video/programari/programari.mp4\nPredare: video/programari/'), t.radacina), { stdout: '', cod: 0 });
  } finally {
    t.curata();
  }
});
