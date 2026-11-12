// Rândurile seriei (spec 7.3, „Intrarea cursantului”; felia 3): tabelul cursantului (CSV, Excel sau randuri.json),
// antetul cu sinonime, pozele din folder potrivite după nume, scurtările din serie.scurtari. Fișierul cursantului nu se
// atinge: tot ce schimbă agentul stă în date.json (scurtările) sau în folderul pozelor (o poză copiată sub numele omului).
// Erorile: S01 (citirea și antetul), S02 (rândurile, citatele, scurtările), S05 (pozele).
import fs from 'node:fs';
import path from 'node:path';
import { eroare, avertisment, grafeme, citesteTabel } from '../../../../../nucleu/lib/sdk.mjs';
import { dimensiuniPoza, LIMITE_POZA } from './poze.mjs';

export const LIMITE = Object.freeze({
  randuri: { min: 1, max: 100 },
  nume: 40,
  rol: 60,
  citat: { min: 5, max: 350 },
  poza: LIMITE_POZA,
});
export const EXTENSII_POZA = Object.freeze(['jpg', 'jpeg', 'png', 'webp']);
export const MARCAJ = '(…)';

// Antetul: cheia coloanei, fără diacritice, cu litere mici și fără spații în plus → câmpul rândului.
const SINONIME = Object.freeze({
  nume: ['nume', 'numele', 'nume si prenume', 'nume complet', 'name', 'client', 'clientul', 'persoana', 'autor'],
  rol: ['rol', 'rolul', 'oras', 'orasul', 'localitate', 'localitatea', 'judet', 'functie', 'functia', 'firma', 'companie', 'compania', 'ocupatie', 'meserie', 'city', 'role', 'titlu'],
  citat: ['citat', 'citatul', 'text', 'textul', 'testimonial', 'testimonialul', 'mesaj', 'mesajul', 'parere', 'parerea', 'recenzie', 'recenzia', 'review', 'opinie', 'quote'],
  poza: ['poza', 'poze', 'foto', 'fotografie', 'imagine', 'imaginea', 'photo', 'avatar'],
});

const fara = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
/** Cheia unui antet: fără diacritice, litere mici, spațiile comprimate, fără punctuație de la capete. */
export const cheieAntet = (s) => fara(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// id-urile rezervate în cadre/ ale nucleului (schita-N/, foaie-N, revizie-*)
const RE_ID_REZERVAT = /^(?:schita|foaie|revizie)(?:-|$)/;

/** Slug-ul unui nume sau fișier: litere mici fără diacritice, cifre și cratimă (Ana-Maria Popescu → ana-maria-popescu). */
export function slug(s) {
  return fara(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const RE_EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const RE_COD = /[\x00-\x08\x0B-\x1F\x7F-\x9F<>{}]/u;

/** Inițialele afișate în cercul fără poză: primele litere ale primului și ultimului cuvânt (Ana Maria Popescu → AP). */
export function initiale(nume) {
  const cuvinte = nume.split(/[\s-]+/).filter((c) => /\p{L}/u.test(c));
  if (cuvinte.length === 0) return '?';
  const prima = (c) => [...c.replace(/^[^\p{L}]+/u, '')][0]?.toLocaleUpperCase('ro') ?? '';
  return cuvinte.length === 1 ? prima(cuvinte[0]) : prima(cuvinte[0]) + prima(cuvinte.at(-1));
}

function campRand(n) {
  return `randuri[${n}]`;
}

/**
 * Bucățile unei scurtări, fără marcaj: fiecare trebuie să apară în original, în ordine, iar scurtarea să fie mai scurtă.
 * Emoji-urile nu contează la comparație (se pot scoate fără marcaj: fontul nu le are).
 * @returns {string|null} motivul pentru care nu e o tăietură, sau null
 */
export function problemaScurtare(original, scurtat) {
  const norm = (s) => s.replace(RE_EMOJI, '').replace(/\s+/g, ' ').trim();
  const o = norm(original);
  const marcaje = scurtat.replaceAll('(...)', MARCAJ);
  const bucati = marcaje.split(MARCAJ).map(norm).filter(Boolean);
  if (bucati.length === 0) return 'nu păstrează nimic din citat';
  if (!marcaje.includes(MARCAJ)) {
    // fără marcaj, singura tăietură permisă e scoaterea emoji-urilor
    if (norm(marcaje) !== o) return `nu are marcajul ${MARCAJ} în locul bucăților scoase`;
    return new RegExp(RE_EMOJI.source, 'u').test(original) ? null : 'e identică cu originalul';
  }
  let poz = 0;
  for (const b of bucati) {
    const i = o.indexOf(b, poz);
    if (i < 0) return `„${b.length > 50 ? `${b.slice(0, 50)}…` : b}” nu apare în citatul original (sau nu în această ordine); o scurtare doar taie, nu schimbă cuvinte`;
    poz = i + b.length;
  }
  if (grafeme(norm(marcaje)) >= grafeme(o)) return 'nu e mai scurtă decât originalul';
  return null;
}

/** Antetul tabelului: indexul coloanei pentru fiecare câmp și coloanele necunoscute. */
function mapeazaAntet(antet) {
  const index = {};
  const necunoscute = [];
  antet.forEach((celula, k) => {
    const cheie = cheieAntet(celula);
    if (cheie === '') return;
    const camp = Object.keys(SINONIME).find((c) => SINONIME[c].includes(cheie));
    if (camp && index[camp] === undefined) index[camp] = k;
    else necunoscute.push(celula.trim());
  });
  return { index, necunoscute };
}

/** Rândurile din randuri.json (scris de agent, când testimonialele vin în chat): [{nume, rol, citat, poza}]. */
function dinJson(cale, camp) {
  let date;
  try {
    date = JSON.parse(fs.readFileSync(cale, 'utf8'));
  } catch (e) {
    return { eroare: eroare('serie-fisier-invalid', camp, `randuri.json nu se poate citi ca JSON (${e.message}).`, 'Scrie randuri.json ca listă: [{"nume": "...", "rol": "...", "citat": "...", "poza": "..."}].', { verificare: 'S01' }) };
  }
  if (!Array.isArray(date) || !date.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    return { eroare: eroare('serie-fisier-invalid', camp, 'randuri.json trebuie să fie o listă de obiecte {nume, rol, citat, poza}.', 'Scrie randuri.json ca listă: [{"nume": "...", "rol": "...", "citat": "...", "poza": "..."}].', { verificare: 'S01' }) };
  }
  const chei = new Set(['nume', 'rol', 'citat', 'poza']);
  const necunoscute = [...new Set(date.flatMap((r) => Object.keys(r).filter((k) => !chei.has(k))))];
  const sir = (v) => (v === undefined || v === null ? '' : String(v));
  return { brute: date.map((r) => ({ nume: sir(r.nume), rol: sir(r.rol), citat: sir(r.citat), poza: sir(r.poza) })), necunoscute, sursa: { tip: 'json', codificare: 'utf-8', separator: null, sedile: 0, poze_in_excel: 0 } };
}

/** Pozele din folder: slug-ul numelui fără extensie → fișierele cu acel slug. */
function pozeDinFolder(dir) {
  const harta = new Map();
  let nume = [];
  try {
    nume = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
  } catch {
    return { harta, toate: [] };
  }
  const toate = nume.filter((n) => EXTENSII_POZA.includes(path.extname(n).slice(1).toLowerCase()));
  for (const n of toate) {
    const s = slug(path.basename(n, path.extname(n)));
    if (!harta.has(s)) harta.set(s, []);
    harta.get(s).push(n);
  }
  return { harta, toate };
}

/** Folderul pozelor: serie.poze, altfel resurse/poze dacă există, altfel resurse. Relativ la proiect, cu /. */
export function folderPoze(date, dirProiect) {
  if (date.serie.poze) return date.serie.poze;
  return fs.existsSync(path.join(dirProiect, 'resurse', 'poze')) ? 'resurse/poze' : 'resurse';
}

/**
 * Rândurile seriei, gata de așezat. Se cheamă după schemă (date.serie există).
 * @param {object} date @param {{dirProiect: string}} ctx
 * @returns {{randuri: Array<{n: number, id: string, nume: string, rol: string, citat: string, citat_original: string, scurtat: boolean, poza: {fisier: string, cale: string, extensie: string, latime: number, inaltime: number}|null, initiale: string}>,
 *   erori: object[], avertismente: object[], sursa: object|null, fisiere: string[]}}
 *   fisiere = căile relative la proiect ale fișierelor citite (tabelul și pozele folosite), pentru amprenta seriei
 */
export function citesteRanduri(date, ctx) {
  const erori = [];
  const avertismente = [];
  const camp = 'serie.fisier';
  const fisierRel = date.serie.fisier;
  const cale = path.join(ctx.dirProiect, ...fisierRel.split('/'));
  const gol = { randuri: [], erori, avertismente, sursa: null, fisiere: [] };
  if (!fs.existsSync(cale)) {
    erori.push(eroare('resursa-lipsa', camp, `Fișierul seriei, ${fisierRel}, nu există în proiect.`,
      fisierRel === 'randuri.json' ? 'Scrie randuri.json cu testimonialele din mesajul cursantului.' : `Copiază tabelul cursantului neatins în video/<proiect>/${fisierRel}.`, { verificare: 'S01' }));
    return gol;
  }
  let brute;
  let necunoscute = [];
  let sursa;
  if (fisierRel === 'randuri.json') {
    const r = dinJson(cale, camp);
    if (r.eroare) {
      erori.push(r.eroare);
      return gol;
    }
    ({ brute, necunoscute, sursa } = r);
  } else {
    const t = citesteTabel(fs.readFileSync(cale), { camp, nume: fisierRel });
    if (!t.ok) {
      erori.push(t.eroare);
      return gol;
    }
    sursa = t.sursa;
    const [antet = [], ...rest] = t.randuri;
    const m = mapeazaAntet(antet);
    const lipsa = ['nume', 'citat'].filter((c) => m.index[c] === undefined);
    if (lipsa.length > 0) {
      erori.push(eroare('date-serie-antet', camp,
        `${fisierRel}: primul rând trebuie să numească coloanele; nu găsesc ${lipsa.map((c) => (c === 'nume' ? '„nume”' : '„citat” (sau „text”, „testimonial”)')).join(' și ')} printre: ${antet.filter((x) => x.trim()).map((x) => `„${x.trim()}”`).join(', ') || 'nimic'}.`,
        'Pune pe primul rând al tabelului numele coloanelor: nume, rol (sau oraș), citat (sau text), poza (opțional), apoi dă fișierul din nou.', { verificare: 'S01' }));
      return gol;
    }
    necunoscute = m.necunoscute;
    const celula = (rand, c) => (m.index[c] === undefined ? '' : (rand[m.index[c]] ?? ''));
    brute = rest.map((rand) => ({ nume: celula(rand, 'nume'), rol: celula(rand, 'rol'), citat: celula(rand, 'citat'), poza: celula(rand, 'poza') }));
  }
  if (necunoscute.length > 0) {
    avertismente.push(avertisment('date-serie-coloana-necunoscuta', camp,
      `${fisierRel}: coloanele ${necunoscute.map((x) => `„${x}”`).join(', ')} nu apar pe card și se ignoră.`,
      'Nimic de făcut dacă nu trebuie să apară; altfel spune-i cursantului ce coloane folosește cardul (nume, rol sau oraș, citat, poza).', { verificare: 'S02' }));
  }
  if (sursa.sedile > 0) {
    avertismente.push(avertisment('sedila', camp,
      `${fisierRel}: ${sursa.sedile} ${sursa.sedile === 1 ? 'literă cu sedilă (\u015F, \u0163) a fost scrisă' : 'litere cu sedilă (\u015F, \u0163) au fost scrise'} cu virgulă (ș, ț), doar pe card; fișierul rămâne neatins.`,
      'Notează în jurnal.md corectura sedilelor.', { verificare: 'S01' }));
  }

  const curate = brute.map((r) => ({ nume: r.nume.replace(/\s+/g, ' ').trim(), rol: r.rol.replace(/\s+/g, ' ').trim(), citat: r.citat.replace(/\s+/g, ' ').trim(), poza: r.poza.trim() }))
    .filter((r) => r.nume !== '' || r.citat !== '' || r.rol !== '');
  if (curate.length < LIMITE.randuri.min || curate.length > LIMITE.randuri.max) {
    erori.push(eroare('date-serie-randuri', camp,
      curate.length === 0 ? `${fisierRel} nu are niciun testimonial sub antet.` : `${fisierRel} are ${curate.length} de testimoniale; o serie are cel mult ${LIMITE.randuri.max}.`,
      curate.length === 0 ? 'Cere-i cursantului tabelul completat, cu câte un testimonial pe rând.' : 'Împarte tabelul în două serii (două proiecte).', { verificare: 'S02' }));
    return { ...gol, sursa };
  }

  const dirPozeRel = folderPoze(date, ctx.dirProiect);
  const { harta, toate: pozeFolder } = pozeDinFolder(path.join(ctx.dirProiect, ...dirPozeRel.split('/')));
  const folosite = new Set();
  const vazute = new Map();
  const randuri = [];
  const scurtari = date.serie.scurtari ?? {};
  const numeFolosite = new Set();
  curate.forEach((r, n) => {
    const c = campRand(n);
    const loc = `Rândul ${n + 2} din ${fisierRel}${r.nume ? ` (${r.nume})` : ''}`;
    const reparaInFisier = 'Cere-i cursantului să corecteze rândul în tabel și să-l dea din nou; fișierul lui nu se modifică de mână.';
    if (r.nume === '') {
      erori.push(eroare('date-serie-rand-invalid', `${c}.nume`, `${loc}: lipsește numele.`, reparaInFisier, { verificare: 'S02' }));
      return;
    }
    if (r.citat === '') {
      erori.push(eroare('date-serie-rand-invalid', `${c}.citat`, `${loc}: lipsește textul testimonialului.`, reparaInFisier, { verificare: 'S02' }));
      return;
    }
    for (const [k, v, max] of [['nume', r.nume, LIMITE.nume], ['rol', r.rol, LIMITE.rol]]) {
      if (RE_COD.test(v) || new RegExp(RE_EMOJI.source, 'u').test(v)) {
        erori.push(eroare('date-serie-rand-invalid', `${c}.${k}`, `${loc}: ${k === 'nume' ? 'numele' : 'rolul'} are caractere care nu se pot afișa (emoji sau < > { }).`, reparaInFisier, { verificare: 'S02' }));
      } else if (grafeme(v) > max) {
        erori.push(eroare('date-serie-rand-invalid', `${c}.${k}`, `${loc}: ${k === 'nume' ? 'numele' : 'rolul'} are ${grafeme(v)} de caractere; încap cel mult ${max}.`, reparaInFisier, { verificare: 'S02' }));
      }
    }
    const baza = slug(r.nume).slice(0, 40).replace(/-+$/, '') || `rand-${n + 1}`;
    // cadre/schita-N/, foaie-N și revizie-* sunt ale nucleului; un om numit „Schița 2” primește prefixul om-
    const id = RE_ID_REZERVAT.test(baza) ? `om-${baza}` : baza;
    if (vazute.has(id)) {
      erori.push(eroare('date-serie-nume-duplicat', `${c}.nume`, `${loc}: numele dă același fișier ca rândul ${vazute.get(id) + 2} (${id}); fiecare testimonial are nevoie de un nume unic.`,
        'Cere-i cursantului să deosebească numele (de exemplu cu inițiala de familie) sau să scoată rândul dublat.', { verificare: 'S02' }));
      return;
    }
    vazute.set(id, n);
    numeFolosite.add(r.nume);

    // citatul: scurtarea agentului (doar tăieturi), apoi limitele
    let citat = r.citat;
    let scurtat = false;
    if (Object.hasOwn(scurtari, r.nume)) {
      const motiv = problemaScurtare(r.citat, scurtari[r.nume]);
      if (motiv) {
        erori.push(eroare('date-serie-scurtare-invalida', `serie.scurtari.${r.nume}`, `Scurtarea citatului lui ${r.nume} ${motiv}. Citatul original: „${r.citat}”`,
          `Scrie în serie.scurtari["${r.nume}"] citatul original din care scoți bucăți, cu ${MARCAJ} în locul fiecărei bucăți scoase; nu schimba și nu adăuga cuvinte.`, { verificare: 'S02' }));
        return;
      }
      citat = scurtari[r.nume].replaceAll('(...)', MARCAJ).replace(RE_EMOJI, '').replace(/\s+/g, ' ').trim();
      scurtat = true;
    }
    if (RE_COD.test(citat)) {
      erori.push(eroare('date-serie-rand-invalid', `${c}.citat`, `${loc}: citatul are caractere care nu se pot afișa (< > { } sau caractere de control).`, reparaInFisier, { verificare: 'S02' }));
      return;
    }
    if (new RegExp(RE_EMOJI.source, 'u').test(citat)) {
      erori.push(eroare('date-serie-rand-invalid', `${c}.citat`, `${loc}: citatul are emoji, pe care fontul cardului nu le are.`,
        `Scrie în serie.scurtari["${r.nume}"] citatul fără emoji (doar le scoți, restul rămâne identic) și arată-i cursantului cum va apărea.`, { verificare: 'S02' }));
      return;
    }
    const g = grafeme(citat);
    if (g < LIMITE.citat.min) {
      erori.push(eroare('date-serie-rand-invalid', `${c}.citat`, `${loc}: citatul are doar ${g} caractere; un card are nevoie de cel puțin ${LIMITE.citat.min}.`, reparaInFisier, { verificare: 'S02' }));
      return;
    }
    if (g > LIMITE.citat.max) {
      erori.push(eroare('date-serie-citat-lung', `${c}.citat`,
        `${loc}: citatul are ${g} de caractere; pe un card încap cel mult ${LIMITE.citat.max} (și cât se poate citi în 20 s). Citatul, întreg: „${r.citat}”`,
        `Propune-i cursantului o scurtare: scrie-o în serie.scurtari["${r.nume}"], cu ${MARCAJ} în locul bucăților scoase, și arat-o în blocul „Ce apare pe ecran” înainte de „aprob”.`, { verificare: 'S02' }));
      return;
    }

    // poza: coloana poza are prioritate; altfel fișierul din folder cu slug-ul numelui
    let poza = null;
    let fisierPoza = null;
    if (r.poza !== '') {
      if (/[\\/]/.test(r.poza) || r.poza.startsWith('.')) {
        erori.push(eroare('valoare-invalida', `${c}.poza`, `${loc}: poza „${r.poza}” trebuie să fie doar un nume de fișier din ${dirPozeRel}/.`, `Pune poza în ${dirPozeRel}/ și scrie în tabel doar numele ei, de exemplu ana.jpg.`, { verificare: 'S05' }));
        return;
      }
      fisierPoza = r.poza;
      if (!pozeFolder.includes(r.poza)) {
        erori.push(eroare('resursa-lipsa', `${c}.poza`, `${loc}: poza „${r.poza}” din tabel nu e în ${dirPozeRel}/.`,
          `Cere-i cursantului poza și copiaz-o în video/<proiect>/${dirPozeRel}/ cu exact numele din tabel (.jpg, .png sau .webp).`, { verificare: 'S05' }));
        return;
      }
    } else {
      const candidati = harta.get(id) ?? [];
      if (candidati.length > 1) {
        erori.push(eroare('date-serie-poza-ambigua', `${c}.poza`, `${loc}: în ${dirPozeRel}/ sunt mai multe poze cu numele lui: ${candidati.join(', ')}.`,
          'Întreabă-l pe cursant pe care o vrea și lasă în folder doar una cu acest nume.', { verificare: 'S05' }));
        return;
      }
      fisierPoza = candidati[0] ?? null;
    }
    if (fisierPoza !== null) {
      folosite.add(fisierPoza);
      const caleP = path.join(ctx.dirProiect, ...dirPozeRel.split('/'), fisierPoza);
      const d = dimensiuniPoza(caleP);
      if (!d.ok) {
        const mesaj = {
          mare: `are ${Math.ceil(d.octeti / 1048576)} MB; încap cel mult 8 MB`,
          format: 'nu e o poză JPG, PNG sau WebP citibilă (o poză .heic de pe iPhone se exportă întâi ca JPG)',
          mica: `are ${d.latime}x${d.inaltime} px; latura mică are nevoie de cel puțin ${LIMITE.poza.latura} px, altfel pe card iese neclară`,
        }[d.motiv];
        erori.push(eroare('valoare-invalida', `${c}.poza`, `${loc}: poza ${fisierPoza} ${mesaj}.`,
          d.motiv === 'mica' ? 'Cere-i cursantului o poză mai mare sau scoate poza (cardul arată atunci inițialele).' : 'Cere-i cursantului poza ca JPG sau PNG și înlocuiește fișierul.', { verificare: 'S05' }));
        return;
      }
      poza = { fisier: fisierPoza, cale: caleP, rel: `${dirPozeRel}/${fisierPoza}`, extensie: d.extensie, latime: d.latime, inaltime: d.inaltime };
    }
    randuri.push({ n, id, nume: r.nume, rol: r.rol, citat, citat_original: r.citat, scurtat, poza, initiale: initiale(r.nume) });
  });

  for (const nume of Object.keys(scurtari)) {
    if (!numeFolosite.has(nume)) {
      erori.push(eroare('date-serie-scurtare-invalida', `serie.scurtari.${nume}`, `serie.scurtari are o scurtare pentru „${nume}”, dar tabelul nu are un testimonial cu acest nume.`,
        'Scrie cheia exact ca numele din tabel sau scoate scurtarea.', { verificare: 'S02' }));
    }
  }
  const nefolosite = pozeFolder.filter((p) => !folosite.has(p));
  if (dirPozeRel !== 'resurse' && nefolosite.length > 0) {
    avertismente.push(avertisment('date-serie-poza-fara-om', `serie.poze`,
      `În ${dirPozeRel}/, ${nefolosite.map((p) => `„${p}”`).join(', ')} nu se potrivesc cu niciun nume din tabel.`,
      `Întreabă-l pe cursant al cui e fiecare poză; copiaz-o în ${dirPozeRel}/ cu numele omului (de exemplu ana-popescu.jpg) sau scrie numele fișierului în coloana poza.`, { verificare: 'S05' }));
  }
  const faraPoza = randuri.filter((r) => r.poza === null);
  if (sursa.poze_in_excel > 0 && faraPoza.length > 0) {
    avertismente.push(avertisment('date-serie-poze-in-excel', camp,
      `${fisierRel} are ${sursa.poze_in_excel} ${sursa.poze_in_excel === 1 ? 'poză lipită' : 'poze lipite'} în foaie, pe care agentul nu le citește; ${faraPoza.map((r) => r.nume).join(', ')} ${faraPoza.length === 1 ? 'apare' : 'apar'} acum cu inițiale.`,
      'Cere-i cursantului pozele ca fișiere separate (un folder), cu numele oamenilor, și pune-le în resurse/poze/.', { verificare: 'S05' }));
  }
  const fisiere = [fisierRel, ...randuri.filter((r) => r.poza).map((r) => r.poza.rel)];
  return { randuri, erori, avertismente, sursa, fisiere: [...new Set(fisiere)].sort() };
}
