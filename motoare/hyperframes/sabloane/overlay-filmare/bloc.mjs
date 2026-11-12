// Blocul „Ce apare pe ecran” al lui overlay-filmare (hook-ul blocScenariu din docs/interfete/sablon.md; decizia 5).
// Câte o linie pe fiecare text al fiecărui element, cu textul exact de pe ecran (eticheta cu majusculele temei, citatul
// între ghilimele, cifra formatată), apoi câte o linie pe grupul de subtitrare, după corecturi. Fontul și greutatea
// spun cu ce se desenează textul (C05). Zona „Texte și cifre” intră în hash-ul aprobării (C08): o corectură nouă cere
// o aprobare nouă.
import { secundeCuZecimala as secunde, valoriStil } from '../../../../nucleu/lib/sdk.mjs';
import { cereriElement } from './tipuri.mjs';
import { idElement } from './timp.mjs';

const TEME = Object.freeze({ noapte: 'noapte', hartie: 'hârtie', curat: 'curat' });
const TIPURI = Object.freeze({ titlu: 'titlu', nume: 'nume', cifra: 'cifră', citat: 'citat', lista: 'listă', final: 'final', filmare: 'filmare' });
const ETICHETE = Object.freeze({
  eticheta: 'eticheta', titlu: 'titlu', nume: 'nume', rol: 'rol', cifra: 'cifra', text_cifra: 'textul', citat: 'citat', autor: 'autor',
  lista_titlu: 'titlul listei', punct: 'punct', cta: 'îndemn', detaliu: 'detaliu',
});

function liniiElement(d, i, plan, implicite, eticheta) {
  const ref = idElement(d, i);
  return cereriElement(d, `elemente[${i}]`, eticheta).map((c) => {
    const R = implicite.roluri[c.rol];
    return {
      ref, camp: c.camp, eticheta: c.k !== undefined ? `punctul ${c.k + 1}` : ETICHETE[c.rol], text: c.text, accent: false, separat: false,
      font: R.font, greutate: R.font === 'titlu' ? plan.greutate_titlu : R.greutate,
    };
  });
}

function liniiSubtitrari(plan) {
  return plan.subtitrari.grupuri.map((g) => ({
    ref: `Subtitrare ${g.n}`, camp: 'subtitrari', eticheta: null,
    text: g.cuvinte.map((c) => c.text).join(' '), accent: false, separat: false, font: 'titlu', greutate: plan.greutate_titlu,
  }));
}

function liniiStil(stil, stilPlat, plan, cronologie) {
  const s = plan.subtitrari;
  const linii = [
    `Tema: ${TEME[stilPlat.tema] ?? stilPlat.tema}; accent ${stilPlat.culori.accent}; carduri ${stilPlat.culori.fundal} la ${Math.round(plan.opacitate_fundal * 100)}%`,
    `Ritm: ${stilPlat.ritm}; format: ${plan.format} ${plan.latime}x${plan.inaltime}, ${plan.fps} fps`,
    `Filmarea: de la ${secunde(plan.start)} s, ${secunde(plan.durata)} s, decupată la ${plan.focus_x}%`,
    s.activ
      ? `Subtitrări: ${s.animatie === 'cuvant-activ' ? 'cuvântul activ' : 'pe grup'}, ${s.pozitie}, ${s.marime} px${s.majuscule ? ', cu majuscule' : ''}; ${s.grupuri.length} grupuri`
      : 'Subtitrări: oprite',
  ];
  for (const seg of cronologie.segmente) {
    if (seg.texte.length === 0) continue;
    linii.push(`${seg.ref} (${TIPURI[seg.tip] ?? seg.tip}, banda ${seg.banda}): ${secunde(seg.start)}-${secunde(seg.sfarsit)} s, complet la ${secunde(seg.complet)} s`);
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
  const plan = ctx.intern;
  const implicite = ctx.sablon.implicite;
  return {
    texte: [...(date.elemente ?? []).flatMap((d, i) => liniiElement(d, i, plan, implicite, stilPlat.eticheta)), ...liniiSubtitrari(plan)],
    stil: liniiStil(stil, stilPlat, plan, cronologie),
  };
}
