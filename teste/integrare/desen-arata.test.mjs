import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync, statSync, symlinkSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arataPiese } from '../../nucleu/lib/desen/arata.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** node_modules și binarele nu se copiază: se leagă cu o joncțiune (pe Windows merge fără drepturi de administrator). */
function leaga(radacina, relativ) {
  const sursa = join(REPO, relativ);
  if (!existsSync(sursa)) return;
  mkdirSync(dirname(join(radacina, relativ)), { recursive: true });
  symlinkSync(sursa, join(radacina, relativ), 'junction');
}

test('mg desen arata produce un PNG nevid pentru două piese din biblioteca mini', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 240000 }, async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({
    biblioteciMini: true,
    copiaza: ['motoare/comun/teme', 'motoare/comun/fonturi', 'motoare/hyperframes/comun', 'motoare/hyperframes/package.json', 'nucleu/VERSIUNI.json'],
  });
  t.after(curata);
  for (const relativ of ['motoare/hyperframes/node_modules', 'nucleu/node_modules', 'unelte/ffmpeg']) leaga(radacina, relativ);
  const iesire = join(radacina, 'video', 'proba', 'cadre', 'desene.png');
  const { png: cale, avertismente } = await arataPiese(radacina, ['od-meditating', 'op-bust-laptop'], { tema: 'noapte', iesire });
  assert.equal(cale, iesire);
  assert.deepEqual(avertismente, []);
  const png = readFileSync(cale);
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
  assert.ok(statSync(cale).size > 2000);
  assert.equal(png.readUInt32BE(16), 684);
  assert.equal(png.readUInt32BE(20), 408);
});

test('T9: dacă folderul de lucru nu se poate șterge (EBUSY pe Windows), foaia reușită rămâne, cu avertismentul curatare-esuata', { skip: sari && 'setează MG_TESTE_INTEGRARE=1', timeout: 240000 }, async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp({
    biblioteciMini: true,
    copiaza: ['motoare/comun/teme', 'motoare/comun/fonturi', 'motoare/hyperframes/comun', 'motoare/hyperframes/package.json', 'nucleu/VERSIUNI.json'],
  });
  t.after(curata);
  for (const relativ of ['motoare/hyperframes/node_modules', 'nucleu/node_modules', 'unelte/ffmpeg']) leaga(radacina, relativ);
  const inainte = new Set(fs.readdirSync(tmpdir()).filter((f) => f.startsWith('mg-arata-')));
  const original = fs.rmdirSync;
  const simulat = mock.method(fs, 'rmdirSync', (cale, ...rest) => {
    if (basename(cale).startsWith('mg-arata-')) throw Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${cale}'`), { code: 'EBUSY' });
    return original.call(fs, cale, ...rest);
  });
  let rezultat;
  try {
    const iesire = join(radacina, 'video', 'proba', 'cadre', 'desene.png');
    rezultat = await arataPiese(radacina, ['od-chilling'], { tema: 'noapte', iesire });
    assert.equal(rezultat.png, iesire);
    assert.ok(statSync(iesire).size > 2000);
  } finally {
    simulat.mock.restore();
    for (const f of fs.readdirSync(tmpdir())) {
      if (f.startsWith('mg-arata-') && !inainte.has(f)) fs.rmSync(join(tmpdir(), f), { recursive: true, force: true });
    }
  }
  assert.deepEqual(rezultat.avertismente.map((a) => [a.cod, a.camp]), [['curatare-esuata', 'mediu.temp']]);
  assert.match(rezultat.avertismente[0].mesaj, /mg-arata-/);
});
