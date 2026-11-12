import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { parseazaFfprobe } from '../../nucleu/lib/ffmpeg.mjs';
import { CODURI } from '../../nucleu/lib/erori.mjs';
import { verificaAudio, verificaC15 } from '../../nucleu/lib/verificari/mp4.mjs';

const DIR = path.join(radacinaAgent(import.meta.url, 2), 'teste', 'fixtures', 'ffmpeg');
const FARA_MUZICA = { texte: [], momente: [], audio: { prezent: false, durata: null }, fundal: '#0E0F13' };

function info(nume) {
  return parseazaFfprobe(fs.readFileSync(path.join(DIR, nume), 'utf8'));
}

test('codurile C15 și C16 sunt în lista comună', () => {
  assert.equal(CODURI['audio-invalid']?.verificare, 'C15');
  assert.equal(CODURI['foaie-lipsa']?.verificare, 'C16');
});

test('parseazaFfprobe citește pista audio din ieșirea reală', () => {
  const i = info('ffprobe-cu-audio.txt');
  assert.equal(i.video.codec, 'h264');
  assert.equal(i.audio.codec, 'aac');
  assert.equal(i.audio.canale, 2);
});

test('C15: fără muzică în date și fără pistă audio trece', () => {
  const r = verificaAudio(info('ffprobe-yuv420p.txt'), FARA_MUZICA);
  assert.equal(r.cod, 'C15');
  assert.equal(r.ok, true);
  assert.equal(r.camp, null);
  assert.deepEqual(r.erori, []);
  assert.deepEqual(r.valoare, { muzica: false, pista: null });
  assert.deepEqual(r.prag, { mod: 'fara-muzica', pista_audio: 'niciuna' });
});

test('C15: o pistă audio fără muzică în date dă audio-invalid pe mp4.audio', () => {
  const r = verificaAudio(info('ffprobe-cu-audio.txt'), FARA_MUZICA);
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['audio-invalid', 'mp4.audio']]);
  assert.match(r.erori[0].mesaj, /aac/);
  assert.deepEqual(r.valoare.pista, { codec: 'aac', canale: 2, durata: 2.986 });
});

const CU_MUZICA = { ...FARA_MUZICA, audio: { prezent: true, durata: 2.986 } };
const NIVEL_BUN = { medie: -23.1, maxim: -17.4, coada: -40.5 };
const cuPista = (schimbari = {}) => {
  const i = info('ffprobe-cu-audio.txt');
  return { ...i, audio: { ...i.audio, ...schimbari } };
};

test('C15 cu muzică: o pistă AAC la durata cronologiei, cu nivelul în prag, trece', () => {
  const r = verificaAudio(cuPista(), CU_MUZICA, NIVEL_BUN);
  assert.equal(r.ok, true, JSON.stringify(r.erori));
  assert.deepEqual(r.valoare, { muzica: true, pista: { codec: 'aac', canale: 2, durata: 2.986 }, piste: 1, nivel: NIVEL_BUN });
  assert.deepEqual(r.prag, { mod: 'cu-muzica', codec: 'aac', piste: 1, durata: '2,986 ± 0,05 s', medie_peste: -35, maxim_cel_mult: -0.5, coada_sub_medie: 10 });
});

test('C15 cu muzică, fără pistă audio în MP4: audio-invalid pe mp4.audio', () => {
  const r = verificaAudio(info('ffprobe-yuv420p.txt'), CU_MUZICA, null);
  assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['audio-invalid', 'mp4.audio']]);
  assert.match(r.erori[0].sugestie, /muzica\.fisier/);
});

test('C15 cu muzică: două piste, alt codec și altă durată dau câte o eroare', () => {
  assert.deepEqual(verificaAudio(cuPista({ piste: 2 }), CU_MUZICA, NIVEL_BUN).erori.map((e) => e.camp), ['mp4.audio']);
  assert.deepEqual(verificaAudio(cuPista({ codec: 'mp3' }), CU_MUZICA, NIVEL_BUN).erori.map((e) => e.camp), ['mp4.audio.codec']);
  const lunga = verificaAudio(cuPista({ durata: 3.1 }), CU_MUZICA, NIVEL_BUN);
  assert.deepEqual(lunga.erori.map((e) => e.camp), ['mp4.audio.durata']);
  assert.match(lunga.erori[0].mesaj, /3,1 s/);
});

test('C15 cu muzică: prea încet, saturat și fără final stins trimit la câmpurile muzica.*', () => {
  const incet = verificaAudio(cuPista(), CU_MUZICA, { medie: -36, maxim: -20, coada: -60 });
  assert.deepEqual(incet.erori.map((e) => [e.cod, e.camp]), [['audio-invalid', 'muzica.volum']]);
  assert.match(incet.erori[0].sugestie, /Mărește muzica\.volum/);
  const tare = verificaAudio(cuPista(), CU_MUZICA, { medie: -10, maxim: -0.2, coada: -40 });
  assert.deepEqual(tare.erori.map((e) => [e.cod, e.camp]), [['audio-invalid', 'muzica.volum']]);
  assert.match(tare.erori[0].sugestie, /Micșorează muzica\.volum/);
  const coada = verificaAudio(cuPista(), CU_MUZICA, { medie: -23, maxim: -17, coada: -25 });
  assert.deepEqual(coada.erori.map((e) => [e.cod, e.camp]), [['audio-invalid', 'muzica.fisier']]);
});

test('C15 cu muzică și nivel nemăsurat (null): audio-invalid pe mp4.audio', () => {
  const r = verificaAudio(cuPista(), CU_MUZICA, null);
  assert.deepEqual(r.erori.map((e) => e.camp), ['mp4.audio']);
});

test('verificaC15 măsoară nivelul doar cu muzică și cu pistă: tot fișierul, apoi ultimele 0,5 s', async () => {
  const chemari = [];
  const masoaraAudio = async (cale, o) => {
    chemari.push(o.start ?? 0);
    return o.start ? { medie: -40, maxim: -30 } : { medie: -23, maxim: -17 };
  };
  const i = cuPista();
  const r = await verificaC15({ mp4: 'x.mp4', info: i, asteptari: CU_MUZICA, ff: { ffmpeg: 'f' }, masoaraAudio });
  assert.equal(r.ok, true, JSON.stringify(r.erori));
  assert.equal(chemari.length, 2);
  assert.equal(chemari[0], 0);
  assert.ok(Math.abs(chemari[1] - (i.durata - 0.5)) < 0.001, `start ${chemari[1]}`);
  chemari.length = 0;
  await verificaC15({ mp4: 'x.mp4', info: i, asteptari: FARA_MUZICA, ff: { ffmpeg: 'f' }, masoaraAudio });
  assert.deepEqual(chemari, []);
});

test('verificaC15: o eroare la măsurare pică C15 cu audio-invalid, nu oprește verificările', async () => {
  const r = await verificaC15({ mp4: 'x.mp4', info: cuPista(), asteptari: CU_MUZICA, ff: { ffmpeg: 'f' }, masoaraAudio: async () => { throw new Error('stricat'); } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => e.cod), ['audio-invalid']);
});

test('C15: fără așteptări (null) se tratează ca fără muzică', () => {
  assert.equal(verificaAudio(info('ffprobe-yuv420p.txt'), null).ok, true);
});

test('C15 cu muzică: sugestiile numesc muzica.incepe_de_la unde ajută', () => {
  const incet = verificaAudio(cuPista(), CU_MUZICA, { medie: -36, maxim: -20, coada: -60 });
  assert.match(incet.erori[0].sugestie, /muzica\.incepe_de_la/);
  assert.match(incet.erori[0].sugestie, /muzica\.volum/);
  const scurta = verificaAudio(cuPista({ durata: 2.5 }), CU_MUZICA, NIVEL_BUN);
  assert.match(scurta.erori[0].sugestie, /muzica\.incepe_de_la/);
  assert.match(scurta.erori[0].sugestie, /muzica\.fisier/);
  const coada = verificaAudio(cuPista(), CU_MUZICA, { medie: -23, maxim: -17, coada: -25 });
  assert.match(coada.erori[0].sugestie, /muzica\.incepe_de_la/);
  const tare = verificaAudio(cuPista(), CU_MUZICA, { medie: -10, maxim: -0.2, coada: -40 });
  assert.match(tare.erori[0].sugestie, /muzica\.volum/);
});

test('C15 cu muzică: limitele exacte trec, imediat dincolo pică', () => {
  const ok = (n, p = cuPista()) => verificaAudio(p, CU_MUZICA, n).ok;
  assert.equal(ok({ medie: -35, maxim: -20, coada: -60 }), false, 'media exact -35 pică (strict)');
  assert.equal(ok({ medie: -34.9, maxim: -20, coada: -60 }), true);
  assert.equal(ok({ medie: -23, maxim: -0.5, coada: -40 }), true, 'vârful exact -0,5 trece');
  assert.equal(ok({ medie: -23, maxim: -0.4, coada: -40 }), false);
  assert.equal(ok({ medie: -23, maxim: -17, coada: -33 }), true, 'coada exact medie - 10 trece');
  assert.equal(ok({ medie: -23, maxim: -17, coada: -32.9 }), false);
  assert.equal(ok(NIVEL_BUN, cuPista({ durata: 3.036 })), true, 'durata + 0,05 trece');
  assert.equal(ok(NIVEL_BUN, cuPista({ durata: 2.936 })), true, 'durata - 0,05 trece');
  assert.equal(ok(NIVEL_BUN, cuPista({ durata: 3.037 })), false);
  assert.equal(ok(NIVEL_BUN, cuPista({ durata: 2.935 })), false);
});

test('C15 cu muzică: niveluri ne-numerice (NaN, undefined) pică', () => {
  for (const nivel of [
    { medie: NaN, maxim: -17, coada: -40 },
    { medie: -23, maxim: NaN, coada: -40 },
    { medie: -23, maxim: -17, coada: NaN },
    { medie: -23, maxim: -17, coada: undefined },
    { medie: -23, maxim: undefined, coada: -40 },
  ]) {
    assert.equal(verificaAudio(cuPista(), CU_MUZICA, nivel).ok, false, JSON.stringify(nivel));
  }
});
