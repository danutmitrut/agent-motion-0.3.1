// plan.mjs: din date, stil și fișierele filmării, planul overlay-ului (build/plan.json), cronologia comună
// (docs/interfete/cronologie.md) și așteptările (C11-C17). Subtitrările se grupează aici, cu fontul real (S06).
// Regizorul din runtime execută pașii exact cum sunt aici: în browser nu se mai ia nicio decizie de timp.
import { avertisment, rotunjeste, valoriStil, secundeCuZecimala as secunde } from '../../../../nucleu/lib/sdk.mjs';
import { citesteFilmare, fereastra } from './context.mjs';
import { aplicaCorecturi } from './corecturi.mjs';
import { timpiElemente } from './timp.mjs';
import { benziFormat, bandaSubtitrari, seIntersecteaza, suspendari } from './benzi.mjs';
import { grupeaza } from './grupeaza.mjs';
import { aseazaElement, creeazaMasuratori } from './tipuri.mjs';

const EPS = 1e-9;
const r2 = (x) => rotunjeste(x, 2);
const r3 = (x) => rotunjeste(x, 3);
const ARATA_GRUP = 0.15; // un grup e citibil la 0,15 s după ce apare (C13 îl măsoară atunci)

/** Opțiunile subtitrărilor, cu implicitele (spec 7.4, „Câmpuri specifice”; decizia 6 pentru import). */
export function optiuniSubtitrari(date, transcriere, ritm) {
  const s = date.subtitrari ?? {};
  const imp = transcriere.sursa === 'import';
  return {
    activ: s.activ !== false,
    animatie: imp ? 'grup' : (s.animatie ?? 'cuvant-activ'),
    pozitie: s.pozitie ?? 'jos',
    marime: s.marime ?? 'M',
    majuscule: s.majuscule === true,
    cuvinte_max: s.cuvinte_max ?? ritm.cuvinte,
    evidentiaza: s.evidentiaza ?? [],
    import: imp,
  };
}

/** Caseta grupului: rândurile măsurate, centrate în banda subtitrărilor. */
export function aseazaGrup(g, { banda, masoara, reguli }) {
  const [padV, padO] = reguli.padding;
  const latimi = g.randuri.map((idx) => masoara(idx.map((i) => g.cuvinte[i].text).join(' ')));
  const w = r2(Math.max(...latimi) + 2 * padO);
  const h = r2(g.randuri.length * g.marime * reguli.inaltime_rand + 2 * padV);
  return { ...g, caseta: [r2(banda[0] + (banda[2] - w) / 2), r2(banda[1] + (banda[3] - h) / 2), w, h] };
}

function pasiSubtitrari(grupuri, animatie, reguli) {
  const pasi = [];
  for (const g of grupuri) {
    pasi.push({ efect: 'grup', tinta: `#${g.id}`, t: g.start, dur: r3(g.end - g.start), iesire: reguli.iesire });
    if (animatie !== 'cuvant-activ') continue;
    g.cuvinte.forEach((c, k) => {
      const t = Math.max(c.start, g.start);
      const dur = r3(Math.min(c.end, g.end) - t);
      // un cuvânt evidențiat e mereu în culoarea de accent, deci nu mai are pas de cuvânt activ
      if (dur > EPS && !c.evidentiat) pasi.push({ efect: 'cuvant', tinta: `#c${g.n}-${k + 1}`, t: r3(t), dur });
    });
  }
  return pasi;
}

const casetaCard = (e) => [e.blocuri[0].x, e.blocuri[0].y, e.blocuri[0].w, e.blocuri[0].h];

/** Cronologia comună din plan: segmentele (elementele, sortate după start), sursa_video, momentele foii. */
export function cronologieDinPlan(plan, implicite) {
  const ordonate = [...plan.elemente].sort((a, b) => a.start - b.start || a.n - b.n);
  const segmente = ordonate.length > 0
    ? ordonate.map((e) => ({
      ref: e.id, camp: e.camp, tip: e.tip, start: e.start, complet: e.complet, sfarsit: e.sfarsit,
      zona_text: casetaCard(e),
      texte: e.texte.map((t) => t.text), selectori: e.texte.map((t) => `#${t.id}`), banda: e.banda,
      detalii: { ancora: e.ancora ? { fraza: e.ancora.fraza, aparitia: e.ancora.aparitia, t: e.ancora.t } : null },
    }))
    : [{ ref: 'Filmarea', camp: 'filmare', tip: 'filmare', start: 0, complet: 0, sfarsit: plan.durata, zona_text: plan.banda_subtitrari, texte: [], banda: 'filmare' }];
  const momente = segmente.map((s) => ({ t: s.complet, ref: s.ref, eticheta: `${s.ref}, complet` }));
  const ultim = r3(plan.durata - 1 / plan.fps);
  for (let k = 0; k * implicite.foaie.pas < ultim - EPS; k++) {
    const t = r3(k * implicite.foaie.pas);
    momente.push({ t, ref: 'Filmarea', eticheta: `Secunda ${secunde(t)}` });
  }
  momente.push({ t: ultim, ref: 'Filmarea', eticheta: 'Ultimul cadru' });
  momente.sort((a, b) => a.t - b.t);
  const momente_foaie = [];
  for (const m of momente) {
    const u = momente_foaie.at(-1);
    if (!u || m.t - u.t >= 0.1 - EPS) momente_foaie.push(m);
  }
  return {
    versiune: 1,
    sablon: 'overlay-filmare',
    format: plan.format,
    latime: plan.latime,
    inaltime: plan.inaltime,
    fps: plan.fps,
    durata: plan.durata,
    fundal: 'filmare',
    sursa_video: { fisier: 'build/filmare.mp4', start: plan.start, latime: plan.sursa.latime, inaltime: plan.sursa.inaltime, focus_x: plan.focus_x },
    segmente,
    ferestre_statice: [],
    momente_foaie,
    audio: null,
  };
}

/**
 * Așteptările (docs/interfete/sablon.md): rândurile elementelor, cu caseta lor, și cuvintele subtitrărilor (C17 le caută
 * ca noduri de text); doar primul cuvânt al fiecărui grup are caseta (a grupului), ca C13 să măsoare o dată pe grup.
 */
export function asteptariDinPlan(cron, plan) {
  const texte = [];
  for (const e of plan.elemente) {
    const zona = casetaCard(e);
    for (const t of e.texte) texte.push({ ref: e.id, camp: t.camp, text: t.text, t: t.t, zona_text: zona, caseta: t.caseta });
  }
  for (const g of plan.subtitrari.grupuri) {
    const t = r3(Math.min(g.start + ARATA_GRUP, (g.start + g.end) / 2));
    g.cuvinte.forEach((c, k) => {
      texte.push({ ref: `Subtitrare ${g.n}`, camp: 'subtitrari', text: c.text, t, zona_text: plan.banda_subtitrari, ...(k === 0 ? { caseta: g.caseta } : {}) });
    });
  }
  return {
    texte,
    momente: cron.segmente.map((s) => s.complet),
    audio: { prezent: false, durata: null },
    fundal: 'filmare',
    // cuvintele rostite (nu doar cele afișate): C-urile și foaia văd și ce se aude cât subtitrările sunt suspendate sau oprite
    transcriere: plan.rostit.map((c) => ({ ...c })),
  };
}

/**
 * Planul și cronologia. Se cheamă doar cu date trecute prin valideaza (sablon.mjs, cronologie()).
 * @returns {{plan: object|null, cronologie: object|null, erori: object[], avertismente: object[]}}
 */
export function planifica(date, stil, ctx) {
  const implicite = ctx.sablon.implicite;
  const stilPlat = valoriStil(stil);
  const f = citesteFilmare(ctx);
  if (f.erori.length > 0) return { plan: null, cronologie: null, erori: f.erori, avertismente: [] };
  const format = date.format;
  const F = implicite.formate[format];
  const ritm = implicite.ritm[stilPlat.ritm ?? 'normal'];
  const { start, durata } = fereastra(date, f.filmare);
  const cor = aplicaCorecturi(f.transcriere.cuvinte, date.corecturi ?? []);
  const t = timpiElemente(date.elemente ?? [], { cuvinte: cor.cuvinte, start, durata, ritm, implicite });
  if (cor.erori.length > 0 || t.erori.length > 0) throw new TypeError('planifica primește doar date trecute prin valideaza (corecturi sau ancore invalide).');

  const avertismente = [];
  const benzi = benziFormat(implicite, format);
  const sub = optiuniSubtitrari(date, f.transcriere, ritm);
  if (sub.import && date.subtitrari?.animatie === 'cuvant-activ') {
    avertismente.push(avertisment('valoare-invalida', 'subtitrari.animatie', 'Transcrierea importată are timpii pe replică, nu pe cuvânt: subtitrările apar pe grup, fără cuvântul activ.',
      'Scoate subtitrari.animatie sau pune "grup"; pentru cuvântul activ, creează proiectul fără --transcriere (transcrierea locală).'));
  }
  const bandaSub = bandaSubtitrari(implicite, format, sub.pozitie);
  const masuri = creeazaMasuratori(ctx.radacina, stilPlat, implicite);
  const erori = [];
  const elemente = [];
  for (const el of t.elemente) {
    const r = aseazaElement(el, date.elemente[el.n - 1], { benzi, implicite, format, masuri, stilPlat, ritm });
    erori.push(...r.erori);
    if (r.element) elemente.push({ ...r.element, permite_banda_subtitrari: seIntersecteaza(benzi[el.banda], bandaSub) });
  }
  const susp = suspendari(t.elemente, { benzi, bandaSub });
  const masoaraLa = (m) => masuri.masoara('subtitrare', m);
  let grupuri = [];
  if (sub.activ) {
    const g = grupeaza(cor.cuvinte, {
      start, durata, umpluturi: implicite.subtitrari.umpluturi, suspendari: susp, cuvinteMax: sub.cuvinte_max, evidentiaza: sub.evidentiaza,
      import: sub.import, majuscule: sub.majuscule, marime: F.subtitrari[sub.marime], marimeMin: F.subtitrari.min, banda: bandaSub, masoaraLa, reguli: implicite.subtitrari,
    });
    erori.push(...g.erori);
    grupuri = g.grupuri.map((gr) => aseazaGrup(gr, { banda: bandaSub, masoara: masoaraLa(gr.marime), reguli: implicite.subtitrari }));
  }
  if (erori.length > 0) return { plan: null, cronologie: null, erori, avertismente };

  const plan = {
    versiune: 1,
    sablon: 'overlay-filmare',
    format,
    latime: F.latime,
    inaltime: F.inaltime,
    fps: f.filmare.fps,
    durata,
    start,
    focus_x: date.filmare.focus_x ?? 50,
    sursa: { latime: f.filmare.latime, inaltime: f.filmare.inaltime },
    ritm: { intrare: ritm.intrare, cuvinte: ritm.cuvinte, avans: ritm.avans, ease: ritm.ease },
    opacitate_fundal: stilPlat.opacitate_fundal ?? implicite.opacitate_fundal[stilPlat.tema],
    greutate_titlu: masuri.greutateTitlu,
    subtitrari: {
      activ: sub.activ, animatie: sub.animatie, pozitie: sub.pozitie, marime: F.subtitrari[sub.marime], majuscule: sub.majuscule,
      grupuri, suspendari: susp, pasi: pasiSubtitrari(grupuri, sub.animatie, implicite.subtitrari),
    },
    elemente,
    banda_subtitrari: bandaSub,
    // toate cuvintele corectate din fereastră (fără cele ascunse de o corectură), pe cronologia finală; umpluturile se aud
    rostit: cor.cuvinte.filter((c) => !c.ascuns && c.start >= start - EPS && c.start < start + durata - EPS)
      .map((c) => ({ start: r3(c.start - start), end: r3(c.end - start), text: c.text })),
  };
  return { plan, cronologie: cronologieDinPlan(plan, implicite), erori: [], avertismente };
}
