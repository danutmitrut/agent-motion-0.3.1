// Blocul „Ce apare pe ecran” al reelului (B12, harta 5.11; planul E, M1), din blocScenariu al șablonului prin blocPentru:
// textele afișate, accentul, eticheta singură a unei scene desen (randuri null), cuvintele, îndemnul și semnătura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { rezolvaStil } from '../../nucleu/lib/teme.mjs';
import { incarcaCatalog } from '../../nucleu/lib/desen/catalog.mjs';
import { creeazaCtx } from '../../nucleu/lib/context.mjs';
import { genereazaBloc, hashZonaTexte } from '../../nucleu/lib/scenariu.mjs';
import { blocPentru } from '../../nucleu/lib/randeaza/bloc.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const EXEMPLE = path.join(REPO, 'motoare', 'hyperframes', 'sabloane', 'reel-ilustrat', 'exemple');
const citesteExemplu = (nume) => JSON.parse(fs.readFileSync(path.join(EXEMPLE, nume), 'utf8'));

// Literalele de mai jos sunt ieșirea codului de dinainte de M1 (liniiTexte și liniiStil din nucleu), luate o singură dată.
// Zona „Texte și cifre” intră în hash-ul aprobării (C08): nu se editează niciodată.
const BLOC_ASTEPTAT_1 = "<!-- mg:start -->\n## Ce apare pe ecran\n\n### Texte și cifre\n- Scena 1, titlu, rândul 1: „Faci totul singur.”\n- Scena 2, eticheta: „LUNI, 8:30”\n- Scena 3, titlu, rândul 1: „Un sistem”\n- Scena 3, titlu, rândul 2 (accent): „preia rutina.”\n- Scena 4, titlu, rândul 1: „Tu decizi.”\n- Scena 4, îndemn: „Scrie „AGENT” în comentarii”\n- Semnătura: „Ana Pop, / coach de carieră”\n\n### Stil și timpi\n- Tema: noapte; accent #FF7A59 (din temă); linie #F2EFEA (implicit)\n- Ritm: normal; atmosferă: ceață\n- Scena 1 (desen, op-bust-laptop): 0,0-6,8 s, complet la 3,7 s\n- Scena 2 (desen, op-bust-cafea): 6,8-13,6 s, complet la 10,5 s\n- Scena 3 (retea): 13,6-21,8 s, complet la 18,2 s\n- Scena 4 (final, od-chilling): 21,8-30,0 s, complet la 26,7 s\n<!-- mg:end -->";
const BLOC_ASTEPTAT_2 = "<!-- mg:start -->\n## Ce apare pe ecran\n\n### Texte și cifre\n- Scena 1, eticheta: „VINERI SEARA, TOT AICI”\n- Scena 1, titlu, rândul 1: „Ții totul minte.”\n- Scena 2, eticheta: „DE DIMINEAȚĂ, MEREU”\n- Scena 2, cuvinte: „Mesaje.” / „Cereri.” / „Termene.” / „Plăți.”\n- Scena 3, eticheta: „ACUM”\n- Scena 3, titlu, rândul 1: „Dacă rutina merge”\n- Scena 3, titlu, rândul 2 (accent): „fără tine?”\n- Scena 4, eticheta: „APOI”\n- Scena 4, titlu, rândul 1: „Ai timp”\n- Scena 4, titlu, rândul 2 (accent): „pentru oameni.”\n- Scena 5, eticheta: „TU ȘI SISTEMUL”\n- Scena 5, titlu, rândul 1: „Ritmul îl alegi”\n- Scena 5, titlu, rândul 2 (accent): „tot tu.”\n- Semnătura: „Ana Pop, / coach de carieră”\n\n### Stil și timpi\n- Tema: noapte; accent #FF7A59 (din temă); linie #F2EFEA (implicit)\n- Ritm: normal; atmosferă: ceață\n- Scena 1 (desen, od-running, mare): 0,0-4,4 s, complet la 3,7 s\n- Scena 2 (adunare): 4,4-9,6 s, complet la 8,25 s\n- Scena 3 (retea): 9,6-18,6 s, complet la 14,2 s\n- Scena 4 (desen, od-strolling, mare): 18,6-24,4 s, complet la 22,8 s\n- Scena 5 (final, od-chilling, mediu): 24,4-30,0 s, complet la 28,5 s\n<!-- mg:end -->";

/** minim.json plus o scenă desen doar cu etichetă, îndemnul și semnătura pe două rânduri. */
function dateTest() {
  const date = citesteExemplu('minim.json');
  // un card de tip card are mereu titlu sau cuvinte (valideaza, 2026-10-06); eticheta fără titlu apare doar pe o scenă cu desen
  date.scene.splice(1, 0, { tip: 'desen', eticheta: 'Luni, 8:30', desen: { id: 'op-bust-cafea' } });
  date.scene[3].cta = 'Scrie „AGENT” în comentarii';
  date.semnatura = 'Ana Pop,\ncoach de carieră';
  return date;
}

/** Pregătirea până la asteptari, ca în pregatesteBuild: stilul, cronologia, ctx-ul unic (M6) și așteptările. */
async function pregatire(date, catalog) {
  const sablon = await incarcaSablon(REPO, 'reel-ilustrat');
  const { stil, erori } = rezolvaStil({ radacina: REPO, sablon, date, brand: null });
  assert.deepEqual(erori, []);
  const ctx = creeazaCtx({ radacina: REPO, proiect: 'proba', dirProiect: path.join(REPO, 'video', 'proba'), sablon, mod: 'doar-verificare', catalog });
  const c = sablon.modul.cronologie(date, stil, { ...ctx, stil });
  assert.deepEqual(c.erori, []);
  const pctx = { ...ctx, stil, intern: c.intern };
  return { sablon, date, stil, cronologie: c.cronologie, intern: c.intern, ctx: pctx, asteptari: sablon.modul.asteptari(c.cronologie, pctx) };
}

const CAZURI = [
  { nume: 'minim.json cu desen doar cu etichetă, îndemn și semnătură', date: dateTest, catalog: () => incarcaCatalog(path.join(REPO, 'teste', 'fixtures', 'biblioteci-mini')), asteptat: BLOC_ASTEPTAT_1 },
  { nume: 'exemple/01-rutina-preluata.json', date: () => citesteExemplu('01-rutina-preluata.json'), catalog: () => incarcaCatalog(REPO), asteptat: BLOC_ASTEPTAT_2 },
];

test('M1: blocul reelului rămâne identic byte cu byte după mutarea în șablon (hash-ul aprobării)', async (t) => {
  for (const caz of CAZURI) {
    await t.test(caz.nume, async () => {
      const p = await pregatire(caz.date(), caz.catalog());
      const bloc = genereazaBloc(blocPentru(p));
      assert.equal(bloc, caz.asteptat);
      assert.equal(hashZonaTexte(bloc), hashZonaTexte(caz.asteptat));
    });
  }
});

test('blocScenariu al reelului ia textele din plan: eticheta fără titlu (randuri null), îndemnul și semnătura fără etichetă', async () => {
  const p = await pregatire(dateTest(), CAZURI[0].catalog());
  assert.equal(typeof p.sablon.modul.blocScenariu, 'function');
  assert.deepEqual(blocPentru(p).texte, [
    { ref: 'Scena 1', camp: 'scene[0].titlu[0]', eticheta: 'titlu, rândul 1', text: 'Faci totul singur.', accent: false, separat: false, font: 'titlu', greutate: 700 },
    { ref: 'Scena 2', camp: 'scene[1].eticheta', eticheta: 'eticheta', text: 'LUNI, 8:30', accent: false, separat: false, font: 'text', greutate: 500 },
    { ref: 'Scena 3', camp: 'scene[2].titlu[0]', eticheta: 'titlu, rândul 1', text: 'Un sistem', accent: false, separat: false, font: 'titlu', greutate: 700 },
    { ref: 'Scena 3', camp: 'scene[2].titlu[1]', eticheta: 'titlu, rândul 2', text: 'preia rutina.', accent: true, separat: false, font: 'titlu', greutate: 700 },
    { ref: 'Scena 4', camp: 'scene[3].titlu[0]', eticheta: 'titlu, rândul 1', text: 'Tu decizi.', accent: false, separat: false, font: 'titlu', greutate: 700 },
    { ref: 'Scena 4', camp: 'scene[3].cta', eticheta: 'îndemn', text: 'Scrie „AGENT” în comentarii', accent: false, separat: false, font: 'text', greutate: 500 },
    { ref: 'Semnătura', camp: 'semnatura', eticheta: null, text: 'Ana Pop,\ncoach de carieră', accent: false, separat: false, font: 'text', greutate: 400 },
  ]);
});

test('blocScenariu al reelului: doar cuvintele au separat true', async () => {
  const p = await pregatire(citesteExemplu('01-rutina-preluata.json'), CAZURI[1].catalog());
  const texte = blocPentru(p).texte;
  assert.deepEqual(texte.filter((t) => t.separat).map((t) => [t.camp, t.eticheta, t.text]), [
    ['scene[1].cuvinte', 'cuvinte', 'Mesaje.\nCereri.\nTermene.\nPlăți.'],
  ]);
});

test('M7: fiecare linie a blocului reelului poartă fontul și greutatea din sablon.html', async () => {
  const p = await pregatire(citesteExemplu('01-rutina-preluata.json'), CAZURI[1].catalog());
  const pe = (t) => [t.font, t.greutate];
  for (const t of blocPentru(p).texte) {
    const asteptat = t.camp === 'semnatura' ? ['text', 400]
      : /\.(eticheta|cta)$/.test(t.camp) ? ['text', 500]
      : ['titlu', 700];
    assert.deepEqual(pe(t), asteptat, t.camp);
  }
});

test('M7: blocImplicit pune titlu/700 când așteptarea nu zice altceva și păstrează font și greutate când le are', async () => {
  const { blocImplicit } = await import('../../nucleu/lib/randeaza/bloc.mjs');
  const cronologie = { segmente: [{ ref: 'S1', camp: 'a[0]', tip: 't', start: 0, sfarsit: 1, complet: 1 }] };
  const asteptari = { texte: [{ ref: 'S1', text: 'Unu' }, { ref: 'S1', camp: 'a[0].x', text: 'Doi', font: 'text', greutate: 400 }] };
  const { texte } = blocImplicit({ cronologie, asteptari, stil: {} });
  assert.deepEqual(texte.map((t) => [t.font, t.greutate]), [['titlu', 700], ['text', 400]]);
});
