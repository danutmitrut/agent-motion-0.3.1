// Regizorul reelului: date -> plan de timpi și poziții, funcții pure (fără DOM, fără disc, fără timp real).
// Regulile vin din implicite.json (secțiunea 5.10 a hărții) și din constantele de mai jos, portate din
// kit/linia-continua/STIL.md și tools/nou-reel.sh. Nicio regulă nu mută datele. Regulile de durată
// (minime, depășire, suma) le verifică `valideaza` din sablon.mjs, înaintea planului; aici se dau doar erorile
// de mecanică (S02-S07), cu schimbarea de date care le repară, iar timpii se calculează oricum.
import { rotunjeste, eroare, avertisment, textAfisat, incarcaCatalog, gasestePiesa } from '../../../../nucleu/lib/sdk.mjs';

const EPS = 1e-6;

/** Constantele mecanicii (fixe în cod, ca în 7.1 „Fix în cod”), în secunde. */
export const T = Object.freeze({
  DESEN_START: 0.3, // desenul pornește la 0,3 s după începutul scenei (valoare aleasă la planul B)
  CARD_INTRA: Object.freeze({ desen: 0.9, final: 0.6, adunare: 0.3, retea: 0.3, card: 0.3 }), // după începutul scenei
  PLECARE: 0.2, // cardul, desenul și rețeaua încep să plece cu 0,2 s înainte de granița scenei
  CARD_RAND: 0.85, // primul rând de titlu e complet la intrare + 0,15 + 0,7 (L.card)
  CARD_ESALON: 0.35, // fiecare rând în plus vine cu 0,35 s mai târziu (L.card)
  // cardul unei scene desen, adunare, retea sau final care are doar etichetă (desenul ține scena); un card de tip card
  // are mereu titlu sau cuvinte, valideaza refuză altfel (decizia din 2026-10-06, B17)
  CARD_DOAR_ETICHETA: 0.5,
  CUVANT_INTRARE: 0.45, // L.cuvinte: un cuvânt intră în 0,45 s
  ICONITA_INTRARE: 0.55, // L.iconite: o iconiță se desenează în 0,55 s
  ICONITA_RETRAGERE: 0.75, // L.iconite: o iconiță e ascunsă la retrag + 0,75 s
  ICONITA_ESALON: 0.05, // L.iconite: retragerea iconiței j pornește la retrag + 0,05 * j
  TREMUR_DUPA: 0.6, // tremurul pornește la 0,6 s după ultima iconiță
  RETEA_NASTERE: 0.6, // nașterea rețelei, după începutul scenei
  SCANTEIE_MAX: 3.6,
  SCANTEIE_MIN: 1.0,
  SCANTEIE_PAUZA: 0.6, // între capătul scânteii și retragerea rețelei
  FINAL_DESEN_START: 1.5, // în scena finală, desenul vine după card
  DESEN_MIN: 2.0, // desenarea finală nu se comprimă sub 2 s
  LINIE_ACCENT_DURATA: 2.2, // valoare aleasă la planul B
  CTA_DUPA: 0.3,
});

/** Valoarea unui câmp din StilRezolvat ({valoare, sursa}) sau dintr-un obiect plat. */
export function val(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x) && 'valoare' in x ? x.valoare : x;
}

/** Număr cu virgulă zecimală, pentru mesaje în română. */
export function nr(x) {
  return String(rotunjeste(x, 2)).replace('.', ',');
}

/**
 * Durata minimă a unei scene, după tip (aceeași regulă o folosește și `valideaza` din sablon.mjs).
 * @param {object} scena
 * @param {object} implicite
 * @returns {number}
 */
export function minimTip(scena, implicite) {
  const t = implicite.tipuri[scena.tip];
  let m = t.min;
  if (scena.tip === 'adunare') m = rotunjeste(t.min + t.pe_iconita * (scena.iconite?.length ?? 0), 3);
  if (scena.tip === 'retea' && scena.scanteie === true) m = t.min_scanteie;
  return Math.max(m, implicite.scene.durata_min);
}

/**
 * Duratele scenelor, în zecimi de secundă (întregi, ca suma să fie exactă).
 *
 * Regula când doar o parte din scene au `durata`:
 * 1. scenele cu `durata` o păstrează întocmai;
 * 2. timpul rămas = durata videoului (`date.durata`, altfel `durata.implicita`) minus suma lor;
 * 3. scenele fără `durata` îl împart pe ponderile tipului; o scenă al cărei cot e sub minimul tipului primește
 *    minimul, iar restul se reîmparte între celelalte;
 * 4. rotunjirea la zecimi se face cu cel mai mare rest, ca suma să rămână exactă.
 * Când toate scenele au `durata`, durata videoului e suma lor.
 *
 * Aici nu se dau erori de durată: depășirea („au rămas -N s”), minimele pe scenă și nepotrivirea sumei le dă
 * `valideaza` din sablon.mjs, înaintea planului. Dacă timpul rămas nu ajunge, scenele fără durată primesc
 * minimul tipului (durata videoului devine suma lor), ca timpii să se calculeze oricum.
 */
function rezolvaDurate(date, implicite) {
  const scene = date.scene;
  const zecimi = (x) => Math.round(x * 10);
  const date10 = scene.map((s) => (typeof s.durata === 'number' ? zecimi(s.durata) : null));
  const lipsa = date10.map((d, i) => (d === null ? i : -1)).filter((i) => i >= 0);
  const suma = date10.reduce((a, d) => a + (d ?? 0), 0);
  if (lipsa.length === 0) return { durate10: date10, total10: suma };
  const total10 = zecimi(typeof date.durata === 'number' ? date.durata : implicite.durata.implicita);
  const min10 = scene.map((s) => Math.ceil(minimTip(s, implicite) * 10 - EPS));
  let rest = total10 - suma;
  const minLipsa = lipsa.reduce((a, i) => a + min10[i], 0);
  if (rest < minLipsa) {
    const durate10 = date10.map((d, i) => d ?? min10[i]);
    return { durate10, total10: durate10.reduce((a, d) => a + d, 0) };
  }
  const pondere = (i) => implicite.tipuri[scene[i].tip].pondere;
  const fixe = new Map();
  let libere = [...lipsa];
  let schimbat = true;
  while (schimbat) {
    schimbat = false;
    const pondereLibere = libere.reduce((a, i) => a + pondere(i), 0);
    for (const i of libere) {
      if ((rest * pondere(i)) / pondereLibere < min10[i]) {
        fixe.set(i, min10[i]);
        rest -= min10[i];
        libere = libere.filter((j) => j !== i);
        schimbat = true;
        break;
      }
    }
  }
  const pondereLibere = libere.reduce((a, i) => a + pondere(i), 0);
  const cote = libere.map((i) => {
    const exact = (rest * pondere(i)) / pondereLibere;
    return { i, baza: Math.floor(exact + EPS), fractie: exact - Math.floor(exact + EPS) };
  });
  let ramas = rest - cote.reduce((a, c) => a + c.baza, 0);
  const ordine = [...cote].sort((a, b) => b.fractie - a.fractie || a.i - b.i);
  for (const c of ordine) {
    if (ramas <= 0) break;
    c.baza += 1;
    ramas -= 1;
  }
  const durate10 = [...date10];
  for (const [i, d] of fixe) durate10[i] = d;
  for (const c of cote) durate10[c.i] = c.baza;
  return { durate10, total10 };
}

function etichetaAfisata(text, stil) {
  const e = val(stil.eticheta) ?? { majuscule: true, prefix: '' };
  const t = e.majuscule ? text.toUpperCase() : text;
  return (e.prefix ?? '') + t;
}

function randuriTitlu(titlu) {
  return titlu.map((r) => ({ text: textAfisat(r), accent: r.length > 1 && r.startsWith('*') && r.endsWith('*') }));
}

/**
 * Planul de timpi.
 * @returns {{ plan: object, segmente: object[], erori: object[] }}
 * plan: forma parțială din 5.17 (fără poziții, cutii, panouri și traseul liniei de accent, care vin din planificaSpatiu);
 * segmente: câte unul pe scenă, în forma segmentelor din cronologie (5.4).
 */
export function planificaTimpi(date, stil, implicite) {
  const erori = [];
  const scene = date.scene;
  const R = implicite.reguli;
  const ritm = implicite.ritm[val(stil.ritm) ?? 'normal'];
  const { durate10, total10 } = rezolvaDurate(date, implicite);
  const durata = total10 / 10;
  const inceput = [];
  let acc = 0;
  for (const d of durate10) {
    inceput.push(acc / 10);
    acc += d;
  }
  const sfarsit = (i) => (i + 1 < scene.length ? inceput[i + 1] : durata);
  const ultima = scene.length - 1;

  // S02: persistența desenelor; fereastra fiecărui desen se termină la granița ultimei scene acoperite
  const capatFereastra = scene.map((sc, i) => {
    const r = sc.desen?.ramane_pana_la;
    if (sc.tip !== 'desen' || r === undefined) return sfarsit(i);
    const camp = `scene[${i}].desen.ramane_pana_la`;
    if (!Number.isInteger(r) || r <= i + 1 || r > scene.length) {
      erori.push(eroare('reel-ilustrat-persistenta', camp,
        `Scena ${i + 1}: desenul poate rămâne doar până la o scenă de după ea (între ${i + 2} și ${scene.length}).`,
        `Pune ramane_pana_la între ${i + 2} și ${scene.length} sau scoate câmpul.`));
      return sfarsit(i);
    }
    for (let k = i + 1; k <= r - 1; k++) {
      if (scene[k].tip !== 'adunare' && scene[k].tip !== 'card') {
        erori.push(eroare('reel-ilustrat-persistenta', camp,
          `Scena ${i + 1}: desenul nu poate rămâne peste scena ${k + 1}, care e de tip ${scene[k].tip}; poate trece doar peste scene adunare sau card.`,
          `Pune ramane_pana_la la ${k} sau mai puțin.`));
        return sfarsit(i);
      }
    }
    return sfarsit(r - 1);
  });

  const plan = {
    versiune: 1,
    durata,
    fps: implicite.format.fps,
    latime: implicite.format.latime,
    inaltime: implicite.format.inaltime,
    atmosfera: null,
    desene: [],
    iconite: [],
    retele: [],
    linii: [],
    carduri: [],
    cta: null,
    semnatura: null,
  };

  // atmosfera (nou-reel.sh): ceața la 35% din durată, 47% sub pragul scurt
  const mod = val(stil.atmosfera) ?? 'ceata';
  const ceata = mod === 'ceata';
  const fractie = durata < R.prag_scurt ? R.ceata_fractie_scurt : R.ceata_fractie;
  plan.atmosfera = {
    mod,
    aprinde: ceata ? rotunjeste(durata * fractie) : null,
    impingere: ceata ? R.impingere : 1,
    granulatie: ceata ? (val(stil.granulatie) ?? 0) : 0,
  };
  // Fără ceață (plin), stratul desenelor urcă lent, cu R.deriva_plin px/s, până la pauza finală, care rămâne statică,
  // ca imaginea să nu stea pe loc (C14, decizia din 2026-10-05). Viteza e cea mai mică încercată (4, 12, 16, 24 px
  // pe 28,5 s) la care freezedetect (n=0,001) nu mai găsește pe curat o oprire de peste 1,25 s cauzată de desenul
  // static: la 16 px rămânea una de 1,93 s, la 12 px una de 2,17 s. În sus, desenele se îndepărtează de semnătură
  // și rămân sub îndemn (zona desenului începe la y 760). Câmpul apare doar pe plin: planul pe ceață e identic.
  if (mod === 'plin') {
    const pana = rotunjeste(durata - R.pauza_finala);
    plan.atmosfera.miscare = { deriva: [0, -rotunjeste(R.deriva_plin * pana, 1)], pana };
  }

  const segmente = [];
  let cardAnterior = null;
  let retragereRetea = null; // retragerea ultimei rețele, pentru S05
  const nastereRetea = scene.map((sc, i) => (sc.tip === 'retea' ? rotunjeste(inceput[i] + T.RETEA_NASTERE) : null));

  for (let i = 0; i < scene.length; i++) {
    const sc = scene[i];
    const s = inceput[i];
    const e = sfarsit(i);
    const ref = `Scena ${i + 1}`;
    const texte = [];
    const selectori = []; // planul F: câte un selector CSS unic pe text, în structura scrisă de carduri() (compileaza.mjs)
    let complet = s;

    // cardul scenei
    let card = null;
    if (sc.eticheta !== undefined || sc.titlu !== undefined || sc.cuvinte !== undefined) {
      const intra = rotunjeste(s + T.CARD_INTRA[sc.tip]);
      const iese = i === ultima ? null : rotunjeste(e - T.PLECARE);
      card = {
        id: `c${i + 1}`,
        scena: i,
        eticheta: sc.eticheta !== undefined ? etichetaAfisata(sc.eticheta, stil) : null,
        randuri: sc.titlu !== undefined ? randuriTitlu(sc.titlu) : null,
        cuvinte: null,
        intra,
        iese,
      };
      // marime (felia 4): treapta titlului; px-ul îl alege aplicaMarimi (sablon.mjs), după măsurare. Fără ea, cardul
      // rămâne exact ca înainte (golden-urile).
      if (sc.marime !== undefined && sc.marime !== 'M') {
        if (sc.titlu === undefined) {
          erori.push(eroare('valoare-invalida', `scene[${i}].marime`,
            `${ref}: marime mărește titlul, dar scena nu are titlu${sc.cuvinte !== undefined ? ' (cuvintele au mărimea fixă)' : ''}.`,
            `Scoate scene[${i}].marime sau pune textul în scene[${i}].titlu.`));
        } else {
          card.treapta = sc.marime;
        }
      }
      if (card.eticheta !== null) {
        texte.push(card.eticheta);
        selectori.push(`#${card.id} > .label`);
      }
      let cardComplet = intra + T.CARD_DOAR_ETICHETA;
      if (card.randuri) {
        card.randuri.forEach((r, j) => {
          texte.push(r.text);
          selectori.push(`#${card.id} > :nth-child(${j + 1 + (card.eticheta !== null ? 1 : 0)}) > .h`);
        });
        cardComplet = intra + T.CARD_RAND + T.CARD_ESALON * (card.randuri.length - 1);
      }
      if (sc.cuvinte !== undefined) {
        const k = sc.cuvinte.length;
        const capat = iese ?? durata - R.pauza_finala;
        const loc = capat - implicite.citire.cuvant_min - intra;
        const pas = k > 1 ? Math.min(ritm.pas_cuvinte, loc / (k - 1)) : ritm.pas_cuvinte;
        if (k > 1 && pas < implicite.citire.cuvant_min - EPS) {
          erori.push(eroare('reel-ilustrat-fereastra-scenei', `scene[${i}].durata`,
            `${ref}: cele ${k} cuvinte nu încap, fiecare ar sta mai puțin de ${nr(implicite.citire.cuvant_min)} s.`,
            `Mărește scene[${i}].durata cu ${nr((implicite.citire.cuvant_min - pas) * (k - 1) + 0.1)} s sau scoate un cuvânt.`));
        }
        card.cuvinte = sc.cuvinte.map((c, j) => ({ text: textAfisat(c), t: rotunjeste(intra + j * pas) }));
        card.cuvinte.forEach((c, j) => {
          texte.push(c.text);
          selectori.push(`#cuvinte-${card.id} > :nth-child(${j + 1})`);
        });
        cardComplet = card.cuvinte[k - 1].t + T.CUVANT_INTRARE;
      }
      complet = Math.max(complet, cardComplet);
      // S03: cardul următor intră la cel puțin ieșirea celui precedent + pauza dintre carduri
      if (cardAnterior && cardAnterior.iese !== null && intra < cardAnterior.iese + R.pauza_carduri - EPS) {
        erori.push(eroare('reel-ilustrat-carduri-suprapuse', `scene[${i}].durata`,
          `${ref}: cardul intră la ${nr(intra)} s, dar cel din scena ${cardAnterior.scena + 1} iese abia la ${nr(cardAnterior.iese)} s; între ele trebuie cel puțin ${nr(R.pauza_carduri)} s.`,
          `Mărește scene[${cardAnterior.scena}].durata sau alege stil.ritm „normal”.`));
      }
      plan.carduri.push(card);
      cardAnterior = card;
    }

    // desenul scenei (desen sau final cu desen)
    if (sc.desen && (sc.tip === 'desen' || sc.tip === 'final')) {
      const W = capatFereastra[i];
      const pleaca = W < durata - EPS;
      const limita = pleaca ? W - T.PLECARE : durata - R.pauza_finala;
      let start = s + (sc.tip === 'final' ? T.FINAL_DESEN_START : T.DESEN_START);
      let fortat = false;
      if (retragereRetea !== null && retragereRetea + R.dupa_retea > start + EPS) {
        start = retragereRetea + R.dupa_retea;
        fortat = true;
      }
      const dur = sc.tip === 'final' ? Math.min(ritm.desenare, limita - start) : ritm.desenare;
      const incape = sc.tip === 'final' ? dur >= T.DESEN_MIN - EPS : start + dur <= limita + EPS;
      if (!incape) {
        const lipsa = sc.tip === 'final' ? T.DESEN_MIN - dur : start + dur - limita;
        const cod = fortat ? 'reel-ilustrat-desen-dupa-retea' : 'reel-ilustrat-fereastra-scenei';
        const mesaj = fortat
          ? `${ref}: desenul poate porni abia la ${nr(start)} s (retragerea rețelei + ${nr(R.dupa_retea)} s) și nu mai apucă să se termine înainte de ${nr(limita)} s.`
          : `${ref}: desenarea (${nr(dur)} s) și retragerea nu încap în fereastra scenei.`;
        erori.push(eroare(cod, `scene[${i}].durata`, mesaj,
          `Mărește scene[${i}].durata cu ${nr(lipsa + 0.05)} s${fortat ? '' : ' sau alege stil.ritm „alert”'}.`));
      }
      plan.desene.push({
        g: `g-d${i + 1}`,
        scena: i,
        id: sc.desen.id,
        draw: [rotunjeste(start), rotunjeste(Math.max(dur, 0))],
        undraw: pleaca ? [rotunjeste(W - T.PLECARE), ritm.retragere] : null,
      });
      complet = Math.max(complet, start + Math.max(dur, 0));

      // linia de accent (linia de accent a finalului)
      if (sc.tip === 'final' && (sc.linie_accent ?? true)) {
        const t = start + Math.max(dur, 0) / 2;
        plan.linii.push({ id: 'linie-accent', scena: i, t: rotunjeste(t), dur: T.LINIE_ACCENT_DURATA, clasa: 'c' });
      }
    } else if (sc.tip === 'final' && sc.linie_accent === true) {
      plan.linii.push({ id: 'linie-accent', scena: i, t: rotunjeste(s + T.FINAL_DESEN_START), dur: T.LINIE_ACCENT_DURATA, clasa: 'c' });
    }
    for (const l of plan.linii.filter((x) => x.scena === i)) {
      if (l.t + l.dur > durata - R.semnatura_ultim + EPS) {
        erori.push(eroare('reel-ilustrat-fereastra-scenei', `scene[${i}].durata`,
          `${ref}: linia de accent se termină la ${nr(l.t + l.dur)} s, după limita de ${nr(durata - R.semnatura_ultim)} s.`,
          `Mărește scene[${i}].durata cu ${nr(l.t + l.dur - durata + R.semnatura_ultim + 0.05)} s.`));
      }
    }

    // iconițele (adunare)
    if (sc.tip === 'adunare') {
      const n = sc.iconite.length;
      const intra = rotunjeste(s + T.CARD_INTRA.adunare);
      const apar = sc.iconite.map((_, j) => rotunjeste(intra + j * ritm.pas_iconite));
      const urmeazaRetea = i < ultima && scene[i + 1].tip === 'retea';
      const durataRetragere = T.ICONITA_RETRAGERE + T.ICONITA_ESALON * (n - 1);
      let retrag = i === ultima ? null : e - T.PLECARE;
      if (urmeazaRetea) retrag = Math.min(retrag, nastereRetea[i + 1] - durataRetragere);
      const gata = apar[n - 1] + T.ICONITA_INTRARE;
      if (retrag !== null && gata > retrag + EPS) {
        const cod = urmeazaRetea ? 'reel-ilustrat-iconite-retea' : 'reel-ilustrat-fereastra-scenei';
        const mesaj = urmeazaRetea
          ? `${ref}: iconițele trebuie să înceapă retragerea la ${nr(retrag)} s, ca să dispară înainte de nașterea rețelei, dar ultima abia apare complet la ${nr(gata)} s.`
          : `${ref}: ultima iconiță apare complet la ${nr(gata)} s, după începutul retragerii (${nr(retrag)} s).`;
        erori.push(eroare(cod, `scene[${i}].durata`, mesaj,
          `Mărește scene[${i}].durata cu ${nr(gata - retrag + 0.05)} s sau scoate o iconiță din scene[${i}].iconite.`));
      }
      const tremura = rotunjeste(apar[n - 1] + T.TREMUR_DUPA);
      plan.iconite.push({
        g: `g-i${i + 1}`,
        scena: i,
        nume: [...sc.iconite],
        apar,
        tremura: retrag !== null && tremura >= retrag ? null : tremura,
        retrag: retrag === null ? null : rotunjeste(retrag),
      });
      complet = Math.max(complet, gata);
    }

    // rețeaua
    if (sc.tip === 'retea') {
      const nastere = nastereRetea[i];
      const gata = nastere + implicite.retea.traseu[1];
      let retrag = i === ultima ? null : e - T.PLECARE;
      let scanteie = null;
      if (sc.scanteie) {
        const loc = (retrag ?? durata - R.pauza_finala + T.SCANTEIE_PAUZA) - T.SCANTEIE_PAUZA - gata;
        const dur = Math.max(T.SCANTEIE_MIN, Math.min(T.SCANTEIE_MAX, loc));
        scanteie = [rotunjeste(gata), rotunjeste(dur)];
        if (retrag !== null) retrag = Math.max(retrag, gata + dur + T.SCANTEIE_PAUZA);
      } else if (retrag !== null) {
        retrag = Math.max(retrag, gata + T.SCANTEIE_PAUZA);
      }
      const anterior = i > 0 && scene[i - 1].tip === 'adunare' && scene[i - 1].iconite.length >= 3 ? scene[i - 1] : null;
      plan.retele.push({
        g: `g-r${i + 1}`,
        scena: i,
        din: anterior ? `g-i${i}` : null,
        noduri: anterior ? anterior.iconite.length : (sc.noduri ?? 6),
        nastere,
        scanteie,
        retrag: retrag === null ? null : rotunjeste(retrag),
      });
      if (retrag !== null) retragereRetea = retrag;
      complet = Math.max(complet, gata);
    }

    // îndemnul din scena finală
    if (sc.tip === 'final' && sc.cta !== undefined) {
      const ultimCard = card ? plan.carduri[plan.carduri.length - 1] : null;
      const baza = ultimCard && ultimCard.randuri
        ? ultimCard.intra + T.CARD_RAND + T.CARD_ESALON * (ultimCard.randuri.length - 1)
        : s + T.CARD_INTRA.final;
      plan.cta = { text: sc.cta, intra: rotunjeste(baza + T.CTA_DUPA) };
      texte.push(sc.cta);
      selectori.push('#cta .h');
      complet = Math.max(complet, plan.cta.intra + T.CUVANT_INTRARE);
    }

    segmente.push({
      ref,
      camp: `scene[${i}]`,
      tip: sc.tip,
      start: rotunjeste(s),
      complet: rotunjeste(Math.min(Math.max(complet, s), e)),
      sfarsit: rotunjeste(e),
      zona_text: [...implicite.zone.text],
      texte,
      ...(selectori.length > 0 ? { selectori } : {}),
    });
  }

  // semnătura (nou-reel.sh): pornește la durata - 1,8 s și se termină cel târziu la durata - 0,3 s
  // doar un text intră în plan (T1): blocul aprobat și #sig îl tratează ca text
  const textSemnatura = val(stil.semnatura) ?? date.semnatura ?? null;
  if (typeof textSemnatura === 'string' && textSemnatura !== '') {
    const t = rotunjeste(durata - R.semnatura_inainte);
    plan.semnatura = { text: textSemnatura, t, dur: R.semnatura_durata };
    if (t + R.semnatura_durata > durata - R.semnatura_ultim + EPS) {
      erori.push(eroare('reel-ilustrat-semnatura', 'semnatura',
        `Semnătura se termină la ${nr(t + R.semnatura_durata)} s, după limita de ${nr(durata - R.semnatura_ultim)} s.`,
        `Mărește scene[${ultima}].durata sau scurtează semnatura.`));
    }
  }

  return { plan, segmente, erori };
}

// ---------------------------------------------------------------------------
// Spațiul: cutiile desenelor, panourile, iconițele, rețeaua și linia de accent.

const S = Object.freeze({
  MARGINE_LATERALA: 96, // ancora pentru pozitie „stanga” și „dreapta”, ca textul
  PANOU_MARGINE: 24, // panoul depășește cutia piesei cu 24 px pe fiecare latură
  SUPRAPUNERE_MAX: 0.1, // S09: două desene simultane se suprapun cel mult 10% din aria celui mai mic
  ICONITA_PX: 24, // iconițele Lucide au viewBox 24x24
  RAND_SPATIU_MAX: 60,
});

function cutieDesen(piesa, desen, implicite) {
  const [zx, zy, zw, zh] = implicite.zone.desen;
  const aj = desen.ajustare ?? {};
  const factor = implicite.marimi[desen.marime ?? 'mare'];
  const s = rotunjeste(factor * Math.min(zw / piesa.cutie.w, zh / piesa.cutie.h) * (aj.scara ?? 1), 3);
  const w = Math.round(piesa.cutie.w * s);
  const h = Math.round(piesa.cutie.h * s);
  const pozitie = desen.pozitie ?? 'centru';
  let x;
  if (pozitie === 'stanga') x = zx + S.MARGINE_LATERALA;
  else if (pozitie === 'dreapta') x = zx + zw - S.MARGINE_LATERALA - w;
  else x = zx + Math.round((zw - w) / 2);
  const y = zy + Math.round((zh - h) / 2) + (aj.dy ?? 0);
  x += aj.dx ?? 0;
  return { x, y, s, cutie: [x, y, w, h] };
}

function areAjustare(desen) {
  const aj = desen.ajustare;
  return Boolean(aj) && ((aj.dx ?? 0) !== 0 || (aj.dy ?? 0) !== 0 || (aj.scara ?? 1) !== 1);
}

function intersectie(a, b) {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

// Un desen e „pe ecran” de la începutul desenării până la începutul retragerii (retragerea e tranziția).
function vizibilDesen(d, durata) {
  return [d.draw[0], d.undraw ? d.undraw[0] : durata];
}

function pozitiiIconite(n, referinta, aranjare, implicite) {
  const m = S.ICONITA_PX * implicite.iconite.scara;
  const marja = implicite.zone.marja;
  const sus = implicite.zone.text[1] + implicite.zone.text[3] + marja;
  const latime = implicite.format.latime;
  const limita = (x, y) => [
    Math.round(Math.min(Math.max(x, marja), latime - marja - m)),
    Math.round(Math.min(Math.max(y, sus), implicite.zone.limita_jos - m)),
  ];
  if (aranjare === 'arc-sus') {
    const [bx, by, bw, bh] = referinta;
    const cx = bx + bw / 2;
    const cy = by + bh * 0.25;
    const rx = Math.min(Math.max(bw / 2 + 40, 200), latime / 2 - marja - m / 2);
    const ry = Math.max(bh * 0.25 + m, 180);
    const pozitii = [];
    for (let j = 0; j < n; j++) {
      const unghi = Math.PI + (Math.PI * (j + 1)) / (n + 1);
      pozitii.push(limita(cx + rx * Math.cos(unghi) - m / 2, cy + ry * Math.sin(unghi) - m / 2));
    }
    return pozitii;
  }
  const [zx, zy, zw, zh] = implicite.zone.desen;
  const loc = latime - 2 * S.MARGINE_LATERALA - n * m;
  const spatiu = n > 1 ? Math.min(S.RAND_SPATIU_MAX, loc / (n - 1)) : 0;
  const x0 = zx + (zw - (n * m + (n - 1) * spatiu)) / 2;
  const y = zy + zh / 2 - m / 2;
  return Array.from({ length: n }, (_, j) => limita(x0 + j * (m + spatiu), y));
}

function caleLinieAccent(cutie, implicite) {
  const [bx, by, bw, bh] = cutie ?? implicite.zone.desen;
  const y0 = Math.round(Math.min(by + bh * 0.85, implicite.zone.limita_jos - implicite.zone.marja));
  const y1 = Math.round(Math.max(by - 20, implicite.zone.text[1] + implicite.zone.text[3] + 260));
  const xm = Math.round(bx + bw * 0.6);
  const ym = Math.round((y0 + y1) / 2 - 60);
  const xd = 1120 - xm;
  return `M-40 ${y0} C ${Math.round(xm * 0.38)} ${y0 - 10}, ${Math.round(xm * 0.69)} ${ym + 130}, ${xm} ${ym} `
    + `C ${Math.round(xm + xd * 0.36)} ${ym - 110}, ${Math.round(xm + xd * 0.64)} ${y1 + 20}, 1120 ${y1}`;
}

/**
 * Planul complet (5.17) din planul de timpi.
 * @param {object} planTimpi plan din planificaTimpi
 * @param {object} date date.json
 * @param {object} catalog Catalog (5.13), din incarcaCatalog
 * @param {object} implicite implicite.json
 * @param {object} stil StilRezolvat (pentru temă și culoarea panoului)
 * @returns {{ plan: object, erori: object[], avertismente: object[] }}
 */
export function planificaSpatiu(planTimpi, date, catalog, implicite, stil) {
  const erori = [];
  const avertismente = [];
  const scene = date.scene;
  const tema = val(stil?.tema) ?? date.stil?.tema ?? 'noapte';
  const culoarePanou = val(val(stil?.culori ?? {}).text) ?? '#F2EFEA';
  const z = implicite.zone;
  const susText = z.text[1] + z.text[3];
  const panouri = [];

  // S11: accentul *...* doar pe un rând întreg; titlu și cuvinte nu apar împreună
  scene.forEach((sc, i) => {
    if (sc.titlu !== undefined && sc.cuvinte !== undefined) {
      erori.push(eroare('reel-ilustrat-accent', `scene[${i}].cuvinte`,
        `Scena ${i + 1} are și titlu, și cuvinte; cardul poate arăta doar una dintre ele.`,
        `Scoate scene[${i}].cuvinte sau scene[${i}].titlu.`));
    }
    let accente = 0;
    (sc.titlu ?? []).forEach((rand, j) => {
      if (!rand.includes('*')) return;
      if (/^\*[^*]+\*$/.test(rand)) {
        accente += 1;
        return;
      }
      erori.push(eroare('reel-ilustrat-accent', `scene[${i}].titlu[${j}]`,
        `Scena ${i + 1}, titlu, rândul ${j + 1}: accentul cu * poate cuprinde doar tot rândul.`,
        `Scrie rândul ca „*${textAfisat(rand).trim()}*” sau fără steluțe.`));
    });
    if (accente > 1) {
      erori.push(eroare('reel-ilustrat-accent', `scene[${i}].titlu`,
        `Scena ${i + 1}: doar un rând al titlului poate fi accentuat.`,
        `Păstrează steluțele pe un singur rând din scene[${i}].titlu.`));
    }
  });

  // desenele: cutie, S08, S12, panouri
  const desene = [];
  for (const d of planTimpi.desene) {
    const sc = scene[d.scena];
    const piesa = gasestePiesa(catalog, d.id);
    if (!piesa) continue; // id-ul necunoscut îl raportează S10 (verificaDesene), cu sugestii
    const { x, y, s, cutie } = cutieDesen(piesa, sc.desen, implicite);
    const [, , w, h] = cutie;
    const camp = areAjustare(sc.desen) ? `scene[${d.scena}].desen.ajustare` : `scene[${d.scena}].desen.marime`;
    const iese = [];
    if (x < z.marja) iese.push('marginea din stânga');
    if (x + w > implicite.format.latime - z.marja) iese.push('marginea din dreapta');
    if (y < susText) iese.push(`zona de text (până la y ${susText})`);
    if (y + h > z.limita_jos) iese.push(`limita de jos (y ${z.limita_jos})`);
    if (iese.length > 0) {
      erori.push(eroare('reel-ilustrat-cutie-desen', camp,
        `Scena ${d.scena + 1}: desenul (${x}, ${y}, ${w}x${h} px) atinge ${iese.join(', ')}.`,
        areAjustare(sc.desen)
          ? `Micșorează scene[${d.scena}].desen.ajustare (dx, dy sau scara) sau scoate ajustarea.`
          : `Alege o mărime mai mică în scene[${d.scena}].desen.marime.`));
    }
    if (areAjustare(sc.desen)) {
      avertismente.push(avertisment('reel-ilustrat-ajustare', `scene[${d.scena}].desen.ajustare`,
        `Scena ${d.scena + 1} folosește ajustare; revizorul se uită atent la ea.`,
        `Dacă desenul arată bine fără ajustare, scoate scene[${d.scena}].desen.ajustare.`));
    }
    let panou = null;
    if (tema === 'noapte' && (piesa.noapte === 'autocolant' || (piesa.noapte === 'evita' && sc.desen.panou === true))) {
      // un desen generat (mg genereaza) are, ca Open Peeps, silueta lui (rolul fond); fără ea, primește dreptunghiul
      const cuSilueta = piesa.sursa === 'open-peeps' || (piesa.generat != null && (piesa.roluri ?? []).includes('fond'));
      panou = cuSilueta ? 'inversat' : 'dreptunghi';
    }
    if (panou === 'dreptunghi') {
      const px = Math.max(x - S.PANOU_MARGINE, 0);
      const py = Math.max(y - S.PANOU_MARGINE, 0);
      panouri.push({
        pentru: d.g,
        cutie: [px, py, Math.min(x + w + S.PANOU_MARGINE, implicite.format.latime) - px, Math.min(y + h + S.PANOU_MARGINE, implicite.format.inaltime) - py],
        culoare: culoarePanou,
      });
    }
    desene.push({
      g: d.g, scena: d.scena, id: d.id, tip: piesa.tip, familie: piesa.familie, animatie: piesa.animatie?.implicit ?? null,
      x, y, s, oglindit: sc.desen.oglindit === true, panou, cutie, draw: d.draw, undraw: d.undraw,
    });
  }

  // S09: două desene simultane se suprapun cel mult 10%
  for (let a = 0; a < desene.length; a++) {
    for (let b = a + 1; b < desene.length; b++) {
      const [a0, a1] = vizibilDesen(desene[a], planTimpi.durata);
      const [b0, b1] = vizibilDesen(desene[b], planTimpi.durata);
      if (Math.min(a1, b1) <= Math.max(a0, b0)) continue;
      const arie = Math.min(desene[a].cutie[2] * desene[a].cutie[3], desene[b].cutie[2] * desene[b].cutie[3]);
      const proportie = intersectie(desene[a].cutie, desene[b].cutie) / arie;
      if (proportie > S.SUPRAPUNERE_MAX) {
        erori.push(eroare('reel-ilustrat-aglomerare', `scene[${desene[b].scena}].desen.marime`,
          `Scenele ${desene[a].scena + 1} și ${desene[b].scena + 1}: desenele sunt pe ecran în același timp și se suprapun ${Math.round(proportie * 100)}% (maximum 10%).`,
          `Alege o mărime mai mică, altă poziție în scene[${desene[b].scena}].desen sau scurtează scene[${desene[a].scena}].desen.ramane_pana_la.`));
      }
    }
  }

  // iconițele: pozițiile și S09 (cel mult 6 vizibile deodată)
  const iconite = planTimpi.iconite.map((ic) => {
    const sc = scene[ic.scena];
    const t = ic.apar[0];
    const ramas = desene.find((d) => {
      const [v0, v1] = vizibilDesen(d, planTimpi.durata);
      return d.scena < ic.scena && v0 <= t && t < v1;
    });
    const aranjare = sc.aranjare ?? (ramas ? 'arc-sus' : 'rand');
    return {
      g: ic.g, scena: ic.scena, nume: ic.nume,
      pozitii: pozitiiIconite(ic.nume.length, ramas ? ramas.cutie : implicite.zone.desen, aranjare, implicite),
      scara: implicite.iconite.scara, apar: ic.apar, tremura: ic.tremura, retrag: ic.retrag,
    };
  });
  const intervale = iconite.flatMap((ic) => ic.apar.map((t, j) => ({
    scena: ic.scena,
    start: t,
    sfarsit: ic.retrag === null ? planTimpi.durata : ic.retrag + T.ICONITA_ESALON * j + T.ICONITA_RETRAGERE,
  })));
  const raportate = new Set();
  for (const iv of intervale) {
    const vizibile = intervale.filter((x) => x.start <= iv.start + EPS && iv.start < x.sfarsit - EPS).length;
    if (vizibile > implicite.iconite.max_vizibile && !raportate.has(iv.scena)) {
      raportate.add(iv.scena);
      erori.push(eroare('reel-ilustrat-aglomerare', `scene[${iv.scena}].iconite`,
        `Scena ${iv.scena + 1}: la ${nr(iv.start)} s sunt ${vizibile} iconițe pe ecran (maximum ${implicite.iconite.max_vizibile}).`,
        `Scoate iconițe din scene[${iv.scena}].iconite sau pune o scenă card între scenele cu iconițe.`));
    }
  }

  const retele = planTimpi.retele.map((r) => ({
    g: r.g, scena: r.scena, din: r.din, noduri: r.noduri, nastere: r.nastere, scanteie: r.scanteie, retrag: r.retrag,
    centru: [...implicite.retea.centru], raza: implicite.retea.raza,
  }));

  const linii = planTimpi.linii.map((l) => {
    const desenScena = desene.find((d) => d.scena === l.scena);
    return { id: l.id, scena: l.scena, d: caleLinieAccent(desenScena ? desenScena.cutie : null, implicite), t: l.t, dur: l.dur, clasa: l.clasa };
  });

  const plan = {
    versiune: planTimpi.versiune,
    durata: planTimpi.durata,
    fps: planTimpi.fps,
    latime: planTimpi.latime,
    inaltime: planTimpi.inaltime,
    atmosfera: planTimpi.atmosfera,
    desene,
    iconite,
    retele,
    linii,
    carduri: planTimpi.carduri,
    cta: planTimpi.cta,
    semnatura: planTimpi.semnatura,
    panouri,
  };
  return { plan, erori, avertismente };
}

/**
 * Timpii și spațiul, legate: planul complet (build/plan.json) și segmentele cronologiei.
 * ctx: { radacina, sablon: { implicite }, catalog? } (4.16)
 * @returns {{ plan: object, segmente: object[], erori: object[], avertismente: object[] }}
 */
export function planifica(date, stil, ctx) {
  const implicite = ctx.sablon.implicite;
  const catalog = ctx.catalog ?? incarcaCatalog(ctx.radacina);
  const timpi = planificaTimpi(date, stil, implicite);
  const spatiu = planificaSpatiu(timpi.plan, date, catalog, implicite, stil);
  return {
    plan: spatiu.plan,
    segmente: timpi.segmente,
    erori: [...timpi.erori, ...spatiu.erori],
    avertismente: spatiu.avertismente,
  };
}
