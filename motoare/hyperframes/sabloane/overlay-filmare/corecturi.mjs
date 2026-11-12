// Corecturile transcrierii (spec 7.4, „Subtitrările și corecturile”; S03): intervale de cuvinte wN sau wN-wM, cel mult 4,
// fără suprapuneri; `din` e textul actual (fără majuscule și punctuație), `in` textul nou; timpii nu se schimbă.
import { eroare } from '../../../../nucleu/lib/sdk.mjs';
import { curat } from './text.mjs';

const MAX_CUVINTE = 4;
const SUGESTIE_DIN = 'Scrie în din textul exact al acelor cuvinte din video/<proiect>/active/transcriere.json (majusculele și punctuația nu contează).';
const SUGESTIE_CUVINTE = 'Scrie cuvinte ca wN sau wN-wM (N ≤ M, cel mult 4 cuvinte), cu id-uri din active/transcriere.json, fără să se suprapună cu altă corectură.';

const interval = (s) => {
  const m = /^w(\d+)(?:-w(\d+))?$/.exec(s);
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
};
const textCurat = (cuvinte) => cuvinte.map((c) => curat(c.text)).filter(Boolean).join(' ');

/**
 * @param {Array<{id: string, text: string, start: number, end: number, fraza?: number}>} cuvinte transcrierea normalizată
 * @param {Array<{cuvinte: string, din: string, in: string}>} corecturi
 */
export function aplicaCorecturi(cuvinte, corecturi = []) {
  const erori = [];
  const ocupate = new Map();
  const valide = [];
  corecturi.forEach((c, i) => {
    const camp = `corecturi[${i}]`;
    const iv = interval(c.cuvinte);
    if (!iv || iv[0] > iv[1] || iv[1] >= cuvinte.length) {
      erori.push(eroare('overlay-filmare-corectura', `${camp}.cuvinte`, `${camp}: „${c.cuvinte}” nu numește cuvinte din transcriere (are ${cuvinte.length} cuvinte, w0-w${cuvinte.length - 1}).`, SUGESTIE_CUVINTE));
      return;
    }
    if (iv[1] - iv[0] + 1 > MAX_CUVINTE) {
      erori.push(eroare('overlay-filmare-corectura', `${camp}.cuvinte`, `${camp}: intervalul ${c.cuvinte} are ${iv[1] - iv[0] + 1} cuvinte; o corectură are cel mult ${MAX_CUVINTE}.`, SUGESTIE_CUVINTE));
      return;
    }
    const peste = [];
    for (let k = iv[0]; k <= iv[1]; k++) if (ocupate.has(k)) peste.push(ocupate.get(k));
    if (peste.length > 0) {
      erori.push(eroare('overlay-filmare-corectura', `${camp}.cuvinte`, `${camp}: ${c.cuvinte} se suprapune cu corecturi[${peste[0]}].`, SUGESTIE_CUVINTE));
      return;
    }
    const bucata = cuvinte.slice(iv[0], iv[1] + 1);
    if (textCurat(bucata) !== c.din.split(/\s+/).map(curat).filter(Boolean).join(' ')) {
      erori.push(eroare('overlay-filmare-corectura', `${camp}.din`, `${camp}: cuvintele ${c.cuvinte} sunt acum „${bucata.map((x) => x.text).join(' ')}”, nu „${c.din}”.`, SUGESTIE_DIN));
      return;
    }
    for (let k = iv[0]; k <= iv[1]; k++) ocupate.set(k, i);
    valide.push({ iv, c });
  });
  const simplu = (x) => ({ id: x.id, ids: [x.id], text: x.text, start: x.start, end: x.end, ascuns: false, corectat: false, ...(x.fraza !== undefined ? { fraza: x.fraza } : {}) });
  if (erori.length > 0) return { cuvinte: cuvinte.map(simplu), erori };
  const deLa = new Map(valide.map((v) => [v.iv[0], v]));
  const rezultat = [];
  for (let k = 0; k < cuvinte.length; k++) {
    const v = deLa.get(k);
    if (!v) { rezultat.push(simplu(cuvinte[k])); continue; }
    const [a, b] = v.iv;
    const ids = cuvinte.slice(a, b + 1).map((x) => x.id);
    rezultat.push({
      id: a === b ? ids[0] : `${ids[0]}-${ids.at(-1)}`, ids, text: v.c.in, start: cuvinte[a].start, end: cuvinte[b].end,
      ascuns: v.c.in.trim() === '', corectat: true, ...(cuvinte[a].fraza !== undefined ? { fraza: cuvinte[a].fraza } : {}),
    });
    k = b;
  }
  return { cuvinte: rezultat, erori };
}
