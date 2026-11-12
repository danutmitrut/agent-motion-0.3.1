// Timpii scenelor din text-animat (spec 7.2, „Cum calculează mg timpii”): funcții pure, fără fonturi și fără DOM.
// plan.mjs le cheamă după așezare (știe atunci rândurile și piesele fiecărei scene); reguli.mjs folosește doar
// minimul de citire, care nu depinde de așezare.
import { rotunjeste, timpCitire, grafeme } from '../../../../nucleu/lib/sdk.mjs';

const EPS = 1e-9;

/** Rotunjire în sus la 0,1 s: o durată calculată nu coboară niciodată sub minim din cauza rotunjirii. */
export function sus01(x) {
  return rotunjeste(Math.ceil(rotunjeste(x, 6) * 10 - EPS) / 10, 1);
}

/**
 * Cuvintele unor texte, pentru formule și pentru minimul de citire: marcajul * devine spațiu (accentul desparte piesele
 * de pe ecran), iar orice bucată nevidă dintre spații e un cuvânt, exact ca numărarea lui C09 pe piesele din cronologie.
 * @param {string[]} texte
 */
export function numarCuvinte(texte) {
  return texte.join(' ').replaceAll('*', ' ').split(/\s+/).filter(Boolean).length;
}

/** Formula din spec 7.2, la ritmul normal (fără factorul ritmului și fără limite). */
export function durataFormula(scena, cuvinte, durate) {
  const d = durate[scena.tip];
  switch (scena.tip) {
    case 'cuvinte': return d.baza + d.pe * scena.cuvinte.length;
    case 'lista': return d.baza + d.pe * scena.puncte.length + (scena.titlu ? d.cu_titlu : 0);
    case 'cifra': return d.baza + (scena.sursa !== undefined ? d.cu_sursa : 0);
    case 'final': return d.baza;
    default: return d.baza + d.pe * cuvinte; // titlu, fraza, citat
  }
}

/** Limitele de scenă (plafonul final): 1,5-8 s, la final 2,5-10 s. */
export function limiteScena(tip, scene) {
  return tip === 'final' ? [scene.final_min, scene.final_max] : [scene.durata_min, scene.durata_max];
}

/** Minimul de citire din spec 7.2: 0,8 s + cuvinte / 3,3. */
export function minimCitire(cuvinte) {
  return 0.8 + cuvinte / 3.3;
}

/** Cât durează tastarea unui text mic (autorul citatului, detaliul finalului): 0,045 s pe caracter, între 0,6 și 1,6 s. */
export function durataTastare(text, timpi) {
  const [min, max] = timpi.tastare;
  return rotunjeste(Math.min(Math.max(grafeme(text) * timpi.tastare_caracter, min), max), 3);
}

/**
 * Durata unei scene. Ordinea din spec: formula × ritm, limitată la intervalul tipului (unde există), apoi cel puțin
 * minimul (mecanic: tot textul intrat, 0,8 s de citire, ieșirea; de citire: 0,8 + cuvinte/3,3 și timpCitire pe piese, C09),
 * rotunjită în sus la 0,1 s și plafonată de limitele scenei.
 * @param {{scena: object, cuvinte: number, texteEcran: string[], complet: number, ultima: boolean, ritm: object, implicite: object}} p
 * @returns {{durata: number|null, minim: number, maxim: number, eroare: null|'sub-minim'|'nu-incape'}}
 */
export function durataScena({ scena, cuvinte, texteEcran, complet, ultima, ritm, implicite }) {
  const T = implicite.timpi;
  const D = implicite.durate[scena.tip];
  let formula = durataFormula(scena, cuvinte, implicite.durate) * ritm.factor;
  if (D.min !== undefined) formula = Math.min(Math.max(formula, D.min), D.max);
  const mecanic = complet + T.citire_min + (ultima ? 0 : T.iesire);
  const citire = Math.max(minimCitire(cuvinte), texteEcran.length > 0 ? timpCitire(texteEcran.join(' ')) : 0);
  const minim = sus01(Math.max(mecanic, citire));
  const [smin, smax] = limiteScena(scena.tip, implicite.scene);
  if (scena.durata !== undefined) {
    return { durata: scena.durata, minim, maxim: smax, eroare: scena.durata + EPS < minim ? 'sub-minim' : null };
  }
  if (minim > smax + EPS) return { durata: null, minim, maxim: smax, eroare: 'nu-incape' };
  const durata = Math.min(Math.max(sus01(Math.max(formula, minim)), smin), smax);
  return { durata: rotunjeste(durata, 3), minim, maxim: smax, eroare: null };
}
