// Fișierele filmării pe care le scrie mg nou (H05) și le citește șablonul: motor.lock.filmare, transcrierea, raportul.
import path from 'node:path';
import { citesteText, eroare, rotunjeste } from '../../../../nucleu/lib/sdk.mjs';

const SUGESTIE = 'Creează proiectul din nou: node nucleu/mg.mjs nou <proiect-nou> --sablon overlay-filmare --filmare <clip>.';

function json(ctx, rel, erori) {
  try {
    return JSON.parse(citesteText(path.join(ctx.dirProiect, ...rel.split('/'))).replace(/^﻿/, ''));
  } catch (e) {
    erori.push(eroare('resursa-lipsa', 'filmare.fisier', `Nu pot citi ${rel} al proiectului (${e?.code ?? e?.message}).`, SUGESTIE));
    return null;
  }
}

export function citesteFilmare(ctx) {
  const erori = [];
  const filmare = json(ctx, 'motor.lock', erori)?.filmare ?? null;
  if (erori.length === 0 && !filmare) erori.push(eroare('resursa-lipsa', 'filmare.fisier', 'motor.lock nu are cheia filmare: proiectul nu a fost creat din filmare.', SUGESTIE));
  const transcriere = json(ctx, 'active/transcriere.json', erori);
  const raport = json(ctx, 'active/raport.json', erori);
  return { filmare, transcriere, raport, erori };
}

export function fereastra(date, filmare) {
  const start = rotunjeste(date.filmare?.start ?? 0, 3);
  const sfarsit = rotunjeste(date.filmare?.sfarsit ?? filmare.durata, 3);
  return { start, sfarsit, durata: rotunjeste(sfarsit - start, 3) };
}
