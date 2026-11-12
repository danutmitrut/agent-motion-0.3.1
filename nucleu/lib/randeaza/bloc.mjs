// Blocul „Ce apare pe ecran” din scenariu.md (planul E, M1; docs/interfete/sablon.md, „blocScenariu”).
// Șablonul îl dă prin hook-ul opțional blocScenariu; fără hook, nucleul îl derivă din asteptari().texte și din segmente.
// Zona „Texte și cifre” intră în hash-ul aprobării (C08): forma ei se schimbă doar cu o aprobare nouă.
import { valideazaLiniiText } from '../scenariu.mjs';
import { secundeCuZecimala as secunde } from '../verificari/index.mjs';

const CHEI_BLOC = new Set(['texte', 'stil']);

/**
 * Varianta implicită: câte o linie pe text așteptat (eticheta null), tema și fereastra fiecărui segment.
 * @param {{cronologie: {segmente: object[]}, asteptari: {texte: object[]}, stil: object}} p
 * @returns {{texte: import('../scenariu.mjs').LinieText[], stil: string[]}}
 */
export function blocImplicit({ cronologie, asteptari, stil }) {
  const campSegment = new Map();
  for (const s of cronologie.segmente) if (!campSegment.has(s.ref)) campSegment.set(s.ref, s.camp);
  const texte = asteptari.texte.map((t) => ({
    ref: t.ref, camp: t.camp ?? campSegment.get(t.ref) ?? '$', eticheta: null, text: t.text, accent: false, separat: false,
    font: t.font ?? 'titlu', greutate: t.greutate ?? 700,
  }));
  const randuri = [];
  if (stil?.tema?.valoare !== undefined) randuri.push(`Tema: ${stil.tema.valoare}`);
  for (const s of cronologie.segmente) {
    randuri.push(`${s.ref} (${s.tip}): ${secunde(s.start)}-${secunde(s.sfarsit)} s, complet la ${secunde(s.complet)} s`);
  }
  return { texte, stil: randuri };
}

/**
 * Blocul pregătirii: din hook-ul blocScenariu al șablonului (validat strict), altfel blocImplicit.
 * O formă greșită e o greșeală a autorului șablonului, nu a cursantului: aruncă TypeError.
 * @param {{sablon: {nume?: string, modul: object}, date: object, stil: object, cronologie: object, asteptari: object, ctx: object}} p
 * @returns {{texte: import('../scenariu.mjs').LinieText[], stil: string[]}}
 */
export function blocPentru(p) {
  const hook = p.sablon.modul.blocScenariu;
  if (typeof hook !== 'function') return blocImplicit(p);
  const r = hook(p.date, p.stil, p.cronologie, p.ctx);
  const greseala = (motiv) => new TypeError(`blocScenariu al șablonului „${p.sablon.nume}”: ${motiv}.`);
  if (r === null || typeof r !== 'object' || Array.isArray(r)) throw greseala('trebuie să întoarcă {texte, stil}');
  for (const cheie of Object.keys(r)) if (!CHEI_BLOC.has(cheie)) throw greseala(`cheie necunoscută „${cheie}”`);
  valideazaLiniiText(r.texte);
  if (!Array.isArray(r.stil) || !r.stil.every((s) => typeof s === 'string' && s !== '')) {
    throw greseala('stil trebuie să fie o listă de șiruri nevide');
  }
  return { texte: r.texte, stil: r.stil };
}
