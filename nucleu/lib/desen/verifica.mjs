// S10 și `mg desen verifica` (spec 7.1 S10, 8.4.3, 8.4.4, 8.9).
import { eroare } from '../erori.mjs';
import { existaIconita } from '../iconite.mjs';
import { citesteBrand } from '../brand.mjs';
import { gasestePiesa } from './catalog.mjs';

const MARIMI = Object.freeze(['mic', 'mediu', 'mare']);
const NUME_FAMILIE = Object.freeze({ cerneala: 'o formă cu cerneală', traseu: 'un traseu al brandului' });

/** Tema filmului: din date, altfel din brand, altfel `noapte` (implicitul reelului). */
export function temaFilmului(date, radacina) {
  if (typeof date?.stil?.tema === 'string') return date.stil.tema;
  if (typeof date?.brand === 'string') {
    try {
      const brand = citesteBrand(radacina, date.brand);
      if (typeof brand.tema === 'string') return brand.tema;
    } catch {
      // brandul lipsă sau invalid e raportat de C02; aici rămâne tema implicită
    }
  }
  return 'noapte';
}

/**
 * @param {object} date conținutul lui date.json
 * @param {{piese: object[]}} catalog rezultatul lui incarcaCatalog
 * @param {string} radacina rădăcina agentului (pentru iconițe și brand)
 * @returns {{erori: import('../erori.mjs').EroareMg[], avertismente: import('../erori.mjs').EroareMg[]}}
 */
export function verificaDesene(date, catalog, radacina) {
  const erori = [];
  const avertismente = [];
  const tema = temaFilmului(date, radacina);
  const scene = Array.isArray(date?.scene) ? date.scene : [];
  let familieFilm = null;

  scene.forEach((scena, i) => {
    const loc = `Scena ${i + 1}`;
    const desen = scena?.desen;
    if (desen && typeof desen === 'object' && typeof desen.id === 'string') {
      const camp = `scene[${i}].desen`;
      const piesa = gasestePiesa(catalog, desen.id);
      if (!piesa) {
        erori.push(eroare('desen-necunoscut', `${camp}.id`,
          `${loc}: desenul „${desen.id}” nu există în biblioteci/, în proprii/ sau în catalogul brandului proiectului.`,
          `Pune în ${camp}.id un id găsit cu node nucleu/mg.mjs desen cauta "<concept>".`));
      } else if (piesa.tip !== 'forma' && !(piesa.tip === 'traseu' && piesa.brand)) {
        // traseele vin doar din catalogul brandului proiectului (felia 4); altfel, doar forme
        erori.push(eroare('valoare-invalida', `${camp}.id`,
          `${loc}: „${piesa.id}” nu e o formă (tip „${String(piesa.tip)}”); agentul folosește doar forme (Open Peeps, Open Doodles și desenele tale adăugate cu mg desen adauga).`,
          `Alege în ${camp}.id o formă găsită cu node nucleu/mg.mjs desen cauta "<concept>".`));
      } else {
        if (piesa.familie !== 'proprie') {
          if (familieFilm === null) {
            familieFilm = { familie: piesa.familie, loc, id: piesa.id };
          } else if (piesa.familie !== familieFilm.familie) {
            erori.push(eroare('desen-familii-amestecate', `${camp}.id`,
              `${loc} folosește ${NUME_FAMILIE[piesa.familie] ?? piesa.familie} („${piesa.id}”), iar ${familieFilm.loc} ${NUME_FAMILIE[familieFilm.familie] ?? familieFilm.familie} („${familieFilm.id}”); un film are o singură familie de desene mari.`,
              `Alege în ${camp}.id o piesă din familia „${familieFilm.familie}” (node nucleu/mg.mjs desen cauta "<concept>" --familie ${familieFilm.familie}).`));
          }
        }
        if (tema === 'noapte' && piesa.noapte === 'evita' && desen.panou !== true) {
          erori.push(eroare('desen-fara-panou', `${camp}.panou`,
            `${loc}: „${piesa.id}” arată ca un negativ pe tema noapte și nu se folosește fără panou.`,
            `Alege altă piesă pentru ${camp}.id sau, dacă ai cerut-o explicit, scrie ${camp}.panou: true.`));
        }
      }
      if (desen.marime !== undefined && !MARIMI.includes(desen.marime)) {
        erori.push(eroare('desen-marime-invalida', `${camp}.marime`,
          `${loc}: mărimea „${String(desen.marime)}” nu există.`,
          `Scrie în ${camp}.marime una dintre valorile mic, mediu sau mare.`));
      }
    }
    if (Array.isArray(scena?.iconite)) {
      scena.iconite.forEach((nume, j) => {
        if (typeof nume === 'string' && !existaIconita(radacina, nume)) {
          erori.push(eroare('iconita-necunoscuta', `scene[${i}].iconite[${j}]`,
            `${loc}: iconița „${nume}” nu există în Lucide 1.49.0.`,
            `Înlocuiește scene[${i}].iconite[${j}] cu un nume din Lucide 1.49.0, de exemplu phone, mail sau calendar.`));
        }
      });
    }
  });
  return { erori, avertismente };
}
