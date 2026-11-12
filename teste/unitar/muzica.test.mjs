// Validarea muzicii în stratul datelor (planul F, F4). ffprobe e înlocuit cu o funcție falsă; proba reală e în F5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  areMuzica, argumenteTranscodare, audioCronologie, avertismentPiesaScurta, cheieMuzica, elementAudio, valideazaMuzica, verificaAudioCronologie,
} from '../../nucleu/lib/muzica.mjs';
import { verificareaErorii } from '../../nucleu/lib/erori.mjs';

const FF = { ffmpeg: 'ffmpeg-fals', ffprobe: 'ffprobe-fals' };
const piesa = (durata = 45, piste = 1) => async () => ({ durata, codec: 'mp3', piste });

function proiect(t, fisiere = { 'resurse/piesa.mp3': 'x' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg muzica Ăîș '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [rel, continut] of Object.entries(fisiere)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), continut);
  }
  return dir;
}
const cu = (muzica) => ({ sablon: 't', versiune_schema: 1, muzica });
const coduri = (r) => r.erori.map((e) => [e.cod, e.camp, verificareaErorii(e)]);

test('areMuzica: doar un obiect simplu', () => {
  assert.equal(areMuzica({ muzica: { fisier: 'resurse/a.mp3' } }), true);
  for (const m of [undefined, null, 'resurse/a.mp3', ['resurse/a.mp3']]) assert.equal(areMuzica({ muzica: m }), false);
});

test('fără muzică: nicio eroare, muzica null, ffprobe nu se cheamă', async (t) => {
  let chemat = false;
  const r = await valideazaMuzica(cu(null), { dirProiect: proiect(t), ff: null, probeaza: async () => { chemat = true; } });
  assert.deepEqual(r, { erori: [], muzica: null });
  assert.equal(chemat, false);
});

test('o piesă bună: valorile implicite volum 0,4 și incepe_de_la 0', async (t) => {
  const dir = proiect(t);
  const r = await valideazaMuzica(cu({ fisier: 'resurse/piesa.mp3' }), { dirProiect: dir, ff: FF, probeaza: piesa(45) });
  assert.deepEqual(r.erori, []);
  assert.deepEqual(r.muzica, { cale: path.join(dir, 'resurse', 'piesa.mp3'), fisier: 'resurse/piesa.mp3', durata: 45, volum: 0.4, incepe_de_la: 0 });
});

test('fișierul lipsă dă resursa-lipsa pe muzica.fisier (C07)', async (t) => {
  const r = await valideazaMuzica(cu({ fisier: 'resurse/nu-exista.mp3' }), { dirProiect: proiect(t), ff: FF, probeaza: piesa() });
  assert.deepEqual(coduri(r), [['resursa-lipsa', 'muzica.fisier', 'C07']]);
  assert.match(r.erori[0].sugestie, /resurse\//);
});

test('în afara lui resurse/, cu .. sau cu backslash: valoare-invalida pe muzica.fisier, atribuită lui C07', async (t) => {
  const dir = proiect(t, { 'piesa.mp3': 'x', 'resurse/piesa.mp3': 'x' });
  for (const fisier of ['piesa.mp3', 'resurse/../piesa.mp3', 'resurse\\piesa.mp3', '/resurse/piesa.mp3', 'resurse/']) {
    const r = await valideazaMuzica(cu({ fisier }), { dirProiect: dir, ff: FF, probeaza: piesa() });
    assert.deepEqual(coduri(r), [['valoare-invalida', 'muzica.fisier', 'C07']], fisier);
  }
});

test('extensia în afara listei (.ogg) dă valoare-invalida; .MP3 cu majuscule e acceptat', async (t) => {
  const dir = proiect(t, { 'resurse/a.ogg': 'x', 'resurse/B.MP3': 'x' });
  const rau = await valideazaMuzica(cu({ fisier: 'resurse/a.ogg' }), { dirProiect: dir, ff: FF, probeaza: piesa() });
  assert.deepEqual(coduri(rau), [['valoare-invalida', 'muzica.fisier', 'C07']]);
  assert.match(rau.erori[0].mesaj, /\.mp3, \.wav, \.m4a sau \.aac/);
  const bun = await valideazaMuzica(cu({ fisier: 'resurse/B.MP3' }), { dirProiect: dir, ff: FF, probeaza: piesa() });
  assert.deepEqual(bun.erori, []);
});

test('peste 50 MB dă valoare-invalida, fără să cheme ffprobe', async (t) => {
  const dir = proiect(t);
  fs.truncateSync(path.join(dir, 'resurse', 'piesa.mp3'), 50 * 1024 * 1024 + 1);
  let chemat = false;
  const r = await valideazaMuzica(cu({ fisier: 'resurse/piesa.mp3' }), { dirProiect: dir, ff: FF, probeaza: async () => { chemat = true; } });
  assert.deepEqual(coduri(r), [['valoare-invalida', 'muzica.fisier', 'C07']]);
  assert.match(r.erori[0].mesaj, /50 MB/);
  assert.equal(chemat, false);
});

test('un fișier pe care ffprobe nu-l citește sau fără pistă audio dă valoare-invalida', async (t) => {
  const dir = proiect(t);
  const necitibil = await valideazaMuzica(cu({ fisier: 'resurse/piesa.mp3' }), { dirProiect: dir, ff: FF, probeaza: async () => { throw new Error('Invalid data'); } });
  assert.deepEqual(coduri(necitibil), [['valoare-invalida', 'muzica.fisier', 'C07']]);
  // mesajul pentru cursant e scurt și în română: numește câmpul, fără textul englezesc al lui ffprobe și fără calea absolută
  assert.match(necitibil.erori[0].mesaj, /muzica\.fisier/);
  assert.doesNotMatch(necitibil.erori[0].mesaj, /Invalid data/);
  assert.ok(!necitibil.erori[0].mesaj.includes(dir), necitibil.erori[0].mesaj);
  const mut = await valideazaMuzica(cu({ fisier: 'resurse/piesa.mp3' }), { dirProiect: dir, ff: FF, probeaza: piesa(45, 0) });
  assert.deepEqual(coduri(mut), [['valoare-invalida', 'muzica.fisier', 'C07']]);
});

test('lipsa lui ffprobe (EroareFatala) trece mai departe, ca eroare de mediu', async (t) => {
  const { EroareFatala, eroare } = await import('../../nucleu/lib/erori.mjs');
  const fatala = new EroareFatala(eroare('ffmpeg-lipsa', 'mediu.ffprobe', 'm', 's'));
  await assert.rejects(valideazaMuzica(cu({ fisier: 'resurse/piesa.mp3' }), { dirProiect: proiect(t), ff: FF, probeaza: async () => { throw fatala; } }),
    (e) => e === fatala);
});

test('incepe_de_la trebuie să lase cel puțin 5 s din piesă', async (t) => {
  const dir = proiect(t);
  const rau = await valideazaMuzica(cu({ fisier: 'resurse/piesa.mp3', incepe_de_la: 40 }), { dirProiect: dir, ff: FF, probeaza: piesa(45) });
  assert.deepEqual(coduri(rau), [['valoare-invalida', 'muzica.incepe_de_la', 'C07']]);
  assert.match(rau.erori[0].sugestie, /cel mult 39,9/);
  const bun = await valideazaMuzica(cu({ fisier: 'resurse/piesa.mp3', incepe_de_la: 39.9 }), { dirProiect: dir, ff: FF, probeaza: piesa(45) });
  assert.deepEqual(bun.erori, []);
});

test('avertismentPiesaScurta: doar când ce rămâne din piesă e mai scurt decât videoul', () => {
  const m = { fisier: 'resurse/piesa.mp3', durata: 45, volum: 0.4, incepe_de_la: 10 };
  assert.deepEqual(avertismentPiesaScurta(m, { durata: 35 }), []);
  const [a] = avertismentPiesaScurta(m, { durata: 40 });
  assert.equal(a.cod, 'valoare-invalida');
  assert.equal(a.camp, 'muzica.fisier');
  assert.equal(verificareaErorii(a), 'C07');
  assert.match(a.mesaj, /35 s/);
  assert.match(a.mesaj, /liniște/);
  assert.deepEqual(avertismentPiesaScurta(null, { durata: 40 }), []);
});

test('verificaAudioCronologie: muzica și cronologia.audio trebuie să se potrivească', () => {
  const m = { fisier: 'resurse/piesa.mp3', durata: 45, volum: 0.4, incepe_de_la: 0 };
  assert.deepEqual(verificaAudioCronologie({ durata: 30, audio: { fisier: 'build/assets/muzica.m4a', durata: 30 } }, m), []);
  assert.deepEqual(verificaAudioCronologie({ durata: 30, audio: null }, null), []);
  const camp = (c, mz) => verificaAudioCronologie(c, mz).map((e) => [e.cod, e.camp]);
  assert.deepEqual(camp({ durata: 30, audio: null }, m), [['cronologie-invalida', 'cronologie.audio']]);
  assert.deepEqual(camp({ durata: 30, audio: { fisier: 'build/assets/muzica.m4a', durata: 30 } }, null), [['cronologie-invalida', 'cronologie.audio']]);
  assert.deepEqual(camp({ durata: 30, audio: { fisier: 'build/muzica.mp3', durata: 30 } }, m), [['cronologie-invalida', 'cronologie.audio.fisier']]);
  assert.deepEqual(camp({ durata: 30, audio: { fisier: 'build/assets/muzica.m4a', durata: 29 } }, m), [['cronologie-invalida', 'cronologie.audio.durata']]);
});

test('audioCronologie: null fără muzică, altfel calea fixă și durata rotunjită', () => {
  assert.equal(audioCronologie({ muzica: null }, 30), null);
  assert.equal(audioCronologie({}, 30), null);
  assert.deepEqual(audioCronologie({ muzica: { fisier: 'resurse/a.mp3' } }, 25.00049), { fisier: 'build/assets/muzica.m4a', durata: 25 });
});

test('elementAudio: șir gol fără muzică; altfel elementul confirmat de proba F1', () => {
  assert.equal(elementAudio({ audio: null }), '');
  assert.equal(elementAudio(null), '');
  assert.equal(elementAudio({ audio: { fisier: 'build/assets/muzica.m4a', durata: 25.5 } }),
    '<audio id="muzica" src="assets/muzica.m4a" data-start="0" data-duration="25.5" data-track-index="10" data-volume="1"></audio>');
});

test('argumenteTranscodare: tăiere, volum, fade-in 0,5 s, fade-out 1,5 s, liniște până la durată, AAC 192k', () => {
  assert.deepEqual(argumenteTranscodare({ sursa: 'S', iesire: 'I', volum: 0.4, incepe_de_la: 4, durataPiesa: 45, durata: 30 }), [
    '-hide_banner', '-nostdin', '-y', '-ss', '4.000', '-t', '30.000', '-i', 'S',
    '-af', 'volume=0.4,afade=t=in:st=0:d=0.5,afade=t=out:st=28.500:d=1.5,apad=whole_dur=30.000',
    '-t', '30.000', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', 'I',
  ]);
  // piesa scurtă: fade-out-ul cade la capătul piesei, nu al videoului; restul e liniște
  const scurta = argumenteTranscodare({ sursa: 'S', iesire: 'I', volum: 1, incepe_de_la: 0, durataPiesa: 20, durata: 30 });
  assert.equal(scurta[6], '20.000');
  assert.equal(scurta[10], 'volume=1,afade=t=in:st=0:d=0.5,afade=t=out:st=18.500:d=1.5,apad=whole_dur=30.000');
});

test('cheieMuzica: 16 hex, depinde de sursă și de fiecare parametru, nu de ordinea cheilor', () => {
  const baza = { sha256Sursa: 'a'.repeat(64), volum: 0.4, incepe_de_la: 0, durata: 30 };
  const k = cheieMuzica(baza);
  assert.match(k, /^[0-9a-f]{16}$/);
  assert.equal(cheieMuzica({ durata: 30, incepe_de_la: 0, volum: 0.4, sha256Sursa: 'a'.repeat(64) }), k);
  for (const schimbat of [{ sha256Sursa: 'b'.repeat(64) }, { volum: 0.5 }, { incepe_de_la: 1 }, { durata: 31 }]) {
    assert.notEqual(cheieMuzica({ ...baza, ...schimbat }), k, JSON.stringify(schimbat));
  }
});

test('pregatesteMuzica cu ffmpeg fals: transcodează o dată, apoi din cache; eșecul lui ffmpeg e valoare-invalida pe muzica.fisier, cod 1', async (t) => {
  const { COD_IESIRE, EroareFatala } = await import('../../nucleu/lib/erori.mjs');
  const { pregatesteMuzica } = await import('../../nucleu/lib/muzica.mjs');
  const dir = proiect(t);
  const dirBuild = path.join(dir, 'build');
  const muzica = { cale: path.join(dir, 'resurse', 'piesa.mp3'), fisier: 'resurse/piesa.mp3', durata: 45, volum: 0.4, incepe_de_la: 0 };
  let rulari = 0;
  const ruleaza = async (argumente) => { rulari += 1; fs.writeFileSync(argumente.at(-1), 'aac'); return { cod: 0, stdout: Buffer.alloc(0), stderr: '' }; };
  const probeaza = async () => ({ codec: 'aac', piste: 1, durata: 12.01 });
  fs.mkdirSync(path.join(dir, 'active', 'muzica'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'active', 'muzica', '0123456789abcdef.m4a'), 'vechi');

  const a = await pregatesteMuzica({ muzica, durata: 12, dirProiect: dir, dirBuild, ff: FF, ruleaza, probeaza });
  assert.equal(a.din_cache, false);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'active', 'muzica')), [`${a.cheie}.m4a`]);
  assert.equal(fs.readFileSync(path.join(dirBuild, 'assets', 'muzica.m4a'), 'utf8'), 'aac');
  const b = await pregatesteMuzica({ muzica, durata: 12, dirProiect: dir, dirBuild, ff: FF, ruleaza, probeaza });
  assert.deepEqual(b, { cheie: a.cheie, din_cache: true });
  assert.equal(rulari, 1);

  const esuat = async () => ({ cod: 1, stdout: Buffer.alloc(0), stderr: 'Error while decoding' });
  await assert.rejects(pregatesteMuzica({ muzica: { ...muzica, volum: 0.9 }, durata: 12, dirProiect: dir, dirBuild, ff: FF, ruleaza: esuat, probeaza }), (e) => {
    assert.ok(e instanceof EroareFatala);
    assert.equal(e.codIesire, COD_IESIRE.DATE);
    assert.deepEqual([e.eroareMg.cod, e.eroareMg.camp, e.eroareMg.verificare], ['valoare-invalida', 'muzica.fisier', 'C07']);
    return true;
  });
  // fără fișiere parțiale rămase în cache
  assert.ok(fs.readdirSync(path.join(dir, 'active', 'muzica')).every((n) => !n.includes('partial')));
});
