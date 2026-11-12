// Golden-urile reelului: build/plan.json și build/index.html pentru fiecare exemplu, identice byte cu byte
// (spec 7.1, harta 5.17 și 8.5). Regenerare, numai după o schimbare voită și inspectată:
//   MG_ACTUALIZEAZA_GOLDEN=1 node --test motoare/hyperframes/sabloane/reel-ilustrat/teste/plan.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creeazaRadacinaTemp } from '../../../../../teste/ajutoare/radacina-temp.mjs';
import { incarcaSablon } from '../../../../../nucleu/lib/sabloane.mjs';
import { creeazaCtx } from '../../../../../nucleu/lib/context.mjs';
import { lockNou, scrieLock, citesteLock } from '../../../../../nucleu/lib/lock.mjs';
import { rezolvaStil, valoriStil } from '../../../../../nucleu/lib/teme.mjs';
import { citesteVersiuni } from '../../../../../nucleu/lib/versiuni.mjs';
import { incarcaCatalog } from '../../../../../nucleu/lib/desen/catalog.mjs';
import { verificaActive } from '../../../../../nucleu/lib/active.mjs';
import { checkJson } from '../../../../../nucleu/lib/motor-hf.mjs';
import { verificaBuild } from '../../../../../nucleu/lib/verificari/build.mjs';
import { adaugaPiesa } from '../../../../../nucleu/lib/desen/adauga.mjs';
import { caseteTexte, geometrieTexte, zonaSemnatura } from '../casete.mjs';
import { escapeazaHtml } from '../../../../../nucleu/lib/html.mjs';
import { elementAudio } from '../../../../../nucleu/lib/muzica.mjs';

const REPO = fileURLToPath(new URL('../../../../../', import.meta.url));
const DIR_SABLON = fileURLToPath(new URL('../', import.meta.url));
const DIR_GOLDEN = path.join(DIR_SABLON, 'teste', 'golden');
const ACTUALIZEAZA = process.env.MG_ACTUALIZEAZA_GOLDEN === '1';
const INTEGRARE = process.env.MG_TESTE_INTEGRARE === '1';
const OBLIGATORII = ['minim', '01-rutina-preluata'];
// 02-programari-25s intră automat când există exemple/02-programari-25s.json (îl adaugă B22).
const EXEMPLE = ['minim', '01-rutina-preluata', '02-programari-25s']
  .filter((e) => fs.existsSync(path.join(DIR_SABLON, 'exemple', `${e}.json`)));
const PROIECT = 'golden';
const ACUM = new Date('2026-10-01T00:00:00.000Z');

const sablon = await incarcaSablon(REPO, 'reel-ilustrat');

/** Construiește un exemplu într-o rădăcină temporară cu biblioteca mini, pe drumul lui mg randeaza.
 *  `modifica(radacina, date)` (opțional) schimbă rădăcina sau datele înainte de build. */
async function construiesteExemplu(exemplu, { modifica } = {}) {
  const temp = creeazaRadacinaTemp({
    copiaza: ['motoare/comun', 'motoare/hyperframes/comun', 'nucleu/VERSIUNI.json'],
    biblioteciMini: true,
  });
  const { radacina } = temp;
  try {
    const date = JSON.parse(fs.readFileSync(path.join(DIR_SABLON, 'exemple', `${exemplu}.json`), 'utf8'));
    assert.equal(date.brand ?? null, null, `${exemplu}: exemplele golden nu folosesc brand`);
    if (modifica) await modifica(radacina, date);
    const dirProiect = path.join(radacina, 'video', PROIECT);
    fs.mkdirSync(dirProiect, { recursive: true });
    scrieLock(path.join(dirProiect, 'motor.lock'), lockNou({ proiect: PROIECT, sablon, versiuni: citesteVersiuni(radacina), acum: ACUM }));
    const ctx = creeazaCtx({ radacina, proiect: PROIECT, dirProiect, sablon, mod: 'doar-verificare', catalog: incarcaCatalog(radacina) });
    const v = sablon.modul.valideaza(date, ctx);
    assert.deepEqual(v.erori, [], `${exemplu}: valideaza`);
    const s = rezolvaStil({ radacina, sablon, date, brand: null });
    assert.deepEqual(s.erori, [], `${exemplu}: rezolvaStil`);
    const c = sablon.modul.cronologie(date, s.stil, ctx);
    assert.deepEqual(c.erori, [], `${exemplu}: cronologie`);
    const construieste = (dirBuild) => sablon.modul.construieste(date, s.stil, c.cronologie, dirBuild, { ...ctx, intern: c.intern });
    const dirBuild = path.join(dirProiect, 'build');
    const rezultat = await construieste(dirBuild);
    return { ...temp, date, dirProiect, dirBuild, rezultat, construieste, cronologie: c.cronologie, stil: s.stil, ctx: { ...ctx, intern: c.intern } };
  } catch (e) {
    // un build care pică (testele ostile) nu lasă rădăcina temporară în urmă
    temp.curata();
    throw e;
  }
}

test('exemplele obligatorii există', () => {
  for (const e of OBLIGATORII) assert.ok(EXEMPLE.includes(e), `lipsește exemple/${e}.json`);
});

for (const exemplu of EXEMPLE) {
  test(`${exemplu}: plan.json și index.html sunt identice cu golden-ul`, async (t) => {
    const b = await construiesteExemplu(exemplu);
    try {
      for (const fisier of ['plan.json', 'index.html']) {
        const obtinut = fs.readFileSync(path.join(b.dirBuild, fisier));
        const caleGolden = path.join(DIR_GOLDEN, exemplu, fisier);
        if (ACTUALIZEAZA) {
          fs.mkdirSync(path.dirname(caleGolden), { recursive: true });
          fs.writeFileSync(caleGolden, obtinut);
          t.diagnostic(`scris ${path.relative(REPO, caleGolden)}`);
          continue;
        }
        assert.ok(fs.existsSync(caleGolden), `lipsește ${path.relative(REPO, caleGolden)}; rulează o dată cu MG_ACTUALIZEAZA_GOLDEN=1 și inspectează rezultatul`);
        assert.ok(obtinut.equals(fs.readFileSync(caleGolden)), `${fisier} diferă de ${path.relative(REPO, caleGolden)}`);
      }
      assert.deepEqual(b.rezultat.fisiere.filter((f) => !f.startsWith('fonturi/')), ['gsap.min.js', 'index.html', 'plan.json', 'stil-rezolvat.json']);
      assert.ok(b.rezultat.fisiere.some((f) => f.startsWith('fonturi/') && f.endsWith('.woff2')));
      assert.equal(b.rezultat.intrare, 'index.html');
    } finally {
      b.curata();
    }
  });

  test(`${exemplu}: al doilea build e identic, fără rețea, iar activele sunt înghețate`, async () => {
    const b = await construiesteExemplu(exemplu);
    try {
      const alDoilea = path.join(b.dirProiect, 'build-2');
      await b.construieste(alDoilea);
      for (const fisier of ['plan.json', 'index.html']) {
        assert.ok(fs.readFileSync(path.join(b.dirBuild, fisier)).equals(fs.readFileSync(path.join(alDoilea, fisier))), fisier);
      }
      const html = fs.readFileSync(path.join(b.dirBuild, 'index.html'), 'utf8');
      const faraXmlns = html.split('xmlns="http://www.w3.org/2000/svg"').join('');
      assert.deepEqual(faraXmlns.match(/https?:\/\/[^\s"')]*/g) ?? [], [], 'index.html nu are voie să conțină adrese de rețea');

      const lock = citesteLock(path.join(b.dirProiect, 'motor.lock'));
      const active = Object.keys(lock.active);
      const desene = [...new Set(b.date.scene.filter((s) => s.desen).map((s) => s.desen.id))];
      for (const id of desene) assert.ok(active.some((a) => a.startsWith(`active/desen/${id}.`)), `${id} nu e înghețat`);
      assert.equal(verificaActive(b.radacina, PROIECT, lock).ok, true);
    } finally {
      b.curata();
    }
  });
}

// Planul F (F11): selectorii textelor, pentru index.motion.json. Node nu are un parser DOM, deci testul folosește formele
// cunoscute ale HTML-ului cardurilor, scrise de carduri() în compileaza.mjs, și verifică corespondența pe golden și pe plan.
test('F11: fiecare segment cu texte are selectori, câte unul pe text, toți unici, și urmează structura scrisă de carduri()', async () => {
  for (const exemplu of EXEMPLE) {
    const b = await construiesteExemplu(exemplu);
    try {
      const plan = b.ctx.intern;
      const html = fs.readFileSync(path.join(DIR_GOLDEN, exemplu, 'index.html'), 'utf8');
      const toti = [];
      for (const s of b.cronologie.segmente) {
        if (s.texte.length === 0) {
          assert.equal(s.selectori, undefined, `${exemplu} ${s.ref}`);
          continue;
        }
        assert.equal(s.selectori.length, s.texte.length, `${exemplu} ${s.ref}`);
        toti.push(...s.selectori);
        s.selectori.forEach((sel, i) => {
          const text = s.texte[i];
          let m;
          if ((m = /^#(c\d+) > \.label$/.exec(sel))) {
            assert.ok(html.includes(`<div class="card" id="${m[1]}"><div class="label">${escapeazaHtml(text)}</div>`), `${exemplu}: ${sel} → ${text}`);
          } else if ((m = /^#(c\d+) > :nth-child\((\d+)\) > \.h$/.exec(sel))) {
            const card = plan.carduri.find((c) => c.id === m[1]);
            const k = Number(m[2]) - (card.eticheta ? 2 : 1);
            assert.equal(card.randuri[k].text, text, `${exemplu}: ${sel}`);
            assert.ok(html.includes(`>${escapeazaHtml(text)}</div></div>`), `${exemplu}: ${sel} → ${text}`);
          } else if ((m = /^#cuvinte-(c\d+) > :nth-child\((\d+)\)$/.exec(sel))) {
            const card = plan.carduri.find((c) => c.id === m[1]);
            assert.equal(card.cuvinte[Number(m[2]) - 1].text, text, `${exemplu}: ${sel}`);
            assert.ok(html.includes(`id="cuvinte-${m[1]}"`), `${exemplu}: ${sel}`);
          } else {
            assert.equal(sel, '#cta .h', `${exemplu}: ${sel}`);
            assert.equal(plan.cta.text, text);
            assert.ok(html.includes(`<div class="card" id="cta"><div class="mask" data-layout-allow-overflow><div class="h">${escapeazaHtml(text)}</div>`));
          }
        });
      }
      assert.ok(toti.length > 0, exemplu);
      assert.equal(new Set(toti).size, toti.length, `${exemplu}: selectori dublați`);
      // selectorii stau doar în cronologie, nu în plan.json (golden-ul nu se schimbă)
      assert.equal(fs.readFileSync(path.join(b.dirBuild, 'plan.json'), 'utf8').includes('selectori'), false);
    } finally {
      b.curata();
    }
  }
});

test('F11: cu muzică, cronologia are audio, iar index.html e golden-ul plus rândul <audio>', async () => {
  const b = await construiesteExemplu('minim', {
    modifica: async (radacina, date) => {
      date.muzica = { fisier: 'resurse/muzica.mp3', volum: 0.4, incepe_de_la: 4 };
    },
  });
  try {
    assert.deepEqual(b.cronologie.audio, { fisier: 'build/assets/muzica.m4a', durata: b.cronologie.durata });
    const audio = elementAudio(b.cronologie);
    assert.match(audio, /^<audio id="muzica" src="assets\/muzica\.m4a" data-start="0" data-duration="[\d.]+" data-track-index="10" data-volume="1"><\/audio>$/);
    const cu = fs.readFileSync(path.join(b.dirBuild, 'index.html'), 'utf8');
    const golden = fs.readFileSync(path.join(DIR_GOLDEN, 'minim', 'index.html'), 'utf8');
    assert.equal(cu.split('<audio ').length - 1, 1);
    assert.equal(cu.replace(`\n      ${audio}`, ''), golden);
    assert.deepEqual(sablon.modul.asteptari(b.cronologie, b.ctx).audio, { prezent: true, durata: b.cronologie.durata });
    // planul nu se schimbă cu muzica
    assert.ok(fs.readFileSync(path.join(b.dirBuild, 'plan.json')).equals(fs.readFileSync(path.join(DIR_GOLDEN, 'minim', 'plan.json'))));
  } finally {
    b.curata();
  }
});

test('pe hartie, ceața se desenează la intensitatea limitată din A06 (0,91), aceeași pe care o măsoară C06', async () => {
  const b = await construiesteExemplu('minim', {
    modifica: async (radacina, date) => {
      date.stil = { ...(date.stil ?? {}), tema: 'hartie' };
    },
  });
  try {
    const html = fs.readFileSync(path.join(b.dirBuild, 'index.html'), 'utf8');
    // accent #C2410C la 0,3 * 0,91; linie = text #2A2420 la 0,14 * 0,91
    assert.match(html, /--ceata-a: rgba\(194, 65, 12, 0\.273\);/);
    assert.match(html, /--ceata-b: rgba\(42, 36, 32, 0\.1274\);/);
  } finally {
    b.curata();
  }
});

test('fontul de brand al titlului se copiază ca brand-<fișier>, cu @font-face „MG <familie>”; un fișier lipsă dă font-necunoscut', async () => {
  const b = await construiesteExemplu('minim');
  try {
    // orice woff2 din build-ul de catalog ține locul fișierului de brand: construieste doar îl copiază (C05 e în B12)
    const sursa = b.rezultat.fisiere.find((f) => f.startsWith('fonturi/') && f.endsWith('.woff2'));
    fs.mkdirSync(path.join(b.radacina, 'branduri', 'studio'), { recursive: true });
    fs.copyFileSync(path.join(b.dirBuild, ...sursa.split('/')), path.join(b.radacina, 'branduri', 'studio', 'titlu.woff2'));
    const cuBrand = (fisier) => ({
      ...b.stil,
      font_titlu: { valoare: { fisier, familie: 'Studio Serif' }, sursa: 'brand' },
    });

    const dirBrand = path.join(b.dirProiect, 'build-brand');
    const r = await sablon.modul.construieste(b.date, cuBrand('branduri/studio/titlu.woff2'), b.cronologie, dirBrand, b.ctx);
    assert.ok(r.fisiere.includes('fonturi/brand-titlu.woff2'), r.fisiere.join(', '));
    assert.ok(fs.existsSync(path.join(dirBrand, 'fonturi', 'brand-titlu.woff2')));
    assert.deepEqual(r.fisiere, [...r.fisiere].sort());
    const html = fs.readFileSync(path.join(dirBrand, 'index.html'), 'utf8');
    assert.match(html, /font-family: "MG Studio Serif";/);
    assert.match(html, /src: url\("fonturi\/brand-titlu\.woff2"\) format\("woff2"\);/);
    assert.match(html, /--font-titlu: "MG Studio Serif", serif;/);

    await assert.rejects(
      sablon.modul.construieste(b.date, cuBrand('branduri/studio/lipsa.woff2'), b.cronologie, path.join(b.dirProiect, 'build-lipsa'), b.ctx),
      (e) => e.eroareMg?.cod === 'font-necunoscut' && e.eroareMg?.camp === 'brand',
    );
  } finally {
    b.curata();
  }
});

test('un activ modificat după înghețare dă resursa-hash (C07)', async () => {
  const b = await construiesteExemplu('minim');
  try {
    const lock = citesteLock(path.join(b.dirProiect, 'motor.lock'));
    const cale = Object.keys(lock.active).find((a) => a.startsWith('active/desen/'));
    fs.appendFileSync(path.join(b.dirProiect, ...cale.split('/')), ' ');
    const r = verificaActive(b.radacina, PROIECT, lock);
    assert.equal(r.ok, false);
    assert.deepEqual(r.erori.map((e) => [e.cod, e.camp]), [['resursa-hash', `fisier:video/${PROIECT}/${cale}`]]);
  } finally {
    b.curata();
  }
});

test('asteptari dă textele fiecărui segment la momentul complet, momentele, audio și fundalul (harta 5.9)', async () => {
  const b = await construiesteExemplu('01-rutina-preluata');
  try {
    const a = sablon.modul.asteptari(b.cronologie, b.ctx);
    const segmente = b.cronologie.segmente;
    const sig = b.ctx.intern.semnatura;
    assert.deepEqual(a.momente, segmente.map((s) => s.complet));
    // T7: după textele segmentelor vine semnătura, complet scrisă la t + dur, în zona lui #sig
    assert.deepEqual(a.texte, [
      ...segmente.flatMap((s) => s.texte.map((text) => ({ ref: s.ref, camp: s.camp, text, t: s.complet, zona_text: s.zona_text }))),
      { ref: 'Semnătura', camp: 'semnatura', text: 'Ana Pop,\ncoach de carieră', t: sig.t + sig.dur, zona_text: [96, 1500, 888, 83.7] },
    ]);
    assert.ok(a.texte.some((x) => x.ref === 'Scena 3' && x.text === 'fără tine?'), 'textul accentuat intră fără steluțe');
    assert.deepEqual(a.audio, { prezent: false, durata: null });
    assert.equal(a.fundal, b.cronologie.fundal);
  } finally {
    b.curata();
  }
});

test('casete (C13): fiecare text are caseta lui reală, calculată din CSS-ul din sablon.html și din font', async () => {
  const b = await construiesteExemplu('01-rutina-preluata', {
    modifica: (_r, date) => { date.scene[date.scene.length - 1].cta = 'Scrie-mi „sistem” în mesaj.'; },
  });
  try {
    const a = sablon.modul.asteptari(b.cronologie, { ...b.ctx, stil: b.stil });
    const dupa = (text) => a.texte.find((x) => x.text === text);
    const aproape = (x, y, mesaj) => assert.ok(Math.abs(x - y) < 0.5, `${mesaj}: ${x} față de ${y}`);
    // .label: 28 px Inter 500, line-height normal = (1984 + 494) / 2048 x 28 = 33,88; .gap: 28 px; .h: 96 px x 1,08 = 103,68
    const eticheta = dupa('VINERI SEARA, TOT AICI').caseta;
    assert.deepEqual(eticheta.slice(0, 2), [96, 200]);
    aproape(eticheta[3], 33.88, 'înălțimea etichetei');
    const titlu = dupa('Ții totul minte.').caseta;
    aproape(titlu[1], 261.88, 'y-ul primului rând');
    aproape(titlu[3], 103.68, 'un rând de titlu');
    assert.ok(titlu[2] > 550 && titlu[2] < 700, `lățimea titlului: ${titlu[2]}`);
    // „Dacă rutina merge” (801 px) încape pe un rând (regula de lățime din C04, 2026-10-06); rândul accentuat vine imediat sub el
    const scurt = dupa('Dacă rutina merge').caseta;
    aproape(scurt[3], 103.68, 'un singur rând');
    assert.ok(scurt[2] > 780 && scurt[2] < 820, `lățimea rândului: ${scurt[2]}`);
    aproape(dupa('fără tine?').caseta[1], 261.88 + 103.68, 'rândul accentuat');
    // un rând mai lat decât cardul (planul modificat de mână, pe lângă regula din cronologie): caseta urmează ruperea browserului
    const plan = structuredClone(b.ctx.intern);
    plan.carduri.find((c) => c.randuri?.[0]?.text === 'Dacă rutina merge').randuri[0].text = 'Dacă rutina ar merge';
    const rupte = caseteTexte({ plan, stil: valoriStil(b.stil), radacina: b.radacina, sablonHtml: fs.readFileSync(path.join(DIR_SABLON, 'sablon.html'), 'utf8'), latimeFormat: 1080 }).scene.get(2);
    const lung = rupte.find((x) => x.text === 'Dacă rutina ar merge').caseta;
    aproape(lung[3], 207.36, 'titlul rupt pe două rânduri');
    assert.ok(lung[2] <= 888, `lățimea e cea a cardului: ${lung[2]}`);
    aproape(rupte.find((x) => x.text === 'fără tine?').caseta[1], 261.88 + 207.36, 'rândul de după titlul rupt');
    // cuvintele se înlocuiesc în același loc; fiecare e măsurat la momentul lui
    const card2 = b.ctx.intern.carduri.find((c) => c.cuvinte);
    card2.cuvinte.forEach((w, i) => {
      const x = dupa(w.text);
      aproape(x.caseta[1], 261.88, w.text);
      assert.equal(x.t, Math.round((w.t + 0.45) * 1000) / 1000, `momentul lui ${w.text}`);
    });
    // #cta: top 560 px, 44 px x 1,2; #sig: top 1500 px, două rânduri de 27 px x 1,55
    const cta = dupa('Scrie-mi „sistem” în mesaj.').caseta;
    assert.deepEqual([cta[0], cta[1]], [96, 560]);
    aproape(cta[3], 52.8, 'înălțimea îndemnului');
    const sig = dupa('Ana Pop,\ncoach de carieră');
    assert.deepEqual(sig.zona_text, [96, 1500, 888, 83.7]);
    assert.deepEqual([sig.caseta[0], sig.caseta[1], sig.caseta[3]], [96, 1500, 83.7]);
    assert.ok(sig.caseta[2] > 190 && sig.caseta[2] < 240, `lățimea semnăturii: ${sig.caseta[2]}`);
    assert.ok(a.texte.every((x) => x.caseta && x.caseta[0] + x.caseta[2] <= 1080 && x.caseta[1] + x.caseta[3] <= 1920), 'toate în cadru');
  } finally {
    b.curata();
  }
});

test('casete (C13): CSS-ul fără o declarație de care depind casetele oprește calculul, fără casete vechi', () => {
  const html = fs.readFileSync(path.join(DIR_SABLON, 'sablon.html'), 'utf8');
  const g = geometrieTexte(html);
  assert.deepEqual([g.card.x, g.card.y, g.card.dreapta, g.gol, g.cta.y, g.semnatura.y], [96, 200, 96, 28, 560, 1500]);
  assert.deepEqual([g.rand.marime, g.rand.inaltimeRand, g.rand.spatiere, g.rand.greutate], [96, 1.08, '-.035em', 700]);
  assert.deepEqual([g.eticheta.marime, g.eticheta.inaltimeRand, g.eticheta.greutate], [28, 'normal', 500]);
  assert.deepEqual([g.cta.marime, g.cta.inaltimeRand, g.semnatura.marime, g.semnatura.inaltimeRand], [44, 1.2, 27, 1.55]);
  assert.throws(() => geometrieTexte(html.replace('#cta { top: 560px; }', '#cta { }')), /#cta \{ top \}/);
});

test('casete (C13): o valoare CSS nenumerică oprește calculul cu selectorul, proprietatea și valoarea, fără NaN în casete', () => {
  const html = fs.readFileSync(path.join(DIR_SABLON, 'sablon.html'), 'utf8');
  const cu = (vechi, nou) => {
    const h = html.replace(vechi, nou);
    assert.notEqual(h, html, `șablonul nu mai conține ${vechi}`);
    return h;
  };
  const cazuri = [
    // line-height cu unitate: Number('104px') ar fi NaN, iar caseta ar ieși [x, y, w, NaN]
    [cu('font-size: 96px; line-height: 1.08;', 'font-size: 96px; line-height: 104px;'), /„\.h \{ line-height: 104px \}”.*factor fără unitate/],
    // font-weight cu nume: Number('bold') ar fi NaN, iar metricile fontului s-ar alege greșit
    [cu('.h { font-family: var(--font-titlu); font-weight: 700;', '.h { font-family: var(--font-titlu); font-weight: bold;'), /„\.h \{ font-weight: bold \}”.*greutate numerică/],
    [cu('#sig { position: absolute; left: 96px;', '#sig { position: absolute; left: 1.2.3px;'), /„#sig \{ left: 1\.2\.3px \}”.*px/],
    [cu('font-size: 28px;', 'font-size: 2rem;'), /„\.label \{ font-size: 2rem \}”/],
    [cu('line-height: 1.55;', 'line-height: calc(1.5);'), /„#sig \{ line-height: calc\(1\.5\) \}”/],
  ];
  for (const [h, mesaj] of cazuri) assert.throws(() => geometrieTexte(h), mesaj);
  // zonaSemnatura trece prin aceeași validare, deci nu poate întoarce o zonă cu NaN
  assert.throws(() => zonaSemnatura(cazuri[4][0], 'Ana', 1080), /line-height: calc/);
  assert.ok(zonaSemnatura(html, 'Ana\nPop', 1080).every(Number.isFinite));
});

test('T4: construieste întoarce activele folosite de planul curent, nu tot motor.lock', async () => {
  const b = await construiesteExemplu('minim');
  try {
    const lock = citesteLock(path.join(b.dirProiect, 'motor.lock'));
    assert.deepEqual(b.rezultat.active, Object.keys(lock.active).sort());
    assert.ok(b.rezultat.active.some((a) => a.startsWith('active/desen/')));
    // alt desen în scenă: activul vechi rămâne în motor.lock, dar nu mai e în lista planului
    const scena = b.date.scene.findIndex((s) => s.desen);
    const prefix = `active/desen/${b.date.scene[scena].desen.id}.`;
    const vechi = Object.keys(lock.active).find((k) => k.startsWith(prefix)); // extensia depinde de tipul piesei (forma: .svg)
    assert.ok(vechi, `în motor.lock lipsește activul ${prefix}*`);
    const date = structuredClone(b.date);
    date.scene[scena].desen.id = 'od-chilling';
    const s = rezolvaStil({ radacina: b.radacina, sablon, date, brand: null });
    const c = sablon.modul.cronologie(date, s.stil, b.ctx);
    assert.deepEqual(c.erori, []);
    const r = await sablon.modul.construieste(date, s.stil, c.cronologie, b.dirBuild, { ...b.ctx, intern: c.intern });
    assert.ok(Object.hasOwn(citesteLock(path.join(b.dirProiect, 'motor.lock')).active, vechi), vechi);
    assert.ok(!r.active.includes(vechi), JSON.stringify(r.active));
  } finally {
    b.curata();
  }
});

test('felia 4: titlul rupt de marime rămâne un singur text static în build, deci C17 trece', async () => {
  // revizia feliei 4: cu <br>, rândul ajungea în două noduri de text, iar C17 dădea text-lipsa-din-build
  const b = await construiesteExemplu('minim', { modifica: (_r, date) => {
    date.scene[2].titlu = ['Nu te înlocuiește.', '*Îți dă timpul înapoi.*'];
    date.scene[2].marime = 'L';
  } });
  try {
    assert.ok(b.ctx.intern.carduri.find((c) => c.scena === 2).rupturi, 'titlul chiar s-a rupt');
    const c17 = verificaBuild({ dirBuild: b.dirBuild, asteptari: sablon.modul.asteptari(b.cronologie, b.ctx), check: null, versiuni: citesteVersiuni(REPO) })[1];
    assert.equal(c17.ok, true, JSON.stringify(c17.erori));
  } finally {
    b.curata();
  }
});

test('T7: C17 pică dacă semnătura aprobată lipsește din build/index.html', async () => {
  const b = await construiesteExemplu('01-rutina-preluata');
  try {
    const a = sablon.modul.asteptari(b.cronologie, b.ctx);
    const versiuni = citesteVersiuni(REPO);
    const c17 = () => verificaBuild({ dirBuild: b.dirBuild, asteptari: a, check: null, versiuni })[1];
    assert.equal(c17().ok, true, JSON.stringify(c17().erori));
    const cale = path.join(b.dirBuild, 'index.html');
    const html = fs.readFileSync(cale, 'utf8');
    const fara = html.replace(/(<div id="sig"[^>]*>)[^<]*(<\/div>)/, '$1$2');
    assert.notEqual(fara, html, '#sig lipsește din șablon');
    fs.writeFileSync(cale, fara);
    const r = c17();
    assert.equal(r.ok, false);
    assert.deepEqual(r.erori.map((e) => [e.cod, e.mesaj.split(':')[0]]), [['text-lipsa-din-build', 'Semnătura']]);
  } finally {
    b.curata();
  }
});

// PNG minim valid ca antet (semnătura și IHDR), cât să-l accepte mg desen adauga (B04)
function pngMinim(latime, inaltime) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(latime, 16);
  b.writeUInt32BE(inaltime, 20);
  b[24] = 8;
  b[25] = 6;
  return b;
}

test('o piesă raster proprie (PNG) se îngheață și intră prin apariție (spec 8.6)', async () => {
  const b = await construiesteExemplu('minim', {
    modifica: async (radacina, date) => {
      const png = path.join(radacina, 'sigla.png');
      fs.writeFileSync(png, pngMinim(300, 200));
      const piesa = await adaugaPiesa(radacina, png, { licenta: 'desenul meu', etichete: ['siglă', 'firmă', 'logo', 'marcă'] });
      assert.equal(piesa.id, 'p-sigla');
      date.scene.find((s) => s.desen).desen.id = piesa.id;
    },
  });
  try {
    const lock = citesteLock(path.join(b.dirProiect, 'motor.lock'));
    assert.ok(Object.keys(lock.active).includes('active/desen/p-sigla.png'), Object.keys(lock.active).join(', '));
    const plan = JSON.parse(fs.readFileSync(path.join(b.dirBuild, 'plan.json'), 'utf8'));
    assert.equal(plan.desene.find((d) => d.id === 'p-sigla').animatie, 'aparitie');
    assert.match(fs.readFileSync(path.join(b.dirBuild, 'index.html'), 'utf8'), /data:image\/png;base64,iVBORw0KGgo/);
    assert.equal(verificaActive(b.radacina, PROIECT, lock).ok, true);
  } finally {
    b.curata();
  }
});

// Revizuirea transversală B01-B13 (T11, T12, T13): ce intră în build din proprii/ și din biblioteci/.
const ETICHETE = ['siglă', 'firmă', 'logo', 'marcă'];

/** Desenele din window.__MG_DESENE al lui build/index.html, ca obiect. */
function deseneDinBuild(dirBuild) {
  const html = fs.readFileSync(path.join(dirBuild, 'index.html'), 'utf8');
  const m = /^window\.__MG_DESENE = (.*);(?:<\/script>)?$/m.exec(html);
  assert.ok(m, 'lipsește window.__MG_DESENE');
  return JSON.parse(m[1]);
}

/** Scrie de mână o piesă în proprii/catalog-propriu.json, cum ar face-o cineva care ocolește mg desen adauga. */
function scriePiesaProprie(radacina, piesa) {
  const cale = path.join(radacina, 'proprii', 'catalog-propriu.json');
  fs.mkdirSync(path.dirname(cale), { recursive: true });
  fs.writeFileSync(cale, `${JSON.stringify({ versiune: 1, piese: [piesa] }, null, 2)}\n`);
}

test('T11: un SVG cu „>” într-un atribut al rădăcinii, adăugat cu mg desen adauga, nu pune niciun tag înaintea primului <path>', async () => {
  const b = await construiesteExemplu('minim', {
    modifica: async (radacina, date) => {
      const svg = path.join(radacina, 'logo.svg');
      fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" aria-label="><image href=x onerror=alert(1)>">'
        + '<path d="M0 0 L10 10" fill="#000"/></svg>');
      const piesa = await adaugaPiesa(radacina, svg, { licenta: 'desenul meu', etichete: ETICHETE });
      date.scene.find((s) => s.desen).desen.id = piesa.id;
    },
  });
  try {
    const { continut } = deseneDinBuild(b.dirBuild)['p-logo'];
    assert.ok(continut.startsWith('<path '), continut);
    assert.ok(!continut.includes('<image'), continut);
  } finally {
    b.curata();
  }
});

test('T12: o formă scrisă de mână în proprii/, cu <image onerror>, oprește build-ul cu desen-svg-periculos', async () => {
  await assert.rejects(construiesteExemplu('minim', {
    modifica: async (radacina, date) => {
      const cale = path.join(radacina, 'proprii', 'forme', 'p-x.svg');
      fs.mkdirSync(path.dirname(cale), { recursive: true });
      fs.writeFileSync(cale, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href=x onerror=alert(1)>'
        + '<path class="ink" d="M0 0 L10 10"/></svg>\n');
      scriePiesaProprie(radacina, {
        id: 'p-x', tip: 'forma', familie: 'proprie', sursa: 'proprie', fisier: 'forme/p-x.svg', licenta: 'a mea',
        cutie: { w: 10, h: 10 }, roluri: ['ink'], recolorabil: true, etichete: ETICHETE, noapte: 'autocolant',
        teme_potrivite: ['noapte', 'hartie', 'curat'], animatie: { implicit: 'contur-umplere', alternative: [], esalonare: 0.06, accent: 'aparitie' },
      });
      date.scene.find((s) => s.desen).desen.id = 'p-x';
    },
  }), (e) => e.eroareMg?.cod === 'desen-svg-periculos' && e.eroareMg.camp === 'scene[0].desen.id');
});

test('T12: o formă de bibliotecă cu <img onerror> ascuns în <metadata> se îngheață și intră în build doar normalizată', async () => {
  const b = await construiesteExemplu('minim', {
    modifica: async (radacina, date) => {
      fs.writeFileSync(path.join(radacina, 'biblioteci', 'forme', 'od-meditating.svg'),
        '<svg viewBox="0 0 10 10"><metadata><img src=x onerror=alert(1)></metadata><path class="ink" d="M0 0 L10 10"/></svg>\n');
      date.scene.find((s) => s.desen).desen.id = 'od-meditating';
    },
  });
  try {
    const inghetat = fs.readFileSync(path.join(b.dirProiect, 'active', 'desen', 'od-meditating.svg'), 'utf8');
    assert.equal(inghetat, '<svg viewBox="0 0 10 10"><path class="ink" d="M0 0 L10 10"/></svg>\n');
    assert.equal(deseneDinBuild(b.dirBuild)['od-meditating'].continut, '<path class="ink" d="M0 0 L10 10"/>');
  } finally {
    b.curata();
  }
});

test('T13: un „fisier” din catalog-propriu.json care iese din proprii/ dă valoare-invalida pe catalog, fără citire', async () => {
  await assert.rejects(construiesteExemplu('minim', {
    modifica: async (radacina, date) => {
      scriePiesaProprie(radacina, {
        id: 'p-x', tip: 'forma', familie: 'proprie', fisier: '../../../Desktop/poza.png', licenta: 'a mea', cutie: { w: 100, h: 100 },
      });
      date.scene.find((s) => s.desen).desen.id = 'p-x';
    },
  }), (e) => e.eroareMg?.cod === 'valoare-invalida' && e.eroareMg.camp === 'fisier:proprii/catalog-propriu.json' && e.codIesire === 1);
});

// T16: rolurile și CSS-ul lor au o singură sursă (nucleu/lib/desen/roluri.mjs), deci clasa de contur pusă de
// mg desen adauga are stroke și în reel, nu doar în foaia mg desen arata.
test('T16: o piesă proprie desenată cu contur, compilată, are stroke în reel', async () => {
  const b = await construiesteExemplu('minim', {
    modifica: async (radacina, date) => {
      const svg = path.join(radacina, 'schita.svg');
      fs.writeFileSync(svg, '<svg viewBox="0 0 100 100"><path d="M10 10 L90 90" fill="none" stroke="#000" stroke-width="4"/></svg>');
      const piesa = await adaugaPiesa(radacina, svg, { licenta: 'desenul meu', etichete: ETICHETE });
      date.scene.find((s) => s.desen).desen.id = piesa.id;
    },
  });
  try {
    const { continut } = deseneDinBuild(b.dirBuild)['p-schita'];
    const clase = /<path class="([^"]+)"/.exec(continut)[1].split(' ');
    assert.deepEqual(clase, ['ink-contur']);
    const css = /<style>([\s\S]*?)<\/style>/.exec(fs.readFileSync(path.join(b.dirBuild, 'index.html'), 'utf8'))[1];
    for (const clasa of clase) assert.match(css, new RegExp(`#art \\.${clasa} \\{ stroke: var\\(--linie\\); \\}`), clasa);
  } finally {
    b.curata();
  }
});

test('hyperframes check --json trece pe build-ul fiecărui exemplu', { skip: !INTEGRARE && 'setează MG_TESTE_INTEGRARE=1', timeout: 600000 }, async () => {
  for (const exemplu of EXEMPLE) {
    const b = await construiesteExemplu(exemplu);
    try {
      const check = await checkJson(b.dirBuild, { radacina: REPO });
      const gasiri = ['lint', 'runtime', 'layout', 'motion', 'contrast']
        .flatMap((cheie) => check[cheie].findings.map((f) => `${cheie}: ${f.severity} ${f.code} ${f.message}`));
      assert.equal(check._meta.version, '0.8.96', exemplu);
      assert.equal(check.ok, true, `${exemplu}\n${gasiri.join('\n')}`);
      assert.equal(check.lint.errorCount, 0, `${exemplu}\n${gasiri.join('\n')}`);
      assert.equal(check.runtime.errorCount, 0, `${exemplu}\n${gasiri.join('\n')}`);
    } finally {
      b.curata();
    }
  }
});
