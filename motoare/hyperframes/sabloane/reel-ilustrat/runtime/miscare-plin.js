/* Mișcarea lentă a scenei pe atmosfera „plin” (decizia lui Dănuț din 2026-10-05, B17, C14).
 * Fără ceață, nimic nu se mișcă după ce un desen e gata, iar imaginea stă pe loc secunde întregi.
 * Aici stratul desenelor (#cam) derivă cu câțiva pixeli, liniar, de la 0 până la sfârșitul mișcării
 * (începutul pauzei finale, care rămâne statică). Textele (cardurile, semnătura) nu sunt în #cam și nu se mișcă.
 * Compileaza.mjs adaugă fișierul după regizor doar când planul are atmosfera.miscare, deci pe celelalte
 * atmosfere build-ul e identic. Valorile vin din plan (plan.mjs), aici nu se calculează timpi. */
(function () {
  var M = window.__MG_PLAN.atmosfera.miscare;
  var tl = window.__timelines.main;
  tl.fromTo("#cam", { x: 0, y: 0 }, { x: M.deriva[0], y: M.deriva[1], duration: M.pana, ease: "none" }, 0);
})();
