// Verificările proprii ale lui date-serie pe MP4 (spec 7.3; stadiul mp4, hook-ul verificariProprii):
// S06 = cadrele MP4-ului egale cu cadreTotale (± 1) și durata în limitele șablonului, S07 = cel mult 100 MB.
// Nepotrivirea de cadre și mărimea sunt defecte de randare; durata în afara limitelor numește scenele.
import fs from 'node:fs';
import { eroare, probeazaMp4, rotunjeste, secundeCuZecimala as secunde } from '../../../../nucleu/lib/sdk.mjs';
import { cadreTotale } from './src/durata.mjs';

export const MARIME_MAX = 100 * 1024 * 1024;
export const TOLERANTA_CADRE = 1;
const RAPORTEAZA = 'E un defect de randare, nu de date: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --json.';
const ro = (x) => String(x).replace('.', ',');
// „de” după numeral doar când ultimele două cifre fac 00 sau 20-99: 672 de cadre, dar 701 cadre.
const deCadre = (n) => (n >= 20 && (n % 100 === 0 || n % 100 >= 20) ? `${n} de cadre` : `${n} cadre`);

function rezultatS(cod, erori, valoare, prag) {
  return { cod, ok: erori.length === 0, valoare, prag, camp: erori[0]?.camp ?? null, erori, avertismente: [] };
}

/**
 * S06 din măsurători (pură).
 * @param {{info: {durata: number, video: {cadre: number|null}}, asteptate: number, durata: {min: number, max: number}}} p
 */
export function evalueazaCadre({ info, asteptate, durata }) {
  const erori = [];
  const cadre = info.video?.cadre ?? null;
  if (cadre === null || Math.abs(cadre - asteptate) > TOLERANTA_CADRE) {
    erori.push(eroare('date-serie-durata-mp4', 'mp4',
      `MP4-ul are ${cadre === null ? 'un număr necunoscut de cadre' : deCadre(cadre)}, iar scenele cer ${asteptate} (diferența admisă: ${TOLERANTA_CADRE}).`,
      RAPORTEAZA));
  }
  // Aceeași toleranță ca C11 (1/fps): un film de exact 60 s cu muzica tăiată la lungime poate ieși cu un cadru peste.
  const toleranta = 1 / (info.video?.fps || 30) + 1e-9;
  if (info.durata < durata.min - toleranta || info.durata > durata.max + toleranta) {
    erori.push(eroare('date-serie-durata-mp4', 'scene',
      `MP4-ul are ${secunde(info.durata)} s; filmul trebuie să aibă între ${durata.min} și ${durata.max} s.`,
      durata.max === 20 ? 'Schimbă serie.durata (6-20 s) sau scoate-o, ca fiecare card să-și ia durata după citat.' : 'Schimbă scene[i].durata (2-12 s) sau numărul scenelor, ca totalul să intre în limite.'));
  }
  return rezultatS('S06', erori, { cadre, durata: info.durata },
    { cadre: asteptate, toleranta: TOLERANTA_CADRE, durata_min: durata.min, durata_max: durata.max });
}

/**
 * S07 din mărimea fișierului (pură).
 * @param {{octeti: number}} p
 */
export function evalueazaMarime({ octeti }) {
  const erori = octeti <= MARIME_MAX ? [] : [eroare('date-serie-marime-mp4', 'mp4',
    `MP4-ul are ${ro(rotunjeste(octeti / (1024 * 1024), 1).toFixed(1))} MB; maximum 100 MB.`,
    RAPORTEAZA)];
  return rezultatS('S07', erori, { octeti }, { octeti_max: MARIME_MAX });
}

/**
 * Hook-ul verificariProprii (docs/interfete/sablon.md): S06 și S07 pe MP4-ul randat; la grafic, S08 și S09 verzi (nu se aplică).
 * @param {string} mp4 calea absolută a MP4-ului
 * @param {{intern: {cadre: number[]}, sablon: {meta: {durata: {min: number, max: number}}}, ff: {ffprobe: string}}} ctx
 * @param {{probeaza?: typeof probeazaMp4, marime?: (cale: string) => number}} [inlocuiri] doar în teste
 */
export async function verificariProprii(mp4, ctx, { probeaza = probeazaMp4, marime = (cale) => fs.statSync(cale).size } = {}) {
  if (!Array.isArray(ctx?.intern?.cadre)) throw new TypeError('verificariProprii cere cadrele scenelor în ctx.intern.cadre.');
  const info = await probeaza(mp4, { ffprobe: ctx.ff.ffprobe });
  const rezultate = [
    evalueazaCadre({ info, asteptate: cadreTotale(ctx.intern.cadre), durata: ctx.intern.limite ?? ctx.sablon.meta.durata }),
    evalueazaMarime({ octeti: marime(mp4) }),
  ];
  // S08 (seria întreagă) și S09 (schița seriei) le dă nucleul la nivelul seriei; la grafic e un singur film, deci nu se aplică
  if (ctx.intern.card !== true) {
    for (const cod of ['S08', 'S09']) rezultate.push(rezultatS(cod, [], { aplicabil: false }, 'doar la compoziția serie'));
  }
  return rezultate;
}
