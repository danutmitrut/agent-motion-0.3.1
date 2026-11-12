// Copierea recursivă a unui folder pentru teste, în locul lui fs.cpSync(sursa, dest, { recursive: true }).
// Pe Windows, Node 22 (verificat pe 22.23.3) copiază fără `filter` cu implementarea nativă, care oprește procesul
// (0xC0000409, fără niciun mesaj) când calea are diacritice; Node 24 nu mai are problema. Clonele de teste stau
// în căi ca „Proiecte Ăîș test”, deci testele copiază cu funcția asta, pe fișiere, prin API-ul obișnuit.
import fs from 'node:fs';
import path from 'node:path';

/** Copiază folderul `sursa` în `dest` (creat dacă lipsește), cu tot cu subfolderele. */
export function copiazaDosar(sursa, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const intrare of fs.readdirSync(sursa, { withFileTypes: true })) {
    const de = path.join(sursa, intrare.name);
    const la = path.join(dest, intrare.name);
    if (intrare.isDirectory()) copiazaDosar(de, la);
    else fs.copyFileSync(de, la);
  }
}
