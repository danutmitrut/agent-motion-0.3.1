// Șablonul text-animat: interfața comună din docs/interfete/sablon.md (spec 7.2).
// valideaza e în reguli.mjs; planul și cronologia în plan.mjs; HTML-ul în compileaza.mjs; blocul scenariului în bloc.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eroare, EroareFatala, COD_IESIRE,
  citesteText, scrieTextAtomic, scrieJsonAtomic, existaFisier,
  valoriStil,
  cssFontFace, copiazaFonturi, incarcaCatalogFonturi, esteFontBrand, cssFontFaceBrand, copiazaFontBrand, familieCss,
  elementAudio,
} from '../../../../nucleu/lib/sdk.mjs';
import { valideaza } from './reguli.mjs';
import { planifica } from './plan.mjs';
import { compileaza } from './compileaza.mjs';
import { greutateTitlu } from './asezare.mjs';
import { sursaSigla, citesteSigla } from './sigla.mjs';

export { valideaza } from './reguli.mjs';
export { blocScenariu } from './bloc.mjs';
export { verificariBuild } from './build.mjs';

const DIR_SABLON = path.dirname(fileURLToPath(import.meta.url));
// textul mic și mediu la 500 (inter are 400, 500, 700); titlul la greutateTitlu (decizia 5 din planul G)
const GREUTATI_TEXT = [500];

function citesteRuntime() {
  return {
    sablonHtml: citesteText(path.join(DIR_SABLON, 'index.src.html')),
    miscari: citesteText(path.join(DIR_SABLON, 'lib', 'miscari.js')),
    regizor: citesteText(path.join(DIR_SABLON, 'lib', 'regizor.js')),
  };
}

/** Interfața comună: cronologia și planul (intern). cronologie e null dacă erori nu e gol. */
export function cronologie(date, stil, ctx) {
  // protecție proprie, ca la reel: date invalide nu produc plan, indiferent de ordinea apelurilor
  const v = valideaza(date, ctx);
  if (v.erori.length > 0) return { cronologie: null, intern: null, erori: v.erori, avertismente: [] };
  const r = planifica(date, stil, ctx);
  if (r.erori.length > 0) return { cronologie: null, intern: null, erori: r.erori, avertismente: r.avertismente };
  return { cronologie: r.cronologie, intern: r.plan, erori: [], avertismente: r.avertismente };
}

/**
 * Ce așteaptă verificările comune: fiecare piesă de text, la momentul ei, cu caseta ei reală (din plan).
 * Fără plan (ctx.intern), doar textele segmentelor, la momentul complet.
 */
export function asteptari(cron, ctx = {}) {
  const plan = ctx.intern ?? null;
  const texte = [];
  for (const s of cron.segmente) {
    const ps = plan?.scene.find((x) => x.camp === s.camp) ?? null;
    if (ps) {
      for (const t of ps.texte) texte.push({ ref: s.ref, camp: t.camp, text: t.text, t: t.t, zona_text: s.zona_text, caseta: t.caseta });
    } else {
      for (const text of s.texte) texte.push({ ref: s.ref, camp: s.camp, text, t: s.complet, zona_text: s.zona_text });
    }
  }
  return {
    texte,
    momente: cron.segmente.map((s) => s.complet),
    audio: { prezent: cron.audio != null, durata: cron.audio?.durata ?? null },
    fundal: cron.fundal,
  };
}

// Un font e fie un id din catalog, fie (doar font_titlu, din brand) un FontBrand {fisier, familie}, ca la reel.
function fonturi(stilPlat, radacina, dirBuild, gt) {
  const catalog = incarcaCatalogFonturi(radacina);
  const { font_titlu: titlu, font_text: text } = stilPlat;
  for (const [camp, font] of [['stil.font_titlu', titlu], ['stil.font_text', text]]) {
    if (esteFontBrand(font)) {
      if (!existaFisier(path.join(radacina, font.fisier))) {
        throw new EroareFatala(eroare('font-necunoscut', 'brand',
          `Fontul de brand „${font.familie}” (${font.fisier}) lipsește.`,
          'Pune în folderul brandului fișierul woff2 numit în font_titlu.fisier sau alege în fișa de brand un font din catalog.'), COD_IESIRE.DATE);
      }
      continue;
    }
    if (typeof font !== 'string' || !catalog[font]) {
      throw new EroareFatala(eroare('font-necunoscut', camp,
        `Fontul „${typeof font === 'string' ? font : JSON.stringify(font)}” nu e nici în catalogul de fonturi, nici un font de brand {fisier, familie}.`,
        'Alege în stil.font_titlu unul dintre instrument-sans, inter, montserrat, playfair-display sau, în fișa de brand, un font_titlu cu fisier și familie.'), COD_IESIRE.DATE);
    }
  }
  const greutati = new Map();
  const branduri = new Map();
  for (const [font, lista] of [[titlu, [gt]], [text, GREUTATI_TEXT]]) {
    if (esteFontBrand(font)) {
      branduri.set(`${font.fisier}\n${font.familie}`, font);
      continue;
    }
    greutati.set(font, [...new Set([...(greutati.get(font) ?? []), ...lista])].sort((a, b) => a - b));
  }
  const ids = [...greutati.keys()].sort();
  const deBrand = [...branduri.keys()].sort().map((cheie) => branduri.get(cheie));
  let css = ids.map((id) => cssFontFace(radacina, id, greutati.get(id), 'fonturi/')).join('');
  css += deBrand.map((font) => cssFontFaceBrand(font, 'fonturi/')).join('');
  css += `:root { --font-titlu: "${familieCss(titlu, radacina)}", sans-serif; --font-text: "${familieCss(text, radacina)}", sans-serif; }\n`;
  const dirFonturi = path.join(dirBuild, 'fonturi');
  const copiate = copiazaFonturi(radacina, ids, dirFonturi);
  for (const font of deBrand) copiate.push(copiazaFontBrand(radacina, font, dirFonturi));
  return { css, fisiere: [...new Set(copiate)].sort().map((f) => `fonturi/${f}`) };
}

/** build/masuratori.json (spec 7.2, Comenzi): mărimea aleasă și lățimea măsurată a fiecărui rând, pentru om. */
function masuratori(plan) {
  return {
    versiune: 1,
    scene: plan.scene.map((s) => ({
      id: s.id,
      blocuri: s.blocuri.map((b) => ({
        id: b.id, camp: b.camp, rol: b.rol, marime: b.marime,
        randuri: b.randuri.map((r) => ({ id: r.id, latime: r.w, text: r.parti.map((p) => p.text).join('') })),
      })),
    })),
  };
}

function continutSigla(date, ctx) {
  const sursa = sursaSigla(date, ctx.brand ?? null, ctx.dirProiect);
  const r = sursa && !sursa.invalida ? citesteSigla(sursa.cale, ctx.sablon.implicite.sigla_max_octeti) : null;
  if (!r?.ok) {
    throw new EroareFatala(eroare('resursa-lipsa', sursa?.camp ?? 'sigla',
      'Sigla a dispărut sau s-a schimbat între verificare și construire.',
      'Pune sigla la loc și rulează din nou mg randeaza.', { verificare: 'C07' }), COD_IESIRE.DATE);
  }
  return { mime: r.mime, base64: r.continut.toString('base64') };
}

/**
 * Scrie în dirBuild: index.html, plan.json, stil-rezolvat.json, masuratori.json, gsap.min.js și fonturi/.
 * Sigla intră în index.html ca data: URI (decizia 6 din planul G), deci nu e în active/ și nici în `fisiere`.
 * @returns {Promise<{intrare: 'index.html', fisiere: string[]}>}
 */
export async function construieste(date, stil, cron, dirBuild, ctx) {
  const plan = ctx.intern;
  if (!plan || plan.versiune !== 1 || plan.sablon !== 'text-animat') throw new TypeError('construieste cere planul lui text-animat în ctx.intern (din cronologie()).');
  if (plan.durata !== cron.durata) throw new TypeError('Planul și cronologia au durate diferite.');
  const implicite = ctx.sablon.implicite;
  const stilPlat = valoriStil(stil);
  const gt = greutateTitlu(stilPlat.font_titlu, implicite);
  const sigla = plan.sigla ? continutSigla(date, ctx) : null;
  fs.mkdirSync(dirBuild, { recursive: true });
  const f = fonturi(stilPlat, ctx.radacina, dirBuild, gt);
  const { sablonHtml, miscari, regizor } = citesteRuntime();
  const html = compileaza({
    plan, stil: stilPlat, date, sablonHtml, runtime: { miscari, regizor }, fonturiCss: f.css, implicite, greutateTitlu: gt, sigla, audio: elementAudio(cron),
  });
  scrieTextAtomic(path.join(dirBuild, 'index.html'), html);
  scrieJsonAtomic(path.join(dirBuild, 'plan.json'), plan);
  scrieJsonAtomic(path.join(dirBuild, 'stil-rezolvat.json'), stil);
  scrieJsonAtomic(path.join(dirBuild, 'masuratori.json'), masuratori(plan));
  fs.copyFileSync(path.join(ctx.radacina, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), path.join(dirBuild, 'gsap.min.js'));
  const fisiere = ['gsap.min.js', 'index.html', 'masuratori.json', 'plan.json', 'stil-rezolvat.json', ...f.fisiere].sort();
  return { intrare: 'index.html', fisiere };
}
