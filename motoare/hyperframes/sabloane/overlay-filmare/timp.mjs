// Timpii elementelor (spec 7.4, „Calculul timpilor”): la sau ancora (cu avansul ritmului), durata tipului, lista și finalul.
// Toți timpii pe cronologia finală (0 = filmare.start).
import { eroare, rotunjeste, secundeCuZecimala as secunde, timpCitire } from '../../../../nucleu/lib/sdk.mjs';
import { gasesteFraza, eroareAncora } from './ancore.mjs';

const r3 = (x) => rotunjeste(x, 3);
const EPS = 1e-9;

/** Textul citit al unui element din date (pentru timpul de citire): toate textele lui, cifra cu prefixul și sufixul. */
export function textCitit(e) {
  const cifra = e.tip === 'cifra' ? `${e.prefix ?? ''}${e.valoare}${e.sufix ?? ''}` : null;
  const parti = [e.eticheta, ...(e.titlu ?? []), e.nume, e.rol, cifra, e.text, e.autor, ...(e.puncte ?? []).map((p) => p.text), e.cta, e.detaliu];
  return parti.filter((x) => typeof x === 'string' && x !== '').join(' ');
}

/** Durata implicită (decizia 21): cea a tipului sau timpul de citire, dacă e mai mare, cel mult maximul tipului. */
export const durataImplicita = (e, D, baza) => Math.min(D.max, Math.max(baza, timpCitire(textCitit(e))));

/** Id-ul elementului i din date.json: cel dat sau e{i+1}. E numele lui în cronologie (`ref`), în scenariu și în verdict (decizia 30). */
export const idElement = (e, i) => e.id ?? `e${i + 1}`;

/** Decizia 26: fraza rostită în afara porțiunii alese e eroare S02 (nu primește timpi inventați). */
function eroareInAfara(camp, fraza, aparitia, tAbs, start, durata) {
  return eroare('overlay-filmare-ancora', camp, `Fraza „${fraza}” (apariția ${aparitia}) se aude la ${secunde(tAbs)} s în filmarea întreagă, în afara porțiunii alese: ea începe la ${secunde(start)} s și durează ${secunde(durata)} s (până la ${secunde(start + durata)} s).`,
    'Alege altă apariție (ancora.aparitia), mută filmare.start sau filmare.sfarsit ori folosește la, cu secunda.');
}
const inAfara = (tAbs, start, durata) => tAbs - start < -EPS || tAbs - start >= durata - EPS;

/** Prima apariție a frazei cu timpul (pe cronologia finală) strict după `dupa`. */
function dupaMoment(cuvinte, fraza, start, dupa) {
  for (let a = 1; ; a++) {
    const g = gasesteFraza(cuvinte, fraza, a);
    if (!g.gasita) return { g: null, prima: gasesteFraza(cuvinte, fraza, 1) };
    if (g.t - start > dupa + EPS) return { g };
  }
}

export function timpiElemente(elemente = [], { cuvinte, start, durata, ritm, implicite }) {
  const erori = [];
  const rez = [];
  elemente.forEach((e, i) => {
    const camp = `elemente[${i}]`;
    const D = implicite.durate[e.tip];
    let t0;
    let ancora = null;
    if (e.la !== undefined) t0 = e.la;
    else if (e.ancora) {
      const aparitia = e.ancora.aparitia ?? 1;
      const g = gasesteFraza(cuvinte, e.ancora.fraza, aparitia);
      if (!g.gasita) { erori.push(eroareAncora(`${camp}.ancora.fraza`, e.ancora.fraza, aparitia, g)); return; }
      if (inAfara(g.t, start, durata)) { erori.push(eroareInAfara(`${camp}.ancora`, e.ancora.fraza, aparitia, g.t, start, durata)); return; }
      ancora = { fraza: e.ancora.fraza, aparitia, gasita: true, t: r3(g.t - start) };
      t0 = Math.max(0, g.t - start - ritm.avans);
    } else t0 = durata - (e.durata ?? durataImplicita(e, D, D.inainte_de_sfarsit));
    t0 = r3(t0);
    let t1;
    let puncte;
    if (e.tip === 'final') t1 = durata;
    else if (e.tip === 'lista') {
      puncte = [];
      let dupa = ancora ? ancora.t : t0 - EPS;
      let ok = true;
      e.puncte.forEach((p, k) => {
        if (!ok) return;
        const { g, prima } = dupaMoment(cuvinte, p.ancora.fraza, start, dupa);
        if (!g) {
          ok = false;
          const pcamp = `${camp}.puncte[${k}].ancora.fraza`;
          erori.push(prima?.gasita
            ? eroare('overlay-filmare-ancora', pcamp, `Punctul ${k + 1} („${p.ancora.fraza}”) se aude doar înainte de ${k === 0 ? 'ancora listei' : `punctul ${k}`}; punctele apar în ordinea în care sunt rostite.`,
              'Pune punctele listei în ordinea în care le spui în filmare sau schimbă fraza punctului.')
            : eroareAncora(pcamp, p.ancora.fraza, 1, prima));
          return;
        }
        if (inAfara(g.t, start, durata)) {
          ok = false;
          erori.push(eroareInAfara(`${camp}.puncte[${k}].ancora`, p.ancora.fraza, 1, g.t, start, durata));
          return;
        }
        dupa = r3(g.t - start);
        puncte.push({ k, ancora_t: dupa, t: r3(Math.max(t0, g.t - start - ritm.avans)) });
      });
      if (!ok) return;
      t1 = e.durata !== undefined ? t0 + e.durata : Math.min(t0 + D.max, Math.max(t0 + durataImplicita(e, D, D.min), puncte.at(-1).t + D.dupa_ultimul));
    } else t1 = t0 + (e.durata ?? durataImplicita(e, D, D.implicita));
    rez.push({ n: i + 1, camp, id: idElement(e, i), tip: e.tip, banda: implicite.banda_tip[e.tip], start: t0, sfarsit: r3(t1), ancora, ...(puncte ? { puncte } : {}) });
  });
  return { elemente: rez, erori };
}
