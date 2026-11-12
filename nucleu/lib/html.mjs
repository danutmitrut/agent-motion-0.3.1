// Escaparea HTML comună, pentru text și pentru valori de atribute între ghilimele duble sau simple.
// O folosesc compileaza.mjs (reelul), desen/arata.mjs (foaia de piese), desen/adauga.mjs (atributele SVG-urilor proprii)
// și iconite.mjs (atributele Lucide); inversa, decodeazaHtml, o folosește C17 (verificari/build.mjs) ca să citească
// textele din build/index.html. deschidereSvg e regula unică a rădăcinii <svg>, pentru normalizare și pentru reel.
// Fără importuri: modulul nu depinde de nimic.

/**
 * Neutralizează & < > " și apostroful; & se înlocuiește primul, ca entitățile scrise aici să nu fie escapate din nou.
 * @param {unknown} valoare orice valoare; se transformă în șir cu String()
 * @returns {string}
 */
export function escapeazaHtml(valoare) {
  return String(valoare)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ENTITATI = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' });

/**
 * Inversa lui escapeazaHtml, plus entitățile numerice (&#238;, &#x219;) și &apos;, &nbsp;; o entitate necunoscută rămâne.
 * @param {string} text
 * @returns {string}
 */
export function decodeazaHtml(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (tot, nume) => {
    if (nume[0] === '#') {
      const cod = nume[1] === 'x' || nume[1] === 'X' ? parseInt(nume.slice(2), 16) : parseInt(nume.slice(1), 10);
      return Number.isFinite(cod) ? String.fromCodePoint(cod) : tot;
    }
    return Object.hasOwn(ENTITATI, nume) ? ENTITATI[nume] : tot;
  });
}

/**
 * Tagul de deschidere al primului <svg> din text, cu ghilimelele respectate: un `>` dintr-o valoare între ghilimele
 * nu închide tagul. Îl folosesc normalizarea desenelor (desen/adauga.mjs) și compilarea reelului (compileaza.mjs),
 * ca locul care verifică și cel care consumă să vadă aceeași rădăcină (revizuirea transversală B01-B13, T11).
 * @param {string} text
 * @returns {{index: number, tag: string, atribute: string}|null} atribute = textul dintre `<svg` și `>`
 */
export function deschidereSvg(text) {
  const m = /<svg(?=[\s/>])((?:"[^"]*"|'[^']*'|[^'">])*)>/.exec(text);
  return m ? { index: m.index, tag: m[0], atribute: m[1] } : null;
}
