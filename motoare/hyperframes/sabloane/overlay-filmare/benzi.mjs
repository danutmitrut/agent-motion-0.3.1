// Benzile din cod (spec 7.4, „Fix în cod”; deciziile 9-11 și 20 din planul H) și regulile de ocupare (S04).
import { eroare, secundeCuZecimala as secunde } from '../../../../nucleu/lib/sdk.mjs';

const EPS = 1e-9;
export const benziFormat = (implicite, format) => implicite.formate[format].benzi;
export const bandaSubtitrari = (implicite, format, pozitie = 'jos') => benziFormat(implicite, format)[pozitie];
export const seIntersecteaza = ([ax, ay, aw, ah], [bx, by, bw, bh]) => ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

export function suspendaSubtitrarile(el, { benzi, bandaSub }) {
  return el.banda === 'centru' || seIntersecteaza(benzi[el.banda], bandaSub);
}

export function suspendari(elemente, { benzi, bandaSub }) {
  const iv = elemente.filter((e) => suspendaSubtitrarile(e, { benzi, bandaSub })).map((e) => [e.start, e.sfarsit]).sort((a, b) => a[0] - b[0]);
  const unite = [];
  for (const [a, b] of iv) {
    const u = unite.at(-1);
    if (u && a <= u[1] + EPS) u[1] = Math.max(u[1], b);
    else unite.push([a, b]);
  }
  return unite;
}

/** Câmpul care pornește elementul, pentru mesajele lui S04. */
function campStart(el, d) {
  if (d?.la !== undefined) return `${el.camp}.la`;
  if (d?.ancora) return `${el.camp}.ancora.fraza`;
  return `${el.camp}.durata`;
}

export function verificaOcupare(elemente, { date, durata, implicite, format }) {
  const erori = [];
  const L = implicite.limite;
  const benzi = benziFormat(implicite, format);
  const sub = date.subtitrari ?? {};
  const bandaSub = bandaSubtitrari(implicite, format, sub.pozitie ?? 'jos');
  const activ = sub.activ !== false;
  const d = (el) => date.elemente?.[el.n - 1];
  const pune = (el, mesaj, sugestie) => erori.push(eroare('overlay-filmare-ocupare', campStart(el, d(el)), mesaj, sugestie));
  for (const el of elemente) {
    const D = implicite.durate[el.tip];
    const lung = el.sfarsit - el.start;
    if (el.start < -EPS || el.start >= el.sfarsit - EPS || el.sfarsit > durata + EPS) {
      pune(el, `${el.camp} (${el.tip}) stă între ${secunde(el.start)} s și ${secunde(el.sfarsit)} s, în afara videoului de ${secunde(durata)} s.`, 'Mută elementul mai devreme (la sau altă frază de ancorare) sau scurtează-i durata.');
    } else if (lung < D.min - EPS || lung > D.max + EPS || (el.tip === 'final' && Math.abs(el.sfarsit - durata) > EPS)) {
      pune(el, `${el.camp} (${el.tip}) stă ${secunde(lung)} s; tipul ${el.tip} stă între ${secunde(D.min)} și ${secunde(D.max)} s${el.tip === 'final' ? ' și se termină odată cu videoul' : ''}.`, `Schimbă ${el.camp}.durata sau momentul de intrare.`);
    }
  }
  const total = Math.min(L.elemente, Math.ceil(durata / L.secunde_pe_element));
  const camp = 'elemente';
  if (elemente.length > total) erori.push(eroare('overlay-filmare-ocupare', camp, `Sunt ${elemente.length} elemente; un video de ${secunde(durata)} s are cel mult ${total} (unul la 3 s, maximum ${L.elemente}).`, 'Scoate elementele cele mai puțin importante.'));
  for (const tip of ['citat', 'lista', 'nume', 'final']) {
    const n = elemente.filter((e) => e.tip === tip).length;
    if (n > L[tip]) erori.push(eroare('overlay-filmare-ocupare', camp, `Sunt ${n} elemente ${tip}; maximum ${L[tip]}.`, `Păstrează cel mult ${L[tip]} elemente ${tip}.`));
  }
  const ordonate = [...elemente].sort((a, b) => a.start - b.start || a.n - b.n);
  ordonate.forEach((b, j) => {
    for (const a of ordonate.slice(0, j)) {
      const atinge = a.banda === b.banda || seIntersecteaza(benzi[a.banda], benzi[b.banda]);
      if (atinge && b.start < a.sfarsit + L.pauza_banda - EPS) {
        pune(b, `${b.camp} (${b.tip}) intră la ${secunde(b.start)} s, iar ${a.camp} (${a.tip}), în aceeași bandă sau într-una care se suprapune, iese la ${secunde(a.sfarsit)} s; între ele trebuie cel puțin ${secunde(L.pauza_banda)} s.`,
          `Mută ${b.camp} mai târziu sau scurtează ${a.camp}.durata.`);
        return;
      }
    }
    const vizibile = ordonate.filter((x) => x.start <= b.start + EPS && x.sfarsit > b.start + EPS);
    const suspendat = vizibile.some((x) => suspendaSubtitrarile(x, { benzi, bandaSub }));
    const blocuri = vizibile.length + (activ && !suspendat ? 1 : 0);
    if (blocuri > L.blocuri_vizibile) {
      pune(b, `La ${secunde(b.start)} s ar fi ${blocuri} blocuri de text pe ecran (${vizibile.map((x) => x.camp).join(', ')}${activ && !suspendat ? ' și subtitrările' : ''}); maximum ${L.blocuri_vizibile}.`,
        `Mută ${b.camp} după ieșirea celorlalte elemente sau scurtează-le durata.`);
    }
  });
  return erori;
}
