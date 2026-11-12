import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { alegeTintaVerdict } from '../../nucleu/lib/garda/revizor.mjs';
import { numarFoaieNoua } from '../../nucleu/lib/randeaza/index.mjs';
import { textRandeaza } from '../../nucleu/mg.mjs';
import { stareRevizie } from '../../nucleu/lib/randeaza/runde.mjs';

const verdict = 'Verdict: REPARĂ\n\n- Scena 2: titlul se citește greu.\n';

function cuRevizii(fisiere) {
  return creeazaRadacinaTemp({ fisiere });
}

test('sub plafon: rundele folosite din fișiere, fără cerere de rundă în plus', () => {
  const t = cuRevizii({
    'video/p/cadre/revizie-1.md': verdict,
    'video/p/cadre/revizie-schita-1.md': verdict,
    'video/p/cadre/revizie-schita-2.md': verdict,
  });
  try {
    assert.deepEqual(stareRevizie(t.radacina, 'p'), {
      runde_scrise: 1, plafon: 3, peste_plafon: false, mesaj: 'Revizia vizuală: 1 din 3 runde complete folosite.',
    });
    assert.deepEqual(stareRevizie(t.radacina, 'p', { schita: true }), {
      runde_scrise: 2, plafon: 3, peste_plafon: false, mesaj: 'Revizia vizuală: 2 din 3 runde de schiță folosite.',
    });
    assert.equal(stareRevizie(t.radacina, 'nimeni').runde_scrise, 0);
  } finally {
    t.curata();
  }
});

test('la plafon (P1): randarea nu se refuză, mesajul cere predarea cu observațiile la vedere și numește cererea explicită', () => {
  const t = cuRevizii({
    'video/p/cadre/revizie-1.md': verdict,
    'video/p/cadre/revizie-2.md': verdict,
    'video/p/cadre/revizie-3.md': verdict,
  });
  try {
    const s = stareRevizie(t.radacina, 'p');
    assert.equal(s.runde_scrise, 3);
    assert.equal(s.plafon, 3);
    assert.equal(s.peste_plafon, true);
    assert.match(s.mesaj, /3 din 3 runde complete sunt folosite/);
    assert.match(s.mesaj, /observațiile nereparate ale revizorului la vedere; cursantul decide/);
    assert.match(s.mesaj, /„încă o rundă p”/);
    const schita = stareRevizie(t.radacina, 'p', { schita: true });
    assert.equal(schita.peste_plafon, false, 'schița are rundele ei (T3)');
  } finally {
    t.curata();
  }
});

test('o rundă cerută explicit (runde_suplimentare din motor.lock, B13) ridică plafonul, separat pe schiță', () => {
  const t = cuRevizii({
    'video/p/cadre/revizie-1.md': verdict,
    'video/p/cadre/revizie-2.md': verdict,
    'video/p/cadre/revizie-3.md': verdict,
    'video/p/cadre/revizie-schita-1.md': verdict,
    'video/p/cadre/revizie-schita-2.md': verdict,
    'video/p/cadre/revizie-schita-3.md': verdict,
    'video/p/motor.lock': JSON.stringify({ versiune: 1, runde_suplimentare: { complet: 1, schita: 0 } }) + '\n',
  });
  try {
    assert.deepEqual(stareRevizie(t.radacina, 'p'), {
      runde_scrise: 3, plafon: 4, peste_plafon: false, mesaj: 'Revizia vizuală: 3 din 4 runde complete folosite.',
    });
    const schita = stareRevizie(t.radacina, 'p', { schita: true });
    assert.equal(schita.peste_plafon, true);
    assert.match(schita.mesaj, /„încă o rundă schiță p”/);
  } finally {
    t.curata();
  }
});

test('N-ul foii complete: fără foi complete e 1; foile schiței, folderele schita-N și desene.png nu intră în număr', () => {
  const t = cuRevizii({
    'video/p/cadre/desene.png': 'x',
    'video/p/cadre/predare-1.png': 'x',
    'video/p/cadre/foaie-schita-1.jpg': 'x',
    'video/p/cadre/foaie-schita-1.json': '{}',
    'video/p/cadre/foaie-schita-2.jpg': 'x',
    'video/p/cadre/schita-1/frame-00-at-0.5s.png': 'x',
    'video/p/cadre/schita-3/frame-00-at-0.5s.png': 'x',
    'video/p/cadre/revizie-schita-1.md': verdict,
  });
  const cadre = join(t.radacina, 'video', 'p', 'cadre');
  try {
    assert.equal(numarFoaieNoua(cadre), 1, 'doar schiță în cadre/: prima foaie completă e 1');
    assert.equal(numarFoaieNoua(join(t.radacina, 'video', 'nimeni', 'cadre')), 1, 'fără folder cadre/');
  } finally {
    t.curata();
  }
});

test('N-ul foii complete e cel pe care hook-ul SubagentStop îl dă lui revizie-N.md', () => {
  const t = cuRevizii({
    'video/p/cadre/foaie-1.jpg': 'x',
    'video/p/cadre/foaie-1.json': '{}',
    'video/p/cadre/revizie-1.md': verdict,
    'video/p/cadre/foaie-schita-5.jpg': 'x',
    'video/p/cadre/schita-7/frame-00-at-0.5s.png': 'x',
    'video/p/cadre/desene.png': 'x',
  });
  const cadre = join(t.radacina, 'video', 'p', 'cadre');
  try {
    const n = numarFoaieNoua(cadre);
    assert.equal(n, 2, 'schita-7 și foaie-schita-5 nu împing numărul');
    // foaia nouă primește exact revizia pe care o scrie garda
    const fisiere = creeazaRadacinaTemp({ fisiere: { [`video/p/cadre/foaie-${n}.jpg`]: 'x', 'video/p/cadre/foaie-1.jpg': 'x', 'video/p/cadre/revizie-1.md': verdict } });
    try {
      const tinta = alegeTintaVerdict(fisiere.radacina);
      assert.equal(tinta.fisier, `video/p/cadre/revizie-${n}.md`);
    } finally {
      fisiere.curata();
    }
  } finally {
    t.curata();
  }
});

test('mg randeaza fără --json tipărește foaia rundei și mesajul rundelor de revizie (P1), după „Detalii în”', () => {
  const t = cuRevizii({ 'video/p/cadre/revizie-1.md': verdict, 'video/p/cadre/revizie-2.md': verdict, 'video/p/cadre/revizie-3.md': verdict });
  try {
    const revizie = stareRevizie(t.radacina, 'p');
    const text = textRandeaza({
      mod: 'complet', verificari: [{ cod: 'C16', ok: true }], verificari_lipsa: [], verificare: 'video/p/verificare.json',
      mp4: 'video/p/p.mp4', predare: ['video/p/cadre/predare-1.png'], foaie: 'video/p/cadre/foaie-1.jpg', revizie,
    });
    const randuri = text.trimEnd().split('\n');
    assert.ok(randuri.includes('Foaia de contact a rundei: video/p/cadre/foaie-1.jpg.'));
    assert.equal(randuri[randuri.length - 2], 'Detalii în video/p/verificare.json.');
    assert.equal(randuri[randuri.length - 1], revizie.mesaj);
    assert.doesNotMatch(textRandeaza({ mod: 'doar-verificare', verificari: [], verificare: 'v.json' }), /Revizia vizuală/);
  } finally {
    t.curata();
  }
});

test('schița: avertismentele check-ului la tranziții apar cu codul și mesajul lor, cel mult trei (felia 8)', () => {
  const gasiri = [
    { categorie: 'motion', severitate: 'warning', cod: 'w1', mesaj: 'primul' },
    { categorie: 'layout', severitate: 'error', cod: 'e1', mesaj: 'o eroare' },
    { categorie: 'motion', severitate: 'warning', cod: 'w2', mesaj: 'al doilea' },
    { categorie: 'lint', severitate: 'info', cod: 'w3' },
    { categorie: 'motion', severitate: 'warning', cod: 'w4', mesaj: 'al patrulea' },
  ];
  const text = textRandeaza({
    mod: 'schita', verificari: [], verificare: 'v.json',
    schita: { celule: 3, instantanee: 'i', foaie: 'f.jpg', check: { ok: false, erori: 1, avertismente: 4, gasiri } },
  });
  assert.match(text, /- avertisment motion\/w1: primul/);
  assert.match(text, /- avertisment motion\/w2: al doilea/);
  assert.match(text, /- avertisment lint\/w3: fără mesaj/);
  assert.doesNotMatch(text, /e1|w4/);
  assert.match(text, /- încă 1 avertisment\./);
  const fara = textRandeaza({
    mod: 'schita', verificari: [], verificare: 'v.json',
    schita: { celule: 3, instantanee: 'i', foaie: 'f.jpg', check: { ok: true, erori: 0, avertismente: 0, gasiri: [] } },
  });
  assert.doesNotMatch(fara, /- avertisment/);
});
