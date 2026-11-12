// Starea și instalarea transcrierii locale Parakeet (spec 7.4, „Transcrierea Parakeet”; planul H, decizia 7).
// HyperFrames instalează runtime-ul sherpa-onnx-node și modelul în cache-ul lui, în afara kitului; nucleul doar
// verifică dacă există (aceleași căi și mărimi ca în hyperframes/dist, fixate în VERSIUNI.transcriere) și cere instalarea.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { COD_IESIRE, EroareFatala, eroare } from '../erori.mjs';
import { ruleazaHyperframes } from '../motor-hf.mjs';
import { ultimeleRanduri } from '../ffmpeg.mjs';

export function stareParakeet({ acasa = os.homedir(), versiuni, platforma = process.platform, arhitectura = process.arch }) {
  const t = versiuni.transcriere;
  const runtime = path.join(acasa, '.cache', 'hyperframes', 'optional', `${t.runtime}@${t.versiune}-${platforma}-${arhitectura}`);
  const model = path.join(acasa, '.cache', 'hyperframes', 'parakeet', t.dir_model);
  const lipsa = [];
  if (!fs.existsSync(path.join(runtime, 'node_modules', t.runtime, 'package.json'))) lipsa.push('runtime');
  for (const [nume, { octeti }] of Object.entries(t.fisiere)) {
    const st = fs.statSync(path.join(model, nume), { throwIfNoEntry: false });
    if (!st || st.size !== octeti) lipsa.push(nume);
  }
  return { instalat: lipsa.length === 0, runtime, model, lipsa };
}

/** Mediul pentru npm, pornit de HyperFrames prin PATH: folderul lui node (unde stă și npm) primul. */
export function mediuNpm(baza = process.env) {
  const mediu = { ...baza };
  const cheie = Object.keys(mediu).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
  mediu[cheie] = [path.dirname(process.execPath), mediu[cheie]].filter(Boolean).join(path.delimiter);
  return mediu;
}

export async function instaleazaParakeet(radacina, { ff, mediu = process.env } = {}) {
  const r = await ruleazaHyperframes(['models', 'install', 'parakeet', '--json'],
    { radacina, ff, mediu: mediuNpm(mediu), timeoutMs: 3600000, reincercariEbusy: 1 });
  let json = null;
  try { json = JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1)); } catch { json = null; }
  if (r.cod !== 0 || json?.ok !== true) {
    throw new EroareFatala(eroare('transcriere-instalare-esuata', 'mediu.parakeet',
      `Transcrierea locală nu s-a putut instala (cod ${r.cod}): ${json?.error ?? json?.message ?? ultimeleRanduri(r.stderr || r.stdout, 3)}`,
      'Verifică legătura la internet (se descarcă ~670 MB de pe huggingface.co și un pachet npm), apoi încearcă din nou. Dacă antivirusul a blocat fișierul, vezi INSTALARE.md, secțiunea despre Defender.'), COD_IESIRE.MEDIU);
  }
}
