// Aserțiunile de mișcare ale reelului cu hyperframes check real (planul F, F11): exemplele, minim pe „plin” și minim cu muzică.
// Rulare: MG_TESTE_INTEGRARE=1 node --test --test-concurrency=1 teste/integrare/miscare-reel.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { descarcaRezerva, platforma, rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { checkJson, ruleazaHyperframes } from '../../nucleu/lib/motor-hf.mjs';
import { citesteVersiuni } from '../../nucleu/lib/versiuni.mjs';
import { pregatesteBuild } from '../../nucleu/lib/randeaza/pregatire.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const motivSarit = sari && 'setează MG_TESTE_INTEGRARE=1';
const RADACINA = radacinaAgent(import.meta.url, 2);
const DIR_EXEMPLE = path.join(RADACINA, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat', 'exemple');
const FIXTURE_MUZICA = path.join(RADACINA, 'teste', 'fixtures', 'muzica', 'exemplu-muzica.mp3');

async function ffReale() {
  try {
    return await rezolvaFfmpeg(RADACINA);
  } catch (err) {
    if (err?.eroareMg?.cod !== 'ffmpeg-lipsa') throw err;
    const versiuni = await citesteVersiuni(RADACINA);
    if (!versiuni.ffmpeg?.rezerva?.[platforma()]?.ffprobe) throw err;
    await descarcaRezerva(RADACINA, 'ffprobe', versiuni);
    return rezolvaFfmpeg(RADACINA);
  }
}

let temp = null;
let R = null;
const legaturi = [];

// Rădăcina temporară ca în randeaza-verificare.test.mjs: nucleu/ și motoare/ copiate (pregatesteBuild încarcă șablonul
// din rădăcină), node_modules și unelte/ffmpeg legate prin junction, ca ștergerea să nu le atingă.
function copiazaFaraNodeModules(rel) {
  fs.cpSync(path.join(RADACINA, rel), path.join(R, rel), {
    recursive: true,
    filter: (sursa) => !sursa.split(/[\\/]/).includes('node_modules') && !/[\\/]nucleu[\\/]\.(stare\.json|canar|canar-refuzuri)$/.test(sursa),
  });
}

function leaga(rel) {
  const legatura = path.join(R, rel);
  fs.mkdirSync(path.dirname(legatura), { recursive: true });
  fs.symlinkSync(path.join(RADACINA, rel), legatura, 'junction');
  legaturi.push(legatura);
}

before(async () => {
  if (sari) return;
  await ffReale(); // rezerva ffprobe, dacă lipsește, se descarcă în repo înainte de legarea lui unelte/ffmpeg
  temp = creeazaRadacinaTemp({ biblioteciMini: true });
  R = temp.radacina;
  copiazaFaraNodeModules('nucleu');
  copiazaFaraNodeModules('motoare');
  leaga(path.join('nucleu', 'node_modules'));
  leaga(path.join('motoare', 'hyperframes', 'node_modules'));
  if (fs.existsSync(path.join(RADACINA, 'unelte', 'ffmpeg'))) leaga(path.join('unelte', 'ffmpeg'));
});

after(() => {
  for (const legatura of legaturi) fs.unlinkSync(legatura);
  temp?.curata();
});

const citesteExemplu = (nume) => JSON.parse(fs.readFileSync(path.join(DIR_EXEMPLE, `${nume}.json`), 'utf8'));

const CAZURI = [
  { caz: 'minim', proiect: 'minim', date: () => citesteExemplu('minim') },
  { caz: '01-rutina-preluata', proiect: 'rutina', date: () => citesteExemplu('01-rutina-preluata') },
  { caz: '02-programari-25s', proiect: 'programari', date: () => citesteExemplu('02-programari-25s') },
  { caz: 'minim pe plin', proiect: 'minim-plin', date: () => {
    const d = citesteExemplu('minim');
    d.stil = { ...(d.stil ?? {}), atmosfera: 'plin' };
    return d;
  } },
  { caz: 'minim cu muzică', proiect: 'minim-muzica', muzica: true, date: () => {
    const d = citesteExemplu('minim');
    d.muzica = { fisier: 'resurse/piesă de test.mp3', volum: 0.4, incepe_de_la: 2 };
    return d;
  } },
];

for (const { caz, proiect, date, muzica } of CAZURI) {
  test(`${caz}: index.motion.json are aserțiunile reelului și hyperframes check nu dă nicio găsire motion`, { skip: motivSarit, timeout: 15 * 60 * 1000 }, async (t) => {
    await comandaNou({ radacina: R, proiect, sablon: 'reel-ilustrat' });
    const dirProiect = path.join(R, 'video', proiect);
    fs.writeFileSync(path.join(dirProiect, 'date.json'), `${JSON.stringify(date(), null, 2)}\n`);
    if (muzica) {
      fs.mkdirSync(path.join(dirProiect, 'resurse'), { recursive: true });
      fs.copyFileSync(FIXTURE_MUZICA, path.join(dirProiect, 'resurse', 'piesă de test.mp3'));
    }

    const p = await pregatesteBuild({ radacina: R, proiect, mod: 'doar-verificare' });
    assert.deepEqual(p.erori, []);
    const motion = JSON.parse(fs.readFileSync(path.join(p.cai.build, 'index.motion.json'), 'utf8'));
    assert.ok(motion.assertions.some((a) => a.kind === 'keepsMoving'));
    assert.ok(motion.assertions.some((a) => a.kind === 'appearsBy'));
    const keepsMoving = motion.assertions.find((a) => a.kind === 'keepsMoving');
    t.diagnostic(`${caz}: keepsMoving ${JSON.stringify(keepsMoving)}, ${motion.assertions.length} aserțiuni`);

    // Cu muzică (revizia F5): build/assets/muzica.m4a și elementul <audio> există când pornește hyperframes check.
    const m4a = path.join(p.cai.build, 'assets', 'muzica.m4a');
    const html = fs.readFileSync(path.join(p.cai.build, 'index.html'), 'utf8');
    if (muzica) {
      assert.ok(fs.existsSync(m4a) && fs.statSync(m4a).size > 0, 'build/assets/muzica.m4a lipsește înainte de check');
      assert.equal(html.split('<audio id="muzica" src="assets/muzica.m4a"').length - 1, 1);
      assert.deepEqual(p.asteptari.audio, { prezent: true, durata: p.cronologie.durata });
    } else {
      assert.equal(fs.existsSync(m4a), false);
      assert.equal(html.includes('<audio'), false);
    }

    const ff = await ffReale();
    await ruleazaHyperframes(['browser', 'ensure'], { radacina: RADACINA, ff });
    const r = await checkJson(p.cai.build, { radacina: RADACINA, ff });
    const gasiri = (r.motion?.findings ?? []).filter((f) => f.severity === 'error');
    t.diagnostic(`${caz}: ${JSON.stringify(gasiri)}`);
    assert.deepEqual(gasiri.map((f) => `${f.code} ${f.selector ?? ''} ${f.message}`), []);
    assert.equal(r.ok, true, JSON.stringify(r, null, 2).slice(0, 4000));
  });
}
