import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { importaTranscriere } from '../../nucleu/lib/filmare/transcriere.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = path.join(REPO, 'teste', 'fixtures', 'filmare');
const ACUM = new Date('2026-10-18T10:00:00.000Z');
const BRUT = JSON.parse(fs.readFileSync(path.join(FIX, 'scurt.transcriere.json'), 'utf8')).cuvinte.map(({ text, start, end }) => ({ text, start, end }));
const codul = (cod) => (err) => err.eroareMg?.cod === cod;

async function servicii({ instalat = true, brut = BRUT } = {}) {
  const ff = await rezolvaFfmpeg(REPO);
  const apeluri = [];
  return {
    apeluri,
    ff,
    stareParakeet: () => ({ instalat, lipsa: instalat ? [] : ['runtime'] }),
    instaleazaParakeet: async () => { apeluri.push('instaleaza'); },
    transcrie: async (lucru, limba) => { apeluri.push(['transcrie', path.basename(lucru), limba]); return { brut }; },
    importaTranscriere: (fisier) => { apeluri.push(['importa', path.basename(fisier)]); return importaTranscriere(REPO, fisier, { ff }); },
  };
}
const radacina = () => creeazaRadacinaTemp({ sablonProbaFilmare: true, copiaza: ['nucleu/VERSIUNI.json', 'nucleu/lib'] });

test('frontmatter: intrare: filmare se încarcă; altă valoare e sablon-invalid', async (t) => {
  const r = radacina();
  t.after(r.curata);
  assert.equal((await incarcaSablon(r.radacina, 'proba-filmare')).meta.intrare, 'filmare');
  const md = path.join(r.radacina, 'motoare', 'hyperframes', 'sabloane', 'proba-filmare', 'SABLON.md');
  fs.writeFileSync(md, fs.readFileSync(md, 'utf8').replace('intrare: filmare', 'intrare: poza'));
  await assert.rejects(incarcaSablon(r.radacina, 'proba-filmare'), codul('sablon-invalid'));
});

test('mg nou cu filmare: originalul, copia de lucru, transcrierea, raportul, foaia, date.json și motor.lock', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = await servicii();
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'), acum: ACUM, servicii: s });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori));
  const dir = path.join(r.radacina, 'video', 'clip');
  for (const f of ['resurse/filmare-original.mp4', 'active/filmare-lucru.mp4', 'active/transcriere.json', 'active/transcriere.brut.json', 'active/raport.json', 'cadre/verificare-1fps.jpg', 'date.json', 'scenariu.md', 'jurnal.md', 'motor.lock']) {
    assert.ok(fs.existsSync(path.join(dir, f)), f);
  }
  assert.equal(sha256Fisier(path.join(dir, 'resurse', 'filmare-original.mp4')), sha256Fisier(path.join(FIX, 'scurt.mp4')));
  const date = JSON.parse(fs.readFileSync(path.join(dir, 'date.json'), 'utf8'));
  assert.deepEqual(date, { sablon: 'proba-filmare', versiune_schema: 1, format: 'vertical', filmare: { fisier: 'active/filmare-lucru.mp4' } });
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'motor.lock'), 'utf8'));
  assert.equal(lock.filmare.original.cale, 'resurse/filmare-original.mp4');
  assert.equal(lock.filmare.original.sha256, sha256Fisier(path.join(FIX, 'scurt.mp4')));
  assert.equal(lock.filmare.lucru.sha256, sha256Fisier(path.join(dir, 'active', 'filmare-lucru.mp4')));
  assert.equal(lock.filmare.transcriere.sha256, sha256Fisier(path.join(dir, 'active', 'transcriere.json')));
  assert.deepEqual([lock.filmare.fps, lock.filmare.latime, lock.filmare.inaltime], [30, 360, 640]);
  assert.equal(lock.filmare.transcriere.sursa, 'parakeet');
  assert.equal(lock.filmare.motor_transcriere.versiune, '1.13.8');
  assert.deepEqual(s.apeluri, [['transcrie', 'filmare-lucru.mp4', 'ro']]);
  const tr = JSON.parse(fs.readFileSync(path.join(dir, 'active', 'transcriere.json'), 'utf8'));
  assert.equal(tr.cuvinte[0].id, 'w0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'active', 'raport.json'), 'utf8')).cuvinte, tr.cuvinte.length);
  assert.match(fs.readFileSync(path.join(dir, 'jurnal.md'), 'utf8'), /filmare-original\.mp4/);
});

test('--transcriere .srt: importul real, cu sursa import, fără Parakeet', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = await servicii({ instalat: false });
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'),
    transcriere: path.join(FIX, 'scurt.srt'), acum: ACUM, servicii: s });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori));
  const tr = JSON.parse(fs.readFileSync(path.join(r.radacina, 'video', 'clip', 'active', 'transcriere.json'), 'utf8'));
  assert.equal(tr.sursa, 'import');
  assert.ok(tr.cuvinte.every((c) => Number.isInteger(c.fraza)));
  assert.deepEqual(s.apeluri, [['importa', 'scurt.srt']]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.radacina, 'video', 'clip', 'motor.lock'), 'utf8')).filmare.motor_transcriere, null);
});

test('Parakeet neinstalat, fără acord: transcriere-neinstalata, cod 2, nimic scris', async (t) => {
  const r = radacina();
  t.after(r.curata);
  await assert.rejects(comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'), acum: ACUM, servicii: await servicii({ instalat: false }) }),
    (e) => e.eroareMg?.cod === 'transcriere-neinstalata' && e.codIesire === 2 && /670 MB/.test(e.eroareMg.mesaj));
  assert.ok(!fs.existsSync(path.join(r.radacina, 'video', 'clip')));
});

test('Parakeet neinstalat, cu --instaleaza-transcrierea: instalează, apoi transcrie', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = await servicii({ instalat: false });
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'), instaleazaTranscrierea: true, acum: ACUM, servicii: s });
  assert.equal(rez.ok, true);
  assert.deepEqual(s.apeluri, ['instaleaza', ['transcrie', 'filmare-lucru.mp4', 'ro']]);
});

test('poarta: fără audio, proiectul nu rămâne; extensia și limba se refuză înainte de orice', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = await servicii();
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'fara-audio.mp4'), acum: ACUM, servicii: s });
  assert.equal(rez.ok, false);
  assert.deepEqual(rez.erori.map((e) => e.cod), ['filmare-fara-audio']);
  assert.ok(!fs.existsSync(path.join(r.radacina, 'video', 'clip')));
  await assert.rejects(comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.srt'), acum: ACUM, servicii: s }), codul('filmare-extensie'));
  await assert.rejects(comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'), limba: 'ja', acum: ACUM, servicii: s }), codul('limba-necunoscuta'));
  await assert.rejects(comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', acum: ACUM, servicii: s }), codul('filmare-lipsa'));
  await assert.rejects(comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'nu-exista.mp4'), acum: ACUM, servicii: s }), codul('filmare-necitita'));
});

test('transcrierea fără cuvinte: transcriere-goala, proiectul nu rămâne', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'clip', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'), acum: ACUM, servicii: await servicii({ brut: [] }) });
  assert.equal(rez.ok, false);
  assert.deepEqual(rez.erori.map((e) => e.cod), ['transcriere-goala']);
  assert.ok(!fs.existsSync(path.join(r.radacina, 'video', 'clip')));
});

test('--filmare la un șablon fără intrare: filmare e argument-necunoscut', async (t) => {
  const r = creeazaRadacinaTemp({ sablonProba: true, copiaza: ['nucleu/VERSIUNI.json', 'nucleu/lib'] });
  t.after(r.curata);
  await assert.rejects(comandaNou({ radacina: r.radacina, proiect: 'x', sablon: 'proba', filmare: path.join(FIX, 'scurt.mp4'), acum: ACUM }), codul('argument-necunoscut'));
});

test('--din la un proiect cu filmare: originalul copiat, transcrierea brută refolosită, fără Parakeet', async (t) => {
  const r = radacina();
  t.after(r.curata);
  const s = await servicii();
  await comandaNou({ radacina: r.radacina, proiect: 'vechi', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'), acum: ACUM, servicii: s });
  const s2 = await servicii({ instalat: false });
  const rez = await comandaNou({ radacina: r.radacina, proiect: 'nou', din: 'vechi', acum: ACUM, servicii: s2 });
  assert.equal(rez.ok, true, JSON.stringify(rez.erori));
  assert.deepEqual(s2.apeluri, []);
  const v = (p, f) => fs.readFileSync(path.join(r.radacina, 'video', p, ...f.split('/')), 'utf8');
  assert.equal(v('nou', 'active/transcriere.json'), v('vechi', 'active/transcriere.json'));
  assert.ok(fs.existsSync(path.join(r.radacina, 'video', 'nou', 'resurse', 'filmare-original.mp4')));
  assert.ok(JSON.parse(v('nou', 'motor.lock')).filmare);
});

test('--din fără originalul sau fără transcrierea brută: resursa-lipsa, fără folder nou, fără „e creat”', async (t) => {
  const { principal } = await import('../../nucleu/mg.mjs');
  for (const lipsa of ['resurse/filmare-original.mp4', 'active/transcriere.brut.json']) {
    const r = radacina();
    t.after(r.curata);
    await comandaNou({ radacina: r.radacina, proiect: 'vechi', sablon: 'proba-filmare', filmare: path.join(FIX, 'scurt.mp4'), acum: ACUM, servicii: await servicii() });
    fs.rmSync(path.join(r.radacina, 'video', 'vechi', ...lipsa.split('/')));
    let iesire = '';
    const cod = await principal(['nou', 'nou', '--din', 'vechi'], { radacina: r.radacina, stdout: { write: (x) => { iesire += x; } } });
    assert.equal(cod, 1, iesire);
    assert.match(iesire, /resursa-lipsa/);
    assert.ok(!fs.existsSync(path.join(r.radacina, 'video', 'nou')));
    assert.ok(!/e creat/.test(iesire), iesire);
  }
});
