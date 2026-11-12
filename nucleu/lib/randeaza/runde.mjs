// runde.mjs: unde e proiectul față de plafonul rundelor de revizie, pentru rezultatul lui mg randeaza (decizia P1).
// mg randeaza nu refuză nicio randare din cauza plafonului: plafonul se aplică verdictelor revizorului, la
// SubagentStop (A17), iar predarea nu se blochează. Comanda doar spune, la fiecare randare, câte runde s-au folosit
// și ce urmează când s-au terminat: predarea cu observațiile la vedere sau „încă o rundă”, cerută explicit de cursant (B13).
import { numaraRunde, plafonRunde } from '../garda/revizor.mjs';

/**
 * @param {string} radacina
 * @param {string} proiect
 * @param {{ schita?: boolean }} [optiuni] schița are rundele ei (T3)
 * @returns {{ runde_scrise: number, plafon: number, peste_plafon: boolean, mesaj: string }}
 */
export function stareRevizie(radacina, proiect, { schita = false } = {}) {
  const runde_scrise = numaraRunde(radacina, proiect, { schita });
  const plafon = plafonRunde(radacina, proiect, { schita });
  const peste_plafon = runde_scrise >= plafon;
  const fel = schita ? 'de schiță' : 'complete';
  const cerere = schita ? `încă o rundă schiță ${proiect}` : `încă o rundă ${proiect}`;
  const mesaj = peste_plafon
    ? `Revizia vizuală: ${runde_scrise} din ${plafon} runde ${fel} sunt folosite, deci revizorul nu mai scrie un verdict nou. `
      + 'Predă cu observațiile nereparate ale revizorului la vedere; cursantul decide. '
      + `O rundă în plus pornește doar dacă cursantul scrie explicit „${cerere}”.`
    : `Revizia vizuală: ${runde_scrise} din ${plafon} runde ${fel} folosite.`;
  return { runde_scrise, plafon, peste_plafon, mesaj };
}
