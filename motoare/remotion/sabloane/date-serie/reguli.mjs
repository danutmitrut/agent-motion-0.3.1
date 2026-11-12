// valideaza pentru date-serie (docs/interfete/sablon.md): regulile de dincolo de schema.json care nu cer fonturi sau
// stil (la valideaza, ctx.stil e null). Lățimea textelor (S04) se verifică în cronologie(), după rezolvarea stilului
// (asezare.mjs). Aici: C03 pe texte, plafoanele de grafeme (C04), pasul duratei, zecimalele, S03 (datele graficului),
// durata totală (C09) și sigla (S05).
import { eroare, avertisment, verificaTexteDate, grafeme } from '../../../../nucleu/lib/sdk.mjs';
import { cadreScena, cadreTotale, FPS } from './src/durata.mjs';
import { formatRo, zecimaleNecesare } from './src/comun/numere.mjs';
import { sursaSigla, citesteSigla } from './sigla.mjs';
import { valideazaSerie } from './serie/sablon-serie.mjs';

const EPS = 1e-9;

/** 4.4 → „4,4” (secundele din mesaje). */
export function nr(x) {
  return String(x).replace('.', ',');
}

const NUME_CAMP = Object.freeze({
  eticheta: 'eticheta', titlu: 'rândul {j} din titlu', subtitlu: 'subtitlul', valoare: 'valoarea', prefix: 'prefixul',
  sufix: 'sufixul', text: 'textul', unitate: 'unitatea', sursa: 'sursa', cta: 'îndemnul', durata: 'durata',
  evidentiaza: 'evidentiaza', zecimale: 'zecimalele', valori: 'valorile',
});

/** „scene[2].valori[3].eticheta” → „Scena 3, valoarea 4, eticheta”; „scene[4].titlu[1]” → „Scena 5, rândul 2 din titlu”. */
export function locCamp(camp) {
  const m = /^scene\[(\d+)\](?:\.([a-z_]+)(?:\[(\d+)\])?(?:\.([a-z_]+))?)?$/.exec(camp);
  if (!m) return camp;
  const parti = [`Scena ${Number(m[1]) + 1}`];
  if (m[2] === 'valori' && m[3] !== undefined) {
    parti.push(`valoarea ${Number(m[3]) + 1}`);
    if (m[4] && m[4] !== 'valoare') parti.push(NUME_CAMP[m[4]] ?? m[4]);
  } else if (m[2]) {
    parti.push((NUME_CAMP[m[2]] ?? m[2]).replace('{j}', String(Number(m[3] ?? 0) + 1)));
  }
  return parti.join(', ');
}

/** Durata unei scene în secunde: cea din date sau implicitul tipului (implicite.durate). */
export function durataScena(scena, implicite) {
  return scena.durata ?? implicite.durate[scena.tip];
}

/** Câmpurile de text ale unei scene, cu plafonul lor de grafeme (cheia din implicite.plafoane; null = doar schema). */
export function campuriScena(s, i) {
  const b = `scene[${i}]`;
  const c = [];
  const adauga = (camp, text, plafon) => {
    if (text !== undefined) c.push({ camp: `${b}.${camp}`, text, plafon });
  };
  adauga('eticheta', s.eticheta, 'eticheta');
  (s.titlu ?? []).forEach((t, j) => adauga(`titlu[${j}]`, t, 'titlu'));
  adauga('subtitlu', s.subtitlu, 'subtitlu');
  adauga('prefix', s.prefix, null);
  adauga('sufix', s.sufix, null);
  adauga('text', s.text, 'text');
  adauga('unitate', s.unitate, 'unitate');
  (s.valori ?? []).forEach((v, k) => {
    adauga(`valori[${k}].eticheta`, v.eticheta, s.tip === 'bare' ? 'eticheta_bare' : 'eticheta_comparatie');
    adauga(`valori[${k}].prefix`, v.prefix, null);
    adauga(`valori[${k}].sufix`, v.sufix, null);
  });
  adauga('sursa', s.sursa, 'sursa');
  adauga('cta', s.cta, 'cta');
  return c;
}

function caractere(n) {
  if (n === 1) return 'un caracter';
  return n >= 20 ? `${n} de caractere` : `${n} caractere`;
}

function verificaPlafoane(campuri, plafoane, erori) {
  for (const c of campuri) {
    if (c.plafon === null) continue;
    const n = grafeme(c.text);
    const max = plafoane[c.plafon];
    if (n <= max) continue;
    erori.push(eroare('rand-nu-incape', c.camp, `${locCamp(c.camp)} are ${caractere(n)}; încap cel mult ${max}.`,
      `Scurtează ${c.camp} la cel mult ${caractere(max)}.`));
  }
}

function verificaDurata(s, i, erori) {
  if (s.durata === undefined || Math.abs(s.durata * 10 - Math.round(s.durata * 10)) <= EPS) return;
  erori.push(eroare('valoare-invalida', `scene[${i}].durata`,
    `Scena ${i + 1}: durata, ${nr(s.durata)} s, nu are pasul de 0,1 s.`,
    `Scrie scene[${i}].durata cu cel mult o zecimală, de exemplu ${nr(Math.round(s.durata * 10) / 10)}.`));
}

/** Cifra: valoarea nu se rotunjește pe tăcute; cu mai multe zecimale decât `zecimale`, scena nu trece (ca la text-animat). */
function verificaZecimaleCifra(s, i, erori) {
  const z = s.zecimale ?? 0;
  const necesar = zecimaleNecesare(s.valoare);
  if (necesar !== null && necesar <= z) return;
  const scrisa = nr(s.valoare);
  if (necesar === null) {
    erori.push(eroare('valoare-invalida', `scene[${i}].valoare`,
      `Scena ${i + 1}: valoarea ${scrisa} are mai multe zecimale decât se pot afișa (cel mult 2).`,
      `Rotunjește scene[${i}].valoare la cel mult 2 zecimale, de exemplu ${formatRo(s.valoare, 2)}, și pune scene[${i}].zecimale 2.`));
    return;
  }
  erori.push(eroare('valoare-invalida', `scene[${i}].zecimale`,
    `Scena ${i + 1}: valoarea ${scrisa} ${z === 0 ? 'are zecimale, dar câmpul zecimale lipsește (implicit 0)' : `are mai multe zecimale decât zecimale ${z}`}, deci pe ecran s-ar rotunji.`,
    `Pune scene[${i}].zecimale ${necesar}, ca valoarea să apară exact.`));
}

/** Barele și comparația afișează toate valorile scenei cu aceleași zecimale (cele mai multe cerute, cel mult 2). */
function verificaZecimaleValori(s, i, erori) {
  s.valori.forEach((v, k) => {
    if (zecimaleNecesare(v.valoare) !== null) return;
    erori.push(eroare('valoare-invalida', `scene[${i}].valori[${k}].valoare`,
      `${locCamp(`scene[${i}].valori[${k}].valoare`)}: ${nr(v.valoare)} are mai mult de 2 zecimale.`,
      `Rotunjește scene[${i}].valori[${k}].valoare la cel mult 2 zecimale, de exemplu ${formatRo(v.valoare, 2)}.`));
  });
}

/** Zecimalele cu care se afișează valorile unei scene bare sau comparatie: cele mai multe cerute de o valoare. */
export function zecimaleScena(s) {
  return Math.max(0, ...s.valori.map((v) => zecimaleNecesare(v.valoare) ?? 2));
}

function verificaGrafic(s, i, erori) {
  if (s.evidentiaza !== undefined && !s.valori.some((v) => v.eticheta === s.evidentiaza)) {
    const etichete = s.valori.map((v) => `„${v.eticheta}”`).join(', ');
    erori.push(eroare('date-serie-evidentiaza', `scene[${i}].evidentiaza`,
      `Scena ${i + 1}: evidentiaza, „${s.evidentiaza}”, nu e eticheta niciunei valori (${etichete}).`,
      `Scrie în scene[${i}].evidentiaza exact eticheta valorii de pus în accent sau scoate câmpul.`));
  }
  if (s.tip === 'bare' && s.valori.every((v) => v.valoare === 0)) {
    erori.push(eroare('date-serie-bare-zero', `scene[${i}].valori`,
      `Scena ${i + 1}: toate valorile barelor sunt 0, deci graficul n-ar avea nicio bară.`,
      `Verifică cifrele din scene[${i}].valori (de unde vin) sau scoate scena.`));
  }
}

function verificaFinal(date, erori) {
  const ultima = date.scene.length - 1;
  date.scene.forEach((s, i) => {
    if (s.tip !== 'final' || i === ultima) return;
    erori.push(eroare('date-serie-final-nu-e-ultimul', `scene[${i}].tip`,
      `Scena ${i + 1} e de tip final, dar nu e ultima: finalul (cu sigla) stă doar la sfârșitul videoului și apare o singură dată.`,
      `Mută scena la sfârșit sau schimbă scene[${i}].tip (de exemplu în „titlu”).`));
  });
}

function verificaTotal(date, implicite, erori) {
  const secunde = cadreTotale(date.scene.map((s) => cadreScena(durataScena(s, implicite)))) / FPS;
  const { min, max } = implicite.total;
  if (secunde >= min - EPS && secunde <= max + EPS) return;
  const durata = nr(Math.round(secunde * 1000) / 1000);
  erori.push(eroare('durata-in-afara-limitelor', 'scene',
    `Videoul ar dura ${durata} s (cu tranzițiile de 0,4 s scăzute); date-serie face videouri de ${min}-${max} s.`,
    secunde < min
      ? 'Adaugă o scenă sau dă scenelor o durată mai mare (scene[i].durata, cel mult 12 s).'
      : 'Scoate scene sau scurtează-le duratele (scene[i].durata, cel puțin 2 s).',
    { verificare: 'C09' }));
}

function verificaSigla(date, ctx, implicite, erori, avertismente) {
  const sursa = sursaSigla(date, ctx.brand ?? null, ctx.dirProiect);
  if (!sursa) return;
  if (sursa.invalida) {
    erori.push(eroare('valoare-invalida', 'brand',
      `${sursa.loc} nu e un nume de fișier din folderul brandului (${JSON.stringify(ctx.brand.sigla)}).`,
      `Pune fișierul siglei în folderul branduri/${ctx.brand.nume}/ și scrie în sigla: doar numele lui, de exemplu sigla.svg.`, { verificare: 'S05' }));
    return;
  }
  const r = citesteSigla(sursa.cale, implicite.sigla_max_octeti);
  if (!r.ok) {
    const unde = sursa.camp === 'brand' ? `fișierul siglei din branduri/${ctx.brand.nume}/` : 'fișierul în resurse/';
    const mesaje = {
      lipsa: [`${sursa.loc} nu există: ${sursa.camp === 'brand' ? ctx.brand.sigla : date.sigla}.`, `Pune ${unde} sau scoate sigla.`],
      extensie: [`${sursa.loc} nu e .svg sau .png.`, 'Folosește o siglă .svg sau .png.'],
      mare: [`${sursa.loc} are ${Math.ceil((r.octeti ?? 0) / 1048576)} MB; încap cel mult 2 MB.`, 'Micșorează fișierul (sau exportă-l ca SVG) și pune-l din nou.'],
      dimensiuni: [`${sursa.loc} nu are dimensiuni citibile (SVG fără viewBox sau width și height, ori un PNG stricat).`, 'Exportă sigla din nou, ca SVG cu viewBox sau ca PNG.'],
    }[r.motiv];
    erori.push(eroare(r.motiv === 'lipsa' ? 'resursa-lipsa' : 'valoare-invalida', sursa.camp, mesaje[0], mesaje[1], { verificare: 'S05' }));
    return;
  }
  // la serie, sigla stă pe fiecare card; la grafic, doar în scena final
  if (date.compozitie !== 'serie' && date.scene.at(-1).tip !== 'final') {
    avertismente.push(avertisment('valoare-invalida', sursa.camp,
      `${sursa.loc} apare doar în scena final, iar videoul nu se termină cu una, deci nu va fi pe ecran.`,
      'Adaugă la sfârșit o scenă de tip „final” sau scoate sigla.', { verificare: 'S05' }));
  }
}

/**
 * Regulile de dincolo de schemă; se apelează doar după ce C02 și brandul au trecut.
 * @returns {{erori: object[], avertismente: object[]}}
 */
export function valideaza(date, ctx) {
  const implicite = ctx.sablon.implicite;
  if (date.compozitie === 'serie') return valideazaSerie(date, ctx, (d, c, e, a) => verificaSigla(d, c, implicite, e, a));
  const erori = [];
  const avertismente = [];
  if (date.serie !== undefined) {
    erori.push(eroare('valoare-invalida', 'serie', 'La compozitie „grafic” nu se dă serie: seria de testimoniale e compozitie „serie”.', 'Scoate serie din date.json sau pune compozitie „serie” (fără scene).'));
  }
  if (date.scene === undefined) {
    erori.push(eroare('camp-lipsa', 'scene', 'La compozitie „grafic” lipsesc scenele (2-8: titlu, cifra, bare, comparatie, final).', 'Adaugă scene în date.json.'));
    return { erori, avertismente };
  }
  const campuri = date.scene.flatMap((s, i) => campuriScena(s, i));
  const c03 = verificaTexteDate(date, campuri.map(({ camp, text }) => ({ camp, text })));
  erori.push(...c03.erori);
  avertismente.push(...c03.avertismente);
  verificaPlafoane(campuri, implicite.plafoane, erori);
  date.scene.forEach((s, i) => {
    verificaDurata(s, i, erori);
    if (s.tip === 'cifra') verificaZecimaleCifra(s, i, erori);
    if (s.tip === 'bare' || s.tip === 'comparatie') {
      verificaZecimaleValori(s, i, erori);
      verificaGrafic(s, i, erori);
    }
  });
  verificaFinal(date, erori);
  if (!erori.some((e) => e.camp.endsWith('.durata'))) verificaTotal(date, implicite, erori);
  verificaSigla(date, ctx, implicite, erori, avertismente);
  return { erori, avertismente };
}
