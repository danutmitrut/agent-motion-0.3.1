// API-ul nucleului pentru șabloane (docs/interfete/sablon.md, „API-ul nucleului”; planul E, M8).
// Singurul modul din nucleu/ pe care îl pot importa fișierele din motoare/ (teste/unitar/sdk.test.mjs).
// Lista e înghețată: un export nou e o adăugare compatibilă; unul scos sau redenumit e o schimbare de interfață.

// Erori și coduri de ieșire
export { eroare, avertisment, EroareFatala, COD_IESIRE } from './erori.mjs';
// Fișiere
export { citesteText, scrieTextAtomic, scrieJsonAtomic, existaFisier, legaFisier } from './fisiere.mjs';
// Teme și stil
export { valoriStil, semnaturaRezolvata } from './teme.mjs';
// Fonturi
export {
  cssFontFace, copiazaFonturi, incarcaCatalogFonturi, esteFontBrand, cssFontFaceBrand, copiazaFontBrand, familieCss, metriciFont,
} from './fonturi.mjs';
// Iconițe
export { svgIconita } from './iconite.mjs';
// Desene
export { incarcaCatalog, gasestePiesa, caleFisierPiesa } from './desen/catalog.mjs';
export { normalizeazaSvg } from './desen/adauga.mjs';
export { cssRoluri } from './desen/roluri.mjs';
// Text
export { verificaTexteDate, grafeme, textAfisat, timpCitire } from './text.mjs';
// Rânduri (planul F): măsurarea cu fontkit și ruperea în română
export { masuratorRand, rupeRanduri, CUVINTE_SCURTE } from './randuri.mjs';
// Timp
export { rotunjeste } from './cronologie.mjs';
// Muzica (planul F): cronologie.audio și elementul <audio> al compoziției
export { audioCronologie, elementAudio } from './muzica.mjs';
// Culoare și contrast
export { hexInRgb, limitaIntensitate, STRATURI_CEATA, straturiCeata, stopuriDegrade } from './contrast.mjs';
// HTML
export { escapeazaHtml, deschidereSvg } from './html.mjs';
// Filmarea (planul H): decuparea ca în compoziție, SSIM, volumul și ffprobe pe MP4, pentru verificările overlay-ului
export { decupare, filtruDecupare } from './filmare/decupare.mjs';
export { masoaraSsim, masoaraVolum, probeazaMp4 } from './ffmpeg.mjs';
// Verificări
export { secundeCuZecimala } from './verificari/index.mjs';
// Tabelul seriei (felia 3): CSV-ul (UTF-8, windows-1250, UTF-16) și Excelul cursantului, cu sedilele reparate
export { citesteTabel } from './tabel.mjs';
