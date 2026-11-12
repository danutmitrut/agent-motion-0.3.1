// mg doctor --generare (spec 9.1, felia 5): doar ce cere generarea de desene, cerut abia la prima generare.
// Nu atinge nucleu/.stare.json și nici .instalat: atelierul 1 nu depinde de generare.
import { eroare, avertisment } from '../erori.mjs';
import { stareGenerare, instaleazaKeyring, comandaPuneCheie, KEYRING } from '../genereaza/cheie.mjs';
import { PAS_SEIF } from '../genereaza/index.mjs';

/**
 * @param {{radacina: string, instaleaza?: boolean, dependente?: {stare?: Function, instaleaza?: Function}}} p
 * @returns {Promise<{ok: boolean, verificari: object[], erori: object[], avertismente: object[], mesaj: string}>}
 */
export async function doctorGenerare({ radacina, instaleaza = false, dependente = {} }) {
  const citesteStare = dependente.stare ?? stareGenerare;
  let stare = await citesteStare(radacina);
  let instalat = null;
  if (instaleaza && !stare.keyring && stare.python) {
    instalat = await (dependente.instaleaza ?? instaleazaKeyring)(radacina, stare.python);
    if (instalat.ok) stare = await citesteStare(radacina);
  }
  const verificari = [];
  verificari.push(stare.python
    ? { id: 'python', ok: true, nivel: 'ok', valoare: stare.python.join(' '), eroare: null }
    : {
      id: 'python', ok: false, nivel: 'eroare', valoare: null,
      eroare: eroare('generare-nepregatita', 'mediu.python', 'Pe calculator lipsește Python 3 (cel puțin 3.9), de care are nevoie seiful pentru cheia Kie.',
        'Cursantul instalează Python 3 după INSTALARE.md, secțiunea „Generarea de desene” (fără drepturi de administrator), apoi rulezi din nou node nucleu/mg.mjs doctor --generare.'),
    });
  if (stare.python) {
    verificari.push(stare.keyring
      ? { id: 'keyring', ok: true, nivel: 'ok', valoare: `${KEYRING}, în unelte/python/`, eroare: null }
      : {
        id: 'keyring', ok: false, nivel: 'eroare', valoare: instalat && !instalat.ok ? 'instalarea a eșuat' : 'lipsește',
        eroare: eroare('generare-nepregatita', 'mediu.keyring',
          instalat && !instalat.ok ? `Seiful pentru cheie nu s-a instalat: ${instalat.detaliu}` : 'Seiful pentru cheie (keyring) nu e instalat în unelte/python/.',
          instalat && !instalat.ok
            ? 'Verifică conexiunea la internet și rulează din nou node nucleu/mg.mjs doctor --generare --instaleaza-keyring; dacă pică iar, trimite ieșirea lui Dănuț.'
            : 'Cu acordul cursantului (descarcă ~1 MB de pe pypi.org, în folderul agentului): node nucleu/mg.mjs doctor --generare --instaleaza-keyring.'),
      });
  }
  if (stare.keyring && stare.seif) {
    verificari.push({
      id: 'cheie-kie', ok: false, nivel: 'eroare', valoare: 'seiful nu răspunde',
      eroare: eroare('generare-nepregatita', 'mediu.seif', `Seiful sistemului n-a răspuns limpede: ${stare.seif}.`, PAS_SEIF),
    });
  } else if (stare.keyring) {
    verificari.push(stare.cheie
      ? { id: 'cheie-kie', ok: true, nivel: 'ok', valoare: 'în seif', eroare: null }
      : {
        id: 'cheie-kie', ok: true, nivel: 'avertisment', valoare: 'lipsește',
        eroare: avertisment('kie-cheie-lipsa', 'mediu.cheie-kie', 'Cheia Kie nu e încă în seiful sistemului.',
          `Cursantul o pune singur, în terminalul lui, din folderul agentului: ${comandaPuneCheie()} (nu în chat).`),
      });
  }
  verificari.push({ id: 'vectorizare', ok: true, nivel: 'ok', valoare: 'contur, în Node, fără instalare', eroare: null });
  const erori = verificari.filter((v) => v.nivel === 'eroare').map((v) => v.eroare);
  const avertismente = verificari.filter((v) => v.nivel === 'avertisment').map((v) => v.eroare);
  const ok = erori.length === 0;
  const linii = ['Raportul mg doctor --generare:', ...verificari.map((v) => `- ${v.id}: ${v.nivel === 'eroare' ? 'EROARE' : v.nivel}${v.valoare ? ` (${v.valoare})` : ''}`)];
  linii.push(ok
    ? (stare.cheie ? 'Generarea e gata.' : 'Generarea e gata, mai puțin cheia Kie, pe care o pune cursantul.')
    : 'Generarea nu e gata. Repară ce scrie mai jos, apoi rulează din nou: node nucleu/mg.mjs doctor --generare');
  return { ok, verificari, erori, avertismente, mesaj: linii.join('\n') };
}
