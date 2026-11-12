// Șablonul overlay-filmare: interfața comună din docs/interfete/sablon.md (spec 7.4).
// valideaza e în reguli.mjs; planul, cronologia și așteptările în plan.mjs; HTML-ul în compileaza.mjs; blocul scenariului
// în bloc.mjs; argumentele de motor în motor.mjs; S09 și S10 în verificari.mjs (H14).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eroare, EroareFatala, COD_IESIRE,
  citesteText, scrieTextAtomic, scrieJsonAtomic, existaFisier, legaFisier,
  valoriStil,
  cssFontFace, copiazaFonturi, incarcaCatalogFonturi, esteFontBrand, cssFontFaceBrand, copiazaFontBrand, familieCss,
} from '../../../../nucleu/lib/sdk.mjs';
import { valideaza } from './reguli.mjs';
import { planifica, asteptariDinPlan } from './plan.mjs';
import { compileaza } from './compileaza.mjs';
import { argumenteMotor } from './motor.mjs';

export { valideaza } from './reguli.mjs';
export { blocScenariu } from './bloc.mjs';
export { verificariProprii } from './verificari.mjs';

const DIR_SABLON = path.dirname(fileURLToPath(import.meta.url));

function citesteRuntime() {
  return {
    sablonHtml: citesteText(path.join(DIR_SABLON, 'index.src.html')),
    miscari: citesteText(path.join(DIR_SABLON, 'lib', 'miscari.js')),
    regizor: citesteText(path.join(DIR_SABLON, 'lib', 'regizor.js')),
  };
}

/** Interfața comună: cronologia și planul (intern). cronologie e null dacă erori nu e gol. */
export function cronologie(date, stil, ctx) {
  // protecție proprie, ca la text-animat: date invalide nu produc plan, indiferent de ordinea apelurilor
  const v = valideaza(date, ctx);
  if (v.erori.length > 0) return { cronologie: null, intern: null, erori: v.erori, avertismente: [] };
  const r = planifica(date, stil, ctx);
  if (r.erori.length > 0) return { cronologie: null, intern: null, erori: r.erori, avertismente: r.avertismente };
  return { cronologie: r.cronologie, intern: r.plan, erori: [], avertismente: r.avertismente };
}

/** Ce așteaptă verificările comune. Fără plan (ctx.intern), doar textele segmentelor, la momentul complet. */
export function asteptari(cron, ctx = {}) {
  if (ctx.intern) return asteptariDinPlan(cron, ctx.intern);
  return {
    texte: cron.segmente.flatMap((s) => s.texte.map((text) => ({ ref: s.ref, camp: s.camp, text, t: s.complet, zona_text: s.zona_text }))),
    momente: cron.segmente.map((s) => s.complet),
    audio: { prezent: false, durata: null },
    fundal: 'filmare',
    transcriere: [],
  };
}

// Greutățile fontului de text: 500 pe textele mici, 700 pe etichetă (implicite.roluri); titlul la greutatea titlului.
function greutatiText(implicite) {
  return [...new Set(Object.values(implicite.roluri).filter((R) => R.font === 'text').map((R) => R.greutate))].sort((a, b) => a - b);
}

// Un font e fie un id din catalog, fie (doar font_titlu, din brand) un FontBrand {fisier, familie}, ca la text-animat.
function fonturi(stilPlat, radacina, dirBuild, gt, implicite) {
  const catalog = incarcaCatalogFonturi(radacina);
  const { font_titlu: titlu, font_text: text } = stilPlat;
  for (const [camp, font] of [['stil.font_titlu', titlu], ['stil.font_text', text]]) {
    if (esteFontBrand(font)) {
      if (!existaFisier(path.join(radacina, font.fisier))) {
        throw new EroareFatala(eroare('font-necunoscut', 'brand', `Fontul de brand „${font.familie}” (${font.fisier}) lipsește.`,
          'Pune în folderul brandului fișierul woff2 numit în font_titlu.fisier sau alege în fișa de brand un font din catalog.'), COD_IESIRE.DATE);
      }
      continue;
    }
    if (typeof font !== 'string' || !catalog[font]) {
      throw new EroareFatala(eroare('font-necunoscut', camp, `Fontul „${typeof font === 'string' ? font : JSON.stringify(font)}” nu e nici în catalogul de fonturi, nici un font de brand {fisier, familie}.`,
        'Alege în stil.font_titlu unul dintre fraunces, instrument-sans, inter, montserrat, playfair-display sau, în fișa de brand, un font_titlu cu fisier și familie.'), COD_IESIRE.DATE);
    }
  }
  const greutati = new Map();
  const branduri = new Map();
  for (const [font, lista] of [[titlu, [gt]], [text, greutatiText(implicite)]]) {
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
  css += `:root { --font-titlu: "${familieCss(titlu, radacina)}"; --font-text: "${familieCss(text, radacina)}"; }\n`;
  const dirFonturi = path.join(dirBuild, 'fonturi');
  const copiate = copiazaFonturi(radacina, ids, dirFonturi);
  for (const font of deBrand) copiate.push(copiazaFontBrand(radacina, font, dirFonturi));
  return { css, fisiere: [...new Set(copiate)].sort().map((f) => `fonturi/${f}`) };
}

/**
 * Scrie în dirBuild: filmare.mp4 (legat de active/filmare-lucru.mp4, fără copie când se poate), index.html, plan.json,
 * stil-rezolvat.json, gsap.min.js și fonturi/. Întoarce și argumentele de motor (decizia 13).
 * @returns {Promise<{intrare: 'index.html', fisiere: string[], active: string[], motor: object}>}
 */
export async function construieste(date, stil, cron, dirBuild, ctx) {
  const plan = ctx.intern;
  if (!plan || plan.versiune !== 1 || plan.sablon !== 'overlay-filmare') throw new TypeError('construieste cere planul lui overlay-filmare în ctx.intern (din cronologie()).');
  if (plan.durata !== cron.durata) throw new TypeError('Planul și cronologia au durate diferite.');
  const implicite = ctx.sablon.implicite;
  const stilPlat = valoriStil(stil);
  fs.mkdirSync(dirBuild, { recursive: true });
  const lucru = path.join(ctx.dirProiect, 'active', 'filmare-lucru.mp4');
  if (!existaFisier(lucru)) {
    throw new EroareFatala(eroare('resursa-lipsa', 'filmare.fisier', 'Copia de lucru active/filmare-lucru.mp4 a dispărut între verificare și construire.',
      'Creează proiectul din nou: node nucleu/mg.mjs nou <proiect-nou> --sablon overlay-filmare --filmare <clip>.'), COD_IESIRE.DATE);
  }
  legaFisier(lucru, path.join(dirBuild, 'filmare.mp4'));
  const f = fonturi(stilPlat, ctx.radacina, dirBuild, plan.greutate_titlu, implicite);
  const { sablonHtml, miscari, regizor } = citesteRuntime();
  const html = compileaza({ plan, stil: stilPlat, date, sablonHtml, runtime: { miscari, regizor }, fonturiCss: f.css, implicite });
  scrieTextAtomic(path.join(dirBuild, 'index.html'), html);
  scrieJsonAtomic(path.join(dirBuild, 'plan.json'), plan);
  scrieJsonAtomic(path.join(dirBuild, 'stil-rezolvat.json'), stil);
  fs.copyFileSync(path.join(ctx.radacina, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), path.join(dirBuild, 'gsap.min.js'));
  const fisiere = ['filmare.mp4', 'gsap.min.js', 'index.html', 'plan.json', 'stil-rezolvat.json', ...f.fisiere].sort();
  return { intrare: 'index.html', fisiere, active: [], motor: argumenteMotor(plan, ctx.dirProiect) };
}
