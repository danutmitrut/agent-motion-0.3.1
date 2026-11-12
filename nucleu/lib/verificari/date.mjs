// Verificările pe date, după ce cronologia și build-ul există (spec 6.11, harta 4.15): C01-C07 și C09.
// Regulile proprii ale șablonului nu se refac aici: C03 și C04 sunt erorile și avertismentele lui valideaza, grupate
// după CODURI[cod].verificare (B02: „fără să le recalculeze”; runda 1 B12, corectura „Logica dublată”).
// Restul codurilor lui valideaza (C02, C09 timpuriu, S01-S12) le grupează pregatesteBuild, care se oprește la ele.
// Cu C02 picat, nimic de după nu rulează: C03-C05 cer texte șiruri.
import { eroare } from '../erori.mjs';
import { valideazaPeSchema } from '../schema.mjs';
import { timpCitire } from '../text.mjs';
import { verificaAcoperire, verificaFontBrand, esteFontBrand } from '../fonturi.mjs';
import { verificaContrast, PRAGURI_C06, stopuriDegrade } from '../contrast.mjs';
import { valoriStil } from '../teme.mjs';
import { verificaActive } from '../active.mjs';
import { rotunjeste } from '../cronologie.mjs';
import { rezultat, secundeCuZecimala as secunde, grupeazaPeVerificari } from './index.mjs';

const EPS = 1e-9;

/**
 * C05 pe textele de pe ecran (LinieText, din blocul șablonului): fiecare grup (font, greutate), în ordinea primei apariții,
 * prin verificaAcoperire; rândurile noi devin spații. Fonturile de brand se verifică întâi pe toate diacriticele (A07).
 */
async function verificaC05(radacina, texte, date, stil, stilPlat) {
  // Fontul de brand se verifică pe toate diacriticele la fiecare randare (spec 7.1 punctul 3, A07), nu doar pe textul de acum:
  // altfel un font fără ț sau ș trece azi și pică abia la primul text care le conține. Fișierul există deja aici,
  // pentru că construieste (B11) l-a copiat în build sau s-a oprit cu font-necunoscut.
  const fonturiBrand = [];
  for (const font of [stilPlat.font_titlu, stilPlat.font_text]) {
    if (esteFontBrand(font) && !fonturiBrand.some((f) => f.fisier === font.fisier)) fonturiBrand.push(font);
  }
  const parti = [];
  for (const font of fonturiBrand) parti.push(await verificaFontBrand(radacina, font));
  // F11: fontul venit din brand își raportează problemele pe câmpul brand (font_titlu și, din felia 4, font_text).
  const brandFont = (camp) => (stil[camp]?.sursa === 'brand' && typeof date?.brand === 'string' ? date.brand : null);
  const grupuri = new Map();
  for (const t of texte) {
    const font = t.font ?? 'titlu';
    const greutate = t.greutate ?? 700;
    const cheie = `${font}/${greutate}`;
    if (!grupuri.has(cheie)) grupuri.set(cheie, { font, greutate, texte: [] });
    grupuri.get(cheie).texte.push({ camp: t.camp, text: t.text.replace(/\n/g, ' ') });
  }
  for (const g of grupuri.values()) {
    const fisier = g.font === 'titlu' ? stilPlat.font_titlu : stilPlat.font_text;
    parti.push(await verificaAcoperire(radacina, fisier, g.texte, g.greutate, { brand: brandFont(g.font === 'titlu' ? 'font_titlu' : 'font_text') }));
  }
  const erori = parti.flatMap((p) => p.erori);
  return rezultat('C05', erori.length === 0, {
    valoare: parti.map((p) => p.valoare), prag: 'toate caracterele au glifă în font', camp: erori[0]?.camp ?? null, erori,
  });
}

/** C09 (durata, timpul de citire, suprapunerea textelor); exportat pentru teste. Suprapunerea se caută doar în aceeași bandă (decizia 17). */
export function verificaC09(sablon, cronologie) {
  const erori = [];
  const { min, max } = sablon.meta.durata;
  if (cronologie.durata < min - EPS || cronologie.durata > max + EPS) {
    erori.push(eroare('durata-in-afara-limitelor', 'durata',
      `Filmul are ${secunde(cronologie.durata)} s; șablonul ${sablon.nume} acceptă ${secunde(min)}-${secunde(max)} s.`,
      `Schimbă durata (sau duratele scenelor) ca totalul să fie între ${secunde(min)} și ${secunde(max)} s.`));
  }
  const anterioare = new Map(); // banda → ultimul segment cu text din banda ei (fără banda: o bandă comună, ca înainte)
  for (const s of cronologie.segmente) {
    if (s.texte.length === 0) continue;
    const necesar = rotunjeste(timpCitire(s.texte.join(' ')), 3);
    const disponibil = rotunjeste(s.sfarsit - s.start, 3);
    if (disponibil + EPS < necesar) {
      erori.push(eroare('prea-repede-de-citit', `${s.camp}.durata`,
        `${s.ref}: textele cer ${secunde(necesar)} s de citire, dar stau pe ecran ${secunde(disponibil)} s.`,
        `Mărește ${s.camp}.durata la cel puțin ${secunde(necesar)} sau scurtează textul.`));
    }
    const anterior = anterioare.get(s.banda ?? '') ?? null;
    if (anterior && s.start + EPS < anterior.sfarsit) {
      erori.push(eroare('cronologie-suprapunere', s.camp,
        `${s.ref} începe la ${secunde(s.start)} s, înainte să se termine ${anterior.ref} (${secunde(anterior.sfarsit)} s); textele s-ar suprapune.`,
        'E o problemă a șablonului, nu a datelor: trimite lui Dănuț ieșirea lui node nucleu/mg.mjs randeaza <proiect> --doar-verificare --json.'));
    }
    anterioare.set(s.banda ?? '', s);
  }
  return rezultat('C09', erori.length === 0, {
    valoare: { durata: cronologie.durata, segmente: cronologie.segmente.length },
    prag: { durata: [min, max], citire: '0,8 + 0,3 s pe cuvânt' },
    camp: erori[0]?.camp ?? null,
    erori,
  });
}

/**
 * Atmosfera pe care o măsoară C06 (planul G): la 'degrade', cu stopurile din nucleu (stopuriDegrade); altfel neschimbată.
 * @param {{culori: object, atmosfera?: string}} stilPlat valoriStil(stil)
 * @returns {{atmosfera: string, stopuri?: string[]}}
 */
export function atmosferaC06(stilPlat) {
  const atmosfera = stilPlat.atmosfera ?? 'plin';
  return atmosfera === 'degrade' ? { atmosfera, stopuri: stopuriDegrade(stilPlat.culori) } : { atmosfera };
}

/**
 * @param {{ctx: object, date: object, stil: object, cronologie: object, lock: object, active?: string[], validare: {erori: object[], avertismente: object[]}, texte: object[]}} p
 *   ctx = contextul din creeazaCtx (radacina, proiect, sablon, brand se citesc din el); stil = StilRezolvat;
 *   validare = rezultatul apelului unic al lui valideaza din pregatesteBuild (M6; C03 și C04 vin din el);
 *   cronologie = harta 5.4; lock = motor.lock recitit după construieste; active = activele planului, din construieste
 *   (C07 verifică doar intrările lor; fără listă, tot motor.lock);
 *   texte = LinieText[] din blocul șablonului (M7), obligatoriu (TypeError dacă nu e listă): C05 le verifică pe fontul și greutatea fiecăruia
 * @returns {Promise<object[]>} rezultatele C01, C02, C03, C04, C05, C06, C07, C09, în această ordine;
 *   cu C02 picat, doar C01 și C02 (celelalte nu se pot evalua pe date care nu respectă schema)
 */
export async function verificariDate({ ctx, date, stil, cronologie, lock, active, validare, texte }) {
  // M7: fără texte, C05 ar ieși verde fără să verifice nimic; lista e obligatorie (poate fi goală doar explicit).
  if (!Array.isArray(texte)) throw new TypeError('verificariDate cere texte: lista LinieText a blocului „Ce apare pe ecran” (C05).');
  const { radacina, proiect, sablon } = ctx;
  const stilPlat = valoriStil(stil);
  const c01 = rezultat('C01', true, { valoare: { fisier: `video/${proiect}/date.json` }, prag: 'UTF-8 fără BOM, JSON valid' });
  const eroriSchema = valideazaPeSchema(sablon.schema, date);
  const c02 = rezultat('C02', eroriSchema.length === 0, { prag: 'schema.json', camp: eroriSchema[0]?.camp ?? null, erori: eroriSchema });
  if (!c02.ok) return [c01, c02];
  // C03 și C04 din regulile șablonului: vin din apelul unic al lui valideaza din pregatesteBuild (planul E, M6),
  // fără nicio copie a listei de câmpuri sau a plafoanelor în nucleu.
  const grupe = grupeazaPeVerificari(validare.erori, validare.avertismente);
  const dinSablon = (cod, prag) => {
    const { erori, avertismente } = grupe.get(cod) ?? { erori: [], avertismente: [] };
    return rezultat(cod, erori.length === 0, { prag, camp: erori[0]?.camp ?? null, erori, avertismente });
  };
  const c03 = dinSablon('C03', null);
  const c04 = dinSablon('C04', sablon.meta?.verificari_partiale?.C04 ?? null);
  const c05 = await verificaC05(radacina, texte, date, stil, stilPlat);
  // A-Î2: C06 față de punctul cel mai nefavorabil al atmosferei stilului (ceața pe hartie se măsoară la 0,91, ca în B11).
  // F11: cu brand, erorile numesc brandul (camp 'brand'); sursa atenuatului alege sugestia.
  const c06 = verificaContrast(stilPlat.culori, PRAGURI_C06, {
    ...atmosferaC06(stilPlat),
    brand: typeof date?.brand === 'string' ? date.brand : null,
    surse: { atenuat: stil.culori?.atenuat?.sursa },
    ceata: stilPlat.ceata ?? null,
  });
  const c07 = verificaActive(radacina, proiect, lock, active, typeof date?.brand === 'string' ? date.brand : null);
  const c09 = verificaC09(sablon, cronologie);
  return [c01, c02, c03, c04, c05, c06, c07, c09];
}
