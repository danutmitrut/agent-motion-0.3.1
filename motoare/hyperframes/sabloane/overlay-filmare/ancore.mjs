// Ancorele (spec 7.4, „Calculul timpilor”; S02): fraza căutată fără diacritice, majuscule și punctuație, la a N-a apariție.
import { eroare, secundeCuZecimala as secunde } from '../../../../nucleu/lib/sdk.mjs';
import { cheieCuvant } from './text.mjs';

function chei(cuvinte) {
  const lista = [];
  cuvinte.forEach((c, i) => {
    if (c.ascuns) return;
    for (const bucata of c.text.split(/\s+/)) {
      const k = cheieCuvant(bucata);
      if (k) lista.push({ k, i, t: c.start });
    }
  });
  return lista;
}

function levenshtein(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const sus = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = sus;
    }
  }
  return d[b.length];
}

/**
 * @param {Array<{text: string, start: number, ascuns: boolean}>} cuvinte cuvintele corectate (aplicaCorecturi)
 * @param {string} fraza @param {number} [aparitia]
 */
export function gasesteFraza(cuvinte, fraza, aparitia = 1) {
  const k = chei(cuvinte);
  const f = fraza.split(/\s+/).map(cheieCuvant).filter(Boolean);
  let gasite = 0;
  for (let p = 0; f.length > 0 && p + f.length <= k.length; p++) {
    if (f.every((x, j) => k[p + j].k === x)) {
      gasite += 1;
      if (gasite === aparitia) return { gasita: true, t: k[p].t, de_la: k[p].i, pana_la: k[p + f.length - 1].i };
    }
  }
  const tinta = f.join(' ');
  const ferestre = [];
  const vazute = new Set();
  for (let p = 0; f.length > 0 && p + f.length <= k.length; p++) {
    const de = k[p].i;
    const pana = k[p + f.length - 1].i;
    const text = cuvinte.slice(de, pana + 1).filter((c) => !c.ascuns).map((c) => c.text).join(' ');
    if (vazute.has(`${de}-${pana}`)) continue;
    vazute.add(`${de}-${pana}`);
    ferestre.push({ text, t: k[p].t, d: levenshtein(tinta, k.slice(p, p + f.length).map((x) => x.k).join(' ')) });
  }
  ferestre.sort((a, b) => a.d - b.d || a.t - b.t);
  return { gasita: false, gasite, apropiate: ferestre.slice(0, 3).map(({ text, t }) => ({ text, t })) };
}

export function eroareAncora(camp, fraza, aparitia, r) {
  const unde = r.gasite > 0 ? `apare de ${r.gasite} ${r.gasite === 1 ? 'dată' : 'ori'}, nu de ${aparitia}` : 'nu apare în transcrierea corectată';
  const apropiate = r.apropiate.map((a) => `„${a.text}” (la ${secunde(a.t)} s)`).join(', ');
  return eroare('overlay-filmare-ancora', camp, `Fraza „${fraza}” ${unde}.${apropiate ? ` Cele mai apropiate: ${apropiate}.` : ''}`,
    'Scrie în ancora.fraza 1-6 cuvinte exact cum se aud în filmare (diacriticele, majusculele și punctuația nu contează), schimbă ancora.aparitia sau folosește la, cu secunda.');
}
