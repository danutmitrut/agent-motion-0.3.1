// Căutarea în catalog fără diacritice și fără majuscule, cu sinonime (spec 8.9).
// Scor pe fiecare cuvânt al interogării: +3 etichetă exactă, +2 prefix de etichetă sau sinonim, +1 în descriere sau original.

/** NFD fără semne diacritice, minuscule, punctuația și cratima devin spațiu. */
export function normalizeazaCautare(s) {
  return String(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cuvinte(s) {
  const n = normalizeazaCautare(s);
  return n === '' ? [] : n.split(' ');
}

/**
 * Filtrul personaj (spec 8.9): 'fara' = piese fără personaj (null sau numar 0);
 * altfel valoarea trebuie să fie numar (ca text), gen, poza sau orientare din piesa.personaj.
 */
function potrivestePersonaj(piesa, personaj) {
  if (personaj === undefined) return true;
  const p = piesa.personaj ?? null;
  if (personaj === 'fara') return p === null || p.numar === 0;
  if (p === null) return false;
  return [String(p.numar), p.gen, p.poza, p.orientare].includes(personaj);
}

/** Pe tema noapte, fără includeEvita, piesele noapte === 'evita' nu se oferă (decizia 7). */
function treceFiltrele(piesa, { tip, familie, tema, includeEvita = false, personaj } = {}) {
  if (tip !== undefined && piesa.tip !== tip) return false;
  if (familie !== undefined && piesa.familie !== familie) return false;
  if (tema === 'noapte' && !includeEvita && piesa.noapte === 'evita') return false;
  if (!potrivestePersonaj(piesa, personaj)) return false;
  return true;
}

function grupuriSinonime(catalog) {
  /** @type {Map<string, Set<string>>} */
  const harta = new Map();
  for (const [cheie, lista] of Object.entries(catalog.sinonime ?? {})) {
    const grup = [cheie, ...lista].map(normalizeazaCautare).filter(Boolean);
    for (const termen of grup) {
      const set = harta.get(termen) ?? new Set();
      for (const altul of grup) if (altul !== termen) set.add(altul);
      harta.set(termen, set);
    }
  }
  return harta;
}

function potrivesteEticheta(etichete, termen) {
  for (const e of etichete) {
    if (e.normalizat === termen || e.cuvinte.includes(termen)) return { tip: 'exact', eticheta: e.original };
  }
  if (termen.length >= 3) {
    for (const e of etichete) {
      if (e.normalizat.startsWith(termen) || e.cuvinte.some((c) => c.startsWith(termen))) return { tip: 'prefix', eticheta: e.original };
    }
  }
  return null;
}

function scorPiesa(piesa, termeni, sinonime) {
  const etichete = (piesa.etichete ?? []).map((e) => ({ original: e, normalizat: normalizeazaCautare(e), cuvinte: cuvinte(e) }));
  const extra = ` ${normalizeazaCautare(`${piesa.descriere ?? ''} ${piesa.original ?? ''}`)} `;
  let scor = 0;
  const motive = [];
  for (const termen of termeni) {
    const direct = potrivesteEticheta(etichete, termen);
    if (direct?.tip === 'exact') {
      scor += 3;
      motive.push(`eticheta „${direct.eticheta}”`);
      continue;
    }
    if (direct?.tip === 'prefix') {
      scor += 2;
      motive.push(`începutul etichetei „${direct.eticheta}”`);
      continue;
    }
    let gasit = null;
    for (const alt of sinonime.get(termen) ?? []) {
      const p = potrivesteEticheta(etichete, alt);
      if (p !== null) { gasit = p.eticheta; break; }
    }
    if (gasit !== null) {
      scor += 2;
      motive.push(`sinonim pentru „${gasit}”`);
      continue;
    }
    if (extra.includes(` ${termen}`)) {
      scor += 1;
      motive.push('descriere sau fișierul original');
    }
  }
  return { scor, motiv: motive.join('; ') };
}

/** @returns {Array<{piesa: object, scor: number, motiv: string}>} primele 5 */
export function cauta(catalog, interogare, filtre = {}) {
  const termeni = [...new Set(cuvinte(interogare))];
  if (termeni.length === 0) return [];
  const sinonime = grupuriSinonime(catalog);
  return catalog.piese
    .filter((p) => treceFiltrele(p, filtre))
    .map((piesa) => ({ piesa, ...scorPiesa(piesa, termeni, sinonime) }))
    .filter((r) => r.scor > 0)
    .sort((a, b) => b.scor - a.scor || (a.piesa.id < b.piesa.id ? -1 : 1))
    .slice(0, 5);
}

/** @returns {Array<{id, tip, familie, noapte, etichete: string[], proprie: boolean}>} sortat după id */
export function listeaza(catalog, filtre = {}) {
  return catalog.piese
    .filter((p) => treceFiltrele(p, filtre))
    .map((p) => ({
      id: p.id,
      tip: p.tip,
      familie: p.familie,
      noapte: p.noapte ?? null,
      etichete: (p.etichete ?? []).slice(0, 3),
      proprie: p.proprie === true,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}
