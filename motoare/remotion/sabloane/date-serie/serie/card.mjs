// Cardul unui testimonial (compoziția Serie, felia 3): așezarea măsurată cu fontkit (ca la Grafic, aceleași mărimi în
// S04, în caseta lui C13 și în React), coregrafia intrării, durata cardului, cronologia și props.json. Un card = un MP4.
// Zonele și plajele sunt în src/comun/zone.mjs (CARD); aici nu e nimic aleatoriu, deci același rând dă același card.
import { eroare, rupeRanduri, timpCitire, rotunjeste, audioCronologie, grafeme } from '../../../../../nucleu/lib/sdk.mjs';
import * as Z from '../src/comun/zone.mjs';
import { FPS } from '../src/durata.mjs';
import { bloc, creeazaMasurator, etichetaAfisata, marimi } from '../asezare.mjs';
import { ceataProps, fonturiProps } from '../props.mjs';

const C = Z.CARD;
const h = (marime, n = 1) => Math.round(n * marime * Z.INTERLINIE);
const sec = (cadre) => rotunjeste(cadre / FPS, 3);
const LATIME_COLOANA = (Z.LATIME_UTILA - C.avatar - C.langaAvatar) * (1 - Z.MARJA);

/** Cea mai mare mărime din plajă la care textul, rupt, încape în lățime și în numărul de rânduri (maxRanduri(m)). */
function potrivesteRupt(text, { mas, font, greutate, plaja, latime, maxRanduri, spatiere = 0 }) {
  let esec = null;
  for (const m of marimi(plaja)) {
    const r = rupeRanduri(text, { latimeMax: latime, masoara: mas(font, greutate, m, spatiere), maxRanduri: maxRanduri(m) });
    if (r.ok) return { ok: true, marime: m, randuri: r.randuri.map((x) => ({ text: x.text, latime: x.latime })) };
    esec = { motiv: r.motiv, marime: m, cuvant: r.cuvant, necesare: r.necesare };
  }
  return { ok: false, ...esec };
}

const cerere = (id, font, greutate, culoare, camp, extra = {}) => ({ id, font, greutate, culoare, spatiere: 0, aliniere: 'stanga', camp, ...extra });
const cuCamp = (p, camp) => ({ ...p, randuri: p.randuri.map((r) => ({ ...r, camp })) });

/** Sigla în colțul din dreapta sus, micșorată proporțional în cutia CARD.sigla. */
function cutieSigla(dim) {
  if (!dim) return null;
  const k = Math.min(C.sigla.latime / dim.latime, C.sigla.inaltime / dim.inaltime);
  const latime = Math.max(1, Math.round(dim.latime * k));
  const inaltime = Math.max(1, Math.round(dim.inaltime * k));
  return { x: Z.LATERAL + Z.LATIME_UTILA - latime, y: Z.SUS, latime, inaltime };
}

function eroareCard(camp, rand, motiv, sugestie) {
  return eroare('rand-nu-incape', camp, `Cardul lui ${rand.nume}: ${motiv}`, sugestie, { verificare: 'S04' });
}

/**
 * Așezarea unui card. `serie` = date.serie (eticheta, cta), `rand` = rândul din citesteRanduri.
 * @returns {{erori: object[], texte?: object[], ghilimele?: object, avatar?: object, sigla?: object|null, zona?: number[]}}
 */
export function aseazaCard({ rand, serie, stilPlat, radacina, sigla: dimSigla = null }) {
  const mas = creeazaMasurator(radacina, stilPlat);
  const cr = `randuri[${rand.n}]`;
  const texte = [];
  const sigla = cutieSigla(dimSigla);

  // sus: eticheta, cu loc pentru siglă în dreapta
  let sus = Z.SUS;
  if (serie.eticheta !== undefined) {
    const text = etichetaAfisata(serie.eticheta, stilPlat.eticheta);
    const limita = (sigla ? Z.LATIME_UTILA - sigla.latime - 40 : Z.LATIME_UTILA) * (1 - Z.MARJA);
    const spatiere = stilPlat.eticheta?.spatiere ?? 0;
    const w = mas('text', Z.GREUTATE.tare, C.eticheta, spatiere)(text);
    if (w > limita) {
      return { erori: [eroare('rand-nu-incape', 'serie.eticheta', `Eticheta seriei, „${text}”, are ${Math.round(w)} px și nu încape (încap ${Math.floor(limita)} px${sigla ? ', lângă siglă' : ''}).`, 'Scurtează serie.eticheta.', { verificare: 'S04' })] };
    }
    texte.push(bloc(cerere('eticheta', 'text', Z.GREUTATE.tare, 'atenuat', 'serie.eticheta', { spatiere }), { marime: C.eticheta, randuri: [{ text, latime: w, camp: 'serie.eticheta' }] }, Z.LATERAL, sus));
  }
  const inaltimeSus = Math.max(texte.length ? h(C.eticheta) : 0, sigla?.inaltime ?? 0);
  if (inaltimeSus > 0) sus += inaltimeSus + C.sub_eticheta;
  const ghilimele = { x: Z.LATERAL, y: sus, latime: C.ghilimele.latime, inaltime: C.ghilimele.inaltime };
  const susCitat = sus + C.ghilimele.inaltime + C.ghilimele.sub;

  // jos: îndemnul, lipit de limita zonei sigure
  let jos = Z.JOS;
  let blocCta = null;
  if (serie.cta !== undefined) {
    const p = potrivesteRupt(serie.cta, { mas, font: 'text', greutate: Z.GREUTATE.tare, plaja: C.cta, latime: Z.LATIME_RAND, maxRanduri: () => 2 });
    if (!p.ok) return { erori: [eroare('rand-nu-incape', 'serie.cta', `Îndemnul seriei nu încape în 2 rânduri nici la ${p.marime} px.`, 'Scurtează serie.cta.', { verificare: 'S04' })] };
    blocCta = bloc(cerere('cta', 'text', Z.GREUTATE.tare, 'accent', 'serie.cta'), cuCamp(p, 'serie.cta'), Z.LATERAL, Z.JOS - h(p.marime, p.randuri.length));
    jos = blocCta.y - C.peste_cta;
  }

  // omul: avatarul și, în dreapta lui, numele și rolul, centrate pe verticală față de avatar
  const pn = potrivesteRupt(rand.nume, { mas, font: 'text', greutate: Z.GREUTATE.tare, plaja: C.nume, latime: LATIME_COLOANA, maxRanduri: () => 2 });
  if (!pn.ok) return { erori: [eroareCard(`${cr}.nume`, rand, `numele nu încape în 2 rânduri nici la ${pn.marime} px.`, 'Cere-i cursantului o formă mai scurtă a numelui, în tabel.')] };
  let pr = null;
  if (rand.rol !== '') {
    pr = potrivesteRupt(rand.rol, { mas, font: 'text', greutate: Z.GREUTATE.text, plaja: C.rol, latime: LATIME_COLOANA, maxRanduri: () => 2 });
    if (!pr.ok) return { erori: [eroareCard(`${cr}.rol`, rand, `rolul nu încape în 2 rânduri nici la ${pr.marime} px.`, 'Cere-i cursantului o formă mai scurtă a rolului (sau a orașului), în tabel.')] };
  }
  const inaltimeColoana = h(pn.marime, pn.randuri.length) + (pr ? C.subNume + h(pr.marime, pr.randuri.length) : 0);
  const inaltimeOm = Math.max(C.avatar, inaltimeColoana);
  const susOm = jos - inaltimeOm;
  const avatar = { x: Z.LATERAL, y: susOm + Math.round((inaltimeOm - C.avatar) / 2), diametru: C.avatar };
  const xColoana = Z.LATERAL + C.avatar + C.langaAvatar;
  const yColoana = susOm + Math.round((inaltimeOm - inaltimeColoana) / 2);
  const blocNume = bloc(cerere('nume', 'text', Z.GREUTATE.tare, 'text', `${cr}.nume`), cuCamp(pn, `${cr}.nume`), xColoana, yColoana);
  const blocRol = pr ? bloc(cerere('rol', 'text', Z.GREUTATE.text, 'atenuat', `${cr}.rol`), cuCamp(pr, `${cr}.rol`), xColoana, blocNume.y + blocNume.inaltime + C.subNume) : null;

  // citatul: cea mai mare treaptă la care încape în zona dintre ghilimele și om, centrat pe verticală
  const inaltimeCitat = susOm - C.sub_citat - susCitat;
  const pc = potrivesteRupt(rand.citat, { mas, font: 'text', greutate: Z.GREUTATE.text, plaja: C.citat, latime: Z.LATIME_RAND, maxRanduri: (m) => Math.floor(inaltimeCitat / (m * Z.INTERLINIE)) });
  if (!pc.ok) {
    return {
      erori: [eroareCard(`${cr}.citat`, rand,
        pc.motiv === 'cuvant-prea-lung' ? `cuvântul „${pc.cuvant}” din citat nu încape pe un rând.` : `citatul nu încape pe card nici la ${pc.marime} px (are nevoie de ${pc.necesare} rânduri).`,
        `Propune-i cursantului o scurtare în serie.scurtari["${rand.nume}"], cu „(…)” în locul bucăților scoase.`)],
    };
  }
  const blocCitat = bloc(cerere('citat', 'text', Z.GREUTATE.text, 'text', `${cr}.citat`), cuCamp(pc, `${cr}.citat`), Z.LATERAL,
    susCitat + Math.round((inaltimeCitat - h(pc.marime, pc.randuri.length)) / 2));

  texte.push(blocCitat, blocNume, ...(blocRol ? [blocRol] : []), ...(blocCta ? [blocCta] : []));
  const sus0 = Math.min(...texte.map((t) => t.y), ghilimele.y);
  const jos0 = Math.max(...texte.map((t) => t.y + t.inaltime), avatar.y + avatar.diametru);
  return { erori: [], texte, ghilimele, avatar, sigla, zona: [Z.LATERAL, sus0, Z.LATIME_UTILA, jos0 - sus0] };
}

/**
 * Coregrafia intrării, în cadre de la începutul cardului: eticheta și sigla, ghilimelele, rândurile citatului
 * eșalonate cu 4 cadre, avatarul, numele, rolul, apoi îndemnul. `intrare` = cadrul la care totul stă pe loc.
 * @param {{texte: object[]}} a așezarea
 * @returns {{texte: Record<string, {de: number, pana: number}>, randuriCitat: Array<{de: number, pana: number}>, ghilimele: {de: number, pana: number}, avatar: {de: number, pana: number}, sigla: {de: number, pana: number}, intrare: number}}
 */
export function coregrafie(a) {
  const citat = a.texte.find((t) => t.id === 'citat');
  const randuriCitat = citat.randuri.map((_, k) => ({ de: 8 + 4 * k, pana: 8 + 4 * k + 14 }));
  const dupaCitat = 8 + 4 * citat.randuri.length;
  const avatar = { de: dupaCitat, pana: dupaCitat + 14 };
  const texte = { eticheta: { de: 0, pana: 12 }, citat: { de: 8, pana: randuriCitat.at(-1).pana }, nume: { de: dupaCitat + 4, pana: dupaCitat + 18 } };
  texte.rol = { de: dupaCitat + 8, pana: dupaCitat + 22 };
  texte.cta = { de: dupaCitat + 14, pana: dupaCitat + 28 };
  const prezente = a.texte.map((t) => texte[t.id].pana);
  const intrare = Math.max(avatar.pana, ...prezente);
  return { texte, randuriCitat, ghilimele: { de: 3, pana: 18 }, avatar, sigla: { de: 0, pana: 12 }, intrare };
}

/** Toate textele de pe card, în ordinea de citire (C09 le citește împreună, ca un singur segment). */
export const texteCard = (a) => a.texte.flatMap((t) => t.randuri);

/**
 * Durata cardului: serie.durata dacă e dată; altfel implicit 8 s (10 s peste 120 de grafeme), crescută cât să încapă
 * intrarea plus timpul de citire al tuturor textelor (formula comună), rotunjită în sus la 0,5 s, cel mult 20 s.
 * @returns {{durata: number, necesar: number, depaseste: boolean}} depaseste = cardul ar cere peste 20 s
 */
export function durataCard({ serie, rand, a, intrare }) {
  const necesar = rotunjeste(timpCitire(texteCard(a).join(' ')) + intrare / FPS, 3);
  if (serie.durata !== undefined) return { durata: serie.durata, necesar, depaseste: false };
  const baza = grafeme(rand.citat) > C.durata.prag_lunga ? C.durata.lunga : C.durata.implicita;
  const durata = Math.max(baza, Math.ceil((necesar + 0.5) * 2) / 2);
  return { durata: Math.min(durata, C.durata.max), necesar, depaseste: durata > C.durata.max };
}

/** Cronologia unui card (docs/interfete/cronologie.md, „La date-serie”): un singur segment, „Testimonial N”. */
export function cronologieCard({ date, rand, stilPlat, a, intrare, durata }) {
  const ref = `Testimonial ${rand.n + 1}`;
  const total = Math.round(durata * FPS);
  const complet = sec(intrare);
  const final = sec(total);
  return {
    versiune: 1,
    sablon: 'date-serie',
    format: 'vertical',
    latime: Z.LATIME,
    inaltime: Z.INALTIME,
    fps: FPS,
    durata: final,
    fundal: stilPlat.culori.fundal,
    segmente: [{ ref, camp: 'serie', tip: 'testimonial', start: 0, complet, sfarsit: final, zona_text: a.zona, texte: texteCard(a) }],
    ferestre_statice: [],
    momente_foaie: [
      { t: complet, ref, eticheta: `${ref}, complet` },
      { t: rotunjeste(final - 1 / FPS, 3), ref, eticheta: 'Ultimul cadru' },
    ],
    audio: audioCronologie(date, final),
  };
}

const CHEI_TEXT = ['id', 'text', 'randuri', 'x', 'y', 'latime', 'inaltime', 'marime', 'font', 'greutate', 'culoare', 'spatiere', 'aliniere'];

/**
 * props.json al unui card. Căile sunt relative la folderul public (build/), deci au prefixul folderului cardului
 * (`<id>/`): toate cardurile seriei împart un singur bundle Remotion.
 * @param {{rand: object, stilPlat: object, a: object, cor: object, cadre: number, catalog: object, prefix: string, muzica: boolean, sigla: {extensie: string}|null, poza: string|null}} p
 */
export function propsCard({ rand, stilPlat, a, cor, cadre, catalog, prefix, muzica, sigla, poza }) {
  const culori = Object.fromEntries(['fundal', 'text', 'atenuat', 'accent'].map((j) => [j, stilPlat.culori[j]]));
  const familie = (font) => (typeof font === 'object' ? `MG ${font.familie}` : catalog[font].familie);
  return {
    versiune: 1,
    latime: Z.LATIME,
    inaltime: Z.INALTIME,
    fps: FPS,
    cadre,
    culori,
    fonturi: fonturiProps(stilPlat, catalog).map((f) => ({ ...f, url: `${prefix}${f.url}` })),
    familii: { titlu: familie(stilPlat.font_titlu), text: familie(stilPlat.font_text) },
    atmosfera: stilPlat.atmosfera,
    ceata: ceataProps(culori, stilPlat.atmosfera, stilPlat.ceata ?? null),
    muzica: muzica ? `${prefix}assets/muzica.m4a` : null,
    sigla: sigla && a.sigla ? { url: `${prefix}sigla.${sigla.extensie}`, ...a.sigla, ...cor.sigla } : null,
    card: {
      ref: `Testimonial ${rand.n + 1}`,
      intrare: cor.intrare,
      texte: a.texte.map((b) => ({ ...Object.fromEntries(CHEI_TEXT.map((k) => [k, b[k]])), ...cor.texte[b.id] })),
      randuriCitat: cor.randuriCitat,
      ghilimele: { ...a.ghilimele, ...cor.ghilimele },
      avatar: { ...a.avatar, ...cor.avatar, poza: poza ? `${prefix}${poza}` : null, initiale: rand.initiale },
    },
  };
}

/** Numele fișierului pozei în build/<id>/: poza.<extensie>. */
export const numePoza = (rand) => (rand.poza ? `poza.${rand.poza.extensie}` : null);
