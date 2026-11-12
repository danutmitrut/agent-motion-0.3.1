// Rolurile de culoare ale formelor (spec 8.4.2) și CSS-ul lor, într-o singură sursă (revizuirea transversală B01-B13, T16):
// mg desen adauga pune clasele (umplerea → <rol>, conturul → <rol>-contur), verifica-biblioteci le verifică, iar foaia
// mg desen arata și reelul (compileaza.mjs) le desenează cu regulile de aici, ca o piesă să arate la fel în ambele.
// Fără importuri: modulul nu depinde de nimic.

/** Clasele de rol pe care le recolorează reelul. */
export const ROLURI = Object.freeze(['ink', 'fond', 'acc', 'acc2']);

/** Culoarea fiecărui rol, din variabilele CSS ale temei (acc2 cade pe accent când tema nu-l dă). */
export const CULORI_ROLURI = Object.freeze({
  ink: 'var(--linie)',
  fond: 'var(--fundal)',
  acc: 'var(--accent)',
  acc2: 'var(--accent2, var(--accent))',
});

/** Clasa de contur a unui rol: `ink` → `ink-contur`. */
export function clasaContur(rol) {
  return `${rol}-contur`;
}

/**
 * Regulile CSS ale rolurilor, câte una pe rând: `<prefix>.<rol> { fill: c; }` și `<prefix>.<rol>-contur { stroke: c; }`.
 * @param {{prefix?: string, culori?: Record<string, string>, indentare?: string}} [optiuni]
 *   prefix = selectorul părinte, cu spațiu la final (de exemplu '#art .inversat '); culori = rolurile scrise și culoarea lor,
 *   în ordinea în care apar (implicit toate rolurile, cu CULORI_ROLURI); indentare = textul pus la începutul fiecărui rând
 * @returns {string}
 */
export function cssRoluri({ prefix = '', culori = CULORI_ROLURI, indentare = '' } = {}) {
  return Object.entries(culori)
    .flatMap(([rol, culoare]) => [
      `${indentare}${prefix}.${rol} { fill: ${culoare}; }`,
      `${indentare}${prefix}.${clasaContur(rol)} { stroke: ${culoare}; }`,
    ])
    .join('\n');
}
