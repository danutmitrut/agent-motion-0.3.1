import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent, caiProiect } from '../../nucleu/lib/cai.mjs';
import { sha256Fisier } from '../../nucleu/lib/fisiere.mjs';
import { rezolvaFfmpeg, ruleazaFfmpeg, extrageCadre, cadruLa } from '../../nucleu/lib/ffmpeg.mjs';
import { decideAprobare } from '../../nucleu/lib/garda/aprobare.mjs';
import { decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';
import { verificariMp4 } from '../../nucleu/lib/verificari/mp4.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const MOTIV = 'setează MG_TESTE_INTEGRARE=1';
const REPO = radacinaAgent(import.meta.url, 2);

async function proiectAprobat(radacina, proiect) {
  const nou = await comandaNou({ radacina, proiect, sablon: 'reel-ilustrat' });
  assert.equal(nou.ok, true, JSON.stringify(nou.erori));
  const v = await comandaRandeaza({ radacina, proiect, mod: 'doar-verificare' });
  assert.deepEqual(v.erori, []);
  const r = decideAprobare({ hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}` }, radacina, new Date());
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /a fost înregistrată în motor\.lock/);
}

function rezultatCod(verificare, cod) {
  return verificare.verificari.find((v) => v.cod === cod);
}

test('extrageCadre și cadruLa pe un MP4 cu fundal #0E0F13', { skip: sari && MOTIV, timeout: 120000 }, async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp();
  t.after(curata);
  const ff = await rezolvaFfmpeg(REPO);
  const mp4 = path.join(radacina, 'fundal.mp4');
  const gen = await ruleazaFfmpeg(
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0E0F13:s=1080x1920:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4],
    { ffmpeg: ff.ffmpeg },
  );
  assert.equal(gen.cod, 0, gen.stderr);

  const cadre = [];
  for await (const c of extrageCadre(mp4, { ffmpeg: ff.ffmpeg, fps: 10, latime: 135, inaltime: 240 })) cadre.push(c);
  assert.equal(cadre.length, 20);
  assert.equal(cadre[0].t, 0);
  assert.equal(cadre[19].t, 1.9);
  assert.ok(cadre.every((c) => c.pixeli.length === 135 * 240 * 3));
  const [r, g, b] = cadre[5].pixeli;
  for (const [x, asteptat] of [[r, 14], [g, 15], [b, 19]]) assert.ok(Math.abs(x - asteptat) <= 4, `${x} față de ${asteptat}`);

  const fereastra = [];
  for await (const c of extrageCadre(mp4, { ffmpeg: ff.ffmpeg, fps: 10, latime: 135, inaltime: 240, start: 1, durata: 0.5 })) fereastra.push(c.t);
  assert.deepEqual(fereastra, [1, 1.1, 1.2, 1.3, 1.4]);

  let vazute = 0;
  for await (const c of extrageCadre(mp4, { ffmpeg: ff.ffmpeg, fps: 30, latime: 135, inaltime: 240 })) {
    vazute += c.pixeli.length > 0 ? 1 : 0;
    if (vazute === 2) break;
  }
  assert.equal(vazute, 2, 'oprirea iterării nu blochează testul');

  const ultimul = await cadruLa(mp4, 1.967, { ffmpeg: ff.ffmpeg, latime: 270, inaltime: 480 });
  assert.equal(ultimul.length, 270 * 480 * 3);
  await assert.rejects(cadruLa(path.join(radacina, 'lipsa.mp4'), 0, { ffmpeg: ff.ffmpeg, latime: 270, inaltime: 480 }), (e) => {
    assert.equal(e.eroareMg?.cod, 'mp4-invalid');
    return true;
  });
  await assert.rejects(
    (async () => {
      for await (const c of extrageCadre(path.join(radacina, 'lipsa.mp4'), { ffmpeg: ff.ffmpeg, fps: 10, latime: 135, inaltime: 240 })) void c;
    })(),
    (e) => e.eroareMg?.cod === 'mp4-invalid',
  );
});

test('C11 cu ffprobe real: un fișier care nu e MP4 dă mp4-invalid, nu eroare-interna', { skip: sari && MOTIV, timeout: 120000 }, async (t) => {
  const { radacina, curata } = creeazaRadacinaTemp();
  t.after(curata);
  const ff = await rezolvaFfmpeg(REPO);
  const stricat = path.join(radacina, 'stricat.mp4');
  fs.writeFileSync(stricat, 'asta nu e un MP4');
  const cron = { latime: 1080, inaltime: 1920, fps: 30, durata: 3, format: 'vertical' };
  const [c11, ...rest] = await verificariMp4({ mp4: stricat, cronologie: cron, asteptari: null, stil: null, ff, format: 'vertical' });
  assert.equal(rest.length, 0);
  assert.equal(c11.cod, 'C11');
  assert.equal(c11.ok, false);
  assert.equal(c11.erori[0].cod, 'mp4-invalid');
  assert.match(c11.erori[0].camp, /^mp4/);
});

test('fără aprobare, randarea completă refuză cu aprobare-lipsa și nu scrie MP4-ul', { skip: sari && MOTIV, timeout: 600000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  const proiect = 'fara-aprobare';
  const nou = await comandaNou({ radacina, proiect, sablon: 'reel-ilustrat' });
  assert.equal(nou.ok, true, JSON.stringify(nou.erori));
  const cai = caiProiect(radacina, proiect);
  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  assert.equal(r.ok, false);
  assert.ok(r.erori.some((e) => e.cod === 'aprobare-lipsa'), JSON.stringify(r.erori));
  assert.equal(fs.existsSync(cai.mp4), false);
  assert.equal(fs.existsSync(path.join(cai.build, 'randare.mp4')), false);
  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'complet');
  assert.equal(verificare.ok, false);
  assert.equal(verificare.mp4, null);
  assert.equal(rezultatCod(verificare, 'C08').ok, false);
  assert.equal(rezultatCod(verificare, 'C11'), undefined);
});

test('exemplul minim aprobat se randează, înlocuiește un MP4 vechi și C11 trece', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  const proiect = 'complet-test';
  await proiectAprobat(radacina, proiect);
  const cai = caiProiect(radacina, proiect);
  fs.writeFileSync(cai.mp4, 'un film vechi, ținut de o randare anterioară');

  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  assert.deepEqual(r.erori, []);
  assert.equal(r.rezultat.mod, 'complet');
  assert.equal(r.rezultat.reluat_low_memory, false);
  assert.equal(r.rezultat.mp4, `video/${proiect}/${proiect}.mp4`);
  assert.notEqual(fs.readFileSync(cai.mp4).subarray(0, 24).toString('utf8'), 'un film vechi, ținut de ');
  assert.equal(fs.existsSync(path.join(cai.build, 'randare.mp4')), false, 'fișierul temporar a fost mutat');

  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'complet');
  assert.equal(verificare.mp4, `video/${proiect}/${proiect}.mp4`);
  assert.equal(verificare.sha256_mp4, sha256Fisier(cai.mp4));
  assert.equal(verificare.sha256_date, sha256Fisier(cai.date));
  assert.equal(rezultatCod(verificare, 'C08').ok, true);
  const c11 = rezultatCod(verificare, 'C11');
  assert.equal(c11.ok, true, JSON.stringify(c11));
  assert.equal(c11.valoare.codec, 'h264');
  assert.equal(c11.valoare.pix_fmt, 'yuv420p');

  // C12-C16 au rezultat: lista obligatorie din SABLON.md e completă și predarea e verde
  assert.equal(verificare.ok, true, JSON.stringify(verificare.verificari.filter((v) => !v.ok)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.rezultat.verificari_lipsa, []);
  for (const cod of ['C12', 'C13', 'C14', 'C15', 'C16']) assert.equal(rezultatCod(verificare, cod)?.ok, true, `${cod}: ${JSON.stringify(rezultatCod(verificare, cod))}`);
  assert.ok(verificare.verificari.every((v) => v.ok), JSON.stringify(verificare.verificari.filter((v) => !v.ok)));

  for (const k of [1, 2, 3]) assert.equal(fs.existsSync(path.join(cai.cadre, `predare-${k}.png`)), true);
  assert.deepEqual(r.rezultat.predare, [1, 2, 3].map((k) => `video/${proiect}/cadre/predare-${k}.png`));
});

test('la eșecul primei randări, reia o dată cu --low-memory-mode', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  const { radacina, jurnal, curata } = radacinaCuMotoare({ invelis: 'prima-esueaza' });
  t.after(curata);
  const proiect = 'reluare-test';
  await proiectAprobat(radacina, proiect);
  // memorie simulată sub prag: prima randare cere 2 procese, reluarea lasă --low-memory-mode să fixeze unul
  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet', memorieTotala: 8 * 1024 ** 3 });
  assert.deepEqual(r.erori, []);
  assert.equal(r.rezultat.reluat_low_memory, true);
  const randari = fs.readFileSync(jurnal, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(randari.length, 2);
  assert.equal(randari[0].includes('--low-memory-mode'), false);
  assert.equal(randari[1].includes('--low-memory-mode'), true);
  assert.equal(randari[0][randari[0].indexOf('--workers') + 1], '2', JSON.stringify(randari[0]));
  assert.equal(randari[1].includes('--workers'), false, JSON.stringify(randari[1]));
  for (const flag of ['--quality', 'looks', '--fps', '30', '--strict']) assert.ok(randari[0].includes(flag), flag);
  const verificare = JSON.parse(fs.readFileSync(caiProiect(radacina, proiect).verificare, 'utf8'));
  assert.equal(rezultatCod(verificare, 'C11').ok, true);
});

test('două eșecuri ale motorului dau randare-esuata, fără MP4', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  const { radacina, jurnal, curata } = radacinaCuMotoare({ invelis: 'toate-esueaza' });
  t.after(curata);
  const proiect = 'esec-test';
  await proiectAprobat(radacina, proiect);
  const cai = caiProiect(radacina, proiect);
  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  assert.equal(r.ok, false);
  assert.equal(r.erori[0].cod, 'randare-esuata');
  assert.equal(r.erori[0].camp, 'mediu.hyperframes');
  assert.match(r.erori[0].mesaj, /crash Chrome simulat/);
  assert.equal(fs.readFileSync(jurnal, 'utf8').trim().split('\n').length, 2, 'o singură reluare, fără bucle');
  assert.equal(fs.existsSync(cai.mp4), false);
  assert.equal(fs.existsSync(path.join(cai.build, 'randare.mp4')), false);
  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.ok, false);
  assert.equal(verificare.mp4, null);
  assert.equal(r.rezultat.reluat_low_memory, true);
});

test('un MP4 pe care ffprobe nu-l poate citi dă mp4-invalid la nivelul comenzii, cu verificare.json complet și fără cadre de predare', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  const { radacina, jurnal, curata } = radacinaCuMotoare({ invelis: 'mp4-stricat' });
  t.after(curata);
  const proiect = 'stricat-test';
  await proiectAprobat(radacina, proiect);
  const cai = caiProiect(radacina, proiect);
  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  assert.equal(fs.readFileSync(jurnal, 'utf8').trim().split('\n').length, 1, 'o singură randare, fără reluare');
  assert.equal(r.ok, false);
  assert.ok(r.erori.length > 0 && r.erori.every((e) => e.cod === 'mp4-invalid'), JSON.stringify(r.erori));
  assert.equal(r.erori.some((e) => e.cod === 'eroare-interna'), false);
  assert.deepEqual(r.rezultat.predare, []);
  for (const k of [1, 2, 3]) assert.equal(fs.existsSync(path.join(cai.cadre, `predare-${k}.png`)), false);
  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'complet');
  assert.equal(verificare.ok, false);
  assert.equal(rezultatCod(verificare, 'C11').ok, false);
  assert.equal(rezultatCod(verificare, 'C11').erori[0].cod, 'mp4-invalid');
  assert.equal(rezultatCod(verificare, 'C08').ok, true);
});

test('C11 rulează pe MP4-ul temporar: un MP4 nou stricat nu înlocuiește un MP4 vechi bun (decizia din 2026-10-06)', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  const { radacina, jurnal, curata } = radacinaCuMotoare({ invelis: 'mp4-stricat' });
  t.after(curata);
  const proiect = 'vechi-bun';
  await proiectAprobat(radacina, proiect);
  const cai = caiProiect(radacina, proiect);
  // filmul bun de la o randare anterioară: un MP4 real, valid
  const ff = await rezolvaFfmpeg(REPO);
  const gen = await ruleazaFfmpeg(
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x0E0F13:s=1080x1920:d=1:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', cai.mp4],
    { ffmpeg: ff.ffmpeg },
  );
  assert.equal(gen.cod, 0, gen.stderr);
  const vechi = sha256Fisier(cai.mp4);

  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  assert.equal(fs.readFileSync(jurnal, 'utf8').trim().split('\n').length, 1, 'o singură randare');
  assert.equal(r.ok, false);
  assert.ok(r.erori.length > 0 && r.erori.every((e) => e.cod === 'mp4-invalid'), JSON.stringify(r.erori));
  assert.equal(sha256Fisier(cai.mp4), vechi, 'filmul vechi rămâne neatins');
  assert.equal(fs.existsSync(path.join(cai.build, 'randare.mp4')), false, 'MP4-ul stricat nu rămâne nici în build/');
  assert.equal(r.rezultat.mp4, null);
  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'complet');
  assert.equal(verificare.ok, false);
  assert.equal(verificare.mp4, null, 'verificare.json nu atribuie filmului vechi rezultatul randării noi');
  assert.equal(verificare.sha256_mp4, null);
  assert.equal(rezultatCod(verificare, 'C11').ok, false);
  assert.equal(rezultatCod(verificare, 'C11').erori[0].cod, 'mp4-invalid');
  const stop = decideStop({ hook_event_name: 'Stop', last_assistant_message: `Predare: video/${proiect}/${proiect}.mp4` }, radacina);
  assert.equal(JSON.parse(stop.stdout).decision, 'block');
});

test('după aprobare, un text schimbat în date.json dă aprobare-invalida și nu randează nimic', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  const { radacina, jurnal, curata } = radacinaCuMotoare({ invelis: 'prima-esueaza' });
  t.after(curata);
  const proiect = 'text-schimbat';
  await proiectAprobat(radacina, proiect);
  const cai = caiProiect(radacina, proiect);
  fs.writeFileSync(cai.mp4, 'filmul vechi');
  // schimbare de text după aprobare; blocul din scenariu.md încă îl are pe cel vechi, deci C08 trebuie judecat după pasul comun
  const date = JSON.parse(fs.readFileSync(cai.date, 'utf8'));
  date.scene[0].titlu[0] = 'Faci totul singură.';
  fs.writeFileSync(cai.date, JSON.stringify(date, null, 2) + '\n');

  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.erori.map((e) => e.cod), ['aprobare-invalida']);
  assert.equal(fs.existsSync(jurnal), false, 'nicio randare nu a pornit');
  assert.equal(fs.readFileSync(cai.mp4, 'utf8'), 'filmul vechi', 'filmul vechi rămâne neatins');
  assert.equal(fs.existsSync(path.join(cai.build, 'randare.mp4')), false);
  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'complet');
  assert.equal(verificare.mp4, null);
  assert.equal(rezultatCod(verificare, 'C08').ok, false);
  assert.equal(rezultatCod(verificare, 'C08').erori[0].cod, 'aprobare-invalida');
});

test('date.json schimbat în timpul randării: verificare.json roșu, cu hash-ul datelor randate, iar predarea e blocată (SEC-1)', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  const proiect = 'date-schimbate';
  await proiectAprobat(radacina, proiect);
  const cai = caiProiect(radacina, proiect);
  const randat = sha256Fisier(cai.date);
  // cursantul cere o corectură cât timp randarea rulează: agentul editează date.json după render, înaintea verificărilor pe MP4
  const verificaMp4 = async (argumente) => {
    const date = JSON.parse(fs.readFileSync(cai.date, 'utf8'));
    date.scene[0].titlu[0] = 'Corectura cerută.';
    fs.writeFileSync(cai.date, JSON.stringify(date, null, 2) + '\n');
    return verificariMp4(argumente);
  };
  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet', verificaMp4 });
  assert.equal(r.ok, false);
  assert.ok(r.erori.some((e) => e.cod === 'date-schimbate-in-randare'), JSON.stringify(r.erori));
  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  assert.equal(verificare.mod, 'complet');
  assert.equal(verificare.ok, false);
  assert.equal(verificare.sha256_date, randat, 'hash-ul datelor din care s-a randat filmul, nu al fișierului nou');
  const c01 = verificare.verificari.filter((v) => v.cod === 'C01' && !v.ok);
  assert.equal(c01.length, 1);
  assert.equal(c01[0].erori[0].cod, 'date-schimbate-in-randare');
  const stop = decideStop({ hook_event_name: 'Stop', last_assistant_message: `Predare: video/${proiect}/${proiect}.mp4` }, radacina);
  assert.equal(JSON.parse(stop.stdout).decision, 'block');
});
