// mg desen: lista și cauta (B03), verifica și adauga (B04), arata (B05).
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { incarcaCatalog } from './catalog.mjs';
import { cauta, listeaza } from './cauta.mjs';
import { temaFilmului, verificaDesene } from './verifica.mjs';
import { adaugaPiesa } from './adauga.mjs';
import { arataPiese } from './arata.mjs';
import { eroare, EroareFatala, COD_IESIRE } from '../erori.mjs';
import { citesteJson, existaFisier } from '../fisiere.mjs';
import { caiProiect, esteNumeProiect } from '../cai.mjs';
import { TEME_COMUNE } from '../teme.mjs';

const TIPURI = ['forma', 'traseu'];
const FAMILII = ['cerneala', 'proprie', 'traseu'];

function verificaOptiune(nume, valoare, permise) {
  if (valoare !== undefined && !permise.includes(valoare)) {
    throw new EroareFatala(eroare('argument-necunoscut', `argumente.${nume}`,
      `Valoarea „${valoare}” pentru --${nume} nu e acceptată.`,
      `Folosește una dintre: ${permise.join(', ')}.`), COD_IESIRE.UTILIZARE);
  }
}

function filtreDin(optiuni) {
  verificaOptiune('tip', optiuni.tip, TIPURI);
  verificaOptiune('familie', optiuni.familie, FAMILII);
  verificaOptiune('tema', optiuni.tema, TEME_COMUNE);
  if (optiuni.personaj !== undefined && !/^[a-z0-9-]+$/.test(optiuni.personaj)) {
    throw new EroareFatala(eroare('argument-necunoscut', 'argumente.personaj',
      `Valoarea „${optiuni.personaj}” pentru --personaj nu e acceptată.`,
      'Folosește fara, un număr de personaje (1, 2) sau o valoare ca in-picioare, asezat, fata, ambiguu.'), COD_IESIRE.UTILIZARE);
  }
  return {
    tip: optiuni.tip, familie: optiuni.familie, tema: optiuni.tema,
    includeEvita: optiuni.includeEvita === true, personaj: optiuni.personaj,
  };
}

// Marcajul sursei unei piese în listele pentru om: proprie (proprii/) sau a brandului (branduri/<nume>/, felia 4).
const marcajPiesa = (p) => (p.brand ? ` (brand ${p.brand})` : p.proprie ? ' (proprie)' : '');

// Brandul ale cărui piese intră în catalog (felia 4): --brand, altfel brandul din date.json al lui --proiect.
function brandComanda(radacina, optiuni) {
  if (typeof optiuni.brand === 'string' && optiuni.brand !== '') return optiuni.brand;
  if (optiuni.proiect !== undefined && esteNumeProiect(optiuni.proiect)) {
    const cai = caiProiect(radacina, optiuni.proiect);
    if (existaFisier(cai.date)) {
      const date = citesteJson(cai.date);
      if (typeof date?.brand === 'string') return date.brand;
    }
  }
  return null;
}

// Piesele brandului întâi (felia 4): sunt cele potrivite stilului proiectului; ordinea din interior rămâne.
const brandulIntai = (lista, piesa) => [...lista.filter((x) => piesa(x).brand), ...lista.filter((x) => !piesa(x).brand)];

function randLista(p) {
  const marcaj = marcajPiesa(p);
  return `${p.id}${marcaj} | ${p.tip} | ${p.familie} | noapte: ${p.noapte ?? '-'} | ${p.etichete.join(', ')}`;
}

function argumentLipsa(camp, mesaj, sugestie) {
  return new EroareFatala(eroare('valoare-invalida', camp, mesaj, sugestie), COD_IESIRE.UTILIZARE);
}

/** mg desen verifica <cale date.json> */
async function desenVerifica({ radacina, pozitionale }) {
  const [cale] = pozitionale;
  if (!cale) {
    throw argumentLipsa('argumente.date', 'Lipsește calea spre date.json.',
      'Rulează node nucleu/mg.mjs desen verifica video/<proiect>/date.json.');
  }
  const date = citesteJson(resolve(cale));
  const brand = typeof date?.brand === 'string' ? date.brand : null;
  const { erori, avertismente } = verificaDesene(date, incarcaCatalog(radacina, brand), radacina);
  const scene = Array.isArray(date?.scene) ? date.scene : [];
  return {
    ok: erori.length === 0,
    erori,
    avertismente,
    rezultat: {
      date: cale,
      desene: scene.filter((s) => s?.desen?.id).length,
      iconite: scene.reduce((n, s) => n + (Array.isArray(s?.iconite) ? s.iconite.length : 0), 0),
    },
  };
}

/** mg desen adauga <fisier> --licenta "<text>" --etichete "<e1,e2,e3,e4>" [--id <p-nume>] [--fara-mapare] */
async function desenAdauga({ radacina, pozitionale, optiuni }) {
  const [fisier] = pozitionale;
  if (!fisier) {
    throw argumentLipsa('argumente.fisier', 'Lipsește fișierul de adăugat.',
      'Rulează node nucleu/mg.mjs desen adauga <fisier.svg> --licenta "<text>" --etichete "<e1,e2,e3,e4>".');
  }
  const etichete = String(optiuni.etichete ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  const piesa = await adaugaPiesa(radacina, resolve(fisier), {
    licenta: optiuni.licenta, etichete, id: optiuni.id, faraMapare: optiuni.faraMapare === true,
  });
  return { ok: true, erori: [], avertismente: [], rezultat: { piesa, arata: `node nucleu/mg.mjs desen arata ${piesa.id}` } };
}

/** mg desen arata <id...> [--tema <tema>] [--proiect <p>] */
async function desenArata({ radacina, pozitionale, optiuni }) {
  let tema = optiuni.tema;
  let iesire = join(tmpdir(), 'mg-desene', 'desene.png');
  if (optiuni.proiect !== undefined) {
    if (!esteNumeProiect(optiuni.proiect) || !existaFisier(caiProiect(radacina, optiuni.proiect).date)) {
      throw new EroareFatala(eroare('proiect-lipsa', 'argumente.proiect', `Proiectul „${optiuni.proiect}” nu există în video/.`,
        'Dă numele unui folder din video/ sau creează proiectul cu node nucleu/mg.mjs nou <proiect> --sablon reel-ilustrat.'), COD_IESIRE.UTILIZARE);
    }
    const cai = caiProiect(radacina, optiuni.proiect);
    tema ??= temaFilmului(citesteJson(cai.date), radacina);
    iesire = join(cai.cadre, 'desene.png');
  }
  tema ??= 'noapte';
  const { png, avertismente } = await arataPiese(radacina, pozitionale, { tema, iesire, brand: brandComanda(radacina, optiuni) });
  return { ok: true, erori: [], avertismente, rezultat: { png, piese: pozitionale, tema } };
}

/**
 * @param {{radacina: string, sub: string|undefined, pozitionale: string[],
 *          optiuni: {tip?, familie?, tema?, includeEvita?, personaj?, licenta?, etichete?, id?, proiect?, faraMapare?}}} arg
 * @returns {Promise<{ok: boolean, erori: object[], avertismente: object[], rezultat: object}>}
 */
export async function comandaDesen({ radacina, sub, pozitionale = [], optiuni = {} }) {
  if (sub === 'lista') {
    const filtre = filtreDin(optiuni);
    const piese = brandulIntai(listeaza(incarcaCatalog(radacina, brandComanda(radacina, optiuni)), filtre), (p) => p);
    const text = piese.length === 0
      ? 'Nicio piesă nu trece de filtre.'
      : [`Piese (${piese.length}):`, ...piese.map(randLista)].join('\n');
    return { ok: true, erori: [], avertismente: [], rezultat: { piese, text } };
  }
  if (sub === 'cauta') {
    const interogare = pozitionale.join(' ').trim();
    if (interogare === '') {
      throw new EroareFatala(eroare('argument-necunoscut', 'argumente.interogare',
        'Lipsește textul de căutat.',
        'Rulează: node nucleu/mg.mjs desen cauta "copleșit, laptop"'), COD_IESIRE.UTILIZARE);
    }
    const filtre = filtreDin(optiuni);
    const gasite = brandulIntai(cauta(incarcaCatalog(radacina, brandComanda(radacina, optiuni)), interogare, filtre), (r) => r.piesa);
    const rezultate = gasite.map((r) => ({
      id: r.piesa.id, tip: r.piesa.tip, familie: r.piesa.familie, noapte: r.piesa.noapte ?? null,
      proprie: r.piesa.proprie === true, ...(r.piesa.brand ? { brand: r.piesa.brand } : {}), scor: r.scor, motiv: r.motiv,
    }));
    const text = rezultate.length === 0
      ? `Nimic pentru „${interogare}”. Încearcă alt cuvânt sau node nucleu/mg.mjs desen lista.`
      : [`Rezultate pentru „${interogare}” (${rezultate.length}):`,
        ...rezultate.map((r) => `${r.id}${marcajPiesa(r)} | scor ${r.scor} | ${r.motiv}`)].join('\n');
    return { ok: true, erori: [], avertismente: [], rezultat: { interogare, rezultate, text } };
  }
  if (sub === 'verifica') return desenVerifica({ radacina, pozitionale });
  if (sub === 'adauga') return desenAdauga({ radacina, pozitionale, optiuni });
  if (sub === 'arata') return desenArata({ radacina, pozitionale, optiuni });
  throw new EroareFatala(eroare('comanda-necunoscuta', 'argumente.sub',
    `Subcomanda „desen ${sub ?? ''}” nu există.`,
    'Folosește una dintre: lista, cauta, verifica, adauga, arata (de exemplu node nucleu/mg.mjs desen lista).'), COD_IESIRE.UTILIZARE);
}
