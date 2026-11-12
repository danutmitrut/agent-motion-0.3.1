// Blocul „Ce apare pe ecran” al reelului (hook-ul blocScenariu din docs/interfete/sablon.md; planul E, M1).
// Mutat din nucleu (liniiTexte și liniiStil din nucleu/lib/randeaza/index.mjs) fără nicio schimbare de text:
// zona „Texte și cifre” intră în hash-ul aprobării (C08), deci rămâne identică byte cu byte.
import { secundeCuZecimala as secunde } from '../../../../nucleu/lib/sdk.mjs';

/** @typedef {{eticheta: string|null, separat: boolean, text?: string, font?: string, greutate?: number}} LinieText
 *  Forma din nucleu/lib/scenariu.mjs (docs/interfete/sablon.md); aici doar pentru tipuri, fără import din nucleu în afara sdk.mjs. */

const TEME = Object.freeze({ noapte: 'noapte', hartie: 'hârtie', curat: 'curat' });
const SURSE = Object.freeze({ date: 'din date', brand: 'din brand', tema: 'din temă', implicit: 'implicit', calculat: 'calculat' });
const ATMOSFERE = Object.freeze({ ceata: 'ceață', plin: 'plin' });

// Fontul și greutatea din sablon.html (M7, C05): titlurile și cuvintele titlu/700, eticheta și îndemnul text/500, semnătura text/400.
const TITLU = Object.freeze({ font: 'titlu', greutate: 700 });
const ETICHETA = Object.freeze({ font: 'text', greutate: 500 });
const SEMNATURA = Object.freeze({ font: 'text', greutate: 400 });

/**
 * Zona „Texte și cifre”, din planul reelului: exact textele pe care compileaza.mjs le pune pe ecran.
 * @param {object} date date.json
 * @param {object} plan planul reelului (intern, din cronologie)
 * @returns {LinieText[]}
 */
function liniiTexte(date, plan) {
  const texte = [];
  for (const c of [...plan.carduri].sort((a, b) => a.scena - b.scena)) {
    const ref = `Scena ${c.scena + 1}`;
    const baza = `scene[${c.scena}]`;
    if (c.eticheta) texte.push({ ref, camp: `${baza}.eticheta`, eticheta: 'eticheta', text: c.eticheta, accent: false, separat: false, ...ETICHETA });
    if (c.cuvinte) {
      // fiecare cuvânt apare pe ecran singur, deci fiecare are ghilimelele lui
      texte.push({ ref, camp: `${baza}.cuvinte`, eticheta: 'cuvinte', text: c.cuvinte.map((w) => w.text).join('\n'), accent: false, separat: true, ...TITLU });
    } else {
      // un card doar cu etichetă are randuri null (ca în compileaza.mjs)
      (c.randuri ?? []).forEach((r, j) => texte.push({
        ref, camp: `${baza}.titlu[${j}]`, eticheta: `titlu, rândul ${j + 1}`, text: r.text, accent: r.accent === true, separat: false, ...TITLU,
      }));
    }
  }
  if (plan.cta) {
    const i = date.scene.findIndex((s) => typeof s.cta === 'string');
    texte.push({ ref: `Scena ${i + 1}`, camp: `scene[${i}].cta`, eticheta: 'îndemn', text: plan.cta.text, accent: false, separat: false, ...ETICHETA });
  }
  if (plan.semnatura) {
    // '\n' e rândul nou al aceluiași text: „Ana Pop, / coach de carieră”
    texte.push({ ref: 'Semnătura', camp: 'semnatura', eticheta: null, text: plan.semnatura.text, accent: false, separat: false, ...SEMNATURA });
  }
  return texte;
}

/** Zona „Stil și timpi”, informativă: stilul rezolvat în cuvinte și fereastra fiecărei scene. */
function liniiStil(date, stil, cronologie) {
  const c = stil.culori;
  const sursa = (camp) => SURSE[camp.sursa] ?? camp.sursa;
  const linii = [
    `Tema: ${TEME[stil.tema.valoare] ?? stil.tema.valoare}; accent ${c.accent.valoare} (${sursa(c.accent)}); linie ${c.linie.valoare} (${sursa(c.linie)})`,
    `Ritm: ${stil.ritm.valoare}; atmosferă: ${ATMOSFERE[stil.atmosfera.valoare] ?? stil.atmosfera.valoare}`,
  ];
  for (const s of cronologie.segmente) {
    const indice = /^scene\[(\d+)\]$/.exec(s.camp)?.[1];
    const scena = indice === undefined ? null : date.scene[Number(indice)];
    const detalii = [s.tip];
    if (scena?.desen?.id) detalii.push(scena.desen.id);
    if (scena?.desen?.marime) detalii.push(scena.desen.marime);
    linii.push(`${s.ref} (${detalii.join(', ')}): ${secunde(s.start)}-${secunde(s.sfarsit)} s, complet la ${secunde(s.complet)} s`);
  }
  return linii;
}

/**
 * Hook-ul blocScenariu: textele din planul reelului (ctx.intern) și rândurile de stil și timpi.
 * @param {object} date @param {object} stil @param {{segmente: object[]}} cronologie @param {{intern: object}} ctx
 * @returns {{texte: LinieText[], stil: string[]}}
 */
export function blocScenariu(date, stil, cronologie, ctx) {
  return { texte: liniiTexte(date, ctx.intern), stil: liniiStil(date, stil, cronologie) };
}
