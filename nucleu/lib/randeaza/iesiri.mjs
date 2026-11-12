// Ieșirile multiple în pregătire (docs/interfete/sablon.md, „Ieșirile multiple”; felia 3). Când șablonul întoarce o
// listă din iesiri(date, ctx), nucleul rulează cronologie, asteptari și construieste pe date-le fiecărei ieșiri, în
// build/<id>/, iar blocul „Ce apare pe ecran” o singură dată, pe datele întregi. Verificările pe date rulează pe fiecare
// ieșire și se combină pe cod: un cod trece doar dacă trece pe toate.
import path from 'node:path';
import { scrieJsonAtomic, stergeRecursiv } from '../fisiere.mjs';
import { valideazaCronologie } from '../cronologie.mjs';
import { pregatesteMuzica, verificaAudioCronologie } from '../muzica.mjs';
import { unice, rezultat } from '../verificari/index.mjs';
import { blocPentru } from './bloc.mjs';
import { valideazaConstruit } from './construit.mjs';

const ESTE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// numele rezervate în cadre/: schita-N/ (schița seriei), foaie-N.*, revizie-*.md
const ID_REZERVAT = /^(?:schita|foaie|revizie)(?:-|$)/;

/** Numărul ieșirii în numele fișierului: 01, 02, …, 100. */
export const nn = (k) => String(k + 1).padStart(2, '0');

/**
 * Lista întoarsă de iesiri(), verificată: cel puțin o ieșire, id-uri valide și unice, date obiect. O formă greșită e
 * o greșeală a autorului șablonului: TypeError.
 * @returns {Array<{id: string, date: object, schita: boolean}>}
 */
export function valideazaIesiri(lista, numeSablon) {
  const gresit = (motiv) => new TypeError(`iesiri() al șablonului „${numeSablon}”: ${motiv}.`);
  if (!Array.isArray(lista) || lista.length === 0) throw gresit('trebuie să întoarcă o listă nevidă sau null');
  const vazute = new Set();
  return lista.map((x, k) => {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !ESTE_ID.test(x.id)) throw gresit(`ieșirea ${k + 1} nu are un id din litere mici, cifre și cratimă`);
    if (ID_REZERVAT.test(x.id)) throw gresit(`id-ul „${x.id}” începe cu un nume rezervat în cadre/ (schita, foaie, revizie)`);
    if (vazute.has(x.id)) throw gresit(`id-ul „${x.id}” apare de două ori`);
    vazute.add(x.id);
    if (!x.date || typeof x.date !== 'object') throw gresit(`ieșirea ${x.id} nu are date`);
    return { id: x.id, date: x.date, schita: x.schita === true };
  });
}

/**
 * Rezultatele aceluiași cod de pe mai multe ieșiri, într-unul singur: ok doar dacă toate trec, erorile și
 * avertismentele adunate (fără dubluri), valoarea pe ieșiri. Un cod care are un singur rezultat comun rămâne neschimbat.
 * @param {Array<{id: string, rezultate: object[]}>} pe
 * @returns {object[]} sortate după cod
 */
export function combinaRezultate(pe) {
  const coduri = new Map();
  for (const { id, rezultate } of pe) {
    for (const r of rezultate) {
      if (!coduri.has(r.cod)) coduri.set(r.cod, []);
      coduri.get(r.cod).push({ id, r });
    }
  }
  return [...coduri.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([cod, lista]) => {
    if (lista.length === 1 && pe.length === 1) return lista[0].r;
    const picat = lista.find((x) => !x.r.ok);
    return rezultat(cod, !picat, {
      valoare: { iesiri: Object.fromEntries(lista.map((x) => [x.id, x.r.valoare])) },
      prag: lista[0].r.prag,
      camp: picat?.r.camp ?? null,
      erori: unice(lista.flatMap((x) => x.r.erori)),
      avertismente: unice(lista.flatMap((x) => x.r.avertismente ?? [])),
    });
  });
}

/**
 * Pregătirea ieșirilor, după valideaza și stil (pregatesteBuild). Scrie p.iesiri și p.bloc, construiește build/<id>/
 * pentru fiecare; la prima eroare de cronologie se oprește fără build, cu toate erorile ieșirilor.
 * @param {object} p pregătirea în lucru (cai, sablon, date, stil, muzica, erori, avertismente)
 * @param {Array<{id: string, date: object, schita: boolean}>} lista
 * @param {object} ctx contextul pregătirii
 * @returns {Promise<boolean>} false dacă s-a oprit pe erori (apelantul cheamă opreste())
 */
export async function pregatesteIesiri(p, lista, ctx) {
  const { cai, sablon } = p;
  const iesiri = [];
  for (const [k, it] of lista.entries()) {
    const ctxI = { ...ctx, stil: p.stil, iesire: { id: it.id, index: k } };
    const c = sablon.modul.cronologie(it.date, p.stil, ctxI);
    const erori = [...c.erori, ...(c.erori.length === 0 ? valideazaCronologie(c.cronologie) : [])];
    if (erori.length === 0) erori.push(...verificaAudioCronologie(c.cronologie, p.muzica));
    p.erori.push(...erori);
    p.avertismente.push(...c.avertismente);
    if (erori.length === 0) iesiri.push({ id: it.id, nn: nn(k), schita: it.schita, date: it.date, cronologie: c.cronologie, intern: c.intern, ctx: { ...ctxI, intern: c.intern } });
  }
  if (p.erori.length > 0) return false;
  for (const i of iesiri) i.asteptari = sablon.modul.asteptari(i.cronologie, i.ctx);
  p.iesiri = iesiri;
  p.ctx = { ...ctx, stil: p.stil };
  if (typeof sablon.modul.blocScenariu !== 'function') throw new TypeError(`Șablonul „${sablon.nume}” are ieșiri multiple, deci trebuie să exporte blocScenariu (blocul pe toate ieșirile).`);
  p.bloc = blocPentru({ sablon, date: p.date, stil: p.stil, cronologie: null, asteptari: null, ctx: p.ctx });

  stergeRecursiv(cai.build);
  for (const i of iesiri) {
    i.dirBuild = path.join(cai.build, i.id);
    i.construit = valideazaConstruit(await sablon.modul.construieste(i.date, p.stil, i.cronologie, i.dirBuild, i.ctx), sablon.nume, sablon.motor);
    scrieJsonAtomic(path.join(i.dirBuild, 'cronologie.json'), i.cronologie);
    if (p.muzica) await pregatesteMuzica({ muzica: p.muzica, durata: i.cronologie.audio.durata, dirProiect: cai.dir, dirBuild: i.dirBuild, ff: ctx.ff });
  }
  return true;
}
