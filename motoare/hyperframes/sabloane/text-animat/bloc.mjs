// Blocul „Ce apare pe ecran” al lui text-animat (hook-ul blocScenariu din docs/interfete/sablon.md).
// Câte o linie pe câmpul de text, cu textul exact de pe ecran (eticheta cu prefixul și majusculele temei, citatul cu
// ghilimelele puse de șablon, cifra formatată), fontul și greutatea cu care se desenează (C05 le grupează pe font).
// Zona „Texte și cifre” intră în hash-ul aprobării (C08): o schimbare aici cere o aprobare nouă.
import { secundeCuZecimala as secunde, textAfisat, valoriStil } from '../../../../nucleu/lib/sdk.mjs';
import { etichetaAfisata, greutateTitlu } from './asezare.mjs';
import { textCifra } from './cifre.mjs';

const TEME = Object.freeze({ noapte: 'noapte', hartie: 'hârtie', curat: 'curat', contrast: 'contrast' });
const SURSE = Object.freeze({ date: 'din date', brand: 'din brand', tema: 'din temă', implicit: 'implicit', calculat: 'calculat' });
const ATMOSFERE = Object.freeze({ ceata: 'ceață', plin: 'plin', degrade: 'degradeu' });
const TIPURI = Object.freeze({ titlu: 'titlu', fraza: 'frază', cuvinte: 'cuvinte', lista: 'listă', cifra: 'cifră', citat: 'citat', final: 'final' });

function liniiScena(s, i, stilPlat, gt) {
  const ref = `Scena ${i + 1}`;
  const b = `scene[${i}]`;
  const TITLU = { font: 'titlu', greutate: gt };
  const TEXT = { font: 'text', greutate: 500 };
  const linii = [];
  const linie = (camp, eticheta, sursa, font, { afisat = textAfisat(sursa), separat = false } = {}) => {
    linii.push({ ref, camp: `${b}.${camp}`, eticheta, text: afisat, accent: sursa.includes('*'), separat, ...font });
  };
  const titlu = () => (s.titlu ?? []).forEach((t, j) => linie(`titlu[${j}]`, `titlu, rândul ${j + 1}`, t, TITLU));
  if (s.eticheta !== undefined) linie('eticheta', 'eticheta', s.eticheta, TEXT, { afisat: etichetaAfisata(s.eticheta, stilPlat.eticheta) });
  switch (s.tip) {
    case 'titlu':
      titlu();
      break;
    case 'fraza':
      linie('text', 'frază', s.text, TITLU);
      break;
    case 'cuvinte':
      titlu();
      linie('cuvinte', 'cuvinte', s.cuvinte.join('\n'), TITLU, { afisat: s.cuvinte.map(textAfisat).join('\n'), separat: true });
      break;
    case 'lista':
      titlu();
      s.puncte.forEach((t, j) => linie(`puncte[${j}]`, `punctul ${j + 1}`, t, TEXT));
      break;
    case 'cifra':
      linie('valoare', 'cifra', '', TITLU, { afisat: textCifra(s) });
      linie('text', 'textul', s.text, TEXT);
      if (s.sursa !== undefined) linie('sursa', 'sursa', s.sursa, TEXT);
      break;
    case 'citat':
      linie('text', 'citat', s.text, TEXT, { afisat: `„${textAfisat(s.text)}”` });
      linie('autor', 'autor', s.autor, TEXT);
      if (s.rol !== undefined) linie('rol', 'rol', s.rol, TEXT);
      break;
    case 'final':
      titlu();
      if (s.cta !== undefined) linie('cta', 'îndemn', s.cta, TEXT);
      if (s.detaliu !== undefined) linie('detaliu', 'detaliu', s.detaliu, TEXT);
      break;
    default:
      break;
  }
  return linii;
}

function liniiStil(stil, stilPlat, plan, cronologie) {
  const c = stil.culori;
  const sursa = (camp) => SURSE[camp.sursa] ?? camp.sursa;
  const linii = [
    `Tema: ${TEME[stilPlat.tema] ?? stilPlat.tema}; accent ${c.accent.valoare} (${sursa(c.accent)}); fundal ${c.fundal.valoare} (${sursa(c.fundal)})`,
    `Ritm: ${stilPlat.ritm}; atmosferă: ${ATMOSFERE[stilPlat.atmosfera] ?? stilPlat.atmosfera}; aliniere: ${plan.aliniere}; format: ${plan.format} ${plan.latime}x${plan.inaltime}`,
  ];
  if (plan.sigla) linii.push(`Sigla: ${plan.sigla.w}x${plan.sigla.h} px, în scena final`);
  for (const s of cronologie.segmente) {
    linii.push(`${s.ref} (${TIPURI[s.tip] ?? s.tip}): ${secunde(s.start)}-${secunde(s.sfarsit)} s, complet la ${secunde(s.complet)} s`);
  }
  return linii;
}

/**
 * @param {object} date @param {object} stil StilRezolvat @param {{segmente: object[]}} cronologie
 * @param {{intern: object, sablon: {implicite: object}}} ctx intern = planul (din cronologie())
 * @returns {{texte: object[], stil: string[]}}
 */
export function blocScenariu(date, stil, cronologie, ctx) {
  const stilPlat = valoriStil(stil);
  const gt = greutateTitlu(stilPlat.font_titlu, ctx.sablon.implicite);
  return {
    texte: date.scene.flatMap((s, i) => liniiScena(s, i, stilPlat, gt)),
    stil: liniiStil(stil, stilPlat, ctx.intern, cronologie),
  };
}
