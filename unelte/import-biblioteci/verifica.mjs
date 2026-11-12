// Verificările bibliotecii de desene (spec 8.7), rulate în CI și local: npm --prefix nucleu run verifica-biblioteci.
// Citește biblioteci/catalog.json prin incarcaCatalog, ca restul lui mg, și nu modifică nimic.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { incarcaCatalog } from '../../nucleu/lib/desen/catalog.mjs';
import { normalizeazaSvg } from '../../nucleu/lib/desen/adauga.mjs';
import { ROLURI } from '../../nucleu/lib/desen/roluri.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { eroare, formateazaPentruOm, EroareFatala, COD_IESIRE } from '../../nucleu/lib/erori.mjs';
import { radacinaAgent, rulatDirect } from '../../nucleu/lib/cai.mjs';
import { TEME_COMUNE } from '../../nucleu/lib/teme.mjs';
import { reparaSedila } from '../../nucleu/lib/text.mjs';

const LICENTE_PERMISE = Object.freeze(['CC0-1.0', 'ISC', 'proprie-dm']);
export const ROLURI_REEL = ROLURI; // clasele recolorate de reel (8.4.2), din sursa unică nucleu/lib/desen/roluri.mjs (T16)
const TEME_REEL = TEME_COMUNE; // temele comune ale kitului, din nucleu/lib/teme.mjs
const ANIMATIE_FAMILIE = Object.freeze({ cerneala: 'contur-umplere' });
const PREFIX = Object.freeze({ od: { tip: 'forma', familie: 'cerneala' }, op: { tip: 'forma', familie: 'cerneala' } });
const NOAPTE = Object.freeze(['bun', 'autocolant', 'evita']);
const CAMPURI_PIESA = Object.freeze(['id', 'tip', 'familie', 'sursa', 'original', 'fisier', 'sha256', 'kb', 'cutie', 'etichete', 'descriere', 'noapte', 'teme_potrivite', 'animatie']);
const CAMPURI_FORMA = Object.freeze(['roluri', 'recolorabil', 'acoperire_cerneala']);
const MESAJ_ONE_LINE = 'Desenele one-line nu fac parte din biblioteca agentului (decizia din 2026-10-07)';
const CAMPURI_SURSA = Object.freeze(['nume', 'autor', 'licenta', 'dovada', 'verificat']);
// forme fără diacritice care nu sunt cuvinte corecte în română (8.7: „coplesit” pică, „copleșit” trece)
const FARA_DIACRITICE = Object.freeze(['coplesit', 'coplesita', 'coplesiti', 'liniste', 'linistit', 'linistita', 'intalnire', 'sedinta', 'barbat', 'tanar', 'tanara', 'bucatarie', 'gandeste', 'munceste', 'invata', 'sarbatoare']);
export const GRUPURI_PEEPS = Object.freeze(['corp', 'cap', 'fata']); // 8.4.4, deciziile 10 și 16
const LOCK = 'unelte/import-biblioteci/surse.lock.json';
const FOAIE = 'biblioteci/foi/foaie.html';
const BUGET_TOTAL = 4 * 1024 * 1024; // 8.8: biblioteci/ cel mult 4 MB
const BUGET_PIESA = 80 * 1024; // 8.8: o piesă cel mult 80 KB

function marimeDir(dir) {
  let total = 0;
  for (const nume of readdirSync(dir)) {
    const cale = path.join(dir, nume);
    const st = statSync(cale);
    total += st.isDirectory() ? marimeDir(cale) : st.size;
  }
  return total;
}

function verificaSurse(catalog, radacina, erori) {
  for (const [cheie, sursa] of Object.entries(catalog.surse ?? {})) {
    const camp = `biblioteci.surse.${cheie}`;
    for (const c of CAMPURI_SURSA) {
      if (sursa[c] === undefined) erori.push(eroare('camp-lipsa', `${camp}.${c}`, `Sursa ${cheie} nu are câmpul ${c}.`, `Completează ${c} în catalog (8.5.3).`));
    }
    if (!LICENTE_PERMISE.includes(sursa.licenta)) {
      erori.push(eroare('desen-licenta-lipsa', `${camp}.licenta`, `Sursa ${cheie} are licența „${sursa.licenta}”, care nu e permisă.`, `Folosește doar surse cu licență ${LICENTE_PERMISE.join(', ')}.`));
      continue;
    }
    if (sursa.licenta === 'proprie-dm') {
      if (!sursa.licenta_text) erori.push(eroare('desen-licenta-lipsa', `${camp}.licenta_text`, `Sursa ${cheie} are licență proprie fără text.`, 'Scrie textul licenței în licenta_text.'));
    } else {
      if (!sursa.licenta_url) erori.push(eroare('desen-licenta-lipsa', `${camp}.licenta_url`, `Sursa ${cheie} nu are linkul licenței.`, 'Completează licenta_url.'));
      if (!Array.isArray(sursa.dovada) || sursa.dovada.length === 0) {
        erori.push(eroare('desen-licenta-lipsa', `${camp}.dovada`, `Sursa ${cheie} nu are nicio dovadă de licență.`, 'Salvează dovada în biblioteci/dovezi/ și trece-o în dovada.'));
      }
    }
    (sursa.dovada ?? []).forEach((d, j) => {
      if (!existsSync(path.join(radacina, 'biblioteci', d))) {
        erori.push(eroare('resursa-lipsa', `${camp}.dovada[${j}]`, `Dovada ${d} a sursei ${cheie} lipsește din biblioteci/.`, `Pune fișierul în biblioteci/${d}.`));
      }
    });
    if (sursa.catalog !== undefined && !existsSync(path.join(radacina, sursa.catalog))) {
      erori.push(eroare('resursa-lipsa', `${camp}.catalog`, `Catalogul ${sursa.catalog} al sursei ${cheie} lipsește.`, `Pune fișierul la ${sursa.catalog}.`));
    }
  }
}

function verificaEtichete(p, camp, erori) {
  const etichete = Array.isArray(p.etichete) ? p.etichete : [];
  if (etichete.length < 4) {
    erori.push(eroare('desen-etichete-putine', `${camp}.etichete`, `Piesa ${p.id} are ${etichete.length} etichete; trebuie cel puțin 4.`, 'Adaugă etichete în română, cu diacritice.'));
  }
  etichete.forEach((e, j) => {
    const reparata = reparaSedila(e);
    if (reparata !== null) {
      erori.push(eroare('sedila', `${camp}.etichete[${j}]`, `Eticheta „${e}” a piesei ${p.id} are ș sau ț cu sedilă.`, `Scrie „${reparata}”.`));
    }
    const cuvinte = e.toLowerCase().split(/[^a-zăâîșț]+/).filter(Boolean);
    const gresit = cuvinte.find((c) => FARA_DIACRITICE.includes(c));
    if (gresit) {
      erori.push(eroare('valoare-invalida', `${camp}.etichete[${j}]`, `Eticheta „${e}” a piesei ${p.id} e scrisă fără diacritice („${gresit}”).`, 'Scrie eticheta cu diacritice (de exemplu „copleșit”, nu „coplesit”).'));
    }
  });
}

function verificaForma(p, cale, camp, erori) {
  const text = readFileSync(cale, 'utf8');
  // Aceeași normalizare ca în build (sablon.mjs, fără maparea culorilor): reelul pune în HTML ieșirea ei, deci fișierul
  // trebuie să fie chiar ea, nu doar să treacă fără erori (revizuirea transversală B01-B13, T12).
  const { svg, culori, erori: erSvg } = normalizeazaSvg(text, { mapare: false });
  for (const e of erSvg) erori.push(eroare(e.cod, `${camp}.fisier`, `Piesa ${p.id}: ${e.mesaj}`, e.sugestie));
  if (erSvg.length === 0 && svg !== text) {
    erori.push(eroare('valoare-invalida', `${camp}.fisier`, `Piesa ${p.id} nu e în forma normalizată: fișierul diferă de ce ar pune reelul în build.`, 'Refă importul piesei, care scrie forma normalizată.'));
  }
  if (/\sid\s*=/.test(text)) erori.push(eroare('valoare-invalida', `${camp}.fisier`, `Piesa ${p.id} are atribute id (8.5.2 le interzice).`, 'Refă importul piesei, care șterge id-urile.'));
  const scrise = culori.filter((c) => !['none', 'currentcolor', 'transparent', 'inherit'].includes(c.toLowerCase()));
  if (scrise.length > 0) erori.push(eroare('valoare-invalida', `${camp}.fisier`, `Piesa ${p.id} are culori scrise în fișier (${scrise.join(', ')}).`, 'Refă importul piesei, care pune clase de rol în locul culorilor.'));
  const clase = new Set([...text.matchAll(/class\s*=\s*["']([^"']*)["']/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean)));
  const necunoscute = [...clase].filter((c) => !ROLURI_REEL.includes(c));
  if (necunoscute.length > 0) erori.push(eroare('valoare-invalida', `${camp}.roluri`, `Piesa ${p.id} folosește clase pe care reelul nu le recolorează: ${necunoscute.join(', ')}.`, `Folosește doar ${ROLURI_REEL.join(', ')}.`));
  const declarate = new Set(p.roluri ?? []);
  const lipsa = [...clase].filter((c) => ROLURI_REEL.includes(c) && !declarate.has(c));
  const inPlus = [...declarate].filter((c) => !clase.has(c));
  if (lipsa.length > 0 || inPlus.length > 0) erori.push(eroare('valoare-invalida', `${camp}.roluri`, `Piesa ${p.id}: rolurile din catalog (${[...declarate].join(', ')}) nu se potrivesc cu clasele din fișier (${[...clase].join(', ')}).`, 'Refă importul piesei, ca roluri să fie calculat din fișier.'));
  if (p.recolorabil === true && !clase.has('ink')) erori.push(eroare('valoare-invalida', `${camp}.roluri`, `Piesa ${p.id} e recolorabilă, dar nu are grupul ink.`, 'Marchează piesa recolorabil: false sau refă importul.'));
  if (p.id.startsWith('op-')) {
    // 8.7: la Open Peeps, fiecare traseu din g.ink are data-grup corp, cap sau fata
    const ink = /<g class="ink">([\s\S]*?)<\/g>/.exec(text);
    const trasee = ink ? ink[1].match(/<path\b[^>]*>/g) ?? [] : [];
    const faraGrup = trasee.filter((t) => !GRUPURI_PEEPS.includes(/\sdata-grup="([^"]*)"/.exec(t)?.[1]));
    if (!ink || trasee.length === 0 || faraGrup.length > 0) {
      erori.push(eroare('valoare-invalida', `${camp}.fisier`, `Piesa ${p.id} are ${faraGrup.length} trasee în g.ink fără data-grup corp, cap sau fata (8.4.4).`, 'Refă importul piesei; import.py pune data-grup înainte de svgo.'));
    }
  }
}

function verificaPiese(catalog, radacina, erori) {
  const vazute = new Set();
  catalog.piese.forEach((p, i) => {
    const camp = `biblioteci.piese[${i}]`;
    if (p.tip === 'traseu' || p.familie === 'linie' || p.sursa === 'trasee-dm' || (typeof p.id === 'string' && p.id.startsWith('lc-'))) {
      erori.push(eroare('valoare-invalida', `${camp}.id`, `Piesa ${p.id ?? i}: ${MESAJ_ONE_LINE}.`, 'Scoate piesa din catalog; biblioteca are doar forme od- și op-.'));
      return;
    }
    if (p.proprie) return; // piesele cursantului (proprii/) nu fac parte din biblioteca livrată
    const lipsa = [...CAMPURI_PIESA, ...(p.tip === 'forma' ? CAMPURI_FORMA : [])].filter((c) => p[c] === undefined);
    for (const c of lipsa) erori.push(eroare('camp-lipsa', `${camp}.${c}`, `Piesa ${p.id ?? i} nu are câmpul ${c}.`, `Completează ${c} în catalog (8.5.3).`));
    if (typeof p.id !== 'string' || !/^[a-z0-9-]+$/.test(p.id)) {
      erori.push(eroare('valoare-invalida', `${camp}.id`, `Id-ul „${p.id}” are alte caractere decât a-z, 0-9 și cratimă.`, 'Redenumește piesa doar cu litere mici, cifre și cratimă.'));
      return;
    }
    if (vazute.has(p.id)) erori.push(eroare('valoare-invalida', `${camp}.id`, `Id-ul ${p.id} apare de două ori.`, 'Păstrează o singură intrare pentru fiecare id.'));
    vazute.add(p.id);
    const asteptat = PREFIX[p.id.split('-')[0]];
    if (!asteptat) erori.push(eroare('valoare-invalida', `${camp}.id`, `Id-ul ${p.id} nu începe cu od- sau op-.`, 'Folosește prefixul sursei.'));
    else if (p.tip !== asteptat.tip || p.familie !== asteptat.familie) erori.push(eroare('valoare-invalida', `${camp}.familie`, `Piesa ${p.id} trebuie să fie ${asteptat.tip}, familia ${asteptat.familie}.`, 'Corectează tip și familie în catalog.'));
    if (!catalog.surse?.[p.sursa]) erori.push(eroare('desen-licenta-lipsa', `${camp}.sursa`, `Piesa ${p.id} trimite la sursa „${p.sursa}”, care nu e în catalog.`, 'Adaugă sursa în surse, cu licența ei.'));
    if (!NOAPTE.includes(p.noapte)) erori.push(eroare('valoare-invalida', `${camp}.noapte`, `Piesa ${p.id} are noapte „${p.noapte}”.`, `Folosește ${NOAPTE.join(', ')}.`));
    else if (Array.isArray(p.teme_potrivite) && (p.noapte === 'evita') === p.teme_potrivite.includes('noapte')) {
      erori.push(eroare('valoare-invalida', `${camp}.teme_potrivite`, `Piesa ${p.id}: teme_potrivite nu se potrivește cu noapte „${p.noapte}” (8.4.3).`, p.noapte === 'evita' ? 'Scoate noapte din teme_potrivite.' : 'Adaugă noapte în teme_potrivite.'));
    }
    if (ANIMATIE_FAMILIE[p.familie] && p.animatie?.implicit !== ANIMATIE_FAMILIE[p.familie]) {
      erori.push(eroare('valoare-invalida', `${camp}.animatie`, `Piesa ${p.id} din familia ${p.familie} trebuie să intre cu animația ${ANIMATIE_FAMILIE[p.familie]}.`, `Pune animatie.implicit: „${ANIMATIE_FAMILIE[p.familie]}”.`));
    }
    verificaEtichete(p, camp, erori);
    if (p.fisier !== `forme/${p.id}.svg`) {
      erori.push(eroare('valoare-invalida', `${camp}.fisier`, `Piesa ${p.id} are fișierul „${p.fisier}”; numele trebuie să fie egal cu id-ul.`, `Folosește forme/${p.id}.svg.`));
      return;
    }
    const cale = path.join(radacina, 'biblioteci', p.fisier);
    if (!existsSync(cale)) {
      erori.push(eroare('resursa-lipsa', `${camp}.fisier`, `Fișierul ${p.fisier} al piesei ${p.id} lipsește.`, `Pune fișierul la biblioteci/${p.fisier} sau scoate piesa din catalog.`));
      return;
    }
    if (sha256Fisier(cale) !== p.sha256) {
      erori.push(eroare('resursa-hash', `${camp}.sha256`, `Fișierul ${p.fisier} nu mai are sha256-ul din catalog.`, 'Refă importul; fișierele din biblioteci/ nu se editează de mână.'));
    }
    if (statSync(cale).size > BUGET_PIESA) erori.push(eroare('valoare-invalida', `${camp}.kb`, `Piesa ${p.id} are ${Math.round(statSync(cale).size / 1024)} KB (maximum 80 KB).`, 'Simplifică piesa la import.'));
    if (p.tip === 'forma') verificaForma(p, cale, camp, erori);
  });
  if (existsSync(path.join(radacina, 'biblioteci', 'trasee'))) {
    erori.push(eroare('desen-necunoscut', 'fisier:biblioteci/trasee', `Folderul biblioteci/trasee/ nu are ce căuta aici: ${MESAJ_ONE_LINE}.`, 'Șterge folderul biblioteci/trasee/.'));
  }
  for (const dir of ['forme']) {
    const cale = path.join(radacina, 'biblioteci', dir);
    if (!existsSync(cale)) continue;
    for (const nume of readdirSync(cale).sort()) {
      // T10: fișierele de sistem (.DS_Store și ._* de la Finder, Thumbs.db de la Explorer) nu sunt piese
      if (nume.startsWith('.') || nume === 'Thumbs.db') continue;
      const id = nume.replace(/\.svg$/, '');
      if (!vazute.has(id)) {
        erori.push(eroare('desen-necunoscut', `fisier:biblioteci/${dir}/${nume}`, `Fișierul biblioteci/${dir}/${nume} nu are intrare în catalog.`, 'Adaugă piesa în catalog prin import sau șterge fișierul.'));
      }
    }
  }
}

// 8.7: sha256-ul fiecărei forme provine dintr-o intrare din surse.lock.json (nimic adus de mână)
function verificaLock(catalog, radacina, erori) {
  const forme = catalog.piese.map((p, i) => [p, i]).filter(([p]) => !p.proprie && p.tip === 'forma');
  if (forme.length === 0) return;
  const cale = path.join(radacina, ...LOCK.split('/'));
  if (!existsSync(cale)) {
    erori.push(eroare('resursa-lipsa', `fisier:${LOCK}`, `${LOCK} lipsește, deci originea formelor nu se poate verifica.`, 'Pune la loc surse.lock.json din B06.'));
    return;
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(cale, 'utf8'));
  } catch {
    erori.push(eroare('json-invalid', `fisier:${LOCK}`, `${LOCK} nu e JSON valid.`, 'Refă fișierul din istoricul git.'));
    return;
  }
  const intrari = new Set((Array.isArray(lock.fisiere) ? lock.fisiere : [])
    .filter((f) => typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256))
    .map((f) => `${f.sursa}\u0000${f.original}`));
  for (const [p, i] of forme) {
    if (!intrari.has(`${p.sursa}\u0000${p.original}`)) {
      erori.push(eroare('resursa-lipsa', `biblioteci.piese[${i}].original`, `Piesa ${p.id} vine din ${p.sursa}/${p.original}, care nu are intrare cu sha256 în surse.lock.json.`, 'Adaugă originalul în surse.lock.json și refă importul; piesele nu se aduc de mână.'));
    }
  }
}

// 8.7: foaia de contact e la zi (hash-ul catalogului din foaie.html e cel curent)
function verificaFoaie(radacina, erori) {
  const cale = path.join(radacina, ...FOAIE.split('/'));
  if (!existsSync(cale)) {
    erori.push(eroare('resursa-lipsa', `fisier:${FOAIE}`, 'Foaia de contact a bibliotecii lipsește.', 'Rulează din nou import.py (B06), care scrie foaia, și uită-te la ea.'));
    return;
  }
  const m = /<meta name="catalog-sha256" content="([0-9a-f]{64})">/.exec(readFileSync(cale, 'utf8'));
  if (!m || m[1] !== sha256Fisier(path.join(radacina, 'biblioteci', 'catalog.json'))) {
    erori.push(eroare('resursa-hash', `fisier:${FOAIE}`, 'Foaia de contact e făcută pe alt catalog decât cel curent.', 'Rulează din nou import.py (B06), ca foaia să fie la zi, și uită-te din nou la ea.'));
  }
}

// acoperirea cerută de reel (12.1): pentru fiecare familie prezentă, cel puțin o piesă potrivită pe fiecare temă a reelului
function verificaAcoperire(catalog, erori) {
  const familii = [...new Set(catalog.piese.filter((p) => !p.proprie && ANIMATIE_FAMILIE[p.familie]).map((p) => p.familie))].sort();
  for (const familie of familii) {
    for (const tema of TEME_REEL) {
      const are = catalog.piese.some((p) => !p.proprie && p.familie === familie && Array.isArray(p.teme_potrivite) && p.teme_potrivite.includes(tema));
      if (!are) {
        erori.push(eroare('valoare-invalida', `biblioteci.acoperire.${familie}.${tema}`, `Familia ${familie} nu are nicio piesă potrivită pentru tema ${tema}, deci un reel pe ${tema} nu se poate face cu ea.`, `Adaugă sau re-etichetează o piesă ${familie} cu ${tema} în teme_potrivite.`));
      }
    }
  }
}

/**
 * Verifică biblioteci/ (spec 8.7). Nu aruncă pentru probleme de conținut (nici pentru catalog lipsă sau stricat); le întoarce ca erori.
 * @param {string} radacina rădăcina agentului
 * @returns {{ ok: boolean, erori: import('../../nucleu/lib/erori.mjs').EroareMg[] }}
 */
export function verificaBiblioteci(radacina) {
  const erori = [];
  let catalog;
  try {
    catalog = incarcaCatalog(radacina);
  } catch (e) {
    if (e instanceof EroareFatala) return { ok: false, erori: [e.eroareMg] };
    throw e;
  }
  if (catalog.versiune !== 1 || typeof catalog.surse !== 'object') {
    erori.push(eroare('valoare-invalida', 'biblioteci.versiune', 'biblioteci/catalog.json nu are forma din 8.5.3 (versiune 1, surse, piese).', 'Regenerează catalogul cu import.py.'));
    return { ok: false, erori };
  }
  verificaSurse(catalog, radacina, erori);
  verificaPiese(catalog, radacina, erori);
  verificaAcoperire(catalog, erori);
  verificaLock(catalog, radacina, erori);
  if (catalog.piese.some((p) => !p.proprie)) verificaFoaie(radacina, erori);
  const total = marimeDir(path.join(radacina, 'biblioteci'));
  if (total > BUGET_TOTAL) {
    erori.push(eroare('valoare-invalida', 'biblioteci', `biblioteci/ are ${(total / 1024 / 1024).toFixed(1).replace('.', ',')} MB (maximum 4 MB).`, 'Scoate piese sau simplifică-le la import.'));
  }
  return { ok: erori.length === 0, erori };
}

if (rulatDirect(import.meta.url)) {
  const radacina = process.argv[2] ? path.resolve(process.argv[2]) : radacinaAgent(import.meta.url, 2);
  const { ok, erori } = verificaBiblioteci(radacina);
  if (ok) {
    process.stdout.write('Biblioteca de desene e în regulă.\n');
  } else {
    process.stdout.write(formateazaPentruOm(erori, []) + '\n');
    process.exitCode = COD_IESIRE.DATE;
  }
}
