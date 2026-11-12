import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  grafeme, numarCuvinte, timpCitire, parseazaAccent, textAfisat,
  verificaTextDate, verificaTexteDate,
} from '../../nucleu/lib/text.mjs';
import { CODURI } from '../../nucleu/lib/erori.mjs';

const S_SEDILA = '\u{15F}';   // s cu sedilă
const T_SEDILA = '\u{163}';   // t cu sedilă
const LINIE_LUNGA = '\u{2014}';
const LINIE_MEDIE = '\u{2013}';
const EMOJI = '\u{1F600}';

test('grafeme numără literele cu diacritice o singură dată, și în NFC, și în NFD', () => {
  assert.equal(grafeme('ăî'), 2);
  const nfd = 'a\u{306}i\u{302}';
  assert.equal(nfd.length, 4);
  assert.equal(grafeme(nfd), 2);
  assert.equal(grafeme('Telefonul sună'), 14);
  assert.equal(grafeme(''), 0);
});

test('textAfisat scoate steluțele, numarCuvinte numără fără ele', () => {
  assert.equal(textAfisat('*din nou.*'), 'din nou.');
  assert.equal(numarCuvinte('Un agent  *preia* programările.'), 4);
  assert.equal(numarCuvinte('   '), 0);
});

test('timpCitire este 0,8 s plus 0,3 s pe cuvânt, rotunjit la 3 zecimale', () => {
  assert.equal(timpCitire('Telefonul sună'), 1.4);
  assert.equal(timpCitire('Un sistem *preia rutina.*'), 2);
  assert.equal(timpCitire('a b c'), 1.7);
  assert.equal(timpCitire(''), 0.8);
});

test('parseazaAccent împarte textul în segmente', () => {
  assert.deepEqual(parseazaAccent('*din nou.*'), { segmente: [{ text: 'din nou.', accent: true }], eroare: null });
  assert.deepEqual(parseazaAccent('Ai *timp* azi'), {
    segmente: [{ text: 'Ai ', accent: false }, { text: 'timp', accent: true }, { text: ' azi', accent: false }],
    eroare: null,
  });
  assert.deepEqual(parseazaAccent('fără accent'), { segmente: [{ text: 'fără accent', accent: false }], eroare: null });
  assert.equal(parseazaAccent('din *nou').eroare, 'accent-neinchis');
  assert.equal(parseazaAccent('un ** gol').eroare, 'accent-gol');
  assert.equal(parseazaAccent('* *').eroare, 'accent-gol');
});

test(`sedila: „${S_SEDILA}” dă eroarea sedila, cu reparația în sugestie`, () => {
  const r = verificaTextDate(`Lucrezi ${S_SEDILA}i sear${T_SEDILA}a`, 'scene[0].titlu[0]');
  assert.equal(r.erori.length, 1);
  assert.equal(r.erori[0].cod, 'sedila');
  assert.equal(r.erori[0].camp, 'scene[0].titlu[0]');
  assert.ok(r.erori[0].sugestie.includes('Lucrezi și searța'), r.erori[0].sugestie);
  assert.ok(r.erori[0].sugestie.includes('ș'));
  assert.ok(!r.erori[0].sugestie.includes(S_SEDILA));
});

test('liniuța lungă și cea medie dau liniuta-lunga', () => {
  for (const c of [LINIE_LUNGA, LINIE_MEDIE]) {
    const r = verificaTextDate(`Azi ${c} mâine`, 'scene[1].eticheta');
    assert.deepEqual(r.erori.map((e) => e.cod), ['liniuta-lunga']);
  }
});

test('emoji dă eroarea emoji', () => {
  const r = verificaTextDate(`Gata ${EMOJI}`, 'scene[0].cta');
  assert.deepEqual(r.erori.map((e) => e.cod), ['emoji']);
});

test('caracterele de cod și rândul nou dau text-cu-cod', () => {
  for (const t of ['<b>Salut</b>', 'a {x}', 'rând\nnou', 'tab\taici']) {
    const r = verificaTextDate(t, 'scene[0].titlu[0]', { permiteAccent: true });
    assert.deepEqual(r.erori.map((e) => e.cod), ['text-cu-cod'], t);
  }
});

test('steluța în etichetă dă text-cu-cod', () => {
  const r = verificaTextDate('*Luni*', 'scene[0].eticheta');
  assert.deepEqual(r.erori.map((e) => e.cod), ['text-cu-cod']);
});

test('accentul neînchis și accentul gol, doar unde accentul e permis', () => {
  const neinchis = verificaTextDate('din *nou', 'scene[3].titlu[0]', { permiteAccent: true });
  assert.deepEqual(neinchis.erori.map((e) => [e.cod, e.camp]), [['accent-neinchis', 'scene[3].titlu[0]']]);
  const gol = verificaTextDate('un ** gol', 'scene[3].titlu[1]', { permiteAccent: true });
  assert.deepEqual(gol.erori.map((e) => e.cod), ['accent-gol']);
  const bun = verificaTextDate('*din nou.*', 'scene[0].titlu[1]', { permiteAccent: true });
  assert.deepEqual(bun.erori, []);
});

test('cuvintele uzuale fără diacritice dau doar avertismentul fara-diacritice', () => {
  const r = verificaTextDate('si fara grabă', 'scene[0].titlu[0]');
  assert.deepEqual(r.erori, []);
  assert.equal(r.avertismente.length, 1);
  assert.equal(r.avertismente[0].cod, 'fara-diacritice');
  assert.ok(r.avertismente[0].mesaj.includes('si, fara'));
  assert.ok(r.avertismente[0].sugestie.includes('și, fără'));
  assert.deepEqual(verificaTextDate('și fără grabă', 'scene[0].titlu[0]').avertismente, []);
  assert.deepEqual(verificaTextDate('Simplu, sigur', 'scene[0].titlu[0]').avertismente, []);
});

test('textul curat nu dă nimic', () => {
  assert.deepEqual(verificaTextDate('Scrie „AGENT” în comentarii', 'scene[4].cta'), { erori: [], avertismente: [] });
});

test('verificaTexteDate întoarce RezultatVerificare C03', () => {
  const r = verificaTexteDate({}, [
    { camp: 'scene[0].eticheta', text: 'Luni, 8:30', permiteAccent: false },
    { camp: 'scene[0].titlu[1]', text: 'din *nou', permiteAccent: true },
    { camp: 'scene[1].titlu[0]', text: 'si gata', permiteAccent: true },
  ]);
  assert.equal(r.cod, 'C03');
  assert.equal(r.ok, false);
  assert.equal(r.camp, 'scene[0].titlu[1]');
  assert.deepEqual(r.erori.map((e) => e.cod), ['accent-neinchis']);
  assert.deepEqual(r.avertismente.map((e) => e.cod), ['fara-diacritice']);
  assert.deepEqual(r.valoare, { texte: 3 });
  const curat = verificaTexteDate({}, [{ camp: 'scene[0].titlu[0]', text: 'Gata.' }]);
  assert.equal(curat.ok, true);
  assert.equal(curat.camp, null);
});

test('codurile C03 sunt înregistrate în erori.mjs cu nivelul corect', () => {
  for (const cod of ['sedila', 'liniuta-lunga', 'emoji', 'text-cu-cod', 'accent-neinchis', 'accent-gol']) {
    assert.equal(CODURI[cod]?.nivel, 'eroare', cod);
    assert.equal(CODURI[cod]?.verificare, 'C03', cod);
  }
  assert.equal(CODURI['fara-diacritice']?.nivel, 'avertisment');
  assert.equal(CODURI['fara-diacritice']?.verificare, 'C03');
});
