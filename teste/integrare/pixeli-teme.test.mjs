// Calibrarea C12, C13 și C14 pe temele reelului (spec 6.11 și 7.x: noapte, hartie, curat), pe MP4-uri reale.
// Partea A: MP4-uri lavfi (doar fundal: C12 și C13 pică; cu un bloc de text: trec).
// Partea B: exemplul minim, randat complet cu HyperFrames pe fiecare temă: C12, C13 și C14 verzi.
// Partea C: exemplul 01 cu un îndemn în scena finală (etichete, cuvinte, titluri pe două rânduri, semnătură pe două
// rânduri), la fel; C13 măsoară fiecare text în caseta lui reală (decizia din 2026-10-05).
// Partea D: cazurile la limită ale casetelor: o etichetă singură (într-o scenă cu desen, ca C12 să nu vadă un gol),
// un final doar cu îndemn și semnătura scurtă „Ana”.
// Partea E: titluri și cuvinte scurte și late („BMW”, „HMM”, „MW”, „NU”, „MM”), cele mai dense casete măsurate în
// c13-windows-investigatie.md; trec sub pragul casetelor (50%, decizia din 2026-10-06) cu cel puțin 3 pp marjă,
// fiindcă pe Windows, pe noapte, aceleași casete ies cu până la 2 pp mai pline.
// Diagnosticul fiecărei părți are valorile măsurate; ele sunt calibrarea din raportul B17.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent, caiProiect } from '../../nucleu/lib/cai.mjs';
import { extrageCadre, rezolvaFfmpeg, ruleazaFfmpeg } from '../../nucleu/lib/ffmpeg.mjs';
import { verificariMp4 } from '../../nucleu/lib/verificari/mp4.mjs';
import { areDesen } from '../../nucleu/lib/verificari/pixeli.mjs';
import { hexInRgb } from '../../nucleu/lib/contrast.mjs';
import { decideAprobare } from '../../nucleu/lib/garda/aprobare.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const MOTIV = 'setează MG_TESTE_INTEGRARE=1';
// Părțile B-E randează câte un exemplu pe toate temele (~18 minute fiecare pe runner-ul CI).
// Se sar doar când MG_TESTE_PIXELI_TEME are exact valoarea '0' (jobul normal din CI o pune mereu așa; la pornirea
// manuală le rulează jobul separat windows-pixeli-teme).
const MOTIV_GRELE = 'părțile B-E (randări complete pe toate temele) se sar în CI la push și pull request; le rulează jobul windows-pixeli-teme la pornirea manuală a CI-ului (workflow_dispatch) sau local, fără MG_TESTE_PIXELI_TEME=0';
const sarGrele = sari ? MOTIV : process.env.MG_TESTE_PIXELI_TEME === '0' && MOTIV_GRELE;
const REPO = radacinaAgent(import.meta.url, 2);
const TEME = ['noapte', 'hartie', 'curat'];
const EXEMPLU_01 = path.join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat', 'exemple', '01-rutina-preluata.json');

function culoriTema(id) {
  return JSON.parse(fs.readFileSync(path.join(REPO, 'motoare', 'comun', 'teme', `${id}.json`), 'utf8')).culori;
}

function rezultatCod(rezultate, cod) {
  const r = rezultate.find((x) => x.cod === cod);
  assert.ok(r, `lipsește rezultatul ${cod}`);
  return r;
}

/** Cronologie și stil minime pentru un MP4 lavfi de 3 s, cu un segment complet la 1,5 s, în zona de text a reelului. */
function contextLavfi(fundal, ferestre) {
  return {
    cronologie: {
      versiune: 1, sablon: 'reel-ilustrat', format: 'vertical', latime: 1080, inaltime: 1920, fps: 30, durata: 3, fundal,
      segmente: [{ ref: 'Scena 1', camp: 'scene[0]', tip: 'card', start: 0, complet: 1.5, sfarsit: 3, zona_text: [96, 200, 888, 280], texte: ['Text de probă'] }],
      ferestre_statice: ferestre,
      momente_foaie: [{ t: 1.5, ref: 'Scena 1', eticheta: 'Scena 1, complet' }, { t: 2.967, ref: 'final', eticheta: 'Ultimul cadru' }],
      audio: null,
    },
    asteptari: { texte: [{ ref: 'Scena 1', text: 'Text de probă', t: 1.5, zona_text: [96, 200, 888, 280] }], momente: [1.5, 2.967], audio: { prezent: false, durata: null }, fundal },
    stil: { culori: { fundal: { valoare: fundal, sursa: 'tema' } } },
  };
}

/**
 * Creează proiectul, scrie datele, îl verifică, îl aprobă ca un om și îl randează complet;
 * cere C11-C16 verzi și întoarce verificare.json.
 */
async function randeazaSiVerifica(t, radacina, proiect, modificaDate) {
  const nou = await comandaNou({ radacina, proiect, sablon: 'reel-ilustrat' });
  assert.equal(nou.ok, true, JSON.stringify(nou.erori));
  const cai = caiProiect(radacina, proiect);
  const date = modificaDate(JSON.parse(fs.readFileSync(cai.date, 'utf8')));
  fs.writeFileSync(cai.date, JSON.stringify(date, null, 2) + '\n');
  const v = await comandaRandeaza({ radacina, proiect, mod: 'doar-verificare' });
  assert.deepEqual(v.erori, [], `${proiect}: ${JSON.stringify(v.erori)}`);
  const a = decideAprobare({ hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}` }, radacina, new Date());
  assert.match(JSON.parse(a.stdout).hookSpecificOutput.additionalContext, /a fost înregistrată în motor\.lock/);
  const r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  const verificare = JSON.parse(fs.readFileSync(cai.verificare, 'utf8'));
  for (const cod of ['C11', 'C12', 'C13', 'C14', 'C15', 'C16']) {
    const rez = verificare.verificari.find((x) => x.cod === cod);
    assert.ok(rez, `${proiect}: lipsește ${cod}; erorile randării: ${JSON.stringify(r.erori)}`);
    t.diagnostic(`${proiect} ${cod}: ok=${rez.ok} ${JSON.stringify(rez.valoare)}`);
    assert.equal(rez.ok, true, `${proiect} ${cod}: ${JSON.stringify(rez.erori)}`);
  }
  assert.deepEqual(r.rezultat.verificari_lipsa, [], `${proiect}: lista obligatorie e completă`);
  return verificare;
}

/**
 * Rulează `fn` pe fiecare temă și strânge eșecurile, ca o temă picată să nu ascundă temele de după ea
 * (în CI, hartie pica și curat nu se mai randa deloc, C16); la final pică dacă a picat măcar o temă.
 */
async function peToateTemele(fn) {
  const esecuri = [];
  for (const tema of TEME) {
    try {
      await fn(tema);
    } catch (e) {
      esecuri.push(`${tema}: ${e?.message ?? String(e)}`);
    }
  }
  assert.deepEqual(esecuri, [], `au picat ${esecuri.length} din ${TEME.length} teme:\n${esecuri.join('\n')}`);
}

// Plasa pentru marja liniei (C16): primul conținut din C12 trebuie să iasă la timp și cu toleranța 48 + 8.
// O linie care trece de 48 doar cu 1-3 niveluri (conturul de 2 px pe hartie) pică aici, pe Mac, nu abia pe Windows,
// unde câteva niveluri de diferență la randare o duc sub prag. Cadrele sunt cele din C12 (10 fps, 135x240).
const TOLERANTA_MARJA = 56;
const CADRE_C12 = { fps: 10, latime: 135, inaltime: 240 };

async function cerMarjaPrimulContinut(t, radacina, proiect, tema, verificare) {
  const c12 = verificare.verificari.find((x) => x.cod === 'C12');
  const limita = c12.prag.primul_continut;
  const ff = await rezolvaFfmpeg(REPO);
  const fundal = hexInRgb(culoriTema(tema).fundal);
  const { latime, inaltime } = CADRE_C12;
  let primul = null;
  for await (const { t: tc, pixeli } of extrageCadre(caiProiect(radacina, proiect).mp4, { ffmpeg: ff.ffmpeg, ...CADRE_C12, durata: limita + 0.5 })) {
    if (areDesen(pixeli, latime, inaltime, fundal, { toleranta: TOLERANTA_MARJA })) {
      primul = tc;
      break;
    }
  }
  t.diagnostic(`${proiect} primul conținut: ${c12.valoare.primul_continut} s la 48, ${primul} s la ${TOLERANTA_MARJA}`);
  assert.ok(primul !== null && primul <= limita + 1e-9,
    `${proiect}: cu toleranța ${TOLERANTA_MARJA}, primul conținut iese la ${primul} s (cel mult ${limita} s); la 48 iese la ${c12.valoare.primul_continut} s, deci linia trece de prag la limită`);
}

test('partea A: pe fiecare temă, un MP4 doar cu fundal pică C12 și C13, iar cu un bloc de text trece', { skip: sari && MOTIV, timeout: 10 * 60 * 1000 }, async (t) => {
  const ff = await rezolvaFfmpeg(REPO);
  const { radacina: dir, curata } = creeazaRadacinaTemp();
  t.after(curata);
  for (const tema of TEME) {
    const { fundal, text } = culoriTema(tema);
    const gol = path.join(dir, `${tema}-gol.mp4`);
    const cuText = path.join(dir, `${tema}-text.mp4`);
    const sursa = `color=c=0x${fundal.slice(1)}:s=1080x1920:d=3:r=30`;
    for (const [iesire, filtre] of [[gol, []], [cuText, ['-vf', `drawbox=x=96:y=260:w=600:h=60:color=0x${text.slice(1)}@1:t=fill`]]]) {
      const r = await ruleazaFfmpeg(['-hide_banner', '-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', sursa, ...filtre, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', iesire], { ffmpeg: ff.ffmpeg });
      assert.equal(r.cod, 0, r.stderr);
    }
    const totStatic = [{ start: 0, sfarsit: 3, motiv: 'proba' }];
    const rGol = await verificariMp4({ mp4: gol, ...contextLavfi(fundal, totStatic), ff, format: 'vertical' });
    t.diagnostic(`${tema} gol: C12 ${JSON.stringify(rezultatCod(rGol, 'C12').valoare)} C13 ${JSON.stringify(rezultatCod(rGol, 'C13').valoare)}`);
    assert.equal(rezultatCod(rGol, 'C11').ok, true, `${tema}: ${JSON.stringify(rezultatCod(rGol, 'C11').erori)}`);
    assert.equal(rezultatCod(rGol, 'C12').ok, false, `${tema}: C12 trebuie să pice pe fundal gol`);
    assert.equal(rezultatCod(rGol, 'C12').erori[0].cod, 'cadre-goale');
    assert.equal(rezultatCod(rGol, 'C13').ok, false, `${tema}: C13 trebuie să pice fără text`);
    assert.equal(rezultatCod(rGol, 'C13').erori[0].cod, 'text-invizibil');
    assert.equal(rezultatCod(rGol, 'C14').ok, true, `${tema}: fereastra statică acoperă tot`);
    const faraFereastra = await verificariMp4({ mp4: gol, ...contextLavfi(fundal, []), ff, format: 'vertical' });
    assert.equal(rezultatCod(faraFereastra, 'C14').ok, false, `${tema}: fără fereastră, fundalul static e îngheț`);
    assert.equal(rezultatCod(faraFereastra, 'C14').erori[0].cod, 'video-inghetat');
    const rText = await verificariMp4({ mp4: cuText, ...contextLavfi(fundal, totStatic), ff, format: 'vertical' });
    const c13 = rezultatCod(rText, 'C13');
    t.diagnostic(`${tema} text: C12 ${JSON.stringify(rezultatCod(rText, 'C12').valoare)} C13 ${JSON.stringify(c13.valoare)}`);
    assert.equal(rezultatCod(rText, 'C12').ok, true, `${tema}: ${JSON.stringify(rezultatCod(rText, 'C12').erori)}`);
    assert.equal(c13.ok, true, `${tema}: ${JSON.stringify(c13.erori)}`);
    assert.ok(Math.abs(c13.valoare.masuratori[0].proportie - 0.1448) < 0.01, `${tema}: ${c13.valoare.masuratori[0].proportie}`);
    if (tema === TEME[0]) {
      // runda de corecturi 1: o casetă cu NaN pe același MP4 cu text nu trece C13 nemăsurată
      const ctx = contextLavfi(fundal, totStatic);
      ctx.asteptari.texte = [{ ...ctx.asteptari.texte[0], caseta: [96, 260, 600, NaN] }];
      const rNaN = rezultatCod(await verificariMp4({ mp4: cuText, ...ctx, ff, format: 'vertical' }), 'C13');
      assert.equal(rNaN.ok, false, `${tema}: o casetă cu NaN trebuie să pice C13`);
      assert.equal(rNaN.erori[0].cod, 'text-invizibil');
      assert.match(rNaN.erori[0].mesaj, /nu s-a putut măsura/);
      assert.equal(rNaN.valoare.masuratori[0].proportie, null);
    }
  }
});

test('partea B: exemplul minim, randat complet pe noapte, hartie și curat, trece C12, C13 și C14', { skip: sarGrele, timeout: 60 * 60 * 1000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  await peToateTemele(async (tema) => {
    // doar tema se schimbă: o durată mai scurtă ar risca S06 (desenarea și retragerea nu mai încap în scenă)
    await randeazaSiVerifica(t, radacina, `calibrare-${tema}`, (date) => ({ ...date, stil: { ...(date.stil ?? {}), tema } }));
  });
});

test('partea C: exemplul 01 cu îndemn, randat complet pe noapte, hartie și curat, trece C12, C13 și C14', { skip: sarGrele, timeout: 60 * 60 * 1000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  const exemplu = JSON.parse(fs.readFileSync(EXEMPLU_01, 'utf8'));
  await peToateTemele(async (tema) => {
    const verificare = await randeazaSiVerifica(t, radacina, `exemplu-${tema}`, () => {
      const date = structuredClone(exemplu);
      date.stil.tema = tema;
      date.scene[date.scene.length - 1].cta = 'Scrie-mi „sistem” în mesaj.';
      return date;
    });
    await cerMarjaPrimulContinut(t, radacina, `exemplu-${tema}`, tema, verificare);
    // C13 măsoară fiecare text în caseta lui, la rezoluția MP4-ului: 5 etichete, 4 cuvinte, 7 rânduri de titlu,
    // îndemnul și semnătura
    const c13 = verificare.verificari.find((x) => x.cod === 'C13');
    // pragul casetelor strânse: 50% (decizia din 2026-10-06); 35% rămâne doar pentru zona_text
    assert.deepEqual(c13.prag, { min: 0.01, max: 0.5, toleranta: 96, zone: 'casete', latime_cadru: 1080 });
    const refuri = c13.valoare.masuratori.map((m) => m.ref);
    assert.equal(refuri.length, 18, JSON.stringify(refuri));
    for (const ref of refuri) assert.match(ref, /^(Scena [1-5]|Semnătura) \(„.+”\)$/);
    assert.ok(refuri.includes('Scena 5 („Scrie-mi „sistem” în mesaj.”)'), JSON.stringify(refuri));
    assert.ok(refuri.includes('Semnătura („Ana Pop, coach de carieră”)'), JSON.stringify(refuri));
  });
});

test('partea D: eticheta singură, finalul doar cu îndemn și semnătura „Ana” se văd în casetele lor pe toate temele', { skip: sarGrele, timeout: 60 * 60 * 1000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  const exemplu = JSON.parse(fs.readFileSync(EXEMPLU_01, 'utf8'));
  await peToateTemele(async (tema) => {
    const verificare = await randeazaSiVerifica(t, radacina, `margini-${tema}`, () => {
      const date = structuredClone(exemplu);
      date.stil.tema = tema;
      date.semnatura = 'Ana';
      date.scene[3] = { tip: 'desen', durata: 5.8, desen: { id: 'od-strolling', marime: 'mare' }, eticheta: 'Doar o etichetă' };
      date.scene[4] = { tip: 'final', durata: 5.6, desen: { id: 'od-chilling', marime: 'mediu' }, cta: 'Scrie-mi „sistem” în mesaj.' };
      return date;
    });
    await cerMarjaPrimulContinut(t, radacina, `margini-${tema}`, tema, verificare);
    const c13 = verificare.verificari.find((x) => x.cod === 'C13');
    const dupaRef = new Map(c13.valoare.masuratori.map((m) => [m.ref, m.proportie]));
    for (const ref of ['Scena 4 („DOAR O ETICHETĂ”)', 'Scena 5 („Scrie-mi „sistem” în mesaj.”)', 'Semnătura („Ana”)']) {
      assert.ok(dupaRef.has(ref), `${tema}: lipsește ${ref} din ${JSON.stringify([...dupaRef.keys()])}`);
      const p = dupaRef.get(ref);
      assert.ok(p >= 0.01 && p <= 0.35, `${tema} ${ref}: ${p}`);
    }
    // scena 4 are doar eticheta, scena 5 doar îndemnul
    assert.equal([...dupaRef.keys()].filter((r) => r.startsWith('Scena 4 ') || r.startsWith('Scena 5 ')).length, 2);
  });
});

test('partea E: titlurile și cuvintele scurte și late trec C13 pe toate temele, cu cel puțin 3 pp sub pragul casetelor', { skip: sarGrele, timeout: 60 * 60 * 1000 }, async (t) => {
  const { radacina, curata } = radacinaCuMotoare();
  t.after(curata);
  const exemplu = JSON.parse(fs.readFileSync(EXEMPLU_01, 'utf8'));
  const LATE = ['Scena 1 („BMW”)', 'Scena 2 („HMM”)', 'Scena 2 („MW”)', 'Scena 2 („NU”)', 'Scena 4 („MM”)'];
  const MARJA = 0.03;
  await peToateTemele(async (tema) => {
    // randeazaSiVerifica cere C13 verde; aici se verifică în plus marja pentru Windows
    const verificare = await randeazaSiVerifica(t, radacina, `late-${tema}`, () => {
      const date = structuredClone(exemplu);
      date.stil.tema = tema;
      date.scene[0].titlu = ['BMW'];
      date.scene[1].cuvinte = ['HMM', 'MW', 'NU', 'Plăți.'];
      date.scene[3].titlu = ['MM', '*pentru oameni.*'];
      return date;
    });
    await cerMarjaPrimulContinut(t, radacina, `late-${tema}`, tema, verificare);
    const c13 = verificare.verificari.find((x) => x.cod === 'C13');
    assert.equal(c13.prag.zone, 'casete');
    assert.equal(c13.prag.max, 0.5);
    const dupaRef = new Map(c13.valoare.masuratori.map((m) => [m.ref, m.proportie]));
    for (const ref of LATE) {
      assert.ok(dupaRef.has(ref), `${tema}: lipsește ${ref} din ${JSON.stringify([...dupaRef.keys()])}`);
      const p = dupaRef.get(ref);
      assert.ok(p >= 0.01 && p <= c13.prag.max - MARJA, `${tema} ${ref}: ${p} (cel mult ${c13.prag.max - MARJA})`);
    }
    const maxim = Math.max(...c13.valoare.masuratori.map((m) => m.proportie));
    t.diagnostic(`${tema}: maximul C13 ${maxim} (${c13.valoare.masuratori.find((m) => m.proportie === maxim).ref})`);
  });
});
