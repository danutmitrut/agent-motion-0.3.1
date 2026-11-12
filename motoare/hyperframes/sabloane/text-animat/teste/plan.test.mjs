import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../../../../nucleu/lib/teme.mjs';
import { valideazaCronologie } from '../../../../../nucleu/lib/cronologie.mjs';
import { planifica, pasiScena, casetaLa, eroareDurata } from '../plan.mjs';
import { verificareaErorii } from '../../../../../nucleu/lib/erori.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const sablon = await incarcaSablon(REPO, 'text-animat');
const implicite = sablon.implicite;
const minim = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../exemple/minim.json', import.meta.url)), 'utf8'));

function planDin(date, { dirProiect = REPO, brand = null } = {}) {
  const s = rezolvaStil({ radacina: REPO, sablon, date, brand });
  assert.deepEqual(s.erori, []);
  return planifica(date, s.stil, { radacina: REPO, dirProiect, sablon, brand });
}
const pas = (scena, efect, tinta) => scena.pasi.find((p) => p.efect === efect && p.tinta === tinta);
const rotunjeste3 = (x) => Math.round(x * 1000) / 1000;

test('exemplul minim: duratele, începuturile și momentele „complet”', () => {
  const r = planDin(minim);
  assert.deepEqual(r.erori, []);
  const { plan } = r;
  assert.equal(plan.durata, 12.7);
  assert.deepEqual(plan.scene.map((s) => [s.start, s.complet, s.sfarsit, s.ultima]), [[0, 1.35, 4.4, false], [4.4, 6.7, 9.2, false], [9.2, 11.21, 12.7, true]]);
  assert.deepEqual([plan.format, plan.latime, plan.inaltime, plan.fps, plan.iesire, plan.aliniere], ['vertical', 1080, 1920, 30, 0.45, 'centru']);
  assert.deepEqual(plan.atmosfera, { mod: 'ceata', granulatie: 0.1, impingere: 1.03 });
  assert.equal(plan.sigla, null);
});

test('pașii scenelor din exemplul minim, cu timpi absoluți', () => {
  const [s1, s2, s3] = planDin(minim).plan.scene;
  assert.deepEqual(pas(s1, 'apare', '#r1-1'), { efect: 'apare', tinta: '#r1-1', t: 0.1, dur: 0.5, x: 0, y: 16, ease: 'power3.out' });
  assert.deepEqual(pas(s1, 'masca', '#r1-2'), { efect: 'masca', tinta: '#r1-2', t: 0.35, dur: 0.7, ease: 'power3.out' });
  assert.equal(pas(s1, 'masca', '#r1-3').t, 0.65);
  assert.equal(pas(s2, 'masca', '#r2-1').t, 4.5);
  assert.deepEqual(['#r2-2', '#r2-3', '#r2-4'].map((t) => pas(s2, 'apare', t).t), [5.1, 5.55, 6]);
  assert.deepEqual(pas(s2, 'apare', '#r2-2'), { efect: 'apare', tinta: '#r2-2', t: 5.1, dur: 0.7, x: -24, y: 0, ease: 'power3.out' });
  assert.deepEqual(['#m2-1', '#m2-2', '#m2-3'].map((t) => pas(s2, 'bifa', t)), [5.25, 5.7, 6.15].map((t, k) => ({ efect: 'bifa', tinta: `#m2-${k + 1}`, t, dur: 0.35 })));
  assert.deepEqual(pas(s3, 'tasteaza', '#t3-4'), { efect: 'tasteaza', tinta: '#t3-4', t: 10.4, dur: 0.81, text: 'exemplu.ro/atelier' });
  assert.deepEqual(pas(s3, 'apare', '#r3-3'), { efect: 'apare', tinta: '#r3-3', t: 10.4, dur: 0.15, x: 0, y: 0, ease: 'none' });
});

test('textele scenei: piesele de pe ecran, cu momentul și caseta la acel moment', () => {
  const { plan } = planDin(minim);
  const [s1, , s3] = plan.scene;
  assert.deepEqual(s1.texte.map((t) => [t.id, t.text, t.t]), [
    ['t1-1', 'PENTRU SOLOPRENORI', 1.35], ['t1-2', 'Lucrezi 12 ore', 1.35], ['t1-3', 'și tot', 1.35], ['t1-4', 'nu ajungi', 1.35], ['t1-5', '?', 1.35],
  ]);
  assert.deepEqual(s3.texte.map((t) => t.text), ['Hai să construim', 'împreună', '.', 'exemplu.ro/atelier']);
  const piesa = s1.blocuri[1].randuri[0].parti.find((p) => p.tip === 'piesa');
  assert.deepEqual(s1.texte[1].caseta, casetaLa(piesa.caseta, 1.35, s1, plan));
});

test('casetaLa: deriva scenei, apoi împingerea compoziției în jurul centrului cadrului', () => {
  const plan = { latime: 1080, inaltime: 1920, durata: 10, atmosfera: { impingere: 1.03 } };
  const scena = { start: 0, sfarsit: 4, deriva: 12 };
  // s = 1 + 0,03 · 2/10 = 1,006; y după derivă = 1000 − 6 = 994
  assert.deepEqual(casetaLa([96, 1000, 200, 100], 2, scena, plan), [93.34, 994.2, 201.2, 100.6]);
  assert.deepEqual(casetaLa([96, 1000, 200, 100], 0, scena, plan), [96, 1000, 200, 100]);
});

test('cronologia: formatul comun, selectorii pieselor, momentele foii, fără ferestre statice', () => {
  const { cronologie: c } = planDin(minim);
  assert.deepEqual(valideazaCronologie(c), []);
  assert.deepEqual(c.segmente[0].selectori, ['#t1-1', '#t1-2', '#t1-3', '#t1-4', '#t1-5']);
  assert.deepEqual(c.segmente[0].texte, ['PENTRU SOLOPRENORI', 'Lucrezi 12 ore', 'și tot', 'nu ajungi', '?']);
  assert.deepEqual(c.momente_foaie.map((m) => m.t), [1.35, 4.4, 6.7, 9.2, 11.21, 12.667]);
  assert.deepEqual(c.ferestre_statice, []);
  assert.equal(c.fundal, '#0E0F13');
  assert.equal(c.audio, null);
  const [x, y, w, h] = c.segmente[1].zona_text;
  assert.ok(x === 96 && w === 888 && y >= 200 && y + h <= 1590 + 1e-9);
});

test('cuvintele care se schimbă pe loc stau complet vizibile cel puțin 0,8 s, pe fiecare ritm', () => {
  for (const ritm of ['calm', 'normal', 'alert']) {
    const date = { ...minim, stil: { ritm }, scene: [{ tip: 'cuvinte', titlu: ['Un agent AI le face'], cuvinte: ['zilnic.', 'corect.', '*fără tine*.'] }, minim.scene[2]] };
    const r = planDin(date);
    assert.deepEqual(r.erori, [], ritm);
    const [s] = r.plan.scene;
    for (const k of [1, 2]) {
      const intrare = pas(s, 'masca', `#r1-${k + 1}`);
      const iesire = pas(s, 'iese', `#r1-${k + 1}`);
      assert.ok(iesire.t - (intrare.t + intrare.dur) >= 0.8 - 1e-9, `${ritm}, cuvântul ${k}`);
      assert.equal(rotunjeste3(iesire.t + iesire.dur), pas(s, 'masca', `#r1-${k + 2}`).t, `${ritm}: ieșirea se termină când intră următorul`);
    }
    assert.equal(pas(s, 'iese', '#r1-4'), undefined, 'ultimul cuvânt nu iese');
    const ultim = s.texte.at(-1);
    assert.equal(ultim.t, rotunjeste3(pas(s, 'masca', '#r1-4').t + 0.45));
  }
});

test('ritmul alert: arc pe intrări și pași mai scurți', () => {
  const [s1] = planDin({ ...minim, stil: { ritm: 'alert' } }).plan.scene;
  assert.deepEqual(pas(s1, 'masca', '#r1-2'), { efect: 'masca', tinta: '#r1-2', t: 0.35, dur: 0.55, ease: 'back.out(1.6)' });
  assert.equal(pas(s1, 'masca', '#r1-3').t, 0.59);
});

test('cifra: apare, crește și numără pe aceeași piesă; sursa după numărare', () => {
  const date = { ...minim, scene: [{ tip: 'cifra', valoare: 1250, prefix: '€', text: 'economisiți într-un an', sursa: 'calculul meu, 2026' }, minim.scene[2]] };
  const r = planDin(date);
  assert.deepEqual(r.erori, []);
  const [s] = r.plan.scene;
  assert.equal(s.texte[0].text, '€1.250');
  assert.deepEqual(pas(s, 'numara', '#t1-1'), { efect: 'numara', tinta: '#t1-1', t: 0.1, dur: 1.4, valoare: 1250, zecimale: 0, prefix: '€', sufix: '' });
  assert.deepEqual(pas(s, 'scala', '#r1-1'), { efect: 'scala', tinta: '#r1-1', t: 0.1, dur: 1.4, de: 0.9 });
  const sursa = s.blocuri.at(-1).randuri[0].id;
  assert.equal(pas(s, 'apare', `#${sursa}`).t, 1.5);
  assert.equal(s.complet, 2);
});

test('citatul: autorul se tastează după citat, rolul apare după autor', () => {
  const date = { ...minim, scene: [{ tip: 'citat', text: 'Am recuperat o zi pe săptămână încă din prima lună.', autor: 'Ioana Pop', rol: 'fondatoare, Studio Lemn' }, minim.scene[2]] };
  const [s] = planDin(date).plan.scene;
  const tastare = s.pasi.find((p) => p.efect === 'tasteaza');
  assert.equal(tastare.text, 'Ioana Pop');
  assert.equal(tastare.dur, 0.6);
  const ultimRand = s.blocuri[0].randuri.at(-1).id;
  const masca = pas(s, 'masca', `#${ultimRand}`);
  assert.equal(tastare.t, rotunjeste3(masca.t + masca.dur + 0.2));
  const rol = s.blocuri.at(-1).randuri[0].id;
  assert.equal(pas(s, 'apare', `#${rol}`).t, rotunjeste3(tastare.t + 0.6 + 0.1));
  assert.equal(s.texte[0].text.startsWith('„'), true);
});

test('fraza: câte un pas pe cuvânt, cu pasul ritmului', () => {
  const date = { ...minim, scene: [{ tip: 'fraza', text: 'Nu munca e problema. *Rutina* e.' }, minim.scene[2]] };
  const [s] = planDin(date).plan.scene;
  const apare = s.pasi.filter((p) => p.efect === 'apare');
  assert.deepEqual(apare.map((p) => p.t), [0.1, 0.28, 0.46, 0.64, 0.82, 1]);
  assert.deepEqual(s.texte.map((t) => t.text), ['Nu', 'munca', 'e', 'problema.', 'Rutina', 'e.']);
});

test('sigla din resurse/: blocul din final, apariția și dimensiunile din plan; fără final, avertisment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-text-sigla-'));
  try {
    fs.mkdirSync(path.join(dir, 'resurse'));
    fs.writeFileSync(path.join(dir, 'resurse', 'sigla.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><rect width="400" height="100"/></svg>');
    const cu = planDin({ ...minim, sigla: 'resurse/sigla.svg' }, { dirProiect: dir });
    assert.deepEqual(cu.erori, []);
    assert.deepEqual(cu.plan.sigla, { mime: 'image/svg+xml', w: 360, h: 90 });
    const s3 = cu.plan.scene[2];
    assert.equal(pas(s3, 'apare', '#sigla').t, rotunjeste3(9.2 + 1.1 + 0.1));
    const fara = planDin({ ...minim, sigla: 'resurse/sigla.svg', scene: minim.scene.slice(0, 2) }, { dirProiect: dir });
    assert.equal(fara.plan.sigla, null);
    assert.deepEqual(fara.avertismente.map((a) => [a.cod, a.camp]), [['valoare-invalida', 'sigla']]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('durata dată sub minimul mecanic: prea-repede-de-citit pe S02, cu minimul în mesaj', () => {
  // citirea cere 1,5 s (valideaza trece), dar textul intră complet abia la 0,8 s și scena trebuie să mai iasă
  const date = { ...minim, scene: [{ tip: 'titlu', titlu: ['Salut, lume'], durata: 1.5 }, ...minim.scene] };
  const r = planDin(date);
  assert.equal(r.plan, null);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp, e.verificare]), [['prea-repede-de-citit', 'scene[0].durata', 'S02']]);
  assert.match(r.erori[0].mesaj, /cel puțin 2,1 s/);
});

test('totalul sub 5 s: durata-in-afara-limitelor pe scene', () => {
  const r = planDin({ ...minim, scene: [{ tip: 'titlu', titlu: ['Salut, lume'] }] });
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['durata-in-afara-limitelor', 'scene']]);
});

test('pasiScena nu depinde de începutul scenei: aceeași scenă, aceiași pași relativi', () => {
  const r = planDin(minim);
  const s2 = r.plan.scene[1];
  const rel = pasiScena(minim.scene[1], s2.blocuri, implicite.ritm.normal, implicite.timpi);
  assert.deepEqual(rel.pasi.map((p) => rotunjeste3(p.t + 4.4)), s2.pasi.map((p) => p.t));
  assert.equal(rotunjeste3(rel.complet), 2.3);
});

test('determinism: același plan de două ori', () => {
  assert.equal(JSON.stringify(planDin(minim)), JSON.stringify(planDin(minim)));
});

test('avertismentul „sigla fără final” aparține verificării C07, nu lui C02', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-text-sigla-'));
  try {
    fs.mkdirSync(path.join(dir, 'resurse'));
    fs.writeFileSync(path.join(dir, 'resurse', 'sigla.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><rect width="400" height="100"/></svg>');
    const fara = planDin({ ...minim, sigla: 'resurse/sigla.svg', scene: minim.scene.slice(0, 2) }, { dirProiect: dir });
    assert.equal(fara.avertismente.length, 1);
    assert.equal(verificareaErorii(fara.avertismente[0]), 'C07');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scena final prea lungă de citit: sugestia scurtează textul, nu cere împărțirea (finalul e unic)', () => {
  const d = { eroare: 'nu-incape', minim: 10.4, maxim: 10 };
  const final = eroareDurata(d, { tip: 'final' }, 2, 5, true);
  assert.doesNotMatch(final.sugestie, /împarte|două scene/);
  assert.match(final.sugestie, /Scurtează/);
  const fraza = eroareDurata({ ...d, maxim: 8 }, { tip: 'fraza' }, 0, 5, false);
  assert.match(fraza.sugestie, /împarte-l în două scene/);
});
