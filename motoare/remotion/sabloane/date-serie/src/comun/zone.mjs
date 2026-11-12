// Constantele de așezare ale compoziției Grafic (spec 7.3, „Fix în cod”). Modul ESM pur, fără importuri: asezare.mjs
// le folosește la măsurare, iar compoziția React la desen (cadrul, interlinia, grosimea axei), deci aceleași numere.

export const LATIME = 1080;
export const INALTIME = 1920;
/** Zona sigură: nimic important deasupra lui y 200 sau sub y 1594; 80 px pe laterale. */
export const SUS = 200;
export const JOS = 1594;
export const LATERAL = 80;
export const LATIME_UTILA = LATIME - 2 * LATERAL; // 920
/** Marja de lățime de 4%: un rând măsurat cu fontkit încape dacă are cel mult 920 × 0,96 = 883,2 px. */
export const MARJA = 0.04;
export const LATIME_RAND = LATIME_UTILA * (1 - MARJA);
/** Înălțimea unui rând de text, în multipli de mărime (line-height în React). */
export const INTERLINIE = 1.2;

/** Mărimile (px): titlul coboară de la 110 la 84 până încape; textul stă la 44; cifrele mari și textele graficului au plaja lor. */
export const TITLU = Object.freeze({ max: 110, min: 84, pas: 2, randuri: 2 });
export const TEXT = 44;
export const CIFRA = Object.freeze({ max: 220, min: 140, pas: 4 });
export const VALOARE_COMPARATIE = Object.freeze({ max: 140, min: 96, pas: 4 });
export const TEXT_GRAFIC = Object.freeze({ max: 44, min: 32, pas: 2 });
/**
 * Treptele lui `marime` (felia 2): plaja elementului principal al scenei, ca multipli ai maximului de la M.
 * L e cel puțin 1,15× și cel mult 1,3×; XL cel puțin 1,3× și cel mult 1,6× (cifra, singură pe rândul ei, până la 2×).
 * Sub minimul treptei nu se coboară: e rand-nu-incape, cu sugestia unei trepte mai mici.
 */
export const TREPTE = Object.freeze({ L: Object.freeze({ min: 1.15, max: 1.3 }), XL: Object.freeze({ min: 1.3, max: 1.6, maxCifra: 2 }) });
/** La cifra XL, prefixul și sufixul („+”, „%”, „ lei”) se desenează la jumătate din mărimea cifrelor, ca să crească cifrele. */
export const SCARA_AFIXE = 0.5;
export const GREUTATE = Object.freeze({ titlu: 700, text: 500, tare: 700 });

/** Spațiile verticale dintre blocuri (px). */
export const SPATII = Object.freeze({
  eticheta: 24, // sub etichetă
  bloc: 40, // între blocurile unei scene
  valoare: 8, // între eticheta unui rând din comparație și valoarea lui
  rand: 40, // între rândurile comparației
  grafic: 48, // între antet (titlu, unitate) și grafic
  sursa: 32, // între grafic și sursă
  sigla: 56, // între îndemn și siglă
});

/** Barele: coloana ocupă 62% din locul ei; deasupra, valoarea la 12 px; dedesubt, eticheta la 16 px sub axă. */
export const COLOANE = Object.freeze({ latime: 0.62, peste: 12, sub: 16, minim: 160 });
/** Barele orizontale: rândul de text, 6 px, bara de 24 px, apoi 20 px până la rândul următor; eticheta și valoarea la 24 px una de alta. */
export const ORIZONTAL = Object.freeze({ dupaText: 6, grosime: 24, intre: 20, gol: 24 });
export const AXA = 2;
/** Cutia siglei în scena final (lățime, înălțime, px). */
export const SIGLA = Object.freeze({ latime: 360, inaltime: 140 });
/** Etichetele de bare pe coloane: toate au cel mult 5 grafeme; altfel barele sunt orizontale (spec 7.3). */
export const MAX_GRAFEME_COLOANE = 5;

/**
 * Cardul de testimonial (compoziția Serie, felia 3). Zonele, de sus în jos: eticheta (și sigla în colțul din dreapta),
 * ghilimelele, citatul (centrat pe verticală în zona lui), omul (avatarul și, lângă el, numele și rolul), îndemnul jos.
 * Citatul coboară în trepte de 2 px de la 60 la 36 până încape; numele, rolul și îndemnul au plaja lor.
 */
export const CARD = Object.freeze({
  citat: Object.freeze({ max: 72, min: 36, pas: 2 }),
  nume: Object.freeze({ max: 48, min: 36, pas: 2 }),
  rol: Object.freeze({ max: 40, min: 32, pas: 2 }),
  cta: Object.freeze({ max: 44, min: 36, pas: 2 }),
  eticheta: 40,
  ghilimele: Object.freeze({ latime: 112, inaltime: 88, sub: 40 }),
  avatar: 176,
  /** spațiul dintre avatar și coloana numelui; dintre nume și rol */
  langaAvatar: 36,
  subNume: 6,
  /** spațiile verticale: sub etichetă (până la ghilimele), sub citat (până la om), deasupra îndemnului */
  sub_eticheta: 48,
  sub_citat: 64,
  peste_cta: 56,
  sigla: Object.freeze({ latime: 220, inaltime: 88 }),
  /** limitele duratei unui card, în secunde: implicit 8, 10 peste 120 de grafeme, cel mult 20 (decizia lui Dănuț, felia 3) */
  durata: Object.freeze({ min: 6, max: 20, implicita: 8, lunga: 10, prag_lunga: 120 }),
});
