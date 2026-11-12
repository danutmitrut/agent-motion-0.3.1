// `mg desen arata`: foaia mică de piese, randată prin `hyperframes snapshot` (spec 8.9, harta 9.7).
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, extname } from 'node:path';
import { eroare, avertisment, EroareFatala, COD_IESIRE } from '../erori.mjs';
import { citesteText, citesteJson, scrieTextAtomic, stergeRecursiv } from '../fisiere.mjs';
import { ruleazaHyperframes } from '../motor-hf.mjs';
import { rezolvaFfmpeg } from '../ffmpeg.mjs';
import { incarcaTema } from '../teme.mjs';
import { copiazaFonturi, cssFontFace, incarcaCatalogFonturi } from '../fonturi.mjs';
import { escapeazaHtml } from '../html.mjs';
import { incarcaCatalog, gasestePiesa, caleFisierPiesa } from './catalog.mjs';
import { cssRoluri } from './roluri.mjs';

export const ID_COMPOZITIE = 'mg-arata';
const CELULA = 300;
const ETICHETA = 44;
const PAS = 20;
const MARGINE = 32;
const PROGRESE_TRASEU = Object.freeze([0.3, 0.6, 1]);
const DURATA = 1;
const MOMENT = 0.5;

function continutCelula(p, progres) {
  if (p.tip === 'traseu') {
    const t = p.traseu;
    const linii = t.paths.map((d) => `<path class="w" d="${escapeazaHtml(d)}"/>`).join('');
    return `<svg class="traseu" viewBox="0 0 ${t.w} ${t.h}" data-progres="${progres}">${linii}</svg>`;
  }
  if (p.imagine) return `<img src="${escapeazaHtml(p.imagine)}" alt="">`;
  return p.svg;
}

/**
 * Partea pură: HTML-ul compoziției HyperFrames și momentele de captură.
 * @param {Array<{id: string, tip: 'traseu'|'forma', noapte: string, svg?: string, traseu?: {w: number, h: number, paths: string[]}, imagine?: string}>} piese
 * @param {{id: string, culori: {fundal: string, text: string, accent: string}}} tema
 * @param {{cssFonturi?: string, familieText?: string}} [optiuni]
 * @returns {{html: string, latime: number, inaltime: number, durata: number, momente: number[], celule: Array<{id: string, progres: number|null, panou: boolean, x: number, y: number}>}}
 */
export function construiesteCompozitieArata(piese, tema, { cssFonturi = '', familieText = 'sans-serif' } = {}) {
  const celule = [];
  for (const p of piese) {
    const panou = tema.id === 'noapte' && (p.noapte === 'autocolant' || p.noapte === 'evita');
    if (p.tip === 'traseu') for (const progres of PROGRESE_TRASEU) celule.push({ piesa: p, id: p.id, progres, panou });
    else celule.push({ piesa: p, id: p.id, progres: null, panou });
  }
  const coloane = Math.max(1, Math.min(4, celule.length));
  const randuri = Math.max(1, Math.ceil(celule.length / coloane));
  const latime = 2 * MARGINE + coloane * CELULA + (coloane - 1) * PAS;
  const inaltime = 2 * MARGINE + randuri * (CELULA + ETICHETA) + (randuri - 1) * PAS;
  const { fundal, text, accent } = tema.culori;

  const blocuri = celule.map((c, k) => {
    c.x = MARGINE + (k % coloane) * (CELULA + PAS);
    c.y = MARGINE + Math.floor(k / coloane) * (CELULA + ETICHETA + PAS);
    const eticheta = c.progres === null ? c.id : `${c.id} ${Math.round(c.progres * 100)}%`;
    return `<div class="celula${c.panou ? ' panou' : ''}" style="left:${c.x}px;top:${c.y}px">`
      + `<div class="desen">${continutCelula(c.piesa, c.progres)}</div>`
      + `<div class="eticheta">${escapeazaHtml(eticheta)}${c.panou ? ' (pe panou)' : ''}</div></div>`;
  });

  const html = `<!DOCTYPE html>
<html lang="ro"><head><meta charset="UTF-8">
<script src="gsap.min.js"></script>
<style>
${cssFonturi}
:root{--fundal:${fundal};--text:${text};--linie:${text};--accent:${accent}}
html,body{margin:0;width:${latime}px;height:${inaltime}px;background:var(--fundal);overflow:hidden}
.celula{position:absolute;width:${CELULA}px;height:${CELULA + ETICHETA}px}
.desen{width:${CELULA}px;height:${CELULA}px;box-sizing:border-box;padding:16px;border-radius:12px}
.desen svg,.desen img{width:100%;height:100%;object-fit:contain;display:block}
.panou .desen{background:${text};--linie:${fundal};--fundal:${text}}
${cssRoluri()}
.traseu .w{fill:none;stroke:var(--linie);stroke-width:3;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}
.eticheta{height:${ETICHETA}px;line-height:${ETICHETA}px;font:500 20px "${familieText}",sans-serif;color:${text};text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head>
<body><div id="radacina" data-composition-id="${ID_COMPOZITIE}" data-start="0" data-duration="${DURATA}" data-width="${latime}" data-height="${inaltime}">
<div class="clip" data-start="0" data-duration="${DURATA}" data-track-index="0">
${blocuri.join('\n')}
</div></div>
<script>
document.querySelectorAll("svg[data-progres]").forEach(function (s) {
  var f = parseFloat(s.getAttribute("data-progres"));
  var linii = Array.prototype.slice.call(s.querySelectorAll("path.w"));
  // vector-effect:non-scaling-stroke măsoară dash-urile în pixeli de ecran, nu în unități de utilizator:
  // lungimile din getTotalLength() se înmulțesc cu scara SVG-ului (uniformă, din viewBox).
  var scara = s.getScreenCTM().a;
  var lungimi = linii.map(function (p) { return p.getTotalLength() * scara; });
  var total = lungimi.reduce(function (a, b) { return a + b; }, 0), cumulat = 0;
  linii.forEach(function (p, i) {
    var vizibil = Math.min(Math.max(f * total - cumulat, 0), lungimi[i]);
    p.style.strokeDasharray = (lungimi[i] + 1) + " " + (lungimi[i] + 1);
    p.style.strokeDashoffset = lungimi[i] + 1 - vizibil;
    p.style.visibility = vizibil <= 0.5 ? "hidden" : "visible";
    cumulat += lungimi[i];
  });
});
var tl = gsap.timeline({ paused: true });
window.__timelines = { "${ID_COMPOZITIE}": tl };
tl.to({}, { duration: ${DURATA} }, 0);
</script></body></html>
`;
  return { html, latime, inaltime, durata: DURATA, momente: [MOMENT], celule: celule.map(({ id, progres, panou, x, y }) => ({ id, progres, panou, x, y })) };
}

/**
 * Randează foaia mică și o scrie ca PNG.
 * @param {string} radacina
 * @param {string[]} ids
 * @param {{tema?: string, iesire: string, brand?: string|null}} optiuni brand = piesele brandului intră și ele (felia 4)
 * @returns {Promise<{png: string, avertismente: object[]}>} png = calea absolută a PNG-ului; avertismente =
 *   curatare-esuata, dacă folderul de lucru nu s-a putut șterge (T9: pe Windows, Chrome îl poate ține încă deschis)
 */
export async function arataPiese(radacina, ids, { tema = 'noapte', iesire, brand = null }) {
  if (!ids.length) {
    throw new EroareFatala(eroare('valoare-invalida', 'argumente.id', 'Nu ai dat niciun id de piesă.',
      'Scrie id-urile după comandă: node nucleu/mg.mjs desen arata <id> <id>.'), COD_IESIRE.UTILIZARE);
  }
  const temaIncarcata = incarcaTema(radacina, tema);
  const catalog = incarcaCatalog(radacina, brand);
  const lucru = mkdtempSync(join(tmpdir(), 'mg-arata-'));
  const avertismente = [];
  let png;
  try {
    const dirComp = join(lucru, 'compozitie');
    mkdirSync(join(dirComp, 'imagini'), { recursive: true });
    const piese = ids.map((id) => {
      const piesa = gasestePiesa(catalog, id);
      if (!piesa) {
        throw new EroareFatala(eroare('desen-necunoscut', 'argumente.id', `Piesa „${id}” nu există în biblioteci/, în proprii/ sau în catalogul brandului.`,
          'Caută un id cu node nucleu/mg.mjs desen cauta "<concept>".'), COD_IESIRE.UTILIZARE);
      }
      const cale = caleFisierPiesa(radacina, piesa);
      const baza = { id: piesa.id, tip: piesa.tip, noapte: piesa.noapte };
      if (piesa.tip === 'traseu') return { ...baza, traseu: citesteJson(cale) };
      if (extname(cale).toLowerCase() === '.svg') return { ...baza, svg: citesteText(cale) };
      copyFileSync(cale, join(dirComp, 'imagini', basename(cale)));
      return { ...baza, imagine: `imagini/${basename(cale)}` };
    });

    const idFont = temaIncarcata.font_text;
    const font = incarcaCatalogFonturi(radacina)[idFont];
    const greutate = font.fisiere.some((f) => f.greutate === 500) ? 500 : font.fisiere[0].greutate;
    copiazaFonturi(radacina, [idFont], join(dirComp, 'fonturi'));
    copyFileSync(join(radacina, 'motoare', 'hyperframes', 'comun', 'vendor', 'gsap.min.js'), join(dirComp, 'gsap.min.js'));
    const { html, momente } = construiesteCompozitieArata(piese, temaIncarcata, {
      cssFonturi: cssFontFace(radacina, idFont, [greutate], 'fonturi/'),
      familieText: font.familie,
    });
    scrieTextAtomic(join(dirComp, 'index.html'), html);

    const dirCadre = join(lucru, 'cadre');
    const r = await ruleazaHyperframes(
      ['snapshot', dirComp, '--at', momente.join(','), '--no-end', '--describe', 'false', '-o', dirCadre],
      // fără cwd: lucru (T9): folderul curent rămâne rădăcina, pentru că lucru se șterge imediat după
      { radacina, ff: await rezolvaFfmpeg(radacina), timeoutMs: 180000 },
    );
    const cadre = existsSync(dirCadre) ? readdirSync(dirCadre).filter((f) => /^frame-\d+-at-.+\.png$/.test(f)).sort() : [];
    if (r.cod !== 0 || cadre.length === 0) {
      throw new EroareFatala(eroare('motor-esuat', 'mediu.hyperframes',
        `hyperframes snapshot nu a scris cadrul foii (cod ${r.cod}). ${String(r.stderr).trim().split('\n').slice(-3).join(' ')}`.trim(),
        'Rulează node nucleu/mg.mjs doctor și încearcă din nou.'), COD_IESIRE.MEDIU);
    }
    mkdirSync(dirname(iesire), { recursive: true });
    copyFileSync(join(dirCadre, cadre[0]), iesire);
    png = iesire;
  } finally {
    // Curățarea nu aruncă niciodată (T9): nici peste o foaie reușită, nici peste eroarea care a oprit-o.
    try {
      stergeRecursiv(lucru);
    } catch (e) {
      avertismente.push(avertisment('curatare-esuata', 'mediu.temp',
        `Foaia e gata, dar folderul de lucru temporar ${lucru} nu s-a putut șterge (${e.code ?? e.message}).`,
        'Nu e nevoie să faci nimic pentru foaie; folderul se poate șterge de mână mai târziu.'));
    }
  }
  return { png, avertismente };
}
