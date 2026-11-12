// Textul transcrierii pentru overlay-filmare (planul H, H09): cheile de căutare, umpluturile, numerele.
const NU_LITERA = /[^\p{L}\p{N}]+/gu;

/** Cheia de căutare a unui cuvânt: fără diacritice, majuscule și punctuație (ancorele, spec 7.4). */
export function cheieCuvant(text) {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(NU_LITERA, '');
}

/** Cuvântul curățat de majuscule și punctuație, cu diacriticele păstrate (umpluturile, `din` din corecturi). */
export function curat(text) {
  return text.normalize('NFC').toLowerCase().replace(NU_LITERA, '');
}

export function esteUmplutura(text, umpluturi) {
  const c = curat(text);
  return c !== '' && umpluturi.includes(c);
}

export function esteNumar(text) {
  return /^[+-]?\d+([.,]\d+)*%?[.,;:!?]?$/.test(text.replace(/[„”"«»]/g, ''));
}
