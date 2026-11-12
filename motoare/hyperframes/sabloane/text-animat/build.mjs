// Verificările lui text-animat de stadiu build (spec 7.2, „Verificări specifice”): S05 (cifra), S06 (accentul),
// S07 (sigla) și S09 (textele). Citesc ce a scris construieste (build/index.html, build/plan.json,
// build/stil-rezolvat.json) și adevărul, video/<proiect>/date.json. Planul spune doar ce piesă ține de ce câmp;
// textul fiecărei piese se ia din HTML. Partea de build a lui S04 (citatul între „ și ”) e acoperită de S09:
// textul așteptat al citatului include ghilimelele (decizia 10 din planul G).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eroare, citesteText, valoriStil, textAfisat } from '../../../../nucleu/lib/sdk.mjs';
import { textCifra } from './cifre.mjs';
import { etichetaAfisata } from './asezare.mjs';
import { sursaSigla, dimensiuniSigla } from './sigla.mjs';

const ENTITATI = Object.freeze({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" });
const PIESA = /<span class="p( accent)?" id="(t\d+-\d+)"(?: data-layout-allow-overlap)?>([^<]*)<\/span>/g;
const SIGLA = /<img id="sigla" class="bloc" src="data:([^;"]+);base64,([A-Za-z0-9+/=]*)" width="(\d+)" height="(\d+)"/;
const ACCENT = /\*([^*]+)\*/g;
const CAMPURI_MICI = ['sursa', 'autor', 'rol', 'cta', 'detaliu'];

const decodeaza = (t) => t.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITATI[m]);
const strans = (t) => t.replace(/\s+/g, ' ').trim();
const faraSpatii = (t) => t.replace(/\s+/g, '');
const sha = (continut) => crypto.createHash('sha256').update(continut).digest('hex');
const citesteJson = (cale) => JSON.parse(citesteText(cale).replace(/^\uFEFF/, ''));

/** Forma RezultatVerificare (docs/interfete/sablon.md); rezultat() din nucleu nu e în sdk. */
function rezultat(cod, erori, { valoare = null, prag = null } = {}) {
  return { cod, ok: erori.length === 0, valoare, prag, camp: erori[0]?.camp ?? null, erori, avertismente: [] };
}

/** Piesele de text din index.html: id → { text (decodat), accent }. */
export function pieseHtml(html) {
  const piese = new Map();
  for (const m of html.matchAll(PIESA)) piese.set(m[2], { text: decodeaza(m[3]), accent: m[1] !== undefined });
  return piese;
}

/**
 * Câmpurile de text din date, în ordinea de pe ecran: textul brut (cu *) și textul de pe ecran, cu spațiile strânse.
 * @param {object} date @param {object} stilPlat valoriStil(stil-rezolvat)
 * @returns {Array<{camp: string, brut: string, afisat: string}>}
 */
export function campuriText(date, stilPlat) {
  const lista = [];
  date.scene.forEach((s, i) => {
    const b = `scene[${i}]`;
    const pune = (camp, brut, afisat = textAfisat(brut)) => lista.push({ camp, brut, afisat: strans(afisat) });
    if (s.eticheta !== undefined) pune(`${b}.eticheta`, s.eticheta, etichetaAfisata(s.eticheta, stilPlat.eticheta));
    for (const k of ['titlu', 'cuvinte', 'puncte']) (s[k] ?? []).forEach((t, j) => pune(`${b}.${k}[${j}]`, t));
    if (s.tip === 'cifra') pune(`${b}.valoare`, '', textCifra(s));
    if (s.text !== undefined) pune(`${b}.text`, s.text, s.tip === 'citat' ? `„${textAfisat(s.text)}”` : textAfisat(s.text));
    for (const k of CAMPURI_MICI) if (s[k] !== undefined) pune(`${b}.${k}`, s[k]);
  });
  return lista;
}

/** Ce e în build pe fiecare câmp: rândurile (spațiile din plan, piesele din HTML), bucățile .accent, piesele lipsă. */
function texteBuild(plan, piese) {
  const pe = new Map();
  for (const s of plan.scene) {
    for (const b of s.blocuri) {
      for (const r of b.randuri) {
        const x = pe.get(r.camp) ?? { randuri: [], accent: [], lipsa: [] };
        let rand = '';
        for (const p of r.parti) {
          if (p.tip === 'spatiu') {
            rand += p.text;
            continue;
          }
          const h = piese.get(p.id);
          if (!h) {
            x.lipsa.push(p.id);
            continue;
          }
          rand += h.text;
          if (h.accent) x.accent.push(h.text);
        }
        x.randuri.push(rand);
        pe.set(r.camp, x);
      }
    }
  }
  return pe;
}

function s05(date, build, sugestie) {
  const erori = [];
  let n = 0;
  date.scene.forEach((s, i) => {
    if (s.tip !== 'cifra') return;
    n += 1;
    const camp = `scene[${i}].valoare`;
    const asteptat = textCifra(s);
    const gasit = (build.get(camp)?.randuri ?? []).join(' ');
    if (gasit !== asteptat) {
      erori.push(eroare('text-animat-cifra', camp,
        `Scena ${i + 1}: în build/index.html cifra e „${gasit}”, iar din date iese „${asteptat}”.`, sugestie, { verificare: 'S05' }));
    }
  });
  return rezultat('S05', erori, { valoare: n, prag: 'valoarea finală scrisă static, în format românesc, cu prefixul și sufixul ei' });
}

function s06(campuri, build, sugestie) {
  const erori = [];
  for (const c of campuri) {
    const asteptat = [...c.brut.matchAll(ACCENT)].map((m) => faraSpatii(m[1])).join('');
    const gasit = faraSpatii((build.get(c.camp)?.accent ?? []).join(''));
    if (gasit !== asteptat) {
      erori.push(eroare('text-animat-accent', c.camp,
        `${c.camp}: în build, bucățile .accent sunt „${gasit}”, iar în date.json textul marcat cu * e „${asteptat}”.`, sugestie, { verificare: 'S06' }));
    }
  }
  return rezultat('S06', erori, { valoare: campuri.length, prag: 'bucățile .accent sunt exact textele marcate cu *' });
}

function s07(html, plan, date, ctx, sugestie) {
  const prag = 'sigla din build are octeții și raportul de aspect ale fișierului sursă';
  const m = SIGLA.exec(html);
  if (!plan.sigla) {
    const erori = m ? [eroare('text-animat-sigla', 'sigla', 'build/index.html are o siglă, deși planul nu are.', sugestie, { verificare: 'S07' })] : [];
    return rezultat('S07', erori, { prag });
  }
  const sursa = sursaSigla(date, ctx.brand ?? null, ctx.dirProiect);
  const camp = sursa?.camp ?? 'sigla';
  const reconstruieste = `Pune sigla la loc (în resurse/ sau în folderul brandului) și rulează din nou node nucleu/mg.mjs randeaza ${ctx.proiect} --doar-verificare.`;
  const pica = (mesaj, sug) => rezultat('S07', [eroare('text-animat-sigla', camp, mesaj, sug, { verificare: 'S07' })], { prag });
  if (!m) return pica('Planul are siglă, dar build/index.html nu o conține.', sugestie);
  if (!sursa) return pica('Build-ul are siglă, dar date.json și brandul nu mai numesc niciuna.', reconstruieste);
  if (sursa.invalida) {
    // brand.sigla nu e un nume de fișier din folderul brandului: nu există cale de citit
    return pica(`${sursa.loc} nu e un nume de fișier din folderul brandului, așa că nu poate fi comparată cu cea din build.`,
      'Pune în fișa brandului numele unui fișier .svg sau .png din folderul brandului, apoi rulează din nou randarea.');
  }
  let continut;
  try {
    continut = fs.readFileSync(sursa.cale);
  } catch {
    return pica(`${sursa.loc} nu mai există (${path.basename(sursa.cale)}).`, reconstruieste);
  }
  if (sha(Buffer.from(m[2], 'base64')) !== sha(continut)) {
    return pica(`${sursa.loc} din build nu e fișierul ${path.basename(sursa.cale)}: conținutul diferă.`, reconstruieste);
  }
  const dim = dimensiuniSigla(continut, path.extname(sursa.cale).slice(1).toLowerCase());
  const w = Number(m[3]);
  const h = Number(m[4]);
  if (!dim || Math.abs(w - (h * dim.latime) / dim.inaltime) > 1) {
    const raport = dim ? `${dim.latime}x${dim.inaltime}` : 'necunoscut';
    return pica(`${sursa.loc} are în build ${w}x${h} px, iar fișierul are raportul ${raport}.`, sugestie);
  }
  return rezultat('S07', [], { valoare: { w, h }, prag });
}

function s09(campuri, build, sugestie) {
  const erori = [];
  for (const c of campuri) {
    const x = build.get(c.camp);
    if (x && x.lipsa.length > 0) {
      erori.push(eroare('text-animat-text-in-build', c.camp,
        `În build/index.html lipsesc piesele ${x.lipsa.join(', ')} ale lui ${c.camp}.`, sugestie, { verificare: 'S09' }));
      continue;
    }
    const gasit = x ? strans(x.randuri.join(' ')) : '';
    if (gasit !== c.afisat) {
      erori.push(eroare('text-animat-text-in-build', c.camp,
        `${c.camp}: în build/index.html scrie „${gasit}”, iar din date.json iese „${c.afisat}”.`, sugestie, { verificare: 'S09' }));
    }
  }
  return rezultat('S09', erori, { valoare: campuri.length, prag: 'textul din build = textul din date.json, pe fiecare câmp' });
}

/**
 * Hook-ul verificariBuild (docs/interfete/sablon.md): chemat de nucleu după C10 și C17, pe o pregătire fără erori.
 * @param {string} dirBuild absolut
 * @param {{dirProiect: string, proiect: string, brand?: object|null}} ctx
 * @returns {object[]} S05, S06, S07, S09
 */
export function verificariBuild(dirBuild, ctx) {
  const html = citesteText(path.join(dirBuild, 'index.html'));
  const plan = citesteJson(path.join(dirBuild, 'plan.json'));
  const stilPlat = valoriStil(citesteJson(path.join(dirBuild, 'stil-rezolvat.json')));
  const date = citesteJson(path.join(ctx.dirProiect, 'date.json'));
  const sugestie = `Nu e o problemă a datelor: copiază mesajul în video/${ctx.proiect}/cerere-sablon.md pentru Dănuț și nu modifica build/.`;
  const campuri = campuriText(date, stilPlat);
  const build = texteBuild(plan, pieseHtml(html));
  return [s05(date, build, sugestie), s06(campuri, build, sugestie), s07(html, plan, date, ctx, sugestie), s09(campuri, build, sugestie)];
}
