// Unealtă de dezvoltare, rulată o dată de Dănuț (nu de cursanți și nu de mg):
// aduce fonturile fixate din Fontsource 5.3.0 (jsDelivr), verifică sha256-ul fiecărui fișier
// față de valorile fixate mai jos și scrie motoare/comun/fonturi/<id>/font.json.
// Rulare: node unelte/fonturi/aduce-fonturi.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scrieJsonAtomic, sha256Fisier } from '../../nucleu/lib/fisiere.mjs';

const RADACINA = fileURLToPath(new URL('../../', import.meta.url));
const VERSIUNE = '5.3.0';
const BAZA = 'https://cdn.jsdelivr.net/npm/@fontsource';
const SUBSETURI = ['latin', 'latin-ext'];

// Greutățile din harta 5.6.
const FONTURI = [
  { id: 'inter', nume: 'Inter', greutati: [400, 500, 700] },
  { id: 'fraunces', nume: 'Fraunces', greutati: [600, 700] },
  { id: 'montserrat', nume: 'Montserrat', greutati: [700, 800] },
  { id: 'instrument-sans', nume: 'Instrument Sans', greutati: [700] },
  { id: 'playfair-display', nume: 'Playfair Display', greutati: [700] },
];

// sha256 verificate pe 2026-10-01 cu `curl` + `shasum -a 256`, de pe jsDelivr, @fontsource/<id>@5.3.0.
const SHA256_ASTEPTAT = {
  'inter/OFL.txt': '3b0a5fca3d17942cde889069889dedbbbd075e9b599968c82a95f4d944e9b345',
  'inter/inter-400-latin.woff2': '8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc',
  'inter/inter-400-latin-ext.woff2': '6744a7f509ebc6ab220a6cd4ea77e898adf014f03d88dcda5d45d8a9feefb4e9',
  'inter/inter-500-latin.woff2': 'f3779f1efccc4bdcdf9c0a02ab95bf6bd092ed09c48c08cedc725889edd1d19f',
  'inter/inter-500-latin-ext.woff2': '2c6fbc42d315528beb06c1096df45487bf4186c4b78b8111d12c9c951f8acca2',
  'inter/inter-700-latin.woff2': '6f56409fd3d64bb85f7d070bce20749db2d66b6d63cec586cc22d1c761be2491',
  'inter/inter-700-latin-ext.woff2': '143f9504f1377012aa3e39c90c4354ef429cb0494b9ac0e1437f1a81e5412236',
  'fraunces/OFL.txt': 'cd3384cafac6f2bddc3955273958a2e029f97027c8037ac539ef5744a77b579e',
  'fraunces/fraunces-600-latin.woff2': '3a1de7711d147bad4422825045f87597fd77cca72e7c96d3b0a81735d00dda82',
  'fraunces/fraunces-600-latin-ext.woff2': '69e09c7910e64d829e051f023af4c38a2e74b61d9e9439502f56edd7154b117c',
  'fraunces/fraunces-700-latin.woff2': 'c38570d224b830056e69484bb9e768e1d3fa7ba4755c8891a3c6d366194d2ff3',
  'fraunces/fraunces-700-latin-ext.woff2': '162b7b2654ef849ce146e1297bdd5694b971f730cd5f1749a954f24109ca11c4',
  'montserrat/OFL.txt': 'f429f739351287574c0c3175a9222bb3e49c7cad3f568a04f2c08d74c107724e',
  'montserrat/montserrat-700-latin.woff2': 'f9d9e65b15372cebcafc3acd1e664a564c5c4b23278de4d5760de9a13c530371',
  'montserrat/montserrat-700-latin-ext.woff2': 'a59fcc944a712e213a2f3bd994367129217c75f24a9155a5a3c1a0f5fd2cc9a7',
  'montserrat/montserrat-800-latin.woff2': 'ba826fb84c2e961578adf3a08b5778b87905d4443445d1d56d84f9f157d5ea4b',
  'montserrat/montserrat-800-latin-ext.woff2': '59f6ebeb71a14c64edc538eba78a010c1c9ef680a66a559ec3cf4b0d12db1a8b',
  'instrument-sans/OFL.txt': 'c27a3c53c3beed7f5c26853afa15991478ff7145d3754a36b0382f84e10c0d03',
  'instrument-sans/instrument-sans-700-latin.woff2': 'bcf650536cae57403741af193e1e237c245f8929b936f03601279079a64fd699',
  'instrument-sans/instrument-sans-700-latin-ext.woff2': '3ce67836c45ff581f286d8b19cff8798ad47ba0fb7bfb0adde13caa938b35503',
  'playfair-display/OFL.txt': 'c052aafd2a71e90bcee6e69f475029d430a10d548c08ffcae350171f0e9668b1',
  'playfair-display/playfair-display-700-latin.woff2': '28453852ea165c47b5a941be00e418402e1407002ed87507f062a1e316328fe6',
  'playfair-display/playfair-display-700-latin-ext.woff2': 'edb9f5d879b30c617698bcc288692c339d5a0a2464a5476f00025195e5cad166',
};

async function descarca(url) {
  const raspuns = await fetch(url);
  if (!raspuns.ok) throw new Error(`HTTP ${raspuns.status} la ${url}`);
  return Buffer.from(await raspuns.arrayBuffer());
}

// Din CSS-ul Fontsource: numele fișierului woff2 → unicode-range, copiat exact.
function intervaleDinCss(css) {
  const intervale = new Map();
  for (const [, bloc] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const fisier = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(bloc);
    const interval = /unicode-range:\s*([^;]+);/.exec(bloc);
    if (fisier && interval) intervale.set(fisier[1], interval[1].trim());
  }
  return intervale;
}

async function aduVerificat(url, cale, cheie) {
  const asteptat = SHA256_ASTEPTAT[cheie];
  if (!asteptat) throw new Error(`Lipsește sha256-ul fixat pentru ${cheie}.`);
  if (fs.existsSync(cale) && sha256Fisier(cale) === asteptat) return asteptat;
  const continut = await descarca(url);
  const primit = crypto.createHash('sha256').update(continut).digest('hex');
  if (primit !== asteptat) {
    throw new Error(`sha256 diferit pentru ${cheie}: așteptat ${asteptat}, primit ${primit}. Nu scriu fișierul.`);
  }
  fs.writeFileSync(cale, continut);
  return primit;
}

async function aduFont({ id, nume, greutati }) {
  const dir = path.join(RADACINA, 'motoare', 'comun', 'fonturi', id);
  fs.mkdirSync(dir, { recursive: true });
  await aduVerificat(`${BAZA}/${id}@${VERSIUNE}/LICENSE`, path.join(dir, 'OFL.txt'), `${id}/OFL.txt`);
  const fisiere = [];
  for (const greutate of greutati) {
    const css = (await descarca(`${BAZA}/${id}@${VERSIUNE}/${greutate}.css`)).toString('utf8');
    const intervale = intervaleDinCss(css);
    for (const subset of SUBSETURI) {
      const sursa = `${id}-${subset}-${greutate}-normal.woff2`;
      const fisier = `${id}-${greutate}-${subset}.woff2`;
      const unicodeRange = intervale.get(sursa);
      if (!unicodeRange) throw new Error(`${greutate}.css al fontului ${id} nu are un bloc pentru ${sursa}.`);
      const sha256 = await aduVerificat(`${BAZA}/${id}@${VERSIUNE}/files/${sursa}`, path.join(dir, fisier), `${id}/${fisier}`);
      fisiere.push({ greutate, subset, fisier, sha256, unicode_range: unicodeRange });
    }
  }
  scrieJsonAtomic(path.join(dir, 'font.json'), {
    id,
    familie: `MG ${nume}`,
    sursa: `@fontsource/${id}@${VERSIUNE}`,
    licenta: 'OFL-1.1',
    fisiere,
  });
  console.log(`${id}: ${fisiere.length} fișiere woff2, OFL.txt, font.json`);
}

try {
  for (const font of FONTURI) await aduFont(font);
} catch (e) {
  console.error(`Eroare: ${e.message}`);
  process.exitCode = 1;
}
