import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  descarcaRezerva,
  parseazaAudioSursa,
  parseazaFfprobe,
  parseazaFreezedetect,
  parseazaVolumedetect,
  platforma,
  rezolvaFfmpeg,
  verificaBinar,
} from '../../nucleu/lib/ffmpeg.mjs';
import { sha256Text } from '../../nucleu/lib/fisiere.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const FIXTURI = new URL('../fixtures/ffmpeg/', import.meta.url);
const citesteFixtura = (nume) => readFileSync(new URL(nume, FIXTURI), 'utf8');

/** Răspuns HTTP minim, cât folosește descarcaRezerva. */
function raspunsFals(corp, status = 200) {
  return { ok: status >= 200 && status < 300, status, arrayBuffer: async () => corp };
}

function versiuniFalse() {
  return {
    ffmpeg: {
      release: 'b6.1.1',
      binare: {
        'darwin-arm64': { ffmpeg: sha256Text('ffmpeg-arm64'), ffprobe: sha256Text('ffprobe-arm64') },
        'win32-x64': { ffmpeg: sha256Text('ffmpeg-x64'), ffprobe: sha256Text('ffprobe-x64') },
      },
      rezerva: {
        'darwin-arm64': { ffprobe: { url: 'https://exemplu.invalid/ffprobe-darwin-arm64.gz', sha256: sha256Text('ffprobe-arm64') } },
      },
    },
  };
}

const merge = async () => ({ ok: true, versiune: '6.0' });

test('platforma() e process.platform-process.arch', () => {
  assert.equal(platforma(), `${process.platform}-${process.arch}`);
});

test('parseazaFfprobe citește ieșirea reală salvată (video și audio)', () => {
  assert.deepEqual(parseazaFfprobe(citesteFixtura('ffprobe-ok.json')), {
    durata: 2,
    video: { codec: 'h264', pix_fmt: 'yuv420p', latime: 1080, inaltime: 1920, fps: 30, cadre: 60 },
    audio: { codec: 'aac', durata: 2, canale: 1, piste: 1 },
  });
});

test('parseazaFfprobe fără flux video aruncă', () => {
  assert.throws(() => parseazaFfprobe({ streams: [{ codec_type: 'audio' }], format: { duration: '1' } }), /flux video/);
});

test('parseazaFreezedetect citește stderr-ul real: un interval închis și unul până la final', () => {
  assert.deepEqual(parseazaFreezedetect(citesteFixtura('freezedetect.txt')), [
    { start: 1, durata: 1.5, sfarsit: 2.5 },
    { start: 3.5, durata: null, sfarsit: null },
  ]);
  assert.deepEqual(parseazaFreezedetect(''), []);
});

test('verificaBinar prinde ENOENT', async () => {
  const r = await verificaBinar(join(process.cwd(), 'nu-exista', 'ffprobe'));
  assert.equal(r.ok, false);
  assert.match(r.eroare, /ENOENT/);
});

test('verificaBinar prinde și o eroare aruncată sincron de execFile (ca -86)', async () => {
  // un octet nul în cale face execFile să arunce sincron, la fel ca binarul x86_64 pe Mac arm64 fără Rosetta
  const r = await verificaBinar('ffprobe\0fals');
  assert.equal(r.ok, false);
  assert.equal(typeof r.eroare, 'string');
});

test('verificaBinar prinde EACCES', { skip: process.platform === 'win32' && 'Windows nu are bitul de execuție' }, async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'neexecutabil': 'nu e binar' } });
  try {
    const r = await verificaBinar(join(radacina, 'neexecutabil'));
    assert.equal(r.ok, false);
    assert.match(r.eroare, /EACCES/);
  } finally {
    curata();
  }
});

test('descarcaRezerva: sha256 corect, binarul ajunge în unelte/ffmpeg/<platforma>/', async () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    const cale = await descarcaRezerva(radacina, 'ffprobe', versiuniFalse(), {
      platforma: 'darwin-arm64',
      fetch: async (url) => {
        assert.equal(url, 'https://exemplu.invalid/ffprobe-darwin-arm64.gz');
        return raspunsFals(gzipSync(Buffer.from('ffprobe-arm64')));
      },
    });
    assert.equal(cale, join(radacina, 'unelte', 'ffmpeg', 'darwin-arm64', 'ffprobe'));
    assert.equal(readFileSync(cale, 'utf8'), 'ffprobe-arm64');
    if (process.platform !== 'win32') assert.equal(statSync(cale).mode & 0o777, 0o755);
  } finally {
    curata();
  }
});

test('descarcaRezerva: sha256 greșit dă ffmpeg-hash și nu scrie nimic', async () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    await assert.rejects(
      descarcaRezerva(radacina, 'ffprobe', versiuniFalse(), {
        platforma: 'darwin-arm64',
        fetch: async () => raspunsFals(gzipSync(Buffer.from('alt continut'))),
      }),
      (err) => err.eroareMg?.cod === 'ffmpeg-hash' && err.eroareMg.camp === 'mediu.ffprobe',
    );
    assert.equal(existsSync(join(radacina, 'unelte', 'ffmpeg', 'darwin-arm64', 'ffprobe')), false);
  } finally {
    curata();
  }
});

test('descarcaRezerva: HTTP 404, corp întrerupt și platformă fără rezervă dau ffmpeg-lipsa', async () => {
  const { radacina, curata } = creeazaRadacinaTemp();
  try {
    await assert.rejects(
      descarcaRezerva(radacina, 'ffprobe', versiuniFalse(), { platforma: 'darwin-arm64', fetch: async () => raspunsFals(Buffer.alloc(0), 404) }),
      (err) => err.eroareMg?.cod === 'ffmpeg-lipsa',
    );
    await assert.rejects(
      descarcaRezerva(radacina, 'ffmpeg', versiuniFalse(), { platforma: 'darwin-arm64', fetch: async () => assert.fail('nu trebuie apelat') }),
      (err) => err.eroareMg?.cod === 'ffmpeg-lipsa',
    );
    await assert.rejects(
      descarcaRezerva(radacina, 'ffprobe', versiuniFalse(), {
        platforma: 'darwin-arm64',
        fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => { throw new TypeError('terminated'); } }),
      }),
      (err) => err.eroareMg?.cod === 'ffmpeg-lipsa' && err.eroareMg.camp === 'mediu.ffprobe',
    );
    assert.equal(existsSync(join(radacina, 'unelte', 'ffmpeg', 'darwin-arm64', 'ffprobe')), false);
  } finally {
    curata();
  }
});

test('rezolvaFfmpeg pe darwin-arm64: ffprobe-static (x86_64) e respins, câștigă rezerva', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: {
      'nucleu/node_modules/ffmpeg-static/ffmpeg': 'ffmpeg-arm64',
      'nucleu/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe': 'ffprobe-x86_64',
      'unelte/ffmpeg/darwin-arm64/ffprobe': 'ffprobe-arm64',
    },
  });
  try {
    const ff = await rezolvaFfmpeg(radacina, { platforma: 'darwin-arm64', versiuni: versiuniFalse(), verifica: merge });
    assert.deepEqual(ff.surse, { ffmpeg: 'ffmpeg-static', ffprobe: 'rezerva' });
    assert.equal(ff.ffmpeg, join(radacina, 'nucleu', 'node_modules', 'ffmpeg-static', 'ffmpeg'));
    assert.equal(ff.ffprobe, join(radacina, 'unelte', 'ffmpeg', 'darwin-arm64', 'ffprobe'));
  } finally {
    curata();
  }
});

test('rezolvaFfmpeg pe darwin-arm64 fără rezervă descărcată: ffmpeg-lipsa pe mediu.ffprobe', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: {
      'nucleu/node_modules/ffmpeg-static/ffmpeg': 'ffmpeg-arm64',
      'nucleu/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe': 'ffprobe-x86_64',
    },
  });
  try {
    await assert.rejects(
      rezolvaFfmpeg(radacina, { platforma: 'darwin-arm64', versiuni: versiuniFalse(), verifica: merge }),
      (err) => err.eroareMg?.cod === 'ffmpeg-lipsa' && err.eroareMg.camp === 'mediu.ffprobe',
    );
  } finally {
    curata();
  }
});

test('rezolvaFfmpeg pe win32-x64: pachetele npm cu .exe; un ffmpeg cu alt hash dă ffmpeg-hash', async () => {
  const bun = creeazaRadacinaTemp({
    fisiere: {
      'nucleu/node_modules/ffmpeg-static/ffmpeg.exe': 'ffmpeg-x64',
      'nucleu/node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe': 'ffprobe-x64',
    },
  });
  const stricat = creeazaRadacinaTemp({
    fisiere: {
      'nucleu/node_modules/ffmpeg-static/ffmpeg.exe': 'ffmpeg-modificat',
      'nucleu/node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe': 'ffprobe-x64',
    },
  });
  try {
    const ff = await rezolvaFfmpeg(bun.radacina, { platforma: 'win32-x64', versiuni: versiuniFalse(), verifica: merge });
    assert.deepEqual(ff.surse, { ffmpeg: 'ffmpeg-static', ffprobe: 'ffprobe-static' });
    assert.ok(ff.ffprobe.endsWith('ffprobe.exe'));
    await assert.rejects(
      rezolvaFfmpeg(stricat.radacina, { platforma: 'win32-x64', versiuni: versiuniFalse(), verifica: merge }),
      (err) => err.eroareMg?.cod === 'ffmpeg-hash' && err.eroareMg.camp === 'mediu.ffmpeg',
    );
  } finally {
    bun.curata();
    stricat.curata();
  }
});

test('rezolvaFfmpeg pe o platformă fără hash fixat acceptă binarul care rulează și respinge pe cel care nu rulează', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({
    fisiere: {
      'nucleu/node_modules/ffmpeg-static/ffmpeg': 'ffmpeg-x64',
      'nucleu/node_modules/ffprobe-static/bin/darwin/x64/ffprobe': 'ffprobe-x64',
    },
  });
  try {
    const ff = await rezolvaFfmpeg(radacina, { platforma: 'darwin-x64', versiuni: versiuniFalse(), verifica: merge });
    assert.deepEqual(ff.surse, { ffmpeg: 'ffmpeg-static', ffprobe: 'ffprobe-static' });
    const nuMerge = async (cale) => (cale.includes('ffprobe') ? { ok: false, eroare: 'eroarea -86' } : { ok: true });
    await assert.rejects(
      rezolvaFfmpeg(radacina, { platforma: 'darwin-x64', versiuni: versiuniFalse(), verifica: nuMerge }),
      (err) => err.eroareMg?.cod === 'ffmpeg-lipsa' && /-86/.test(err.eroareMg.mesaj),
    );
  } finally {
    curata();
  }
});

test('parseazaFfprobe numără pistele audio (două fluxuri aac)', () => {
  const json = { streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, r_frame_rate: '30/1', nb_frames: '60' },
    { codec_type: 'audio', codec_name: 'aac', duration: '2.0', channels: 2 },
    { codec_type: 'audio', codec_name: 'aac', duration: '2.0', channels: 2 },
  ], format: { duration: '2.0' } };
  assert.equal(parseazaFfprobe(json).audio.piste, 2);
});

test('parseazaAudioSursa: o piesă MP3 fără video (cu o copertă ca flux video, ignorată)', () => {
  assert.deepEqual(parseazaAudioSursa({ streams: [
    { codec_type: 'audio', codec_name: 'mp3', duration: '45.024', channels: 1 },
    { codec_type: 'video', codec_name: 'mjpeg' },
  ], format: { duration: '45.024000' } }), { durata: 45.024, codec: 'mp3', piste: 1 });
});

test('parseazaAudioSursa: fără flux audio, piste 0; fără durată, aruncă', () => {
  assert.deepEqual(parseazaAudioSursa({ streams: [{ codec_type: 'video', codec_name: 'h264' }], format: { duration: '3' } }),
    { durata: 3, codec: null, piste: 0 });
  assert.throws(() => parseazaAudioSursa({ streams: [], format: {} }), /durata/);
});

test('parseazaVolumedetect citește media și vârful; -inf devine -Infinity; fără rânduri, null', () => {
  const stderr = '[Parsed_volumedetect_0 @ 0x13c0092a0] n_samples: 1152000\n'
    + '[Parsed_volumedetect_0 @ 0x13c0092a0] mean_volume: -23.1 dB\n'
    + '[Parsed_volumedetect_0 @ 0x13c0092a0] max_volume: -17.4 dB\n';
  assert.deepEqual(parseazaVolumedetect(stderr), { medie: -23.1, maxim: -17.4 });
  assert.deepEqual(parseazaVolumedetect('mean_volume: -inf dB\nmax_volume: -inf dB\n'), { medie: -Infinity, maxim: -Infinity });
  assert.equal(parseazaVolumedetect('nimic'), null);
});
