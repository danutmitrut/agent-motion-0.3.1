// Părintele din testele de oprire a copiilor (teste/unitar/procese.test.mjs, teste/integrare/procese-ffmpeg.test.mjs).
// Pornește un copil prin ruleazaFfmpeg și apoi se oprește în felul cerut: semnal (îl trimite testul), excepție
// neprinsă, process.exit sau termen depășit. Argumente: <mod> <fisier-pid>.
// Copilul fals e node însuși (merge pe orice platformă): își scrie pid-ul în <fisier-pid> și stă pe loc.
// Cu modul „ffmpeg”, copilul e ffmpeg-ul kitului, pe o sursă lavfi de 120 s citită în timp real (-re).
// Cu modul „randare” (argumente: randare <fisier-pid> <radacina> <proiect>), mg randează complet un proiect deja
// aprobat, deci pornește hyperframes, iar acesta pornește Chrome (chrome-headless-shell).
import fs from 'node:fs';
import { radacinaAgent } from '../../../nucleu/lib/cai.mjs';
import { rezolvaFfmpeg, ruleazaFfmpeg } from '../../../nucleu/lib/ffmpeg.mjs';

const [mod, fisierPid] = process.argv.slice(2);
const COPIL_FALS = ['-e', "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);", fisierPid];

async function asteaptaPid() {
  while (!fs.existsSync(fisierPid) || fs.readFileSync(fisierPid, 'utf8') === '') await new Promise((r) => setTimeout(r, 20));
}

if (mod === 'randare') {
  const [radacina, proiect] = process.argv.slice(4);
  const { comandaRandeaza } = await import('../../../nucleu/lib/randeaza/index.mjs');
  fs.writeFileSync(fisierPid, String(process.pid));
  // „ieșire”: când testul scrie <fisier-pid>.opreste, mg iese cu process.exit în mijlocul randării
  const semnalIesire = `${fisierPid}.opreste`;
  setInterval(() => { if (fs.existsSync(semnalIesire)) process.exit(3); }, 50).unref();
  await comandaRandeaza({ radacina, proiect, mod: 'complet' });
} else if (mod === 'ffmpeg') {
  const ff = await rezolvaFfmpeg(radacinaAgent(import.meta.url, 3));
  ruleazaFfmpeg(['-v', 'error', '-nostdin', '-re', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=120', '-f', 'null', '-'], { ffmpeg: ff.ffmpeg });
  fs.writeFileSync(`${fisierPid}.parinte`, String(process.pid));
  setInterval(() => {}, 1000);
} else if (mod === 'termen') {
  const r = await ruleazaFfmpeg(COPIL_FALS, { ffmpeg: process.execPath, timeoutMs: 1500 });
  process.stdout.write(JSON.stringify({ cod: r.cod, stderr: r.stderr }));
} else {
  ruleazaFfmpeg(COPIL_FALS, { ffmpeg: process.execPath });
  await asteaptaPid();
  if (mod === 'exceptie') setTimeout(() => { throw new Error('excepție neprinsă, intenționată'); }, 10);
  else if (mod === 'exit') setTimeout(() => process.exit(3), 300);
  else setInterval(() => {}, 1000); // „semnal”: testul trimite SIGTERM sau SIGINT
}
