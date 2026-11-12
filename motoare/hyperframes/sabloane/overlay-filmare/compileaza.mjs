// compileaza.mjs: plan + stil → build/index.html, determinist, fără rețea (spec 7.4; decizia 2 din planul H).
// Funcție pură: nu citește și nu scrie pe disc. Primește conținutul lui index.src.html, al runtime-ului și CSS-ul fonturilor
// și înlocuiește marcajele într-o singură trecere, ca un text inserat să nu mai fie scanat după alte marcaje.
// Pozițiile, mărimile și textele vin din plan (tipuri.mjs, plan.mjs); aici doar se scriu, fiecare text prin escapeazaHtml.
// Filmarea rămâne neatinsă: doar object-fit: cover și object-position pentru decupare (spec 7.4, „Ce nu face”).
import { hexInRgb, escapeazaHtml } from '../../../../nucleu/lib/sdk.mjs';

// Marcajul → de câte ori trebuie să apară în index.src.html.
const MARCAJE = Object.freeze({
  '/*MG_FONTURI*/': 1,
  '/*MG_VARIABILE*/': 1,
  '/*MG_ROLURI*/': 1,
  '{{MG_CLASE}}': 1,
  '{{MG_DURATA}}': 3,
  '{{MG_LATIME}}': 2,
  '{{MG_INALTIME}}': 2,
  '{{MG_START}}': 2,
  '<!--MG_ELEMENTE-->': 1,
  '<!--MG_SUBTITRARI-->': 1,
  '/*MG_MISCARI*/': 1,
  '/*MG_DATE*/': 1,
  '/*MG_REGIZOR*/': 1,
});

// Culoarea fiecărui rol: accentul pe etichetă, cifră și îndemn; atenuat pe textele mici; textul în rest.
const CULOARE_ROL = Object.freeze({ eticheta: 'accent', cifra: 'accent', cta: 'accent', rol: 'atenuat', autor: 'atenuat', text_cifra: 'atenuat', detaliu: 'atenuat' });

// JSON sigur într-un <script>: '<' devine \u003c, deci nici '</script>', nici '<!--' nu pot apărea.
function jsonInScript(valoare) {
  return JSON.stringify(valoare).replace(/</g, '\\u003c');
}

function rgba(hex, alfa) {
  const [r, g, b] = hexInRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

function variabile(plan, stil, implicite) {
  const c = stil.culori;
  return [
    '      :root {',
    `        --w: ${plan.latime}px;`,
    `        --h: ${plan.inaltime}px;`,
    `        --text: ${c.text};`,
    `        --atenuat: ${c.atenuat};`,
    `        --accent: ${c.accent};`,
    `        --card: ${rgba(c.fundal, plan.opacitate_fundal)};`,
    `        --raza: ${implicite.card.raza[stil.tema] ?? implicite.card.raza.noapte}px;`,
    `        --raza-sub: ${implicite.subtitrari.raza}px;`,
    `        --rand-sub: ${implicite.subtitrari.inaltime_rand};`,
    `        --greutate-titlu: ${plan.greutate_titlu};`,
    `        --focus-x: ${plan.focus_x}%;`,
    `        --eticheta-spatiere: ${stil.eticheta?.spatiere ?? 0}em;`,
    '      }',
  ].join('\n');
}

/** CSS-ul rolurilor (implicite.roluri): fontul, greutatea, înălțimea rândului și culoarea. font-size stă pe fiecare bloc. */
export function cssRoluriText(implicite, greutateTitlu) {
  const linii = [];
  for (const [nume, R] of Object.entries(implicite.roluri)) {
    if (nume === 'subtitrare') continue;
    const font = R.font === 'titlu' ? 'var(--font-titlu)' : 'var(--font-text)';
    const greutate = R.font === 'titlu' ? greutateTitlu : R.greutate;
    const cifre = nume === 'cifra' ? ' font-variant-numeric: tabular-nums;' : '';
    linii.push(`      .r-${nume} { font-family: ${font}, sans-serif; font-weight: ${greutate}; line-height: ${R.inaltime_rand}; color: var(--${CULOARE_ROL[nume] ?? 'text'});${cifre} }`);
  }
  linii.push('      .r-eticheta { letter-spacing: var(--eticheta-spatiere); }');
  return linii.join('\n');
}

const px = (v) => `${v}px`;

function htmlBloc(b) {
  if (b.fel === 'card') return `<div class="card" id="${escapeazaHtml(b.id)}" style="left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)}"></div>`;
  const clase = ['bloc', `r-${b.rol}`, ...(b.fel === 'punct' ? ['punct'] : [])].join(' ');
  const stil = `left:${px(b.x)};top:${px(b.y)};font-size:${px(b.marime)}${b.marcaj ? `;padding-left:${px(b.marcaj)}` : ''}`;
  return `<div class="${clase}" id="${escapeazaHtml(b.id)}" style="${stil}"><span id="${escapeazaHtml(b.text_id)}">${escapeazaHtml(b.text)}</span></div>`;
}

function htmlElemente(plan) {
  return plan.elemente.map((e) => [
    `        <div class="element ${escapeazaHtml(e.tip)}" id="e${e.n}"${e.permite_banda_subtitrari ? ' data-layout-allow-caption-zone' : ''}>`,
    ...e.blocuri.map((b) => `          ${htmlBloc(b)}`),
    '        </div>',
  ].join('\n')).join('\n');
}

function htmlSubtitrari(plan, implicite) {
  const padding = implicite.subtitrari.padding.map(px).join(' ');
  return plan.subtitrari.grupuri.map((g) => {
    const [x, y, w, h] = g.caseta;
    const randuri = g.randuri.map((idx) => `<div class="rand-sub">${idx.map((i) => {
      const c = g.cuvinte[i];
      return `<span class="c${c.evidentiat ? ' ev' : ''}" id="c${g.n}-${i + 1}">${escapeazaHtml(c.text)}</span>`;
    }).join(' ')}</div>`).join('');
    return `          <div class="grup" id="${escapeazaHtml(g.id)}" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)};font-size:${px(g.marime)};padding:${padding}">${randuri}</div>`;
  }).join('\n');
}

/**
 * @param {{ plan: object, stil: object, date: object, sablonHtml: string, runtime: {miscari: string, regizor: string},
 *   fonturiCss: string, implicite: object }} p   stil = valoriStil(StilRezolvat)
 * @returns {string} conținutul lui build/index.html
 */
export function compileaza({ plan, stil, date, sablonHtml, runtime, fonturiCss, implicite }) {
  if (date?.sablon !== 'overlay-filmare') throw new TypeError('compileaza primește doar date ale șablonului overlay-filmare.');
  for (const [marcaj, numar] of Object.entries(MARCAJE)) {
    const gasite = sablonHtml.split(marcaj).length - 1;
    if (gasite !== numar) throw new Error(`index.src.html are marcajul ${marcaj} de ${gasite} ori; trebuie ${numar}.`);
  }
  const valori = {
    '/*MG_FONTURI*/': fonturiCss.trimEnd(),
    '/*MG_VARIABILE*/': variabile(plan, stil, implicite),
    '/*MG_ROLURI*/': cssRoluriText(implicite, plan.greutate_titlu),
    '{{MG_CLASE}}': escapeazaHtml(`${plan.format} ${plan.subtitrari.animatie}`),
    '{{MG_DURATA}}': escapeazaHtml(plan.durata),
    '{{MG_LATIME}}': escapeazaHtml(plan.latime),
    '{{MG_INALTIME}}': escapeazaHtml(plan.inaltime),
    '{{MG_START}}': escapeazaHtml(plan.start),
    '<!--MG_ELEMENTE-->': htmlElemente(plan),
    '<!--MG_SUBTITRARI-->': htmlSubtitrari(plan, implicite),
    '/*MG_MISCARI*/': runtime.miscari.trimEnd(),
    '/*MG_DATE*/': `window.__MG_PLAN = ${jsonInScript(plan)};\n    window.__MG_CULORI = ${jsonInScript({ text: stil.culori.text, accent: stil.culori.accent })};`,
    '/*MG_REGIZOR*/': runtime.regizor.trimEnd(),
  };
  const tipar = new RegExp(Object.keys(MARCAJE).map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return sablonHtml.replace(tipar, (m) => valori[m]);
}
