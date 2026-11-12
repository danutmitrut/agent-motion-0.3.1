// Partea comună a celor trei moduri ale lui mg randeaza (spec 6.10, harta 4.15): citirea, validarea, stilul,
// cronologia, build-ul și verificările pe date. Se oprește la primul strat cu erori, ca agentul să repare în ordine.
import path from 'node:path';
import { caiProiect, esteNumeProiect } from '../cai.mjs';
import { citesteOcteti, existaFisier, jsonDinText, scrieJsonAtomic, sha256Octeti, stergeRecursiv, textDinOcteti } from '../fisiere.mjs';
import { citesteLock } from '../lock.mjs';
import { incarcaSablon } from '../sabloane.mjs';
import { valideazaPeSchema } from '../schema.mjs';
import { citesteBrand } from '../brand.mjs';
import { creeazaCtx } from '../context.mjs';
import { rezolvaStil } from '../teme.mjs';
import { valideazaCronologie } from '../cronologie.mjs';
import { incarcaCatalog } from '../desen/catalog.mjs';
import { COD_IESIRE, EroareFatala, eroare, verificareaErorii } from '../erori.mjs';
import { rezultat, unice, grupeazaPeVerificari } from '../verificari/index.mjs';
import { declarate, stadiuVerificare } from '../verificari/stadii.mjs';
import { verificariDate } from '../verificari/date.mjs';
import { verificaDesene } from '../desen/verifica.mjs';
import { rezolvaFfmpeg } from '../ffmpeg.mjs';
import { areMuzica, avertismentPiesaScurta, pregatesteMuzica, valideazaMuzica, verificaAudioCronologie } from '../muzica.mjs';
import { genereazaMotion } from '../asertiuni-miscare.mjs';
import { blocPentru } from './bloc.mjs';
import { valideazaConstruit } from './construit.mjs';
import { combinaRezultate, pregatesteIesiri, valideazaIesiri } from './iesiri.mjs';

const dupaCod = (a, b) => (a.cod < b.cod ? -1 : a.cod > b.cod ? 1 : 0);

/** Erorile și avertismentele grupate pe verificarea din CODURI (codurile fără verificare rămân doar în listă). */
function rezultateDinErori(erori, avertismente) {
  return [...grupeazaPeVerificari(erori, avertismente).entries()]
    .map(([cod, g]) => rezultat(cod, g.erori.length === 0, { camp: g.erori[0]?.camp ?? null, erori: g.erori, avertismente: g.avertismente }))
    .sort(dupaCod);
}

/**
 * Regulile șablonului raportează un cod S doar când pică. După ce valideaza, verificaDesene și cronologie
 * au trecut fără erori, fiecare cod S declarat cu stadiul `date` (M2) fără rezultat primește unul verde.
 * Codurile S de `build` și `mp4` își dau rezultatul din hook-urile verificariBuild și verificariProprii.
 * @param {object[]} rezultate @param {{meta: {verificari?: string[], stadii?: object}}} sablon @returns {object[]} sortat după cod
 */
export function cuRezultateSablon(rezultate, sablon) {
  const lipsa = declarate(sablon, ['date']).filter((c) => c.startsWith('S') && !rezultate.some((r) => r.cod === c));
  return [...rezultate, ...lipsa.map((cod) => rezultat(cod, true))].sort(dupaCod);
}

/**
 * Adaugă avertismentele straturilor anterioare la rezultatul verificării lor (fără dubluri). Un rezultat nou, verde,
 * se creează doar pentru un cod de stadiu `date` (M2): un avertisment atribuit unui cod de `build` sau `mp4` (M3) nu-i
 * dă acelui cod verde; rămâne doar în lista avertismentelor rulării, iar codul își așteaptă rezultatul din hook.
 */
function cuAvertismente(rezultate, avertismente, sablon) {
  const toate = [...rezultate];
  for (const a of avertismente) {
    const cod = verificareaErorii(a);
    if (!cod) continue;
    let r = toate.find((x) => x.cod === cod);
    if (!r) {
      if (stadiuVerificare(cod, sablon) !== 'date') continue;
      r = rezultat(cod, true);
      toate.push(r);
    }
    r.avertismente = unice([...(r.avertismente ?? []), a]);
  }
  return toate.sort(dupaCod);
}

/**
 * @param {{radacina: string, proiect: string, mod: 'doar-verificare'|'schita'|'complet'}} p
 * @returns {Promise<object>} Pregatire = { cai, lock, sablon, date, sha256Date, brand, stil, cronologie, intern, asteptari, bloc, ctx, muzica, construit, iesiri, erori, avertismente, rezultate };
 *   iesiri = null la un singur MP4; la ieșiri multiple (felia 3), lista lor (id, nn, date, cronologie, intern, asteptari,
 *   ctx, dirBuild, construit, schita), iar cronologie, intern, asteptari și construit de nivel superior rămân null;
 *   construit = rezultatul validat al lui construieste (cu motor.check/randare.argumente), null dacă pregătirea s-a oprit înainte;
 *   bloc = {texte, stil} al blocului „Ce apare pe ecran” (M1), null dacă pregătirea s-a oprit înainte de asteptari;
 *   sha256Date e hash-ul octeților din care s-a parsat date (SEC-1), null când fișierul nu s-a putut citi
 */
export async function pregatesteBuild({ radacina, proiect, mod }) {
  if (!esteNumeProiect(proiect)) {
    throw new EroareFatala(eroare('proiect-nume-invalid', 'argumente.proiect',
      `„${proiect ?? ''}” nu e un nume de proiect valid.`,
      'Folosește numele folderului din video/, de exemplu: node nucleu/mg.mjs randeaza programari --doar-verificare.'), COD_IESIRE.UTILIZARE);
  }
  const cai = caiProiect(radacina, proiect);
  if (!existaFisier(cai.lock)) {
    throw new EroareFatala(eroare('proiect-lipsa', 'argumente.proiect',
      `Proiectul „${proiect}” nu există în video/.`,
      `Creează-l cu node nucleu/mg.mjs nou ${proiect} --sablon <numele-șablonului>.`), COD_IESIRE.UTILIZARE);
  }
  let lock = citesteLock(cai.lock);
  const sablon = await incarcaSablon(radacina, lock.sablon.nume);
  const p = {
    cai, lock, sablon, date: null, sha256Date: null, brand: null, stil: null, cronologie: null, intern: null, asteptari: null, bloc: null, ctx: null, muzica: null, construit: null, iesiri: null,
    erori: [], avertismente: [], rezultate: [],
  };
  const opreste = () => {
    p.erori = unice(p.erori);
    p.avertismente = unice(p.avertismente);
    p.rezultate = rezultateDinErori(p.erori, p.avertismente);
    return p;
  };

  // C01: citirea strictă a lui date.json, o singură dată: build-ul, verificările și hash-ul din verificare.json
  // vin din aceiași octeți (SEC-1), nu din fișierul de pe disc de la finalul rulării.
  try {
    const camp = `fisier:video/${proiect}/date.json`;
    const octeti = citesteOcteti(cai.date, camp);
    p.sha256Date = sha256Octeti(octeti);
    p.date = jsonDinText(textDinOcteti(octeti, camp), camp);
  } catch (err) {
    if (err instanceof EroareFatala && verificareaErorii(err.eroareMg) === 'C01') {
      p.erori.push(err.eroareMg);
      return opreste();
    }
    throw err;
  }

  // C02: schema, apoi brandul (fișa și conflictele, în rezolvaStil).
  p.erori.push(...valideazaPeSchema(sablon.schema, p.date));
  if (p.erori.length > 0) return opreste();
  if (typeof p.date.brand === 'string') {
    try {
      p.brand = citesteBrand(radacina, p.date.brand);
    } catch (err) {
      if (!(err instanceof EroareFatala)) throw err;
      p.erori.push(err.eroareMg);
      return opreste();
    }
  }

  // Regulile șablonului (C03, C04 cu plafonul brut și lățimea pe card, C09 timpuriu, S01-S12) și desenele (S10, verificaDesene din B04), în același strat.
  // Catalogul se dă mereu în ctx (B09): fără el, cronologie și construieste l-ar încărca singure. Dacă biblioteci/catalog.json
  // lipsește, incarcaCatalog oprește aici cu fisier-necitibil (EroareFatala, cod 2), cu mesaj pentru om, nu cu stivă.
  // ctx.brand: regulile C03/C04 ale șablonului verifică și semnătura din fișa de brand (T1/T18).
  // Ctx-ul unic (M6): același constructor pentru toate apelurile; mod e modul real cerut de cursant.
  // Muzica (planul F): ffmpeg se rezolvă doar când datele cer muzică; fără muzică, ctx.ff rămâne null, ca înainte.
  const ff = areMuzica(p.date) ? await rezolvaFfmpeg(radacina) : null;
  const ctx = creeazaCtx({ radacina, proiect, dirProiect: cai.dir, sablon, mod, catalog: incarcaCatalog(radacina, p.brand?.nume ?? null), brand: p.brand, ff });
  const v = sablon.modul.valideaza(p.date, ctx);
  p.erori.push(...v.erori);
  p.avertismente.push(...v.avertismente);
  const d = verificaDesene(p.date, ctx.catalog, radacina);
  p.erori.push(...d.erori);
  p.avertismente.push(...d.avertismente);
  // Muzica, în același strat cu desenele (C07): calea, extensia, mărimea, citirea și incepe_de_la. Dacă valideaza a
  // respins deja muzica (un șablon fără muzică), nucleul nu mai adaugă o a doua eroare pe același câmp și nu cheamă ffprobe.
  if (!p.erori.some((e) => e.camp === 'muzica' || e.camp.startsWith('muzica.'))) {
    const m = await valideazaMuzica(p.date, { dirProiect: cai.dir, ff });
    p.erori.push(...m.erori);
    p.muzica = m.muzica;
  }
  if (p.erori.length > 0) return opreste();

  // Stilul rezolvat (temă, brand, date).
  const s = rezolvaStil({ radacina, sablon, date: p.date, brand: p.brand });
  p.erori.push(...s.erori);
  p.avertismente.push(...s.avertismente);
  if (p.erori.length > 0) return opreste();
  p.stil = s.stil;

  // Ieșirile multiple (felia 3): o listă din iesiri() înseamnă câte o cronologie și un build pe ieșire, în build/<id>/,
  // și verificările pe date pe fiecare, combinate pe cod.
  const lista = typeof sablon.modul.iesiri === 'function' ? sablon.modul.iesiri(p.date, { ...ctx, stil: p.stil }) : null;
  if (lista !== null && lista !== undefined) {
    if (!(await pregatesteIesiri(p, valideazaIesiri(lista, sablon.nume), ctx))) return opreste();
    lock = citesteLock(cai.lock);
    p.lock = lock;
    const pe = [];
    for (const i of p.iesiri) {
      pe.push({ id: i.id, rezultate: await verificariDate({ ctx: i.ctx, date: p.date, stil: p.stil, cronologie: i.cronologie, lock, validare: v, texte: p.bloc.texte, active: i.construit.active }) });
    }
    p.rezultate = cuAvertismente(cuRezultateSablon(combinaRezultate(pe), sablon), p.avertismente, sablon);
    p.erori = unice(p.rezultate.flatMap((r) => r.erori));
    p.avertismente = unice([...p.avertismente, ...p.rezultate.flatMap((r) => r.avertismente ?? [])]);
    return p;
  }

  // Cronologia (și planul intern al șablonului), verificată pe formatul comun. Ordinea e valideaza, cronologie,
  // valideazaCronologie (B08); nucleul nu se bazează pe faptul că cronologie cheamă și ea valideaza.
  const c = sablon.modul.cronologie(p.date, p.stil, { ...ctx, stil: p.stil });
  p.erori.push(...c.erori, ...(c.erori.length === 0 ? valideazaCronologie(c.cronologie) : []));
  p.avertismente.push(...c.avertismente);
  // Muzica din date și cronologie.audio trebuie să se potrivească; piesa mai scurtă decât videoul dă doar un avertisment.
  if (p.erori.length === 0) {
    p.erori.push(...verificaAudioCronologie(c.cronologie, p.muzica));
    p.avertismente.push(...avertismentPiesaScurta(p.muzica, c.cronologie));
  }
  if (p.erori.length > 0) return opreste();
  p.cronologie = c.cronologie;
  p.intern = c.intern;
  // ctx.stil: casetele reale ale textelor pentru C13 (B17) se calculează din stilul rezolvat (fonturi, spațieri)
  p.ctx = { ...ctx, stil: p.stil, intern: p.intern };
  p.asteptari = sablon.modul.asteptari(p.cronologie, p.ctx);
  // M1: blocul „Ce apare pe ecran”, din blocScenariu al șablonului sau din varianta implicită (asteptari și segmente)
  p.bloc = blocPentru(p);

  // Build-ul, de la zero: activele se îngheață în active/, iar build/ se rescrie complet.
  stergeRecursiv(cai.build); // G1: fără fs.rmSync în nucleu (căile cu diacritice pe Windows)
  const construit = valideazaConstruit(await sablon.modul.construieste(p.date, p.stil, p.cronologie, cai.build, p.ctx), sablon.nume, sablon.motor);
  p.construit = construit;
  scrieJsonAtomic(path.join(cai.build, 'cronologie.json'), p.cronologie);
  // Muzica (planul F): build/assets/muzica.m4a, înainte de hyperframes check, care citește activele compoziției.
  if (p.muzica) await pregatesteMuzica({ muzica: p.muzica, durata: p.cronologie.audio.durata, dirProiect: cai.dir, dirBuild: cai.build, ff: ctx.ff });
  // index.motion.json (planul F): aserțiunile de mișcare din selectorii cronologiei, lângă intrarea compoziției, pentru
  // hyperframes check (C10). Un șablon fără selectori (proba, proba-elemente) nu primește fișierul.
  const miscare = genereazaMotion(p.cronologie);
  if (miscare) scrieJsonAtomic(path.join(cai.build, `${path.basename(construit.intrare, '.html')}.motion.json`), miscare);

  // Verificările pe date, cu motor.lock recitit (construieste a adăugat activele).
  lock = citesteLock(cai.lock);
  p.lock = lock;
  const rezultate = await verificariDate({
    ctx: p.ctx, date: p.date, stil: p.stil, cronologie: p.cronologie, lock, validare: v, texte: p.bloc.texte,
    active: construit?.active, // T4: C07 doar pe activele planului curent (un șablon fără listă: tot motor.lock)
  });
  // Toate straturile au trecut: regulile S declarate de șablon primesc rezultatul verde (cele cu avertismente îl păstrează pe al lor).
  p.rezultate = cuAvertismente(cuRezultateSablon(rezultate, sablon), p.avertismente, sablon);
  p.erori = unice(p.rezultate.flatMap((r) => r.erori));
  p.avertismente = unice([...p.avertismente, ...p.rezultate.flatMap((r) => r.avertismente ?? [])]);
  return p;
}
