// Compoziția Serie în interfața comună (docs/interfete/sablon.md, „Ieșirile multiple”; felia 3). Datele întregi
// (date.serie, tabelul) trec prin valideazaSerie și blocSerie; fiecare ieșire primește date-le ei, cu `rand` adăugat
// (rândul rezolvat), pe care le folosesc cronologieCardului, asteptariCard și construiesteCard.
import fs from 'node:fs';
import path from 'node:path';
import {
  eroare, verificaTexteDate, valoriStil, scrieJsonAtomic, copiazaFonturi, copiazaFontBrand, incarcaCatalogFonturi, esteFontBrand, grafeme,
} from '../../../../../nucleu/lib/sdk.mjs';
import { citesteRanduri, folderPoze, MARCAJ } from './randuri.mjs';
import { aseazaCard, coregrafie, durataCard, cronologieCard, propsCard, numePoza } from './card.mjs';
import { sursaSigla, citesteSigla } from '../sigla.mjs';
import { etichetaAfisata } from '../asezare.mjs';
import * as Z from '../src/comun/zone.mjs';

const TEXT = Object.freeze({ font: 'text', greutate: Z.GREUTATE.text });
const TARE = Object.freeze({ font: 'text', greutate: Z.GREUTATE.tare });
const TEME = Object.freeze({ noapte: 'noapte', hartie: 'hârtie', curat: 'curat' });
const CODIFICARI = Object.freeze({ 'utf-8': 'UTF-8', 'windows-1250': 'windows-1250 (Excel în română)', 'utf-16le': 'UTF-16', 'utf-16be': 'UTF-16' });
const SEPARATORI = Object.freeze({ ';': 'punct și virgulă', ',': 'virgulă', '\t': 'tab' });

/** Sigla seriei, citită (S05 a trecut-o în valideaza); null fără siglă. */
function siglaSerie(date, ctx) {
  const s = sursaSigla(date, ctx.brand ?? null, ctx.dirProiect);
  if (!s || s.invalida) return null;
  const r = citesteSigla(s.cale, ctx.sablon.implicite.sigla_max_octeti);
  return r.ok ? r : null;
}

/**
 * valideaza pentru compozitie „serie”: câmpurile seriei, C03 pe eticheta și îndemn, tabelul (S01, S02, S05).
 * Pe datele unei ieșiri (cu `rand`), rândul e deja verificat: nu se citește din nou tabelul.
 * @param {(date: object, ctx: object, erori: object[], avertismente: object[]) => void} verificaSigla regula siglei de la grafic
 */
export function valideazaSerie(date, ctx, verificaSigla) {
  const erori = [];
  const avertismente = [];
  if (date.rand) return { erori, avertismente };
  if (date.scene !== undefined) {
    erori.push(eroare('valoare-invalida', 'scene', 'La compozitie „serie” nu se dau scene: fiecare card se face din rândul lui din tabel.', 'Scoate scene din date.json sau pune compozitie „grafic”.'));
  }
  if (date.serie === undefined) {
    erori.push(eroare('camp-lipsa', 'serie', 'La compozitie „serie” lipsește obiectul serie (fisier, eventual eticheta, cta, durata).', 'Adaugă "serie": { "fisier": "resurse/<tabelul cursantului>.xlsx" }.'));
    return { erori, avertismente };
  }
  const campuri = [['serie.eticheta', date.serie.eticheta], ['serie.cta', date.serie.cta]].filter(([, t]) => t !== undefined).map(([camp, text]) => ({ camp, text }));
  const c03 = verificaTexteDate(date, campuri);
  erori.push(...c03.erori);
  avertismente.push(...c03.avertismente);
  if (date.serie.durata !== undefined && Math.abs(date.serie.durata * 10 - Math.round(date.serie.durata * 10)) > 1e-9) {
    erori.push(eroare('valoare-invalida', 'serie.durata', `serie.durata, ${String(date.serie.durata).replace('.', ',')} s, nu are pasul de 0,1 s.`, 'Scrie serie.durata cu cel mult o zecimală.'));
  }
  verificaSigla(date, ctx, erori, avertismente);
  const r = citesteRanduri(date, ctx);
  erori.push(...r.erori);
  avertismente.push(...r.avertismente);
  return { erori, avertismente };
}

/**
 * Hook-ul iesiri (docs/interfete/sablon.md): câte o ieșire pe rând, cu id-ul = slug-ul numelui. Schița seriei
 * (spec 7.3, pasul 3) are trei rânduri-limită: primul, ultimul și cel cu citatul cel mai lung.
 * @returns {Array<{id: string, date: object, schita: boolean}>|null} null la compozitie „grafic”
 */
export function iesiriSerie(date, ctx) {
  const { randuri } = citesteRanduri(date, ctx);
  const lung = randuri.reduce((m, r) => (grafeme(r.citat) > grafeme(m.citat) ? r : m), randuri[0]);
  const schita = new Set([randuri[0]?.id, randuri.at(-1)?.id, lung?.id]);
  return randuri.map((rand) => ({ id: rand.id, date: { ...date, rand }, schita: schita.has(rand.id) }));
}

/** cronologie() pe datele unei ieșiri: așezarea, coregrafia, durata cardului (cel mult 20 s) și cronologia. */
export function cronologieCardului(date, stil, ctx) {
  const stilPlat = valoriStil(stil);
  const sigla = siglaSerie(date, ctx);
  const a = aseazaCard({ rand: date.rand, serie: date.serie, stilPlat, radacina: ctx.radacina, sigla: sigla ? { latime: sigla.latime, inaltime: sigla.inaltime } : null });
  if (a.erori.length > 0) return { cronologie: null, intern: null, erori: a.erori, avertismente: [] };
  const cor = coregrafie(a);
  const d = durataCard({ serie: date.serie, rand: date.rand, a, intrare: cor.intrare });
  if (d.depaseste) {
    const r = date.rand;
    return {
      cronologie: null, intern: null, avertismente: [],
      erori: [eroare('date-serie-citat-lung', `randuri[${r.n}].citat`,
        `Cardul lui ${r.nume} ar cere ${String(Math.ceil(d.necesar)).replace('.', ',')} s ca textul să poată fi citit; un card are cel mult ${Z.CARD.durata.max} s. Citatul${r.scurtat ? ' original' : ''}, întreg: „${r.citat_original ?? r.citat}”`,
        `Propune-i cursantului o scurtare: scrie-o în serie.scurtari["${r.nume}"], cu ${MARCAJ} în locul bucăților scoase, și arat-o în blocul „Ce apare pe ecran” înainte de „aprob”.`, { verificare: 'S02' })],
    };
  }
  const cron = cronologieCard({ date, rand: date.rand, stilPlat, a, intrare: cor.intrare, durata: d.durata });
  const cadre = Math.round(cron.durata * 30);
  return {
    cronologie: cron,
    intern: { card: true, a, cor, cadre: [cadre], total: cadre, limite: { min: Z.CARD.durata.min, max: Z.CARD.durata.max }, necesar: d.necesar },
    erori: [],
    avertismente: [],
  };
}

/** asteptari() pe un card: fiecare rând de text, la completul cardului, cu caseta lui. */
export function asteptariCard(cron, ctx) {
  const s = cron.segmente[0];
  const texte = ctx.intern.a.texte.flatMap((b) => b.randuri.map((text, j) => ({ ref: s.ref, camp: b.campuri[j], text, t: s.complet, zona_text: s.zona_text, caseta: b.casete[j] })));
  return { texte, momente: [s.complet], audio: { prezent: cron.audio != null, durata: cron.audio?.durata ?? null }, fundal: cron.fundal };
}

/**
 * Blocul „Ce apare pe ecran” pentru toată seria: textele comune, apoi fiecare card (numele, rolul, citatul exact cum
 * apare, cu nota când e scurtat). Zona „Texte și cifre” intră în hash-ul aprobării: un rând schimbat în tabel cere
 * o aprobare nouă.
 */
export function blocSerie(date, stil, ctx) {
  const stilPlat = valoriStil(stil);
  const { randuri, sursa } = citesteRanduri(date, ctx);
  const texte = [];
  const linie = (ref, camp, eticheta, text, font) => texte.push({ ref, camp, eticheta, text, accent: false, separat: false, ...font });
  if (date.serie.eticheta !== undefined) linie('Toate cardurile', 'serie.eticheta', 'eticheta', etichetaAfisata(date.serie.eticheta, stilPlat.eticheta), TARE);
  if (date.serie.cta !== undefined) linie('Toate cardurile', 'serie.cta', 'îndemn', date.serie.cta, TARE);
  for (const r of randuri) {
    const ref = `Testimonial ${r.n + 1}`;
    linie(ref, `randuri[${r.n}].nume`, 'nume', r.nume, TARE);
    if (r.rol !== '') linie(ref, `randuri[${r.n}].rol`, 'rol', r.rol, TEXT);
    linie(ref, `randuri[${r.n}].citat`, r.scurtat ? 'citat (scurtat, cu acordul cursantului)' : 'citat', r.citat, TEXT);
  }
  const c = stil.culori;
  const linii = [
    `Tema: ${TEME[stilPlat.tema] ?? stilPlat.tema}; accent ${c.accent.valoare}; fundal ${c.fundal.valoare}`,
    `Format: vertical 1080x1920, 30 fps; câte un MP4 pe rând, în serie/`,
    `Tabelul: ${date.serie.fisier}${sursa?.tip === 'csv' ? `, ${CODIFICARI[sursa.codificare] ?? sursa.codificare}, separator ${SEPARATORI[sursa.separator] ?? sursa.separator}` : sursa?.tip === 'xlsx' ? ', Excel, prima foaie' : ''}; ${randuri.length} ${randuri.length === 1 ? 'testimonial' : 'testimoniale'}`,
    `Pozele: din ${folderPoze(date, ctx.dirProiect)}/; ${randuri.filter((r) => r.poza).length} cu poză, ${randuri.filter((r) => !r.poza).length} cu inițiale`,
    `Durata cardurilor: ${date.serie.durata !== undefined ? `${String(date.serie.durata).replace('.', ',')} s fiecare` : 'după citat (8 s, 10 s peste 120 de caractere, mai mult cât să se poată citi, cel mult 20 s)'}`,
  ];
  for (const r of randuri) linii.push(`Testimonial ${r.n + 1}: ${r.nume}${r.poza ? `, poza ${r.poza.fisier}` : `, inițialele ${r.initiale}`}${r.scurtat ? '; citat scurtat' : ''}`);
  return { texte, stil: linii };
}

/** construieste() pe un card: fonturile, sigla și poza în build/<id>/, apoi props.json, cu căile prefixate de <id>/. */
export async function construiesteCard(date, stil, cron, dirBuild, ctx) {
  const intern = ctx.intern;
  if (!intern?.card) throw new TypeError('construieste cere intern-ul unui card date-serie în ctx.intern (din cronologie()).');
  const id = ctx.iesire?.id;
  if (typeof id !== 'string' || id === '') throw new TypeError('construieste pe un card cere ctx.iesire.id (prefixul folderului public).');
  const stilPlat = valoriStil(stil);
  const catalog = incarcaCatalogFonturi(ctx.radacina);
  fs.mkdirSync(dirBuild, { recursive: true });
  const dirFonturi = path.join(dirBuild, 'fonturi');
  const copiate = copiazaFonturi(ctx.radacina, [stilPlat.font_titlu, stilPlat.font_text].filter((f) => !esteFontBrand(f)), dirFonturi);
  for (const f of [stilPlat.font_titlu, stilPlat.font_text]) if (esteFontBrand(f)) copiate.push(copiazaFontBrand(ctx.radacina, f, dirFonturi));
  const fisiere = ['props.json', ...[...new Set(copiate)].map((f) => `fonturi/${f}`)];
  const sigla = intern.a.sigla ? siglaSerie(date, ctx) : null;
  if (sigla) {
    fs.writeFileSync(path.join(dirBuild, `sigla.${sigla.extensie}`), sigla.continut);
    fisiere.push(`sigla.${sigla.extensie}`);
  }
  const poza = numePoza(date.rand);
  if (poza) {
    fs.copyFileSync(date.rand.poza.cale, path.join(dirBuild, poza));
    fisiere.push(poza);
  }
  const props = propsCard({ rand: date.rand, stilPlat, a: intern.a, cor: intern.cor, cadre: intern.total, catalog, prefix: `${id}/`, muzica: cron.audio != null, sigla, poza });
  scrieJsonAtomic(path.join(dirBuild, 'props.json'), props);
  return { intrare: 'props.json', fisiere: fisiere.sort(), active: [], motor: { props: 'props.json', compozitie: 'Serie' } };
}
