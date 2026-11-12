// Argumentele de motor ale overlay-ului (decizia 13 din planul H; docs/interfete/sablon.md, cheia motor din construieste).
// check: --strict (avertismentele pică C10), banda subtitrărilor ca zonă rezervată (fracțiuni 0-1 din cadru, cu momentele
// în fracțiuni din durată) și --frame-check; render: fără „best effort” și cu cache-ul de cadre în video/<proiect>/.cache.
import path from 'node:path';
import { rotunjeste } from '../../../../nucleu/lib/sdk.mjs';

const f4 = (x) => rotunjeste(x, 4);
const MAX_MOMENTE = 12;

/** Momentele la care HyperFrames verifică banda: mijlocul videoului și momentul complet al fiecărui element. */
export function momenteBanda(plan) {
  const t = [0.5, ...plan.elemente.map((e) => f4(e.complet / plan.durata))];
  return [...new Set(t)].filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b).slice(0, MAX_MOMENTE);
}

export function argumenteMotor(plan, dirProiect) {
  const [x, y, w, h] = plan.banda_subtitrari;
  const zona = `x0=${f4(x / plan.latime)};y0=${f4(y / plan.inaltime)};x1=${f4((x + w) / plan.latime)};y1=${f4((y + h) / plan.inaltime)};severity=error;seek=${momenteBanda(plan).join(',')}`;
  return {
    check: { argumente: ['--strict', '--caption-zone', zona, '--frame-check', 'severity=error'] },
    randare: { argumente: ['--no-best-effort', '--frames-cache-dir', path.join(dirProiect, '.cache')] },
  };
}
