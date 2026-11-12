// Cadrele compoziției Grafic (spec 7.3, „Calculul timpilor”; decizia 10 din planul I). Modul ESM pur, fără importuri:
// îl folosesc mg (timp.mjs, reguli.mjs) și compoziția React (Root.tsx, prin webpack), deci aceleași numere în ambele.

export const FPS = 30;
export const CADRE_TRANZITIE = 12;

/** Cadrele unei scene: durata în secunde × 30, rotunjită (durata are pasul 0,1 s, deci produsul e întreg). */
export function cadreScena(durata) {
  return Math.round(durata * FPS);
}

/**
 * Cadrele videoului: suma cadrelor scenelor, minus o tranziție de 12 cadre între fiecare două scene.
 * @param {number[]} cadre cadrele fiecărei scene (cadreScena), nu duratele: React le are direct din props.json
 */
export function cadreTotale(cadre) {
  return cadre.reduce((suma, c) => suma + c, 0) - CADRE_TRANZITIE * (cadre.length - 1);
}

/**
 * Cadrul la care începe fiecare scenă: scena i începe cu 12 cadre înainte să se termine scena i − 1.
 * @param {number[]} cadre cadrele fiecărei scene
 */
export function inceputuri(cadre) {
  const rezultat = [];
  let t = 0;
  for (const c of cadre) {
    rezultat.push(t);
    t += c - CADRE_TRANZITIE;
  }
  return rezultat;
}

/**
 * Cadrele de intrare ale unei scene (de la începutul ei până când tot ce arată e pe loc): titlu 18, cifra 45,
 * bare 30 + 2 pe fiecare bară în plus, comparatie 30 + 6 pe fiecare rând în plus, final 18. Toate sunt cel mult 48 (maximul de azi e 45),
 * deci încap în orice scenă care nu e ultima: intrare ≤ cadre − 12 (fade-ul scenei următoare începe la cadre − 12),
 * iar 48 = 60 − 12 (o scenă de 2 s are 60 de cadre).
 * @param {'titlu'|'cifra'|'bare'|'comparatie'|'final'} tip
 * @param {number} [valori] numărul de bare sau de rânduri (doar la bare și comparatie)
 */
export function cadreIntrare(tip, valori = 0) {
  switch (tip) {
    case 'titlu': return 18;
    case 'cifra': return 45;
    case 'bare': return 30 + 2 * (valori - 1);
    case 'comparatie': return 30 + 6 * (valori - 1);
    case 'final': return 18;
    default: throw new TypeError(`Tip de scenă necunoscut: ${tip}`);
  }
}
