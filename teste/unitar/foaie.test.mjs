// foaie.mjs: ramurile care nu cer ffmpeg (instantanee lipsă sau în plus) și cuvintele rostite din foaie (cu ffmpeg real, pe scurt.mp4). Pe imagini reale, vezi teste/integrare/randeaza-schita.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { alegeMomentePredare, cadrePredare, foaieDinInstantanee, genereazaFoaie, secundaCautare } from '../../nucleu/lib/foaie.mjs';
import { fileURLToPath } from 'node:url';
import { rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const FF = { ffmpeg: '/nu/exista/ffmpeg', ffprobe: '/nu/exista/ffprobe' };
const momente = (n) => Array.from({ length: n }, (_, i) => ({ t: i + 0.5, ref: `Scena ${i + 1}`, eticheta: `Scena ${i + 1}, mijloc` }));

test('foieDinInstantanee ia doar frame-NN-at-<t>s.png, nu orice PNG din cadre/', async () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const cadre = join(radacina, 'cadre');
    mkdirSync(join(cadre, 'schita-1'), { recursive: true });
    writeFileSync(join(cadre, 'desene.png'), 'x');
    writeFileSync(join(cadre, 'predare-1.png'), 'x');
    writeFileSync(join(cadre, 'schita-1', 'contact-sheet.jpg'), 'x');
    writeFileSync(join(cadre, 'schita-1', 'desene.png'), 'x');
    writeFileSync(join(cadre, 'schita-1', 'frame-00-at-0.5s.png'), 'x');
    const dateJpg = join(cadre, 'foaie-schita-1.jpg');
    const dateJson = join(cadre, 'foaie-schita-1.json');
    // un singur instantaneu valid, două momente: numărătoarea nu trebuie să prindă desene.png
    await assert.rejects(
      foaieDinInstantanee({ dirInstantanee: join(cadre, 'schita-1'), momente: momente(2), iesireJpg: dateJpg, iesireJson: dateJson, ff: FF }),
      (e) => e.eroareMg?.cod === 'foaie-lipsa' && /1 instantanee/.test(e.eroareMg.mesaj),
    );
    // folderul cadre/ însuși, cu doar PNG-uri străine: zero instantanee
    await assert.rejects(
      foaieDinInstantanee({ dirInstantanee: cadre, momente: momente(1), iesireJpg: dateJpg, iesireJson: dateJson, ff: FF }),
      (e) => e.eroareMg?.cod === 'foaie-lipsa' && /0 instantanee/.test(e.eroareMg.mesaj),
    );
    // folder lipsă
    await assert.rejects(
      foaieDinInstantanee({ dirInstantanee: join(cadre, 'schita-9'), momente: momente(1), iesireJpg: dateJpg, iesireJson: dateJson, ff: FF }),
      (e) => e.eroareMg?.cod === 'foaie-lipsa',
    );
    assert.equal(existsSync(dateJpg) || existsSync(dateJson), false, 'la eroare nu se scrie nimic');
  } finally {
    curata();
  }
});

test('secundaCautare coboară cu o jumătate de cadru și nu iese sub zero', () => {
  assert.equal(secundaCautare(1.967, 30), '1.9503');
  assert.equal(secundaCautare(0, 30), '0.0000');
});

test('foaie-lipsa spune numele real al proiectului în sugestie, cu --schita la foaia schiței (fără <proiect> literal)', async () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const cadre = join(radacina, 'cadre');
    mkdirSync(cadre, { recursive: true });
    const cuProiect = foaieDinInstantanee({
      dirInstantanee: join(cadre, 'schita-9'), momente: momente(1), iesireJpg: join(cadre, 'f.jpg'), iesireJson: join(cadre, 'f.json'), ff: FF, proiect: 'reel-ana',
    });
    await assert.rejects(cuProiect, (e) => {
      assert.match(e.eroareMg.sugestie, /node nucleu\/mg\.mjs randeaza reel-ana --schita;/);
      assert.doesNotMatch(e.eroareMg.sugestie, /<proiect>/);
      return true;
    });
    await assert.rejects(
      genereazaFoaie({ mp4: join(cadre, 'x.mp4'), momente: [], iesireJpg: join(cadre, 'f.jpg'), iesireJson: join(cadre, 'f.json'), ff: FF, proiect: 'reel-ana' }),
      (e) => /randeaza reel-ana;/.test(e.eroareMg.sugestie) && !/--schita/.test(e.eroareMg.sugestie),
    );
    await assert.rejects(
      cadrePredare({ mp4: join(cadre, 'x.mp4'), momente: momente(1), dirCadre: cadre, ff: FF, proiect: 'reel-ana' }),
      (e) => e.eroareMg?.cod === 'ffmpeg-lipsa',
      'fără ffprobe, cadrele de predare dau ffmpeg-lipsa, nu foaie-lipsa',
    );
  } finally {
    curata();
  }
});

test('genereazaFoaie cu transcriere scrie „rostit” în fiecare celulă (cuvintele din ± 1 s); fără transcriere, cheia lipsește', async () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const ff = await rezolvaFfmpeg(repo);
  const mp4 = join(repo, 'teste', 'fixtures', 'filmare', 'scurt.mp4');
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const cadre = join(radacina, 'cadre');
    mkdirSync(cadre, { recursive: true });
    const m = [{ t: 0.5, ref: 'A', eticheta: 'a' }, { t: 2, ref: 'B', eticheta: 'b' }];
    const transcriere = [{ start: 0.2, end: 0.5, text: 'Bună,' }, { start: 0.6, end: 0.9, text: 'sunt' }, { start: 4, end: 4.3, text: 'departe' }];
    await genereazaFoaie({ mp4, momente: m, iesireJpg: join(cadre, 'f1.jpg'), iesireJson: join(cadre, 'f1.json'), ff, transcriere });
    const cu = JSON.parse(readFileSync(join(cadre, 'f1.json'), 'utf8'));
    assert.deepEqual(cu.celule.map((c) => c.rostit), ['Bună, sunt', '']);
    await genereazaFoaie({ mp4, momente: m, iesireJpg: join(cadre, 'f2.jpg'), iesireJson: join(cadre, 'f2.json'), ff });
    const fara = JSON.parse(readFileSync(join(cadre, 'f2.json'), 'utf8'));
    assert.ok(fara.celule.every((c) => !('rostit' in c)));
  } finally {
    curata();
  }
});

test('predarea nu alege niciodată un moment de tranziție (cronologia date-serie din cererea 14 din GATA.md)', () => {
  const m = [
    { t: 0.6, ref: 'Scena 1', eticheta: 'Scena 1, complet' },
    { t: 2.8, ref: 'Scena 2', eticheta: 'Tranziția spre scena 2' },
    { t: 3.8, ref: 'Scena 2', eticheta: 'Scena 2, complet' },
    { t: 6.9, ref: 'Scena 3', eticheta: 'Tranziția spre scena 3' },
    { t: 8.2, ref: 'Scena 3', eticheta: 'Scena 3, complet' },
    { t: 10.5, ref: 'Scena 4', eticheta: 'Tranziția spre scena 4' },
    { t: 10.9, ref: 'Scena 4', eticheta: 'Scena 4, complet' },
    { t: 13.767, ref: 'Scena 4', eticheta: 'Ultimul cadru' },
  ];
  assert.deepEqual(alegeMomentePredare(m).map((x) => x.t), [0.6, 8.2, 13.767]);
  assert.deepEqual(alegeMomentePredare(m.slice(0, 4)).map((x) => x.t), [0.6, 3.8], 'cu cel mult 3 momente fără tranziții, le ia pe toate');
  assert.deepEqual(alegeMomentePredare(momente(5)).map((x) => x.t), [0.5, 2.5, 4.5], 'fără tranziții, primul, mijlocul și ultimul, ca până acum');
});
