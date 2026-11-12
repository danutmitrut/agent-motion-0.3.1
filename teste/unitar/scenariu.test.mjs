// Blocul „Ce apare pe ecran”: generarea, înlocuirea și hash-ul zonei „Texte și cifre” (spec 6.9, harta 4.14 și 5.11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  extrageBlocMg, inlocuiesteBlocMg, extrageZonaTexte, normalizeazaZona, hashZonaTexte, genereazaBloc, scheletScenariu,
  valideazaLiniiText, MARCAJ_START, MARCAJ_SFARSIT, TITLU_BLOC, TITLU_TEXTE, TITLU_STIL,
} from '../../nucleu/lib/scenariu.mjs';

// Exemplul 02 (spec 7.1), primele texte ale fiecărui tip, ca în harta 5.11.
const TEXTE_02 = [
  { ref: 'Scena 1', camp: 'scene[0].eticheta', eticheta: 'eticheta', text: 'LUNI, 8:30', accent: false, separat: false },
  { ref: 'Scena 1', camp: 'scene[0].titlu[0]', eticheta: 'titlu, rândul 1', text: 'Telefonul sună', accent: false, separat: false },
  { ref: 'Scena 1', camp: 'scene[0].titlu[1]', eticheta: 'titlu, rândul 2', text: 'din nou.', accent: true, separat: false },
  { ref: 'Scena 2', camp: 'scene[1].cuvinte', eticheta: 'cuvinte', text: 'Reprogramări.\nAnulări.\nMesaje.', accent: false, separat: true },
  { ref: 'Scena 5', camp: 'scene[4].cta', eticheta: 'îndemn', text: 'Scrie „AGENT” în comentarii', accent: false, separat: false },
  { ref: 'Semnătura', camp: 'semnatura', eticheta: null, text: 'Ana Pop,\ncoach de carieră', accent: false, separat: false },
];
const STIL_02 = [
  'Tema: hârtie; accent #D9486A (din date); linie #2A2420 (implicit)',
  'Ritm: normal; atmosferă: ceață',
  'Scena 1 (desen, od-running, mare): 0,0-4,0 s, complet la 2,15 s',
];
const BLOC_02 = `<!-- mg:start -->
## Ce apare pe ecran

### Texte și cifre
- Scena 1, eticheta: „LUNI, 8:30”
- Scena 1, titlu, rândul 1: „Telefonul sună”
- Scena 1, titlu, rândul 2 (accent): „din nou.”
- Scena 2, cuvinte: „Reprogramări.” / „Anulări.” / „Mesaje.”
- Scena 5, îndemn: „Scrie „AGENT” în comentarii”
- Semnătura: „Ana Pop, / coach de carieră”

### Stil și timpi
- Tema: hârtie; accent #D9486A (din date); linie #2A2420 (implicit)
- Ritm: normal; atmosferă: ceață
- Scena 1 (desen, od-running, mare): 0,0-4,0 s, complet la 2,15 s
<!-- mg:end -->`;

test('genereazaBloc pe exemplul 02 dă exact forma din harta 5.11', () => {
  assert.equal(genereazaBloc({ texte: TEXTE_02, stil: STIL_02 }), BLOC_02);
});

test('genereazaBloc fără texte și fără stil dă blocul gol al scheletului', () => {
  const gol = extrageBlocMg(scheletScenariu('p', 2)).bloc;
  assert.equal(genereazaBloc({ texte: [], stil: [] }), gol);
});

test('inlocuiesteBlocMg schimbă doar blocul și păstrează textul din jur', () => {
  const inainte = scheletScenariu('programari', 2);
  const dupa = inlocuiesteBlocMg(inainte, BLOC_02);
  assert.equal(extrageBlocMg(dupa).bloc, BLOC_02);
  assert.equal(dupa.slice(0, extrageBlocMg(inainte).inceput), inainte.slice(0, extrageBlocMg(inainte).inceput));
  assert.ok(dupa.endsWith(`${BLOC_02}\n`));
  assert.equal(inlocuiesteBlocMg(dupa, BLOC_02), dupa, 'a doua înlocuire cu același bloc nu schimbă nimic');
});

test('inlocuiesteBlocMg adaugă blocul la final, după o linie goală, dacă lipsește', () => {
  assert.equal(inlocuiesteBlocMg('# Scenariu: p\n\nText liber.\n\n\n', 'BLOC'), '# Scenariu: p\n\nText liber.\n\nBLOC\n');
  assert.equal(inlocuiesteBlocMg('', 'BLOC'), 'BLOC\n');
});

test('extrageZonaTexte ia doar liniile dintre cele două titluri', () => {
  assert.equal(extrageZonaTexte(BLOC_02), [
    '- Scena 1, eticheta: „LUNI, 8:30”',
    '- Scena 1, titlu, rândul 1: „Telefonul sună”',
    '- Scena 1, titlu, rândul 2 (accent): „din nou.”',
    '- Scena 2, cuvinte: „Reprogramări.” / „Anulări.” / „Mesaje.”',
    '- Scena 5, îndemn: „Scrie „AGENT” în comentarii”',
    '- Semnătura: „Ana Pop, / coach de carieră”',
    '',
  ].join('\n'));
  assert.equal(extrageZonaTexte('fără titluri'), '');
});

test('normalizeazaZona: NFC, LF, fără spații la final de rând și fără linii goale la capete', () => {
  const descompus = 'Ta\u{306}'; // „Tă” scris cu semn combinant (a + U+0306)
  assert.equal(normalizeazaZona(`\r\n\r\n- ${descompus}   \r\n- b\t\r\n\r\n`), '- Tă\n- b');
});

test('hashZonaTexte ignoră spațiile de la final și liniile goale, dar nu și textul', () => {
  const asteptat = createHash('sha256').update(normalizeazaZona(extrageZonaTexte(BLOC_02)), 'utf8').digest('hex');
  assert.equal(hashZonaTexte(BLOC_02), asteptat);
  const cuSpatii = BLOC_02.replace('„Telefonul sună”', '„Telefonul sună”   ').replace('### Texte și cifre\n', '### Texte și cifre\n\n');
  assert.equal(hashZonaTexte(cuSpatii), asteptat);
  assert.equal(hashZonaTexte(BLOC_02.replace('\n', '\r\n')), asteptat);
  assert.notEqual(hashZonaTexte(BLOC_02.replace('8:30', '9:30')), asteptat);
  const stilSchimbat = BLOC_02.replace('Ritm: normal', 'Ritm: alert');
  assert.equal(hashZonaTexte(stilSchimbat), asteptat, 'zona „Stil și timpi” e informativă și nu intră în hash');
});

test('M1: genereazaBloc formatează din câmpuri, fără cazuri speciale pe ref', () => {
  const bloc = genereazaBloc({
    texte: [
      { ref: 'Scena 1', camp: 'a', eticheta: 'titlu, rândul 1', text: 'Un sistem', accent: true, separat: false },
      { ref: 'Scena 2', camp: 'b', eticheta: 'cuvinte', text: 'unu\ndoi', accent: false, separat: true },
      { ref: 'Semnătura', camp: 'semnatura', eticheta: null, text: 'Ana Pop,\ncoach', accent: false, separat: false },
      { ref: 'Elementul 1', camp: 'c', eticheta: null, text: 'Simplu', accent: false, separat: false },
    ],
    stil: ['Tema: noapte'],
  });
  assert.equal(bloc, [
    MARCAJ_START, TITLU_BLOC, '', TITLU_TEXTE,
    '- Scena 1, titlu, rândul 1 (accent): „Un sistem”',
    '- Scena 2, cuvinte: „unu” / „doi”',
    '- Semnătura: „Ana Pop, / coach”',
    '- Elementul 1: „Simplu”',
    '', TITLU_STIL, '- Tema: noapte', MARCAJ_SFARSIT,
  ].join('\n'));
});

test('M1: valideazaLiniiText refuză o linie fără separat, cu cheie necunoscută sau cu font greșit', () => {
  const bun = { ref: 'R', camp: 'c', eticheta: null, text: 't', accent: false, separat: false };
  assert.deepEqual(valideazaLiniiText([bun]), [bun]);
  assert.throws(() => valideazaLiniiText([{ ...bun, separat: undefined }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, altceva: 1 }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, font: 'serif' }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, text: '' }]), TypeError);
});

test('M1: valideazaLiniiText acceptă font și greutate valide și refuză restul formelor greșite', () => {
  const bun = { ref: 'R', camp: 'c', eticheta: 'titlu', text: 't', accent: true, separat: true, font: 'titlu', greutate: 700 };
  assert.deepEqual(valideazaLiniiText([bun, { ...bun, font: 'text', greutate: 100 }]), [bun, { ...bun, font: 'text', greutate: 100 }]);
  assert.deepEqual(valideazaLiniiText([]), []);
  assert.throws(() => valideazaLiniiText('nu e listă'), TypeError);
  assert.throws(() => valideazaLiniiText([null]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, ref: '' }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, camp: 3 }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, eticheta: '' }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, eticheta: undefined }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, accent: 'da' }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, greutate: 950 }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, greutate: 50 }]), TypeError);
  assert.throws(() => valideazaLiniiText([{ ...bun, greutate: 400.5 }]), TypeError);
});
