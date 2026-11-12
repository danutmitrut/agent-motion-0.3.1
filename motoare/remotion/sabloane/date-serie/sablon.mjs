// Șablonul date-serie, compozițiile Grafic și Serie (felia 3, în serie/): interfața comună din docs/interfete/sablon.md (spec 7.3), pe motorul Remotion.
// valideaza e în reguli.mjs; așezarea (S04) în asezare.mjs; timpii și cronologia în timp.mjs; blocul scenariului în
// bloc.mjs; props.json în props.mjs. React (src/) doar desenează ce scrie construieste în build/props.json.
import fs from 'node:fs';
import path from 'node:path';
import {
  eroare, EroareFatala, COD_IESIRE, scrieJsonAtomic, valoriStil, copiazaFonturi, copiazaFontBrand, incarcaCatalogFonturi, esteFontBrand,
} from '../../../../nucleu/lib/sdk.mjs';
import { valideaza } from './reguli.mjs';
import { aseaza } from './asezare.mjs';
import { timpi, cronologieGrafic } from './timp.mjs';
import { FPS } from './src/durata.mjs';
import { construiesteProps } from './props.mjs';
import { sursaSigla, citesteSigla } from './sigla.mjs';

import { blocScenariu as blocGrafic } from './bloc.mjs';
import { citesteRanduri } from './serie/randuri.mjs';
import { iesiriSerie, cronologieCardului, asteptariCard, blocSerie, construiesteCard } from './serie/sablon-serie.mjs';

export { valideaza } from './reguli.mjs';
export { verificariProprii } from './proprii.mjs';

/**
 * Ieșirile multiple (docs/interfete/sablon.md, felia 3): la compozitie „serie”, câte un card pe rândul tabelului;
 * la „grafic”, null (un singur MP4, ca până acum).
 */
export function iesiri(date, ctx) {
  return date.compozitie === 'serie' ? iesiriSerie(date, ctx) : null;
}

/**
 * Fișierele din care s-au făcut ieșirile (tabelul și pozele folosite), relative la proiect: nucleul le pune cu
 * hash-ul lor în verificare.json (surse) și în amprenta schiței seriei (S09). La grafic, nimic.
 */
export function surse(date, ctx) {
  return date.compozitie === 'serie' ? citesteRanduri(date, ctx).fisiere : [];
}

/** Blocul „Ce apare pe ecran”: la serie, pe toate cardurile (datele întregi, cu tabelul). */
export function blocScenariu(date, stil, cronologie, ctx = {}) {
  return date.compozitie === 'serie' ? blocSerie(date, stil, ctx) : blocGrafic(date, stil, cronologie, ctx);
}

/** Sigla, citită din nou (valideaza a verificat-o deja, S05); null dacă nu există sau videoul nu se termină cu final. */
function siglaCitita(date, ctx) {
  if (date.scene.at(-1).tip !== 'final') return null;
  const sursa = sursaSigla(date, ctx.brand ?? null, ctx.dirProiect);
  if (!sursa) return null;
  const r = sursa.invalida ? null : citesteSigla(sursa.cale, ctx.sablon.implicite.sigla_max_octeti);
  if (!r?.ok) {
    throw new EroareFatala(eroare('resursa-lipsa', sursa.camp,
      'Sigla a dispărut sau s-a schimbat între verificare și construire.',
      'Pune sigla la loc și rulează din nou mg randeaza.', { verificare: 'S05' }), COD_IESIRE.DATE);
  }
  return r;
}

/** Interfața comună: cronologia și intern = { durate, cadre, inceputuri, total, asezare }. cronologie e null dacă erori nu e gol. */
export function cronologie(date, stil, ctx) {
  if (date.rand) return cronologieCardului(date, stil, ctx);
  // protecție proprie, ca la text-animat: date invalide nu produc cronologie, indiferent de ordinea apelurilor
  const v = valideaza(date, ctx);
  if (v.erori.length > 0) return { cronologie: null, intern: null, erori: v.erori, avertismente: [] };
  const stilPlat = valoriStil(stil);
  const sigla = siglaCitita(date, ctx);
  const asezare = aseaza({ date, stilPlat, radacina: ctx.radacina, sigla: sigla ? { latime: sigla.latime, inaltime: sigla.inaltime } : null });
  if (asezare.erori.length > 0) return { cronologie: null, intern: null, erori: asezare.erori, avertismente: [] };
  const t = timpi(date, ctx.sablon.implicite);
  return {
    cronologie: cronologieGrafic(date, stilPlat, t, asezare),
    intern: { durate: t.durate, cadre: t.cadre, inceputuri: t.inceputuri, intrari: t.intrari, total: t.total, asezare },
    erori: [],
    avertismente: [],
  };
}

/**
 * Ce așteaptă verificările comune: fiecare rând de text, la completul scenei, cu caseta lui reală (din așezare).
 * Fără ctx.intern, doar textele segmentelor, la complet.
 */
export function asteptari(cron, ctx = {}) {
  if (ctx.intern?.card) return asteptariCard(cron, ctx);
  const asezare = ctx.intern?.asezare ?? null;
  const texte = [];
  cron.segmente.forEach((s, i) => {
    const sc = asezare?.scene[i] ?? null;
    if (sc) {
      for (const b of sc.texte) {
        b.randuri.forEach((text, j) => texte.push({ ref: s.ref, camp: b.campuri[j], text, t: s.complet, zona_text: s.zona_text, caseta: b.casete[j] }));
      }
    } else {
      for (const text of s.texte) texte.push({ ref: s.ref, camp: s.camp, text, t: s.complet, zona_text: s.zona_text });
    }
  });
  return {
    texte,
    momente: cron.segmente.map((s) => s.complet),
    audio: { prezent: cron.audio != null, durata: cron.audio?.durata ?? null },
    fundal: cron.fundal,
  };
}

/**
 * Scrie în dirBuild (și folderul public al lui Remotion, decizia 5): props.json, fonturi/ și sigla.<ext>.
 * Muzica (assets/muzica.m4a) o pune nucleul după construieste.
 * @returns {Promise<{intrare: 'props.json', fisiere: string[], active: string[], motor: {props: 'props.json', compozitie: 'Grafic'}}>}
 */
export async function construieste(date, stil, cron, dirBuild, ctx) {
  if (date.rand) return construiesteCard(date, stil, cron, dirBuild, ctx);
  const intern = ctx.intern;
  if (!intern?.asezare || intern.total === undefined) throw new TypeError('construieste cere intern-ul lui date-serie în ctx.intern (din cronologie()).');
  if (Math.abs(intern.total / FPS - cron.durata) > 1e-3) throw new TypeError('Cronologia și intern-ul au durate diferite.');
  const stilPlat = valoriStil(stil);
  const catalog = incarcaCatalogFonturi(ctx.radacina);
  fs.mkdirSync(dirBuild, { recursive: true });

  const dirFonturi = path.join(dirBuild, 'fonturi');
  const ids = [stilPlat.font_titlu, stilPlat.font_text].filter((f) => !esteFontBrand(f));
  const copiate = copiazaFonturi(ctx.radacina, ids, dirFonturi);
  // și fontul de text poate veni din brand (felia 4), ca fișier: props.json îl cere în fonturi/ ca pe cel de titlu
  for (const f of [stilPlat.font_titlu, stilPlat.font_text]) if (esteFontBrand(f)) copiate.push(copiazaFontBrand(ctx.radacina, f, dirFonturi));

  const fisiere = ['props.json', ...[...new Set(copiate)].map((f) => `fonturi/${f}`)];
  const sigla = intern.asezare.sigla ? siglaCitita(date, ctx) : null;
  if (sigla) {
    fs.writeFileSync(path.join(dirBuild, `sigla.${sigla.extensie}`), sigla.continut);
    fisiere.push(`sigla.${sigla.extensie}`);
  }
  const props = construiesteProps({ date, stilPlat, timpi: intern, asezare: intern.asezare, catalog, muzica: cron.audio != null, sigla });
  scrieJsonAtomic(path.join(dirBuild, 'props.json'), props);
  return { intrare: 'props.json', fisiere: fisiere.sort(), active: [], motor: { props: 'props.json', compozitie: 'Grafic' } };
}
