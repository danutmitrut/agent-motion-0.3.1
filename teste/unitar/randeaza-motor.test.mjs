import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { valideazaConstruit, ARGUMENTE_FIXATE } from '../../nucleu/lib/randeaza/construit.mjs';
import { argumenteRandare, comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { legaFisier } from '../../nucleu/lib/fisiere.mjs';
import { citesteJurnalFals, instaleazaHyperframesFals } from '../ajutoare/binare-false.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { legaDinRepo } from '../ajutoare/radacina-motoare.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = path.join(REPO, 'teste', 'fixtures', 'filmare');
const BRUT = JSON.parse(fs.readFileSync(path.join(FIX, 'scurt.transcriere.json'), 'utf8')).cuvinte.map(({ text, start, end }) => ({ text, start, end }));

test('valideazaConstruit refuză argumentele pe care le fixează nucleul, singure sau cu =', () => {
  const cu = (motor) => () => valideazaConstruit({ intrare: 'index.html', fisiere: ['index.html'], motor }, 'x');
  assert.doesNotThrow(cu({ check: { argumente: ['--strict', '--caption-zone', 'x0=0;y0=0.6458;x1=1;y1=0.8021;severity=error'] }, randare: { argumente: ['--no-best-effort'] } }));
  for (const a of ARGUMENTE_FIXATE.randare) {
    assert.throws(cu({ randare: { argumente: [a, '1'] } }), new RegExp(`motor\\.randare.*${a.replace(/-/g, '\\-')}`));
    assert.throws(cu({ randare: { argumente: [`${a}=1`] } }), TypeError);
  }
  assert.throws(cu({ check: { argumente: ['--json'] } }), TypeError);
});

test('argumenteRandare: argumentele nucleului, apoi ale șablonului', () => {
  assert.deepEqual(argumenteRandare({ build: 'B', iesire: 'O.mp4', fps: 25, motor: { randare: { argumente: ['--no-best-effort', '--frames-cache-dir', 'C'] } } }),
    ['render', 'B', '-o', 'O.mp4', '--quality', 'looks', '--fps', '25', '--strict', '--quiet', '--no-best-effort', '--frames-cache-dir', 'C']);
  assert.deepEqual(argumenteRandare({ build: 'B', iesire: 'O.mp4', fps: 30 }).slice(-2), ['--strict', '--quiet']);
});

test('legaFisier: hardlink pe același volum, destinația veche înlocuită', (t) => {
  const r = creeazaRadacinaTemp();
  t.after(r.curata);
  const a = path.join(r.radacina, 'a.bin');
  const b = path.join(r.radacina, 'b.bin');
  fs.writeFileSync(a, 'nou');
  fs.writeFileSync(b, 'vechi');
  assert.equal(legaFisier(a, b), 'hardlink');
  assert.equal(fs.readFileSync(b, 'utf8'), 'nou');
});

test('mg randeaza --doar-verificare pe proba-filmare: check primește argumentele șablonului', async (t) => {
  const r = creeazaRadacinaTemp({ sablonProbaFilmare: true, biblioteciMini: true, copiaza: ['nucleu/VERSIUNI.json', 'nucleu/lib'] });
  let scoateLegaturile = () => {};
  t.after(() => { scoateLegaturile(); r.curata(); });
  instaleazaHyperframesFals(r.radacina);
  // binarele ffmpeg (ffmpeg-static, rezerva din unelte/ffmpeg) nu se copiază în rădăcina temporară: junction spre repo;
  // legăturile se scot înaintea ștergerii recursive (ajutorul comun din radacina-motoare.mjs)
  ({ scoateLegaturile } = legaDinRepo(r.radacina, ['nucleu/node_modules', 'unelte/ffmpeg']));
  process.env.MG_FALS_JURNAL = path.join(r.radacina, 'jurnal-fals.jsonl');
  t.after(() => { delete process.env.MG_FALS_JURNAL; });
  const ff = await rezolvaFfmpeg(REPO);
  const servicii = { ff, stareParakeet: () => ({ instalat: true }), instaleazaParakeet: async () => {}, transcrie: async () => ({ brut: BRUT }), importaTranscriere: async () => { throw new Error('nu'); } };
  assert.equal((await comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'), servicii })).ok, true);
  const rez = await comandaRandeaza({ radacina: r.radacina, proiect: 'clip', mod: 'doar-verificare' });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori, null, 2));
  const check = citesteJurnalFals(r.radacina).find((x) => x.argv[1] === 'check');
  assert.deepEqual(check.argv.slice(3), ['--json', '--strict', '--caption-zone', 'x0=0;y0=0.6458;x1=1;y1=0.8021;severity=error;seek=0.5']);
  const cron = JSON.parse(fs.readFileSync(path.join(r.radacina, 'video', 'clip', 'build', 'cronologie.json'), 'utf8'));
  assert.equal(cron.fundal, 'filmare');
  assert.equal(cron.sursa_video.fisier, 'build/filmare.mp4');
  assert.ok(fs.existsSync(path.join(r.radacina, 'video', 'clip', 'build', 'filmare.mp4')));
});
