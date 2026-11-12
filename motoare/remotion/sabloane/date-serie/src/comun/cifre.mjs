// Blocurile de text cu cifre tabulare: valoarea scenei cifra, valorile din comparație și valorile barelor. Modul ESM pur,
// fără importuri: asezare.mjs le măsoară cu cifrele înlocuite de 0 (lățimea fixă din timpul numărătorii), iar React le
// desenează cu `tabular-nums`; toate celelalte texte se măsoară și se desenează cu cifrele proporționale ale fontului.
const ID_VALOARE = Object.freeze({ cifra: /^valoare$/, comparatie: /^valoare-\d+$/, bare: /^valoare-\d+$/ });

/** Textul `id` din scena de tipul `tip` se măsoară și se desenează cu cifre tabulare? */
export function esteCifre(tip, id) {
  return ID_VALOARE[tip]?.test(id) ?? false;
}
