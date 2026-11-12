// Poarta de înghețare a nucleului (planul E, E10): cele două șabloane de test trec prin toate modurile lui
// mg randeaza, cu HyperFrames real. `proba` e minimă (fără hook-uri opționale, blocul implicit), `proba-elemente`
// n-are `scene` și folosește blocScenariu, verificariBuild, verificariProprii și stadii:. Orice schimbare a nucleului
// trebuie să treacă poarta asta, plus reelul (acceptare-reel.test.mjs).
// Rulare: MG_TESTE_INTEGRARE=1 node --test --test-concurrency=1 teste/integrare/poarta-inghetare.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { radacinaAgent, caiProiect } from '../../nucleu/lib/cai.mjs';
import { decideAprobare } from '../../nucleu/lib/garda/aprobare.mjs';
import { decideStop } from '../../nucleu/lib/garda/stop.mjs';
import { comandaNou } from '../../nucleu/lib/nou.mjs';
import { comandaRandeaza } from '../../nucleu/lib/randeaza/index.mjs';
import { incarcaSablon } from '../../nucleu/lib/sabloane.mjs';
import { extrageBlocMg, extrageZonaTexte } from '../../nucleu/lib/scenariu.mjs';
import { copiazaDosar } from '../ajutoare/copiaza.mjs';
import { radacinaCuMotoare } from '../ajutoare/radacina-motoare.mjs';

const sari = process.env.MG_TESTE_INTEGRARE !== '1';
const MOTIV = 'setează MG_TESTE_INTEGRARE=1';
const REPO = radacinaAgent(import.meta.url, 2);

const citesteJson = (cale) => JSON.parse(fs.readFileSync(cale, 'utf8'));
const picate = (v) => JSON.stringify(v.verificari.filter((x) => !x.ok), null, 2);

/** Rădăcina completă a agentului (ca la randeaza-complet), cu ambele șabloane de test instalate lângă reel. */
function radacinaCuProbe() {
  const t = radacinaCuMotoare();
  for (const nume of ['proba', 'proba-elemente']) {
    copiazaDosar(path.join(REPO, 'teste', 'fixtures', 'sabloane', nume), path.join(t.radacina, 'motoare', 'hyperframes', 'sabloane', nume));
  }
  return t;
}

async function treceToateModurile(t, sablon) {
  const { radacina, curata } = radacinaCuProbe();
  t.after(curata);
  const proiect = `poarta-${sablon}`;
  const cai = caiProiect(radacina, proiect);
  const meta = (await incarcaSablon(radacina, sablon)).meta;

  // 1. mg nou
  const nou = await comandaNou({ radacina, proiect, sablon });
  assert.equal(nou.ok, true, JSON.stringify(nou.erori));

  // 2. --doar-verificare: verde pentru aprobare, cu blocul „Ce apare pe ecran” completat
  let r = await comandaRandeaza({ radacina, proiect, mod: 'doar-verificare' });
  let v = citesteJson(cai.verificare);
  assert.equal(r.ok, true, picate(v));
  assert.equal(v.ok_pentru_aprobare, true, picate(v));
  const bloc = extrageBlocMg(fs.readFileSync(cai.scenariu, 'utf8'));
  assert.ok(bloc, 'scenariu.md nu are blocul mg după --doar-verificare');
  assert.notEqual(extrageZonaTexte(bloc.bloc).trim(), '', 'zona „Texte și cifre” e goală');

  // 3. --schita: foaia schiței există
  r = await comandaRandeaza({ radacina, proiect, mod: 'schita' });
  v = citesteJson(cai.verificare);
  assert.equal(r.ok, true, `${JSON.stringify(r.erori)}\n${picate(v)}`);
  assert.equal(v.mod, 'schita');
  const foaie = r.rezultat.schita?.foaie;
  assert.ok(typeof foaie === 'string' && fs.existsSync(path.join(radacina, foaie)), `foaia schiței lipsește: ${foaie}`);

  // 4. aprobarea, ca hook-ul UserPromptSubmit
  const aprobare = decideAprobare({ hook_event_name: 'UserPromptSubmit', prompt: `aprob ${proiect}` }, radacina, new Date());
  assert.match(JSON.parse(aprobare.stdout).hookSpecificOutput.additionalContext, /a fost înregistrată în motor\.lock/);

  // 5. randarea completă: toate verificările declarate au rezultat verde, doar ele
  r = await comandaRandeaza({ radacina, proiect, mod: 'complet' });
  v = citesteJson(cai.verificare);
  assert.equal(r.ok, true, `${JSON.stringify(r.erori)}\n${picate(v)}`);
  assert.equal(v.mod, 'complet');
  assert.equal(v.ok, true, picate(v));
  assert.equal(v.ok_pentru_aprobare, true);
  assert.deepEqual(v.obligatorii, meta.verificari);
  for (const cod of v.obligatorii) {
    assert.equal(v.verificari.find((x) => x.cod === cod)?.ok, true, `${cod}: ${JSON.stringify(v.verificari.find((x) => x.cod === cod))}`);
  }
  const coduri = v.verificari.map((x) => x.cod);
  assert.ok(coduri.every((cod) => meta.verificari.includes(cod)), `coduri nedeclarate în verificare.json: ${coduri}`);
  if (sablon === 'proba-elemente') {
    assert.ok(coduri.includes('S01') && coduri.includes('S02'), coduri.join(', '));
    assert.equal(coduri.includes('C15'), false);
  }
  // index.motion.json (planul F, F7): doar proba-elemente are selectori în cronologie, deci doar ea primește fișierul
  assert.equal(fs.existsSync(path.join(cai.build, 'index.motion.json')), sablon === 'proba-elemente');
  for (const k of [1, 2]) assert.ok(fs.existsSync(path.join(cai.cadre, `predare-${k}.png`)), `cadre/predare-${k}.png`);

  // 6. hook-ul Stop acceptă predarea MP4-ului
  const stop = decideStop({ hook_event_name: 'Stop', last_assistant_message: `Gata.\nPredare: video/${proiect}/${proiect}.mp4` }, radacina);
  assert.deepEqual(stop, { stdout: '', cod: 0 });
}

test('poarta: proba (fără hook-uri opționale) trece prin toate modurile', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  await treceToateModurile(t, 'proba');
});

test('poarta: proba-elemente (fără scene, cu hook-urile noi) trece prin toate modurile', { skip: sari && MOTIV, timeout: 900000 }, async (t) => {
  await treceToateModurile(t, 'proba-elemente');
});
