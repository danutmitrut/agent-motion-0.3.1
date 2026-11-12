// Adaptorul Remotion prin toate modurile lui mg randeaza (planul I, I04), pe fixture-ul proba-remotion și pe Remotion
// real, cum trece poarta-inghetare.test.mjs adaptorul HyperFrames prin proba. Remotion trebuie instalat în repo
// (motoare/remotion/node_modules, Task I02); altfel testul se sare, cu motivul scris.
// Rulare: MG_TESTE_INTEGRARE=1 node --test --test-concurrency=1 teste/integrare/remotion.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { caiProiect, radacinaAgent } from '../../nucleu/lib/cai.mjs';
import { probeazaMp4, rezolvaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { decideAprobare } from '../../nucleu/lib/garda/aprobare.mjs';
import { decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { ruleazaRemotion } from '../../nucleu/lib/motoare/remotion.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { copiazaDosar } from '../ajutoare/copiaza.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const REPO = radacinaAgent(import.meta.url, 2);
const CLI = path.join(REPO, 'motoare', 'remotion', 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const sari = process.env.MG_TESTE_INTEGRARE !== '1'
  ? 'setează MG_TESTE_INTEGRARE=1'
  : !fs.existsSync(CLI) ? 'Remotion nu e instalat în motoare/remotion (Task I02: npm ci acolo)' : false;

const citesteJson = (cale) => JSON.parse(fs.readFileSync(cale, 'utf8'));
const picate = (v) => JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2);
const bundleuri = (cai) => (fs.existsSync(cai.cache) ? fs.readdirSync(cai.cache).filter((n) => n.startsWith('bundle-')) : []);

/** Rădăcina completă a agentului (ca la poarta de înghețare), cu Remotion legat spre repo și proba-remotion lângă șabloanele lui. */
function radacinaCuRemotion() {
  const r = radacinaCuMotoare({ remotion: true });
  copiazaDosar(path.join(REPO, 'teste', 'fixtures', 'sabloane', 'proba-remotion'), path.join(r.radacina, 'motoare', 'remotion', 'sabloane', 'proba-remotion'));
  return r;
}

test('proba-remotion trece prin toate modurile lui mg randeaza, pe Remotion real', { skip: sari, timeout: 900000 }, async (t) => {
  const { radacina, curata } = radacinaCuRemotion();
  t.after(curata);

  // 0. Chrome Headless Shell, adus o singură dată (în node_modules/.remotion din repo, prin legătură)
  const browser = await ruleazaRemotion(['browser', 'ensure'], { radacina });
  assert.equal(browser.cod, 0, browser.stderr);

  const proiect = 'poarta-remotion';
  const cai = caiProiect(radacina, proiect);
  const meta = (await incarcaSablon(radacina, 'proba-remotion')).meta;
  const ff = await rezolvaFfmpeg(REPO);

  // 1. mg nou: motor.lock pe Remotion, cu versiunea fixată
  const nou = await comandaNou({ radacina, proiect, sablon: 'proba-remotion' });
  assert.equal(nou.ok, true, JSON.stringify(nou.erori));
  assert.deepEqual(citesteJson(cai.lock).motor, { nume: 'remotion', versiune: '4.0.529' });

  // 2. --doar-verificare: C10 (versiunea, bundle-ul, compoziția, rețeaua) și C17 pe props.json; bundle-ul în .cache, cu .gata
  let r = await comandaRandeaza({ radacina, proiect, mod: 'doar-verificare' });
  let v = citesteJson(cai.verificare);
  assert.equal(r.ok, true, picate(v));
  assert.equal(v.ok_pentru_aprobare, true, picate(v));
  assert.deepEqual(v.verificari.find((x) => x.cod === 'C10').valoare.compozitie, { id: 'Proba', fps: 30, latime: 1080, inaltime: 1920, cadre: 180 });
  assert.equal(bundleuri(cai).length, 1);
  const bundle = bundleuri(cai)[0];
  const gata = fs.statSync(path.join(cai.cache, bundle, '.gata')).mtimeMs;

  // 3. a doua verificare refolosește bundle-ul: același folder, .gata neatins
  r = await comandaRandeaza({ radacina, proiect, mod: 'doar-verificare' });
  assert.equal(r.ok, true);
  assert.deepEqual(bundleuri(cai), [bundle]);
  assert.equal(fs.statSync(path.join(cai.cache, bundle, '.gata')).mtimeMs, gata);

  // 4. --schita: MP4-ul schiței la jumătate de rezoluție și foaia din el, fără check la tranziții
  r = await comandaRandeaza({ radacina, proiect, mod: 'schita' });
  v = citesteJson(cai.verificare);
  assert.equal(r.ok, true, `${JSON.stringify(r.erori)}\n${picate(v)}`);
  assert.equal(v.mod, 'schita');
  assert.equal(v.schita.check_la_tranzitii, null);
  assert.equal(r.rezultat.schita.check, null);
  assert.equal(r.rezultat.schita.celule, 2);
  assert.ok(fs.existsSync(path.join(radacina, r.rezultat.schita.foaie)), r.rezultat.schita.foaie);
  const schita = await probeazaMp4(path.join(radacina, r.rezultat.schita.instantanee, 'schita.mp4'), ff);
  assert.deepEqual([schita.video.latime, schita.video.inaltime], [540, 960]);

  // 5. aprobarea, ca hook-ul UserPromptSubmit
  const aprobare = decideAprobare({ hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}` }, radacina, new Date());
  assert.match(JSON.parse(aprobare.stdout).hookSpecificOutput.additionalContext, /a fost înregistrată în motor\.lock/);

  // 6. randarea completă: toate verificările declarate verzi; MP4-ul cerut; bundle-ul rămâne în .cache (decizia 4)
  r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  v = citesteJson(cai.verificare);
  assert.equal(r.ok, true, `${JSON.stringify(r.erori)}\n${picate(v)}`);
  assert.equal(v.mod, 'complet');
  assert.equal(v.ok, true, picate(v));
  assert.deepEqual(v.obligatorii, meta.verificari);
  for (const cod of v.obligatorii) {
    assert.equal(v.verificari.find((x) => x.cod === cod)?.ok, true, `${cod}: ${JSON.stringify(v.verificari.find((x) => x.cod === cod))}`);
  }
  assert.deepEqual([r.rezultat.reluat_low_memory, r.rezultat.reluare], [false, '--concurrency=1']);
  const mp4 = await probeazaMp4(cai.mp4, ff);
  assert.deepEqual(
    [mp4.video.codec, mp4.video.pix_fmt, mp4.video.latime, mp4.video.inaltime, mp4.video.cadre, mp4.audio],
    ['h264', 'yuv420p', 1080, 1920, 180, null],
  );
  assert.deepEqual(bundleuri(cai), [bundle]);
  for (const k of [1, 2]) assert.ok(fs.existsSync(path.join(cai.cadre, `predare-${k}.png`)), `cadre/predare-${k}.png`);

  // 7. hook-ul Stop acceptă predarea MP4-ului
  const stop = decideStop({ hook_event_name: 'Stop', last_assistant_message: `Gata.\nPredare: video/${proiect}/${proiect}.mp4` }, radacina);
  assert.deepEqual(stop, { stdout: '', cod: 0 });
});
