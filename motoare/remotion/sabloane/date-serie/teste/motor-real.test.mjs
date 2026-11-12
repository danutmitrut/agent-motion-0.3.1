// Compoziția pe motorul real (MG_TESTE_INTEGRARE=1): exemplul din spec (grafic.date.json) trece --doar-verificare (C10:
// bundle, compositions cu 672 de cadre) și --schita (MP4-ul schiței, 540x960, 672 de cadre), dintr-o rădăcină temporară
// cu spațiu și diacritice. Randarea completă și verificările pe MP4 sunt în teste/acceptare-grafic (I12).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { radacinaAgent } from '../../../../../nucleu/lib/cai.mjs';
import { citesteJson } from '../../../../../nucleu/lib/fisiere.mjs';
import { probeazaMp4, rezolvaFfmpeg } from '../../../../../nucleu/lib/ffmpeg.mjs';
import { stareRemotion } from '../../../../../nucleu/lib/motoare/remotion-instalare.mjs';
import { radacinaCuMotoare } from '../../../../../teste/ajutoare/radacina-motoare.mjs';

const REPO = radacinaAgent(import.meta.url, 5);
const DIR_SABLON = join(REPO, 'motoare', 'remotion', 'sabloane', 'date-serie');
const MINUT = 60 * 1000;
const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const executa = promisify(execFile);

let temp = null;
let R = null;
let ff = null;

before(async () => {
  if (sari) return;
  const stare = stareRemotion(REPO);
  assert.equal(stare.instalat, true, `Remotion nu e instalat (lipsesc: ${stare.lipsa.join(', ')}); rulează node nucleu/mg.mjs nou proba --sablon date-serie --instaleaza-motorul`);
  ff = await rezolvaFfmpeg(REPO);
  temp = radacinaCuMotoare({ remotion: true });
  R = temp.radacina;
});

after(() => {
  if (!sari) temp?.curata();
});

async function mg(argumente, timeoutMs) {
  let cod = 0;
  let stdout = '';
  let stderr = '';
  try {
    ({ stdout, stderr } = await executa(process.execPath, [join(R, 'nucleu', 'mg.mjs'), ...argumente],
      { cwd: R, env: { ...process.env, MG_DEPANARE: '1' }, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs }));
  } catch (err) {
    if (typeof err.code !== 'number') throw err;
    ({ code: cod, stdout, stderr } = err);
  }
  return { cod, json: JSON.parse(stdout), stderr };
}
const rezumat = (r) => `${JSON.stringify({ cod: r.cod, erori: r.json.erori, avertismente: r.json.avertismente }, null, 2)}\n${String(r.stderr).slice(-2000)}`;

test('grafic.date.json pe Remotion: C10 și C17 verzi la --doar-verificare, MP4-ul schiței cu 672 de cadre', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 30 * MINUT }, async () => {
  const proiect = 'grafic';
  const dirProiect = join(R, 'video', proiect);
  let r = await mg(['nou', proiect, '--sablon', 'date-serie', '--json'], 5 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  copyFileSync(join(DIR_SABLON, 'exemple', 'grafic.date.json'), join(dirProiect, 'date.json'));

  r = await mg(['randeaza', proiect, '--doar-verificare', '--json'], 15 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  let v = citesteJson(join(dirProiect, 'verificare.json'));
  for (const cod of ['C10', 'C17']) assert.equal(v.verificari.find((x) => x.cod === cod)?.ok, true, `${cod}: ${JSON.stringify(v.verificari.find((x) => x.cod === cod))}`);
  const props = citesteJson(join(dirProiect, 'build', 'props.json'));
  assert.equal(props.cadre, 672);
  for (const f of props.fonturi) assert.ok(existsSync(join(dirProiect, 'build', ...f.url.split('/'))), `lipsește build/${f.url}`);

  r = await mg(['randeaza', proiect, '--schita', '--json'], 20 * MINUT);
  assert.equal(r.cod, 0, rezumat(r));
  v = citesteJson(join(dirProiect, 'verificare.json'));
  assert.equal(v.ok, true, JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2));
  assert.equal(v.schita.check_la_tranzitii, null);
  const dirSchita = readdirSync(join(dirProiect, 'cadre')).find((n) => /^schita-\d+$/.test(n));
  assert.ok(dirSchita, 'lipsește cadre/schita-N/');
  const info = await probeazaMp4(join(dirProiect, 'cadre', dirSchita, 'schita.mp4'), { ffprobe: ff.ffprobe });
  assert.equal(info.video.latime, 540);
  assert.equal(info.video.inaltime, 960);
  assert.equal(info.video.cadre, 672);
  assert.equal(existsSync(join(dirProiect, `${proiect}.mp4`)), false, '--schita nu scrie MP4-ul proiectului');
});
