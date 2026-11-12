// mg genereaza desen (spec 6.10, pasul 7; felia 5): un desen nou prin Kie, cu cheia și costul cursantului.
// --estimeaza spune costul și ce lipsește, fără să cheltuie nimic (garda îl lasă să treacă); fără el, garda cere
// aprobarea, iar desenul generat devine o formă umplută în proprii/, prin același drum ca mg desen adauga.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eroare, avertisment, EroareFatala, COD_IESIRE } from '../erori.mjs';
import { citesteJson, scrieJsonAtomic, existaFisier, scrieOctetiAtomic } from '../fisiere.mjs';
import { incarcaCatalog, gasestePiesa } from '../desen/catalog.mjs';
import { adaugaPiesa } from '../desen/adauga.mjs';
import { decodeazaPng, PngNeacceptat } from './png.mjs';
import { vectorizeaza, DesenNefolosibil } from './contur.mjs';
import { clientKie, EroareKie, MODEL } from './kie.mjs';
import { stareGenerare, citesteCheie, comandaPuneCheie, SeifIndisponibil } from './cheie.mjs';

const AICI = dirname(fileURLToPath(import.meta.url));
export const REFERINTA = Object.freeze({ fisier: join(AICI, 'referinta-stil.png'), piesa: 'op-picioare-sacou', sursa: 'Open Peeps, CC0' });
// Verificarea termenilor (spec 8.3.6), făcută pe 2026-10-26 și acceptată de Dănuț („da, cu notă”).
export const TERMENI = Object.freeze({
  verificat: '2026-10-26',
  surse: ['https://kie.ai/terms-of-use (în vigoare din 2025-08-01)', 'https://openai.com/policies/row-terms-of-use/ (în vigoare din 2026-01-01)'],
  nota: 'Kie nu revendică rezultatele și nu restrânge uzul comercial; OpenAI dă rezultatul celui care folosește serviciul. Desenul generat e în răspunderea cursantului, ca orice piesă proprie.',
});

const STIL = 'Redraw in exactly the same illustration style as the reference image: hand-drawn black ink outlines with slightly '
  + 'uneven brush thickness, solid black only for hair and small details, white fills, flat, no gray, no shading, no color, '
  + 'no text, no letters, no background, no floor line, pure white background with a generous white margin around the drawing. '
  + 'The reference is only a style guide: do not copy its person, pose or clothes.';
const COMPLET = 'Show the whole drawing inside the frame: both arms and both hands complete, and every object the person touches, '
  + 'holds or sits on (a chair, a table, an oven), drawn in the same style.';

export const PAS_SEIF = 'Cursantul verifică în terminalul lui, din folderul agentului (pe Mac, Keychain poate cere o dată parola): '
  + `${comandaPuneCheie().replace(' pune ', ' verifica ')}; apoi rulezi din nou node nucleu/mg.mjs doctor --generare.`;

function gresit(cod, camp, mesaj, sugestie, codIesire = COD_IESIRE.UTILIZARE) {
  return new EroareFatala(eroare(cod, camp, mesaj, sugestie), codIesire);
}

/** Promptul trimis la Kie; subiectul e cel scris de agent, în cuvintele cererii. */
export function construiestePrompt(subiect) {
  return `${STIL} Draw: ${subiect}. ${COMPLET}`;
}

/** Prețul modelului, din tabelul datat din repo (spec 6.10); nu se citește prețul live. */
export function pretModel(radacina) {
  const p = citesteJson(join(radacina, 'nucleu', 'preturi.json'));
  const m = p?.modele?.[MODEL];
  if (!m || !Number.isFinite(m.credite) || !Number.isFinite(m.usd) || typeof p.data !== 'string') {
    throw gresit('json-invalid', 'fisier:nucleu/preturi.json', `nucleu/preturi.json nu are prețul modelului ${MODEL}.`,
      'Fișierul vine cu agentul; adu-l înapoi cu node nucleu/mg.mjs actualizeaza sau cere-l lui Dănuț.', COD_IESIRE.MEDIU);
  }
  return { credite: m.credite, usd: m.usd, data: p.data, rezolutie: m.rezolutie };
}

const dataRo = (iso) => iso.split('-').reverse().join('.');
const dolari = (v) => `${v.toFixed(2).replace('.', ',')} $`;

function valideaza(radacina, pozitionale, optiuni) {
  const [sub, id, subiect, ...rest] = pozitionale;
  if (sub !== 'desen') {
    throw gresit('argument-necunoscut', 'argumente.sub', sub ? `Subcomanda „${sub}” nu există.` : 'Lipsește subcomanda.',
      'Scrie: node nucleu/mg.mjs genereaza desen p-<nume> "<subiectul>" --etichete "<e1,e2,e3,e4>" --estimeaza');
  }
  if (rest.length > 0) {
    throw gresit('argument-necunoscut', 'argumente.pozitional', `Argumentul „${rest[0]}” nu e așteptat.`,
      'Subiectul se pune între ghilimele, ca un singur argument.');
  }
  if (typeof id !== 'string' || !/^p-[a-z0-9][a-z0-9-]{0,38}$/.test(id)) {
    throw gresit('valoare-invalida', 'argumente.id', `Id-ul „${id ?? ''}” nu e valid.`,
      'Dă un id p-<nume>, doar litere mici fără diacritice, cifre și cratime, de exemplu p-brutar-cuptor.');
  }
  if (gasestePiesa(incarcaCatalog(radacina), id)) {
    throw gresit('valoare-invalida', 'argumente.id', `Există deja o piesă cu id-ul „${id}”.`, 'Alege alt id, de exemplu cu -2 la final.');
  }
  const s = typeof subiect === 'string' ? subiect.trim() : '';
  if (s.length < 5 || s.length > 300 || /[\r\n<>{}]/.test(s)) {
    throw gresit('valoare-invalida', 'argumente.subiect', 'Subiectul trebuie să aibă 5-300 de caractere, pe un singur rând, fără < > { }.',
      'Descrie desenul într-o propoziție, de exemplu „un brutar care scoate pâinea din cuptor”.');
  }
  const etichete = [...new Set(String(optiuni.etichete ?? '').split(',').map((e) => e.trim()).filter(Boolean))];
  if (etichete.length < 4) {
    throw gresit('desen-etichete-putine', 'argumente.etichete', `Desenul are ${etichete.length} etichete; trebuie cel puțin 4, ca să fie găsit la căutare.`,
      'Adaugă --etichete "<e1,e2,e3,e4>", cuvinte în română, cu diacritice.');
  }
  return { id, subiect: s, etichete };
}

/**
 * @param {{radacina: string, pozitionale: string[], optiuni: {etichete?: string, estimeaza?: boolean},
 *   dependente?: {stare?: Function, cheie?: Function, client?: Function, azi?: () => string}}} p
 * @returns {Promise<{ok: boolean, erori: object[], avertismente: object[], rezultat: object}>}
 */
export async function comandaGenereaza({ radacina, pozitionale, optiuni = {}, dependente = {} }) {
  if (pozitionale[0] === 'reia') return reiaGenerarea({ radacina, pozitionale, optiuni, dependente });
  const { id, subiect, etichete } = valideaza(radacina, pozitionale, optiuni);
  const pret = pretModel(radacina);
  const stare = await (dependente.stare ?? stareGenerare)(radacina);
  const cost = `1 desen, ${pret.credite} credite Kie, cam ${dolari(pret.usd)} (prețul din ${dataRo(pret.data)})`;

  if (optiuni.estimeaza) {
    const lipsa = !stare.python ? 'python' : !stare.keyring ? 'keyring' : stare.seif ? 'seif' : !stare.cheie ? 'cheie' : null;
    const pas = {
      python: 'pe calculator lipsește Python 3. Cursantul îl instalează după INSTALARE.md, secțiunea „Generarea de desene”, apoi rulezi node nucleu/mg.mjs doctor --generare.',
      keyring: 'lipsește seiful pentru cheie (keyring). Cu acordul cursantului, rulezi node nucleu/mg.mjs doctor --generare --instaleaza-keyring.',
      seif: `seiful sistemului n-a răspuns limpede (${stare.seif}). ${PAS_SEIF}`,
      cheie: `lipsește cheia Kie. Cursantul o pune singur, în terminalul lui, din folderul agentului: ${comandaPuneCheie()} (nu o scrie în chat).`,
    }[lipsa];
    const text = [
      `Costul estimat pentru „${id}”: ${cost}. O încercare ratată la Kie nu costă; un desen care nu iese bine costă.`,
      lipsa ? `Generarea nu e gata: ${pas}` : 'Generarea e gata: Python, seiful și cheia Kie sunt la locul lor.',
      lipsa
        ? 'Până atunci, propune cursantului cel mai apropiat desen din bibliotecă (node nucleu/mg.mjs desen cauta) și continuă filmul.'
        : `Spune-i cursantului costul și așteaptă-i acordul; apoi rulează aceeași comandă fără --estimeaza.`,
    ].join('\n');
    return { ok: true, erori: [], avertismente: [], rezultat: { text, id, cost: { ...pret, desene: 1 }, gata: lipsa === null, lipsa } };
  }

  const client = await clientCuCheie(radacina, stare, dependente);
  const azi = (dependente.azi ?? (() => new Date().toISOString().slice(0, 10)))();
  const prompt = construiestePrompt(subiect);
  let idSarcina;
  try {
    const referinta = await client.incarca(readFileSync(REFERINTA.fisier), 'referinta-stil.png');
    idSarcina = await client.creeaza(prompt, [referinta]);
  } catch (e) {
    if (!(e instanceof EroareKie)) throw e;
    // înainte de sarcină nu s-a cheltuit nimic
    const cod = e.refuz || e.credit ? 'kie-refuz' : 'kie-esuat';
    const sugestie = e.refuz
      ? `Cheia pare greșită sau expirată. Cursantul o pune din nou, în terminalul lui: ${comandaPuneCheie()}.`
      : e.credit ? 'Contul Kie nu mai are credite. Cursantul le încarcă pe kie.ai, apoi încerci din nou, cu acordul lui.'
        : 'Sarcina n-a pornit, deci nu costă. Încearcă o dată din nou, cu acordul cursantului; altfel, folosește cel mai apropiat desen din bibliotecă.';
    throw gresit(cod, 'mediu.kie', e.message, sugestie, COD_IESIRE.MEDIU);
  }
  // de aici sarcina e la Kie și se poate plăti: jurnalul o ține înainte de orice altceva, ca reia s-o poată termina
  const jurnal = citesteJurnal(radacina);
  const incercare = jurnal.generari.filter((g) => g.id === id).length + 1;
  const intrare = { id, incercare, data: azi, model: MODEL, sarcina: idSarcina, credite: pret.credite, usd: pret.usd, subiect, prompt, etichete, stare: 'in-curs' };
  jurnal.generari.push(intrare);
  scrieJurnal(radacina, jurnal);
  return duceLaCapat({ radacina, intrare, client, optiuni, cost });
}

const STARI_DE_RELUAT = new Set(['in-curs', 'gata', 'descarcat']);

/** mg genereaza reia <p-id>: termină ultima generare începută pentru id, fără să pornească alta (nu costă). */
async function reiaGenerarea({ radacina, pozitionale, optiuni, dependente }) {
  const [, id, ...rest] = pozitionale;
  if (rest.length > 0 || typeof id !== 'string' || !/^p-[a-z0-9][a-z0-9-]{0,38}$/.test(id)) {
    throw gresit('valoare-invalida', 'argumente.id', 'reia primește doar id-ul desenului.', 'Scrie: node nucleu/mg.mjs genereaza reia p-<nume>');
  }
  const intrare = citesteJurnal(radacina).generari.filter((g) => g.id === id).at(-1);
  if (!intrare || !STARI_DE_RELUAT.has(intrare.stare)) {
    const motiv = !intrare ? `Nu există nicio generare începută pentru „${id}”.`
      : intrare.stare === 'pus' ? `Desenul „${id}” e deja în proprii/.`
        : `Ultima generare pentru „${id}” s-a încheiat (${intrare.stare === 'esuat' ? 'a eșuat la Kie' : 'desenul nu s-a putut folosi'}); nu e nimic de reluat.`;
    throw gresit('valoare-invalida', 'argumente.id', motiv, 'O generare nouă costă: întâi --estimeaza și acordul cursantului.');
  }
  if (gasestePiesa(incarcaCatalog(radacina), id)) {
    throw gresit('valoare-invalida', 'argumente.id', `Există deja o piesă cu id-ul „${id}”.`, 'Desenul e deja pus; arată-l cu node nucleu/mg.mjs desen arata.');
  }
  const pret = { credite: intrare.credite, usd: intrare.usd };
  const cost = `cel cu care a pornit sarcina (${intrare.credite} credite Kie, cam ${dolari(intrare.usd)}); reluarea nu costă`;
  // un desen deja descărcat se vectorizează din nou fără Kie, deci și fără cheie
  const client = intrare.stare === 'descarcat' ? null : await clientCuCheie(radacina, await (dependente.stare ?? stareGenerare)(radacina), dependente);
  return duceLaCapat({ radacina, intrare, client, optiuni, cost, pret });
}

async function clientCuCheie(radacina, stare, dependente) {
  if (!stare.keyring) {
    throw gresit('generare-nepregatita', 'mediu.generare',
      stare.python ? 'Seiful pentru cheie (keyring) nu e instalat în unelte/python/.' : 'Pe calculator lipsește Python 3, de care are nevoie seiful pentru cheie.',
      stare.python ? 'Cu acordul cursantului: node nucleu/mg.mjs doctor --generare --instaleaza-keyring.' : 'Instalează Python 3 după INSTALARE.md, secțiunea „Generarea de desene”, apoi node nucleu/mg.mjs doctor --generare.',
      COD_IESIRE.MEDIU);
  }
  let cheie;
  try {
    cheie = await (dependente.cheie ?? citesteCheie)(radacina);
  } catch (e) {
    if (!(e instanceof SeifIndisponibil)) throw e;
    throw gresit('generare-nepregatita', 'mediu.seif', `Seiful sistemului n-a răspuns limpede: ${e.message}.`, PAS_SEIF, COD_IESIRE.MEDIU);
  }
  if (!cheie) {
    throw gresit('kie-cheie-lipsa', 'mediu.cheie-kie', 'Cheia Kie nu e în seiful sistemului.',
      `Cursantul o pune singur, în terminalul lui, din folderul agentului: ${comandaPuneCheie()}. Până atunci, folosește cel mai apropiat desen din bibliotecă.`,
      COD_IESIRE.MEDIU);
  }
  return (dependente.client ?? clientKie)(cheie);
}

const caleJurnal = (radacina) => join(radacina, 'proprii', 'generate', 'jurnal.json');

function citesteJurnal(radacina) {
  const cale = caleJurnal(radacina);
  const j = existaFisier(cale) ? citesteJson(cale) : null;
  return j && Array.isArray(j.generari) ? j : { versiune: 1, generari: [] };
}

function scrieJurnal(radacina, jurnal) {
  mkdirSync(dirname(caleJurnal(radacina)), { recursive: true });
  scrieJsonAtomic(caleJurnal(radacina), jurnal);
}

/** Schimbă intrarea sarcinii în jurnal (și în obiectul din memorie). */
function noteaza(radacina, intrare, campuri) {
  Object.assign(intrare, campuri);
  const jurnal = citesteJurnal(radacina);
  const i = jurnal.generari.findLastIndex((g) => g.sarcina === intrare.sarcina);
  if (i === -1) jurnal.generari.push(intrare);
  else jurnal.generari[i] = { ...jurnal.generari[i], ...campuri };
  scrieJurnal(radacina, jurnal);
}

/** Extensia după primii octeți: Kie dă de obicei PNG, dar nu promite. */
function extensieDupaSemnatura(b) {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return 'bin';
}

/** Din sarcina pornită până la piesa din proprii/: așteptarea, descărcarea, vectorizarea, catalogul. */
async function duceLaCapat({ radacina, intrare, client, optiuni, cost, pret = { credite: intrare.credite, usd: intrare.usd } }) {
  const { id, sarcina, prompt, etichete, subiect } = intrare;
  const baza = `${id}-${intrare.incercare ?? 1}`;
  let imagine;
  if (intrare.stare === 'descarcat') {
    imagine = readFileSync(join(radacina, 'proprii', intrare.imagine));
  } else {
    try {
      if (intrare.stare !== 'gata') noteaza(radacina, intrare, { rezultat: await client.asteapta(sarcina), stare: 'gata' });
      imagine = await client.descarca(intrare.rezultat);
    } catch (e) {
      if (!(e instanceof EroareKie)) throw e;
      if (e.esuat) {
        noteaza(radacina, intrare, { stare: 'esuat' });
        throw gresit('kie-esuat', 'mediu.kie', e.message,
          'Kie a spus că sarcina a eșuat, deci nu se plătește. Încearcă o dată din nou, cu acordul cursantului; altfel, folosește cel mai apropiat desen din bibliotecă.',
          COD_IESIRE.MEDIU);
      }
      throw gresit('kie-esuat', 'mediu.kie', `${e.message} Sarcina ${sarcina} a pornit la Kie, deci poate fi plătită.`,
        `Nu porni alta. Peste un minut sau două, rulează node nucleu/mg.mjs genereaza reia ${id}; reluarea nu costă. Spune-i cursantului că desenul e încă la Kie.`,
        COD_IESIRE.MEDIU);
    }
    const ext = extensieDupaSemnatura(imagine);
    scrieOctetiAtomic(join(radacina, 'proprii', 'generate', `${baza}.${ext}`), imagine);
    noteaza(radacina, intrare, { imagine: `generate/${baza}.${ext}`, stare: 'descarcat' });
  }

  let vector;
  try {
    vector = vectorizeaza(decodeazaPng(imagine));
  } catch (e) {
    // orice cădere a vectorizării (și una neprevăzută) lasă imaginea plătită pe disc și spune ce s-a întâmplat
    noteaza(radacina, intrare, { stare: 'nefolosibil' });
    const motiv = e instanceof DesenNefolosibil || e instanceof PngNeacceptat ? e.message : `vectorizarea a căzut (${e?.name ?? 'eroare'}: ${e?.message ?? e})`;
    throw gresit('desen-generat-nefolosibil', 'desen.generat', `Desenul generat nu se poate folosi: ${motiv}. Imaginea e în proprii/${intrare.imagine}.`,
      'Spune-i cursantului ce s-a întâmplat și că încercarea a costat; cu acordul lui, mai încearcă o dată (cel mult două încercări pe desen), altfel folosește cel mai apropiat desen din bibliotecă.',
      COD_IESIRE.DATE);
  }
  const caleSvg = join(radacina, 'proprii', 'generate', `${baza}.svg`);
  writeFileSync(caleSvg, vector.svg);
  const licenta = `generat de cursant prin Kie (${intrare.model}), ${intrare.data}; în răspunderea cursantului, ca orice piesă proprie`;
  // proveniența (spec 8.3.6, 8.6) intră în catalog odată cu piesa, într-o singură scriere
  const extra = {
    acoperire_cerneala: vector.acoperire,
    descriere: subiect,
    generat: { model: intrare.model, prompt, data: intrare.data, sarcina, referinta: `${REFERINTA.piesa} (${REFERINTA.sursa})`, imagine: intrare.imagine, termeni: TERMENI },
  };
  const piesa = await adaugaPiesa(radacina, caleSvg, { licenta, etichete, id, extra });
  noteaza(radacina, intrare, { stare: 'pus' });

  const avertismente = vector.avertisment ? [avertisment('desen-generat-fara-silueta', 'desen.generat', vector.avertisment, 'Arată-i cursantului desenul și întreabă-l dacă se vede bine pe fundalul filmului.')] : [];
  const text = [
    `Desenul „${id}” e generat și pus în proprii/ (${vector.trasee} trasee de cerneală, ca o formă umplută).`,
    `Cost: ${cost}.`,
    ...(vector.avertisment ? [`Atenție: ${vector.avertisment}`] : []),
    `Pasul următor: arată-l cursantului cu node nucleu/mg.mjs desen arata ${id}${optiuni.proiect ? ` --proiect ${optiuni.proiect}` : ''}, înainte să-l pui în film.`,
  ].join('\n');
  return { ok: true, erori: [], avertismente, rezultat: { text, id, piesa: piesa.id, trasee: vector.trasee, cost: { ...pret, desene: 1 }, imagine: `proprii/${intrare.imagine}` } };
}
