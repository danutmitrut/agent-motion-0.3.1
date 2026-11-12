import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { radacinaAgent, caiProiect } from '../../nucleu/lib/cai.mjs';
import { rotunjeste } from '../../nucleu/lib/cronologie.mjs';
import { rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { genereazaFoaie, foaieDinInstantanee, cadrePredare } from '../../nucleu/lib/foaie.mjs';
import { citesteLock } from '../../nucleu/lib/lock.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const MOTIV = 'setează MG_TESTE_INTEGRARE=1';
const REPO = radacinaAgent(import.meta.url, 2);

function dimensiuni(ffprobe, cale) {
  const iesire = execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', cale], {
    encoding: 'utf8',
  });
  const [w, h] = iesire.trim().split(',').map(Number);
  return { w, h };
}

/** Toate fișierele .mp4 de sub un folder, căutate recursiv. */
function mp4Sub(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.toLowerCase().endsWith('.mp4'));
}

test('genereazaFoaie, foaieDinInstantanee și cadrePredare pe imagini generate cu lavfi', { skip: sari && MOTIV, timeout: 120000 }, async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp();
  t.after(curata);
  const ff = await rezolvaFfmpeg(REPO);
  const mp4 = path.join(radacina, 'proba.mp4');
  const gen = await ruleazaFfmpeg(
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4],
    { ffmpeg: ff.ffmpeg },
  );
  assert.equal(gen.cod, 0, gen.stderr);

  const momente = [0, 0.5, 1, 1.5, 1.967].map((x, i) => ({ t: x, ref: `Scena ${i + 1}`, eticheta: `Scena ${i + 1}, complet` }));
  const dirCadre = path.join(radacina, 'cadre');
  const jpg = path.join(dirCadre, 'foaie-1.jpg');
  const json = path.join(dirCadre, 'foaie-1.json');
  const { celule } = await genereazaFoaie({ mp4, momente, iesireJpg: jpg, iesireJson: json, ff });
  assert.equal(celule, 5);
  assert.deepEqual(dimensiuni(ff.ffprobe, jpg), { w: 1080, h: 960 });
  const etichete = JSON.parse(fs.readFileSync(json, 'utf8'));
  assert.equal(etichete.versiune, 1);
  assert.equal(etichete.mp4, '../proba.mp4');
  assert.equal(etichete.celule.length, 5);
  assert.deepEqual(etichete.celule[0], { index: 1, t: 0, eticheta: 'Scena 1, complet', ref: 'Scena 1', rand: 1, coloana: 1 });
  assert.deepEqual(etichete.celule[4], { index: 5, t: 1.967, eticheta: 'Scena 5, complet', ref: 'Scena 5', rand: 2, coloana: 1 });

  // instantaneele, cu numele pe care le scrie hyperframes snapshot, la rezoluția compoziției
  const dirInstantanee = path.join(dirCadre, 'schita-1');
  fs.mkdirSync(dirInstantanee, { recursive: true });
  const mijloace = [0.5, 1, 1.5];
  for (const [i, x] of mijloace.entries()) {
    const png = path.join(dirInstantanee, `frame-${String(i).padStart(2, '0')}-at-${x}s.png`);
    const r = await ruleazaFfmpeg(['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:d=1:r=1', '-frames:v', '1', png], { ffmpeg: ff.ffmpeg });
    assert.equal(r.cod, 0, r.stderr);
  }
  fs.writeFileSync(path.join(dirInstantanee, 'contact-sheet.jpg'), 'foaia lui HyperFrames, ignorată');
  const jpgSchita = path.join(dirCadre, 'foaie-schita-1.jpg');
  const jsonSchita = path.join(dirCadre, 'foaie-schita-1.json');
  const momenteSchita = mijloace.map((x, i) => ({ t: x, ref: `Scena ${i + 1}`, eticheta: `Scena ${i + 1}, mijloc` }));
  const schita = await foaieDinInstantanee({ dirInstantanee, momente: momenteSchita, iesireJpg: jpgSchita, iesireJson: jsonSchita, ff });
  assert.equal(schita.celule, 3);
  assert.deepEqual(dimensiuni(ff.ffprobe, jpgSchita), { w: 810, h: 480 });
  const eticheteSchita = JSON.parse(fs.readFileSync(jsonSchita, 'utf8'));
  assert.equal(eticheteSchita.mp4, null);
  assert.equal(eticheteSchita.instantanee, 'schita-1');
  assert.deepEqual(eticheteSchita.celule[2], { index: 3, t: 1.5, eticheta: 'Scena 3, mijloc', ref: 'Scena 3', rand: 1, coloana: 3 });
  await assert.rejects(
    foaieDinInstantanee({ dirInstantanee, momente: momenteSchita.slice(0, 2), iesireJpg: jpgSchita, iesireJson: jsonSchita, ff }),
    (e) => e.eroareMg?.cod === 'foaie-lipsa',
  );

  fs.writeFileSync(path.join(dirCadre, 'predare-3.png'), 'rămas dintr-o rundă veche');
  const doua = await cadrePredare({ mp4, momente: momente.slice(0, 2), dirCadre, ff });
  assert.equal(doua.length, 2);
  assert.equal(fs.existsSync(path.join(dirCadre, 'predare-3.png')), false);

  const trei = await cadrePredare({ mp4, momente, dirCadre, ff });
  assert.deepEqual(trei, [1, 2, 3].map((k) => path.join(dirCadre, `predare-${k}.png`)));
  assert.deepEqual(dimensiuni(ff.ffprobe, trei[2]), { w: 1080, h: 1920 });
});

test('mg randeaza --schita pe exemplul minim, fără aprobare și fără MP4', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  t.after(() => {
    // junction-urile s-au desfăcut înainte de ștergere: node_modules din repo trebuie să fie intacte
    for (const rel of ['nucleu/node_modules', 'motoare/hyperframes/node_modules']) {
      assert.equal(fs.existsSync(path.join(REPO, rel, '.package-lock.json')) || fs.readdirSync(path.join(REPO, rel)).length > 0, true, `${rel} din repo trebuie să rămână intact`);
    }
  });
  const proiect = 'schita-test';
  const nou = await comandaNou({ radacina, proiect, sablon: 'reel-ilustrat' });
  assert.equal(nou.ok, true, JSON.stringify(nou.erori));
  const cai = caiProiect(radacina, proiect);

  // mg desen arata (B05) poate lăsa desene.png în cadre/: nu e instantaneu de schiță și nu intră în foaie
  fs.mkdirSync(cai.cadre, { recursive: true });
  fs.writeFileSync(path.join(cai.cadre, 'desene.png'), 'rămas de la mg desen arata');

  const r = await comandaRandeaza({ radacina, proiect, mod: 'schita' });
  assert.equal(r.ok, true, JSON.stringify(r.erori));
  assert.equal(citesteLock(cai.lock).aprobare, null, 'schița nu cere și nu scrie aprobarea');
  assert.deepEqual(r.rezultat.revizie, { runde_scrise: 0, plafon: 3, peste_plafon: false, mesaj: 'Revizia vizuală: 0 din 3 runde de schiță folosite.' }, 'P1: rundele schiței, separate de cele complete');

  // spec 7.1: fără MP4, nici în build/, nici în folderul proiectului
  assert.deepEqual(mp4Sub(cai.build), [], 'schița nu scrie niciun MP4 în build/');
  assert.equal(fs.existsSync(cai.mp4), false, 'schița nu atinge MP4-ul final');

  // check --json --at-transitions a rulat și a ieșit verde
  assert.equal(r.rezultat.schita.check.la_tranzitii, true);
  assert.equal(r.rezultat.schita.check.ok, true, JSON.stringify(r.rezultat.schita.check.gasiri));
  const checkBrut = JSON.parse(fs.readFileSync(path.join(cai.cadre, 'schita-1', 'check.json'), 'utf8'));
  assert.equal(checkBrut._meta.version, '0.8.96');

  // instantanee la mijlocul fiecărei scene și foaia schiței compusă din ele
  const cron = JSON.parse(fs.readFileSync(path.join(cai.build, 'cronologie.json'), 'utf8'));
  const mijloace = [...new Set(cron.segmente.map((s) => rotunjeste((s.start + s.sfarsit) / 2)))];
  const instantanee = fs.readdirSync(path.join(cai.cadre, 'schita-1')).filter((f) => /^frame-\d+-at-.+\.png$/.test(f));
  assert.equal(instantanee.length, mijloace.length);
  const etichete = JSON.parse(fs.readFileSync(path.join(cai.cadre, 'foaie-schita-1.json'), 'utf8'));
  assert.equal(etichete.mp4, null);
  assert.deepEqual(etichete.celule.map((c) => c.t), mijloace);
  assert.ok(etichete.celule.every((c) => /^Scena \d+, mijloc$/.test(c.eticheta)), JSON.stringify(etichete.celule));
  assert.equal(fs.existsSync(path.join(cai.cadre, 'foaie-schita-1.jpg')), true);

  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'schita');
  assert.equal(verificare.ok, true);
  assert.equal(verificare.mp4, null);
  assert.equal(verificare.sha256_mp4, null);
  assert.deepEqual(verificare.schita.check_la_tranzitii, { ok: true, erori: 0 });

  const { check, ...restul } = r.rezultat.schita;
  assert.deepEqual(restul, {
    foaie: `video/${proiect}/cadre/foaie-schita-1.jpg`,
    etichete: `video/${proiect}/cadre/foaie-schita-1.json`,
    celule: mijloace.length,
    instantanee: `video/${proiect}/cadre/schita-1`,
  });
  assert.equal(typeof check.avertismente, 'number');

  assert.equal(fs.readFileSync(path.join(cai.cadre, 'desene.png'), 'utf8'), 'rămas de la mg desen arata', 'desene.png rămâne neatins');

  // o rundă întreruptă a lăsat un folder schita-2/ fără foaie: următoarea schiță nu-l refolosește, nu amestecă instantaneele
  const veche = path.join(cai.cadre, 'schita-2');
  fs.mkdirSync(veche, { recursive: true });
  fs.writeFileSync(path.join(veche, 'frame-00-at-9s.png'), 'rămas dintr-o rundă întreruptă');
  const r2 = await comandaRandeaza({ radacina, proiect, mod: 'schita' });
  assert.equal(r2.ok, true, JSON.stringify(r2.erori));
  assert.equal(fs.existsSync(path.join(cai.cadre, 'foaie-schita-3.jpg')), true, 'a doua schiță reușită e runda 3');
  assert.equal(fs.existsSync(path.join(cai.cadre, 'foaie-schita-2.jpg')), false, 'runda întreruptă nu are foaie');
  assert.equal(fs.existsSync(path.join(cai.cadre, 'foaie-schita-1.jpg')), true, 'foaia rundei 1 rămâne');
  assert.equal(JSON.parse(fs.readFileSync(path.join(cai.cadre, 'foaie-schita-3.json'), 'utf8')).celule.length, mijloace.length);
  assert.deepEqual(mp4Sub(cai.build), []);
});
