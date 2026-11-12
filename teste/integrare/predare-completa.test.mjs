import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { radacinaAgent, caiProiect } from '../../nucleu/lib/cai.mjs';
import { COD_IESIRE, EroareFatala, eroare } from '../../nucleu/lib/erori.mjs';
import { stergeRecursiv } from '../../nucleu/lib/fisiere.mjs';
import { rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { verificariMp4 } from '../../nucleu/lib/verificari/mp4.mjs';
import { decideAprobare } from '../../nucleu/lib/garda/aprobare.mjs';
import { decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const MOTIV = 'setează MG_TESTE_INTEGRARE=1';
const REPO = radacinaAgent(import.meta.url, 2);
const TOATE = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17',
  'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];

function stop(mesaj) {
  return { hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: mesaj };
}

test('C15 pe MP4-uri lavfi: o pistă audio tăcută pică, un MP4 mut trece', { skip: sari && MOTIV, timeout: 120000 }, async (t) => {
  const ff = await rezolvaFfmpeg(REPO);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg audio Ăîș '));
  t.after(() => stergeRecursiv(dir));
  const video = ['-f', 'lavfi', '-i', 'color=c=0x0E0F13:s=1080x1920:d=3:r=30'];
  const mut = path.join(dir, 'mut.mp4');
  const sonor = path.join(dir, 'sonor.mp4');
  for (const [iesire, extra] of [
    [mut, ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']],
    [sonor, ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']],
  ]) {
    const r = await ruleazaFfmpeg(['-hide_banner', '-v', 'error', '-y', ...video, ...extra, iesire], { ffmpeg: ff.ffmpeg });
    assert.equal(r.cod, 0, r.stderr);
  }
  const fundal = '#0E0F13';
  const context = {
    cronologie: { versiune: 1, sablon: 'reel-ilustrat', format: 'vertical', latime: 1080, inaltime: 1920, fps: 30, durata: 3, fundal, segmente: [], ferestre_statice: [{ start: 0, sfarsit: 3, motiv: 'proba' }], momente_foaie: [], audio: null },
    asteptari: { texte: [], momente: [], audio: { prezent: false, durata: null }, fundal },
    stil: null,
  };
  const c15 = async (mp4) => (await verificariMp4({ mp4, ...context, ff, format: 'vertical' })).find((x) => x.cod === 'C15');
  assert.equal((await c15(mut)).ok, true);
  const r = await c15(sonor);
  assert.equal(r.ok, false);
  assert.equal(r.erori[0].camp, 'mp4.audio');
});

test('randarea completă scrie foaia rundei, predarea și un verificare.json verde, pe care hook-ul Stop îl acceptă', { skip: sari && MOTIV, timeout: 30 * 60 * 1000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  const proiect = 'predare-test';
  const nou = await comandaNou({ radacina, proiect, sablon: 'reel-ilustrat' });
  assert.equal(nou.ok, true, JSON.stringify(nou.erori));
  const v = await comandaRandeaza({ radacina, proiect, mod: 'doar-verificare' });
  assert.deepEqual(v.erori, []);
  const a = decideAprobare({ hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}` }, radacina, new Date());
  assert.match(JSON.parse(a.stdout).hookSpecificOutput.additionalContext, /a fost înregistrată în motor\.lock/);
  const cai = caiProiect(radacina, proiect);

  // foile și folderele schiței, plus desene.png, nu intră în N-ul foii complete: prima randare completă e runda 1
  fs.mkdirSync(path.join(cai.cadre, 'schita-4'), { recursive: true });
  fs.writeFileSync(path.join(cai.cadre, 'foaie-schita-4.jpg'), 'x');
  fs.writeFileSync(path.join(cai.cadre, 'desene.png'), 'x');

  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  assert.deepEqual(r.erori, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rezultat.verificari_lipsa, []);
  assert.equal(r.rezultat.foaie, `video/${proiect}/cadre/foaie-1.jpg`);
  assert.equal(r.rezultat.etichete, `video/${proiect}/cadre/foaie-1.json`);
  assert.deepEqual(r.rezultat.revizie, { runde_scrise: 0, plafon: 3, peste_plafon: false, mesaj: 'Revizia vizuală: 0 din 3 runde complete folosite.' });

  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'complet');
  assert.equal(verificare.ok, true);
  assert.deepEqual([...verificare.obligatorii].sort(), [...TOATE].sort());
  for (const cod of verificare.obligatorii) {
    const ale = verificare.verificari.filter((x) => x.cod === cod);
    assert.ok(ale.length > 0 && ale.every((x) => x.ok === true), `${cod}: ${JSON.stringify(ale)}`);
  }
  const c15 = verificare.verificari.find((x) => x.cod === 'C15');
  assert.deepEqual(c15.valoare, { muzica: false, pista: null });
  const cron = JSON.parse(fs.readFileSync(path.join(cai.build, 'cronologie.json'), 'utf8'));
  const c16 = verificare.verificari.find((x) => x.cod === 'C16');
  assert.deepEqual(c16.valoare, { runda: 1, foaie: `video/${proiect}/cadre/foaie-1.jpg`, etichete: `video/${proiect}/cadre/foaie-1.json`, celule: cron.momente_foaie.length });
  const etichete = JSON.parse(fs.readFileSync(path.join(cai.cadre, 'foaie-1.json'), 'utf8'));
  assert.equal(etichete.versiune, 1);
  assert.equal(etichete.mp4, `../${proiect}.mp4`);
  assert.equal(etichete.celule.length, cron.momente_foaie.length);
  assert.equal(fs.existsSync(path.join(cai.cadre, 'foaie-1.jpg')), true);
  for (const k of [1, 2]) assert.equal(fs.existsSync(path.join(cai.cadre, `predare-${k}.png`)), true);

  assert.deepEqual(decideStop(stop(`Gata.\nPredare: video/${proiect}/${proiect}.mp4`), radacina), { stdout: '', cod: 0 });

  // P1: trei verdicte REPARĂ (în flux le scrie hook-ul SubagentStop; aici, direct) nu opresc o randare nouă
  for (const k of [1, 2, 3]) {
    fs.writeFileSync(path.join(cai.cadre, `revizie-${k}.md`), 'Verdict: REPARĂ\n\n- Scena 1: titlul intră prea devreme.\n');
  }
  const r2 = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  assert.equal(r2.ok, true, JSON.stringify(r2.erori));
  assert.equal(r2.rezultat.foaie, `video/${proiect}/cadre/foaie-2.jpg`, 'a doua randare completă e runda 2');
  assert.equal(r2.rezultat.revizie.peste_plafon, true);
  assert.match(r2.rezultat.revizie.mesaj, /observațiile nereparate ale revizorului la vedere; cursantul decide/);
  assert.match(r2.rezultat.revizie.mesaj, new RegExp(`„încă o rundă ${proiect}”`));
  assert.deepEqual(decideStop(stop(`Predare: video/${proiect}/${proiect}.mp4`), radacina), { stdout: '', cod: 0 });

  // un Error simplu din pasul foii (un folder ocupă locul foaie-3.json) se aruncă, ca eroare-interna, abia după ce
  // verificare.json e scris ca picat: nu rămâne cel al pasului comun
  fs.mkdirSync(path.join(cai.cadre, 'foaie-3.json'));
  await assert.rejects(comandaRandeaza({ radacina, proiect, mod: 'complet' }), (e) => !(e instanceof EroareFatala));
  const picat = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(picat.mod, 'complet');
  assert.equal(picat.ok, false);
  assert.equal(picat.mp4, `video/${proiect}/${proiect}.mp4`);
  const c16Picat = picat.verificari.find((x) => x.cod === 'C16');
  assert.equal(c16Picat.ok, false);
  assert.equal(c16Picat.erori[0].cod, 'eroare-interna');
  assert.match(c16Picat.erori[0].sugestie, new RegExp(`randeaza ${proiect};.*doctor`));
  assert.equal(fs.existsSync(path.join(cai.cadre, 'foaie-3.jpg')), false, 'foaia pe jumătate scrisă se șterge');
  assert.notEqual(decideStop(stop(`Predare: video/${proiect}/${proiect}.mp4`), radacina).stdout, '', 'cu C16 picat, hook-ul Stop nu acceptă predarea');
});

test('o eroare fatală la verificările pe MP4 (ffmpeg dispare după randare) scrie verificare.json complet, picat, și ajunge la comandă', { skip: sari && MOTIV, timeout: 30 * 60 * 1000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  const proiect = 'fatala-test';
  const nou = await comandaNou({ radacina, proiect, sablon: 'reel-ilustrat' });
  assert.equal(nou.ok, true, JSON.stringify(nou.erori));
  const v = await comandaRandeaza({ radacina, proiect, mod: 'doar-verificare' });
  assert.deepEqual(v.erori, []);
  decideAprobare({ hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}` }, radacina, new Date());
  const cai = caiProiect(radacina, proiect);
  const fatala = new EroareFatala(eroare('ffmpeg-lipsa', 'mediu.ffmpeg', 'ffmpeg a dispărut.', 'Rulează node nucleu/mg.mjs doctor.'), COD_IESIRE.MEDIU);
  await assert.rejects(
    comandaRandeaza({ radacina, proiect, mod: 'complet', verificaMp4: async () => { throw fatala; } }),
    (e) => e === fatala,
  );
  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'complet');
  assert.equal(verificare.ok, false);
  assert.equal(verificare.mp4, `video/${proiect}/${proiect}.mp4`);
  assert.ok(verificare.sha256_mp4);
  const c11 = verificare.verificari.find((x) => x.cod === 'C11');
  assert.equal(c11.ok, false);
  assert.equal(c11.erori[0].cod, 'ffmpeg-lipsa');
  assert.equal(verificare.verificari.some((x) => x.cod === 'C16'), false, 'fără MP4 verificat, nu se face foaie');
});
