// Transcodarea reală a muzicii (planul F, F5): ffmpeg-static, fixture-ul din teste/fixtures/muzica, cache-ul din active/muzica/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { descarcaRezerva, masoaraVolum, platforma, probeazaAudio, rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { pregatesteMuzica, valideazaMuzica } from '../../nucleu/lib/muzica.mjs';
import { citesteVersiuni } from '../../nucleu/lib/versiuni.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const motivSarit = sari && 'setează MG_TESTE_INTEGRARE=1';
const RADACINA = radacinaAgent(import.meta.url, 2);
const FIXTURE = path.join(RADACINA, 'teste', 'fixtures', 'muzica', 'exemplu-muzica.mp3');

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

function proiect(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg muzică Ăîș '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'resurse'), { recursive: true });
  fs.copyFileSync(FIXTURE, path.join(dir, 'resurse', 'piesă de test.mp3'));
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  return dir;
}

test('piesa de 45 s, tăiată la 12 s: AAC, durata exactă, nivel în pragurile C15, coada stinsă; a doua oară din cache', { skip: motivSarit, timeout: 5 * 60 * 1000 }, async (t) => {
  const ff = await ffReale();
  const dir = proiect(t);
  const date = { muzica: { fisier: 'resurse/piesă de test.mp3', volum: 0.4, incepe_de_la: 2 } };
  const v = await valideazaMuzica(date, { dirProiect: dir, ff });
  assert.deepEqual(v.erori, []);
  assert.ok(Math.abs(v.muzica.durata - 45) < 0.1, `durata piesei ${v.muzica.durata}`);

  const dirBuild = path.join(dir, 'build');
  const prima = await pregatesteMuzica({ muzica: v.muzica, durata: 12, dirProiect: dir, dirBuild, ff });
  assert.equal(prima.din_cache, false);
  const iesire = path.join(dirBuild, 'assets', 'muzica.m4a');
  const info = await probeazaAudio(iesire, { ffprobe: ff.ffprobe });
  assert.equal(info.codec, 'aac');
  assert.equal(info.piste, 1);
  assert.ok(Math.abs(info.durata - 12) <= 0.05, `durata ${info.durata}`);
  const tot = await masoaraVolum(iesire, { ffmpeg: ff.ffmpeg });
  const coada = await masoaraVolum(iesire, { ffmpeg: ff.ffmpeg, start: 11.5 });
  t.diagnostic(`nivel: medie ${tot.medie} dB, vârf ${tot.maxim} dB, coada ${coada.medie} dB`);
  assert.ok(tot.medie > -35 && tot.maxim <= -0.5 && coada.medie <= tot.medie - 10);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'active', 'muzica')), [`${prima.cheie}.m4a`]);

  fs.rmSync(dirBuild, { recursive: true, force: true });
  fs.mkdirSync(dirBuild);
  const aDoua = await pregatesteMuzica({ muzica: v.muzica, durata: 12, dirProiect: dir, dirBuild, ff });
  assert.deepEqual(aDoua, { cheie: prima.cheie, din_cache: true });
  assert.ok(fs.existsSync(iesire));
});

test('alt volum dă altă cheie; fișierul vechi din cache se curăță; piesa mai scurtă decât videoul se completează cu liniște', { skip: motivSarit, timeout: 5 * 60 * 1000 }, async (t) => {
  const ff = await ffReale();
  const dir = proiect(t);
  const dirBuild = path.join(dir, 'build');
  const v = await valideazaMuzica({ muzica: { fisier: 'resurse/piesă de test.mp3', volum: 0.4, incepe_de_la: 35 } }, { dirProiect: dir, ff });
  assert.deepEqual(v.erori, []);
  const a = await pregatesteMuzica({ muzica: v.muzica, durata: 15, dirProiect: dir, dirBuild, ff });
  const b = await pregatesteMuzica({ muzica: { ...v.muzica, volum: 0.6 }, durata: 15, dirProiect: dir, dirBuild, ff });
  assert.notEqual(a.cheie, b.cheie);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'active', 'muzica')), [`${b.cheie}.m4a`]);
  const iesire = path.join(dirBuild, 'assets', 'muzica.m4a');
  const info = await probeazaAudio(iesire, { ffprobe: ff.ffprobe });
  assert.ok(Math.abs(info.durata - 15) <= 0.05, `durata ${info.durata}`);
  const final = await masoaraVolum(iesire, { ffmpeg: ff.ffmpeg, start: 12 });
  assert.ok(final.maxim < -60, `după capătul piesei (10 s de muzică) trebuie liniște, vârf ${final.maxim} dB`);
});

test('un fișier stricat din cache (alt codec sau altă durată) se reface, nu se copiază', { skip: motivSarit, timeout: 5 * 60 * 1000 }, async (t) => {
  const ff = await ffReale();
  const dir = proiect(t);
  const dirBuild = path.join(dir, 'build');
  const v = await valideazaMuzica({ muzica: { fisier: 'resurse/piesă de test.mp3' } }, { dirProiect: dir, ff });
  const a = await pregatesteMuzica({ muzica: v.muzica, durata: 8, dirProiect: dir, dirBuild, ff });
  fs.writeFileSync(path.join(dir, 'active', 'muzica', `${a.cheie}.m4a`), 'stricat');
  const b = await pregatesteMuzica({ muzica: v.muzica, durata: 8, dirProiect: dir, dirBuild, ff });
  assert.deepEqual(b, { cheie: a.cheie, din_cache: false });
  const info = await probeazaAudio(path.join(dirBuild, 'assets', 'muzica.m4a'), { ffprobe: ff.ffprobe });
  assert.equal(info.codec, 'aac');
});
