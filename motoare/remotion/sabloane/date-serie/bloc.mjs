// Blocul „Ce apare pe ecran” al lui date-serie (hook-ul blocScenariu din docs/interfete/sablon.md). Câte o linie pe
// câmpul de text, cu textul exact de pe ecran (eticheta cu majusculele temei, valorile formatate românește cu
// prefixul și sufixul lor) și fontul cu care se desenează (C05 le grupează pe font și greutate). Liniile vin din date,
// nu din așezare: rândurile rupte automat (subtitlul, textul cifrei, sursa) depind de font, iar zona „Texte și cifre”
// intră în hash-ul aprobării (C08), deci o schimbare de temă nu cere o aprobare nouă.
import { secundeCuZecimala as secunde, valoriStil } from '../../../../nucleu/lib/sdk.mjs';
import { etichetaAfisata, orientareBare } from './asezare.mjs';
import { textValoare } from './src/comun/numere.mjs';
import { zecimaleScena } from './reguli.mjs';
import * as Z from './src/comun/zone.mjs';

const TEME = Object.freeze({ noapte: 'noapte', hartie: 'hârtie', curat: 'curat' });
const SURSE = Object.freeze({ date: 'din date', brand: 'din brand', tema: 'din temă', implicit: 'implicit', calculat: 'calculat' });
const ATMOSFERE = Object.freeze({ ceata: 'ceață', plin: 'plin', degrade: 'degradeu' });
const TIPURI = Object.freeze({ titlu: 'titlu', cifra: 'cifră', bare: 'bare', comparatie: 'comparație', final: 'final' });
const ORIENTARI = Object.freeze({ coloane: 'coloane', orizontal: 'bare orizontale' });

const TITLU = Object.freeze({ font: 'titlu', greutate: Z.GREUTATE.titlu });
const TEXT = Object.freeze({ font: 'text', greutate: Z.GREUTATE.text });
const TARE = Object.freeze({ font: 'text', greutate: Z.GREUTATE.tare });

function liniiScena(s, i, stilPlat) {
  const ref = `Scena ${i + 1}`;
  const b = `scene[${i}]`;
  const linii = [];
  const linie = (camp, eticheta, text, font, accent = false) => linii.push({ ref, camp: `${b}.${camp}`, eticheta, text, accent, separat: false, ...font });
  if (s.eticheta !== undefined) linie('eticheta', 'eticheta', etichetaAfisata(s.eticheta, stilPlat.eticheta), TARE);
  (s.titlu ?? []).forEach((t, j) => linie(`titlu[${j}]`, `titlu, rândul ${j + 1}`, t, TITLU));
  switch (s.tip) {
    case 'titlu':
      if (s.subtitlu !== undefined) linie('subtitlu', 'subtitlu', s.subtitlu, TEXT);
      break;
    case 'cifra':
      linie('valoare', 'cifra', textValoare(s), TITLU);
      linie('text', 'textul', s.text, TEXT);
      break;
    case 'bare': {
      if (s.unitate !== undefined) linie('unitate', 'unitatea', s.unitate, TEXT);
      const z = zecimaleScena(s);
      s.valori.forEach((v, k) => {
        const accent = v.eticheta === s.evidentiaza;
        linie(`valori[${k}].eticheta`, `bara ${k + 1}`, v.eticheta, TEXT);
        linie(`valori[${k}].valoare`, `bara ${k + 1}, valoarea`, textValoare({ ...v, zecimale: z }), TARE, accent);
      });
      if (s.sursa !== undefined) linie('sursa', 'sursa', s.sursa, TEXT);
      break;
    }
    case 'comparatie': {
      const z = zecimaleScena(s);
      s.valori.forEach((v, k) => {
        const accent = v.eticheta === s.evidentiaza;
        linie(`valori[${k}].eticheta`, `comparația, rândul ${k + 1}`, v.eticheta, TEXT);
        linie(`valori[${k}].valoare`, `comparația, valoarea ${k + 1}`, textValoare({ ...v, zecimale: z }), TITLU, accent);
      });
      break;
    }
    case 'final':
      if (s.cta !== undefined) linie('cta', 'îndemn', s.cta, TARE);
      break;
    default:
      break;
  }
  return linii;
}

function liniiStil(date, stil, stilPlat, cronologie, asezare) {
  const c = stil.culori;
  const sursa = (camp) => SURSE[camp.sursa] ?? camp.sursa;
  const linii = [
    `Tema: ${TEME[stilPlat.tema] ?? stilPlat.tema}; accent ${c.accent.valoare} (${sursa(c.accent)}); fundal ${c.fundal.valoare} (${sursa(c.fundal)})`,
    `Atmosferă: ${ATMOSFERE[stilPlat.atmosfera] ?? stilPlat.atmosfera}; format: vertical 1080x1920, 30 fps; tranziție de 0,4 s între scene`,
  ];
  if (asezare?.sigla) linii.push(`Sigla: ${asezare.sigla.latime}x${asezare.sigla.inaltime} px, în scena final`);
  cronologie.segmente.forEach((s, i) => {
    const sc = date.scene[i];
    const extra = sc.tip === 'bare' ? `, ${ORIENTARI[orientareBare(sc)]}` : '';
    linii.push(`${s.ref} (${TIPURI[s.tip] ?? s.tip}${extra}): ${secunde(s.start)}-${secunde(s.sfarsit)} s, complet la ${secunde(s.complet)} s`);
  });
  return linii;
}

/**
 * @param {object} date @param {object} stil StilRezolvat @param {{segmente: object[]}} cronologie
 * @param {{intern?: {asezare?: object}}} ctx intern din cronologie() (pentru sigla)
 * @returns {{texte: object[], stil: string[]}}
 */
export function blocScenariu(date, stil, cronologie, ctx = {}) {
  const stilPlat = valoriStil(stil);
  return {
    texte: date.scene.flatMap((s, i) => liniiScena(s, i, stilPlat)),
    stil: liniiStil(date, stil, stilPlat, cronologie, ctx.intern?.asezare ?? null),
  };
}
