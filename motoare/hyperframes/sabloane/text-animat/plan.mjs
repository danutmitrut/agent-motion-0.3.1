// plan.mjs: din date și stil, planul animației (build/plan.json) și cronologia comună (spec 7.2; docs/interfete/cronologie.md).
// Pentru fiecare scenă: așezarea (asezare.mjs), pașii relativi la începutul ei, momentul „complet”, durata (timp.mjs);
// apoi începuturile cumulate, timpii absoluți și casetele textelor la momentul lor (C13). Regizorul din runtime execută
// pașii exact cum sunt aici: în browser nu se mai ia nicio decizie de timp.
import { eroare, avertisment, rotunjeste, valoriStil, audioCronologie } from '../../../../nucleu/lib/sdk.mjs';
import { creeazaMasuratori, aseazaScena, aliniereScena } from './asezare.mjs';
import { durataScena, durataTastare } from './timp.mjs';
import { cuvinteScena, nr } from './reguli.mjs';
import { sursaSigla, citesteSigla } from './sigla.mjs';

const EPS = 1e-9;
const r2 = (x) => rotunjeste(x, 2);
const r3 = (x) => rotunjeste(x, 3);

// Momentele fixe care nu depind de ritm (spec 7.2, „Cum calculează mg timpii”; tabelul din planul G, G07).
const CUVINTE_DUPA_TITLU = 0.6; // primul cuvânt intră când titlul a făcut 60% din intrare
const DUPA_TITLU_LISTA = 0.15; // pauza dintre titlul listei și primul punct, peste pasul punctelor
const DETALIU_DUPA_CTA = 0.6; // detaliul finalului se tastează după îndemn
const APARITIE_SIGLA = 0.6;
const SCALA_CIFRA = 0.9;

function pieseBloc(bloc) {
  return bloc.randuri.flatMap((r) => r.parti.filter((p) => p.tip === 'piesa'));
}

/**
 * Pașii unei scene, cu timpi relativi la începutul ei (tabelul din planul G, G07).
 * @param {object} scena datele scenei
 * @param {object[]} blocuri blocurile așezate (aseazaScena)
 * @param {object} ritm implicite.ritm[<ritm>]
 * @param {object} timpi implicite.timpi
 * @returns {{pasi: object[], complet: number, momente: Map<string, number>}} momente: piesele cu moment propriu (cuvintele)
 */
export function pasiScena(scena, blocuri, ritm, timpi) {
  const T = timpi;
  const pasi = [];
  const momente = new Map();
  let complet = 0;
  const pas = (p, apare = true) => {
    pasi.push(p);
    if (apare) complet = Math.max(complet, p.t + p.dur);
  };
  const apareMic = (rand, t) => pas({ efect: 'apare', tinta: `#${rand.id}`, t, dur: T.aparitie_mica, x: 0, y: 16, ease: 'power3.out' });
  const masti = (bloc, t0) => {
    bloc.randuri.forEach((r, k) => pas({ efect: 'masca', tinta: `#${r.id}`, t: t0 + k * ritm.pas_rand, dur: ritm.intrare, ease: ritm.ease }));
    return t0 + (bloc.randuri.length - 1) * ritm.pas_rand + ritm.intrare;
  };
  const tasteaza = (bloc, t) => {
    const [piesa] = pieseBloc(bloc);
    const dur = durataTastare(piesa.text, T);
    pas({ efect: 'apare', tinta: `#${bloc.randuri[0].id}`, t, dur: T.aparitie_tastare, x: 0, y: 0, ease: 'none' });
    pas({ efect: 'tasteaza', tinta: `#${piesa.id}`, t, dur, text: piesa.text });
    return t + dur;
  };
  const unul = (fel) => blocuri.find((b) => b.fel === fel) ?? null;

  const eticheta = unul('eticheta');
  if (eticheta) pas({ efect: 'apare', tinta: `#${eticheta.randuri[0].id}`, t: T.inceput, dur: T.eticheta_intrare, x: 0, y: 16, ease: 'power3.out' });
  const a = eticheta ? T.inceput + T.eticheta_avans : T.inceput;
  const titlu = unul('randuri');
  const mici = blocuri.filter((b) => b.fel === 'mic');

  switch (scena.tip) {
    case 'titlu':
      masti(titlu, a);
      break;
    case 'fraza':
      pieseBloc(unul('rupt')).forEach((p, w) => pas({ efect: 'apare', tinta: `#${p.id}`, t: a + w * ritm.pas_fraza, dur: T.cuvant_fraza, x: 0, y: 20, ease: ritm.ease }));
      break;
    case 'cuvinte': {
      let t0 = a;
      if (titlu) {
        masti(titlu, a);
        t0 = a + CUVINTE_DUPA_TITLU * ritm.intrare;
      }
      const randuri = unul('cuvinte').randuri;
      randuri.forEach((r, j) => {
        const s = t0 + j * ritm.pas_cuvinte;
        pas({ efect: 'masca', tinta: `#${r.id}`, t: s, dur: T.cuvant_intrare, ease: ritm.ease });
        for (const p of r.parti) if (p.tip === 'piesa') momente.set(p.id, s + T.cuvant_intrare);
        if (j < randuri.length - 1) {
          pas({ efect: 'iese', tinta: `#${r.id}`, t: s + ritm.pas_cuvinte - T.iesire_inainte, dur: T.cuvant_iesire }, false);
        }
      });
      break;
    }
    case 'lista': {
      let p0 = a;
      if (titlu) {
        masti(titlu, a);
        p0 = a + ritm.pas_puncte + DUPA_TITLU_LISTA;
      }
      unul('lista').randuri.forEach((r, j) => {
        const t = p0 + j * ritm.pas_puncte;
        pas({ efect: 'apare', tinta: `#${r.id}`, t, dur: ritm.intrare, x: -24, y: 0, ease: ritm.ease });
        if (r.marcajId) pas({ efect: 'bifa', tinta: `#${r.marcajId}`, t: t + T.bifa_dupa, dur: T.bifa });
      });
      break;
    }
    case 'cifra': {
      const valoare = unul('cifra');
      const rand = valoare.randuri[0];
      const [piesa] = pieseBloc(valoare);
      pas({ efect: 'apare', tinta: `#${rand.id}`, t: a, dur: T.aparitie_cifra, x: 0, y: 0, ease: 'power2.out' });
      pas({ efect: 'scala', tinta: `#${rand.id}`, t: a, dur: T.numarare, de: SCALA_CIFRA });
      pas({ efect: 'numara', tinta: `#${piesa.id}`, t: a, dur: T.numarare, valoare: scena.valoare, zecimale: scena.zecimale ?? 0, prefix: scena.prefix ?? '', sufix: scena.sufix ?? '' });
      unul('rupt').randuri.forEach((r, k) => apareMic(r, a + T.text_cifra + k * ritm.pas_rand));
      if (mici[0]) apareMic(mici[0].randuri[0], a + T.numarare);
      break;
    }
    case 'citat': {
      const tq = masti(unul('rupt'), a);
      const sfarsitAutor = tasteaza(mici[0], tq + T.dupa_citat);
      if (mici[1]) apareMic(mici[1].randuri[0], sfarsitAutor + T.dupa_bloc);
      break;
    }
    case 'final': {
      const tc = masti(titlu, a);
      const cta = unul('cta');
      if (cta) apareMic(cta.randuri[0], tc + T.dupa_bloc);
      if (mici[0]) tasteaza(mici[0], cta ? tc + DETALIU_DUPA_CTA : tc + T.dupa_bloc);
      if (unul('sigla')) pas({ efect: 'apare', tinta: '#sigla', t: tc + T.dupa_bloc, dur: APARITIE_SIGLA, x: 0, y: 16, ease: 'power3.out' });
      break;
    }
    default:
      throw new TypeError(`Tip de scenă necunoscut: ${scena.tip}`);
  }
  return { pasi, complet, momente };
}

/**
 * Caseta unei piese la momentul t: deriva scenei (−deriva px liniar pe fereastra ei), apoi împingerea compoziției
 * (scara 1 → impingere pe tot filmul, în jurul centrului cadrului), exact ca în lib/miscari.js (scena, atmosfera).
 * @param {number[]} caseta [x, y, w, h], statică (asezare.mjs)
 */
export function casetaLa([x, y, w, h], t, scena, plan) {
  const dy = -scena.deriva * (t - scena.start) / (scena.sfarsit - scena.start);
  const s = 1 + (plan.atmosfera.impingere - 1) * t / plan.durata;
  const cx = plan.latime / 2;
  const cy = plan.inaltime / 2;
  return [r2(cx + (x - cx) * s), r2(cy + (y + dy - cy) * s), r2(w * s), r2(h * s)];
}

function zonaText(blocuri, zona) {
  const sus = Math.min(...blocuri.map((b) => b.y));
  const jos = Math.max(...blocuri.map((b) => b.y + b.h));
  return [zona[0], r2(sus), zona[2], r2(jos - sus)];
}

export function eroareDurata(d, s, i, complet, ultima) {
  if (d.eroare === 'sub-minim') {
    return eroare('prea-repede-de-citit', `scene[${i}].durata`,
      `Scena ${i + 1} (${s.tip}) are nevoie de cel puțin ${nr(d.minim)} s: textul intră complet abia la ${nr(r3(complet))} s, apoi trebuie citit${ultima ? '' : ', iar scena trebuie să iasă'}; durata dată e ${nr(s.durata)} s.`,
      `Mărește scene[${i}].durata la cel puțin ${nr(d.minim)} s sau scoate durata, ca mg s-o calculeze.`, { verificare: 'S02' });
  }
  return eroare('prea-repede-de-citit', `scene[${i}]`,
    `Scena ${i + 1} (${s.tip}) are nevoie de cel puțin ${nr(d.minim)} s, peste cât poate dura o scenă (${nr(d.maxim)} s).`,
    s.tip === 'final' ? `Scurtează textul din scene[${i}] (titlu, îndemn sau detaliu).` : `Scurtează textul din scene[${i}] sau împarte-l în două scene.`, { verificare: 'S02' });
}

function eroareTotal(durata, total) {
  return eroare('durata-in-afara-limitelor', 'scene',
    `Videoul ar dura ${nr(durata)} s; text-animat face videouri de ${total.min}-${total.max} s.`,
    durata < total.min
      ? 'Adaugă o scenă sau dă unei scene o durată mai mare (scene[i].durata).'
      : 'Scoate scene sau scurtează-le textul ori duratele date (scene[i].durata).',
    { verificare: 'S02' });
}

/** Cronologia comună (docs/interfete/cronologie.md) din plan: segmentele, momentele foii, audio. */
export function cronologieDinPlan(plan, format, stilPlat, date) {
  const segmente = plan.scene.map((ps) => ({
    ref: `Scena ${ps.n}`,
    camp: ps.camp,
    tip: ps.tip,
    start: ps.start,
    complet: ps.complet,
    sfarsit: ps.sfarsit,
    zona_text: zonaText(ps.blocuri, format.zona),
    texte: ps.texte.map((t) => t.text),
    selectori: ps.texte.map((t) => `#${t.id}`),
  }));
  const momente = segmente.map((s) => ({ t: s.complet, ref: s.ref, eticheta: `${s.ref}, complet` }));
  for (let i = 1; i < segmente.length; i++) momente.push({ t: segmente[i].start, ref: segmente[i].ref, eticheta: `Tranziția spre scena ${i + 1}` });
  momente.push({ t: r3(plan.durata - 1 / plan.fps), ref: segmente[segmente.length - 1].ref, eticheta: 'Ultimul cadru' });
  momente.sort((x, y) => x.t - y.t);
  const momente_foaie = [];
  for (const m of momente) {
    const ultim = momente_foaie[momente_foaie.length - 1];
    if (!ultim || m.t - ultim.t >= 0.1 - EPS) momente_foaie.push(m);
  }
  return {
    versiune: 1,
    sablon: 'text-animat',
    format: plan.format,
    latime: plan.latime,
    inaltime: plan.inaltime,
    fps: plan.fps,
    durata: plan.durata,
    fundal: stilPlat.culori.fundal,
    segmente,
    ferestre_statice: [],
    momente_foaie,
    audio: audioCronologie(date, plan.durata),
  };
}

/**
 * Planul și cronologia. Se cheamă doar cu date trecute prin valideaza (sablon.mjs, cronologie()).
 * @param {object} date
 * @param {object} stil StilRezolvat
 * @param {{radacina: string, dirProiect: string, sablon: {implicite: object}, brand?: object|null}} ctx
 * @returns {{plan: object|null, cronologie: object|null, erori: object[], avertismente: object[]}}
 */
export function planifica(date, stil, ctx) {
  const implicite = ctx.sablon.implicite;
  const T = implicite.timpi;
  const stilPlat = valoriStil(stil);
  const numeFormat = date.format ?? 'vertical';
  const format = implicite.formate[numeFormat];
  const ritm = implicite.ritm[stilPlat.ritm ?? 'normal'];
  const aliniere = aliniereScena(stilPlat, implicite);
  const masuri = creeazaMasuratori(ctx.radacina, stilPlat, implicite);
  const erori = [];
  const avertismente = [];

  let sigla = null;
  const sursa = sursaSigla(date, ctx.brand ?? null, ctx.dirProiect);
  if (sursa) {
    // valideaza (C07) a respins deja o sigla de brand invalidă; fără acest gard, o cale nulă ar ajunge la citesteSigla
    if (sursa.invalida) throw new TypeError('planifica primește doar date trecute prin valideaza (brand.sigla invalidă).');
    const r = citesteSigla(sursa.cale, implicite.sigla_max_octeti);
    if (!r.ok) throw new TypeError(`planifica primește doar date trecute prin valideaza (sigla: ${r.motiv}).`);
    if (date.scene[date.scene.length - 1].tip === 'final') {
      sigla = r;
    } else {
      avertismente.push(avertisment('valoare-invalida', sursa.camp,
        `${sursa.loc} apare doar în scena final, iar videoul nu are una, deci nu va fi pe ecran.`,
        'Adaugă la sfârșit o scenă de tip „final” sau scoate sigla.', { verificare: 'C07' }));
    }
  }

  const scene = [];
  date.scene.forEach((s, i) => {
    const ultima = i === date.scene.length - 1;
    const a = aseazaScena({
      scena: s, i, stilPlat, implicite, format, masuri, aliniere,
      sigla: s.tip === 'final' && sigla ? { latime: sigla.latime, inaltime: sigla.inaltime } : null,
    });
    if (a.erori.length > 0) {
      erori.push(...a.erori);
      return;
    }
    const { pasi, complet, momente } = pasiScena(s, a.blocuri, ritm, T);
    const piese = a.blocuri.flatMap(pieseBloc);
    const d = durataScena({ scena: s, cuvinte: cuvinteScena(s), texteEcran: piese.map((p) => p.text), complet, ultima, ritm, implicite });
    if (d.eroare) {
      erori.push(eroareDurata(d, s, i, complet, ultima));
      return;
    }
    scene.push({ s, i, ultima, blocuri: a.blocuri, pasi, complet, momente, piese, durata: d.durata });
  });
  if (erori.length > 0) return { plan: null, cronologie: null, erori, avertismente };

  const durata = r3(scene.reduce((x, sc) => x + sc.durata, 0));
  if (durata < implicite.total.min - EPS || durata > implicite.total.max + EPS) {
    return { plan: null, cronologie: null, erori: [eroareTotal(durata, implicite.total)], avertismente };
  }

  const plan = {
    versiune: 1,
    sablon: 'text-animat',
    format: numeFormat,
    latime: format.latime,
    inaltime: format.inaltime,
    fps: implicite.fps,
    durata,
    aliniere,
    iesire: T.iesire,
    atmosfera: { mod: stilPlat.atmosfera, granulatie: stilPlat.atmosfera === 'plin' ? 0 : stilPlat.granulatie, impingere: T.impingere },
    sigla: null,
    scene: [],
  };
  let t0 = 0;
  for (const sc of scene) {
    const start = r3(t0);
    const ps = {
      n: sc.i + 1,
      id: `s${sc.i + 1}`,
      camp: `scene[${sc.i}]`,
      tip: sc.s.tip,
      start,
      complet: r3(start + sc.complet),
      sfarsit: r3(t0 + sc.durata),
      ultima: sc.ultima,
      deriva: T.deriva,
      blocuri: sc.blocuri,
      pasi: sc.pasi.map((p) => ({ ...p, t: r3(start + p.t), dur: r3(p.dur) })),
      texte: [],
    };
    ps.texte = sc.piese.map((p) => {
      const t = sc.momente.has(p.id) ? r3(start + sc.momente.get(p.id)) : ps.complet;
      return { id: p.id, text: p.text, camp: p.camp, t, caseta: casetaLa(p.caseta, t, ps, plan) };
    });
    const blocSigla = sc.blocuri.find((b) => b.fel === 'sigla');
    if (blocSigla) plan.sigla = { mime: sigla.mime, w: blocSigla.w, h: blocSigla.h };
    plan.scene.push(ps);
    t0 += sc.durata;
  }
  return { plan, cronologie: cronologieDinPlan(plan, format, stilPlat, date), erori: [], avertismente };
}
