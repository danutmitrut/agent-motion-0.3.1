// mg genereaza (felia 5): clientul Kie (fetch simulat), cheia (procese simulate), doctor --generare și comanda
// întreagă cu un Kie simulat, fără rețea, fără seif real și fără credite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientKie, EroareKie, MODEL } from '../../nucleu/lib/genereaza/kie.mjs';
import { gasestePython, stareGenerare, comandaPuneCheie, pythonMediu, citesteCheie, SeifIndisponibil } from '../../nucleu/lib/genereaza/cheie.mjs';
import { comandaGenereaza, construiestePrompt, TERMENI } from '../../nucleu/lib/genereaza/index.mjs';
import { doctorGenerare } from '../../nucleu/lib/doctor/generare.mjs';
import { incarcaCatalog, gasestePiesa } from '../../nucleu/lib/desen/catalog.mjs';
import { EroareFatala } from '../../nucleu/lib/erori.mjs';
import { creeazaRadacinaTemp } from '../ajutoare/radacina-temp.mjs';
import { codificaPng, imagineGri, inel } from '../ajutoare/png.mjs';

const PRETURI = readFileSync(fileURLToPath(new URL('../../nucleu/preturi.json', import.meta.url)), 'utf8');
const ETICHETE = 'brutar,pâine,cuptor,brutărie';

function raspuns(corp, status = 200) {
  return { status, ok: status < 400, text: async () => JSON.stringify(corp), arrayBuffer: async () => Buffer.from(JSON.stringify(corp)) };
}

/** fetch simulat: răspunsurile vin în ordine, cererile se păstrează. */
function fetchSimulat(raspunsuri) {
  const cereri = [];
  const f = async (url, init = {}) => {
    cereri.push({ url, init });
    const r = raspunsuri.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  return { f, cereri };
}

test('clientul Kie: încărcarea, sarcina cu modelul și 1K, așteptarea și descărcarea', async () => {
  const png = Buffer.from('imagine');
  const { f, cereri } = fetchSimulat([
    raspuns({ code: 200, data: { downloadUrl: 'https://kie.test/ref.png' } }),
    raspuns({ code: 200, data: { taskId: 't1' } }),
    raspuns({ code: 200, data: { state: 'generating' } }),
    raspuns({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://kie.test/rez.png'] }) } }),
    { status: 200, ok: true, arrayBuffer: async () => png },
  ]);
  const c = clientKie('cheia-secreta', { fetch: f, dormi: async () => {}, pasMs: 1 });
  assert.equal(await c.incarca(Buffer.from('ref'), 'referinta-stil.png'), 'https://kie.test/ref.png');
  assert.equal(await c.creeaza('promptul', ['https://kie.test/ref.png']), 't1');
  assert.equal(await c.asteapta('t1'), 'https://kie.test/rez.png');
  assert.deepEqual(await c.descarca('https://kie.test/rez.png'), png);
  const corp = JSON.parse(cereri[1].init.body);
  assert.deepEqual(corp, { model: MODEL, input: { prompt: 'promptul', input_urls: ['https://kie.test/ref.png'], aspect_ratio: '1:1', resolution: '1K' } });
  for (const r of cereri.slice(0, 4)) {
    assert.equal(r.init.headers.Authorization, 'Bearer cheia-secreta');
    assert.equal(r.init.redirect, 'error');
  }
  // descărcarea rezultatului nu primește cheia
  assert.equal(cereri[4].init.headers, undefined);
  assert.doesNotMatch(String(c), /cheia-secreta/);
});

test('clientul Kie: cheia refuzată, creditele, sarcina eșuată și rețeaua dau EroareKie cu tipul potrivit', async () => {
  const cu = (...r) => clientKie('k', { fetch: fetchSimulat(r).f, dormi: async () => {}, pasMs: 1, limitaMs: 2 });
  await assert.rejects(cu(raspuns({}, 401)).creeaza('p', []), (e) => e instanceof EroareKie && e.refuz);
  await assert.rejects(cu(raspuns({ code: 402, msg: 'Credits insufficient' })).creeaza('p', []), (e) => e.credit && /402/.test(e.message));
  await assert.rejects(cu(raspuns({ code: 200, data: { state: 'fail', failMsg: 'nu' } })).asteapta('t'), /a eșuat la Kie: nu/);
  await assert.rejects(cu(raspuns({ code: 200, data: { state: 'success', resultJson: '{}' } })).asteapta('t'), /URL de rezultat/);
  await assert.rejects(cu(...Array(5).fill(0).map(() => raspuns({ code: 200, data: { state: 'queuing' } }))).asteapta('t'), /nu s-a terminat/);
  await assert.rejects(cu(new TypeError('fetch failed')).creeaza('p', []), /Kie nu răspunde/);
  await assert.rejects(cu(raspuns({ code: 200, data: { state: 'fail' } })).asteapta('t'), (e) => e.esuat && !e.retea);
});

test('clientul Kie: sondarea trece peste trei căderi de rețea la rând, nu peste patru', async () => {
  const caderi = (n) => Array(n).fill(0).map(() => new TypeError('fetch failed'));
  const succes = raspuns({ code: 200, data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://kie.test/r.png'] }) } });
  const cu = (...r) => clientKie('k', { fetch: fetchSimulat(r).f, dormi: async () => {}, pasMs: 1, limitaMs: 100 });
  assert.equal(await cu(...caderi(3), succes).asteapta('t'), 'https://kie.test/r.png');
  await assert.rejects(cu(...caderi(4), succes).asteapta('t'), (e) => e.retea && !e.esuat);
});

test('cheia: Python de sistem, seiful din unelte/python și comanda pe care o rulează cursantul', async () => {
  const apeluri = [];
  const ruleaza = async (cmd, arg) => {
    apeluri.push([cmd, ...arg].join(' '));
    if (cmd === 'py') return { cod: 0, stdout: '3 12\n', stderr: '' };
    return { cod: 9009, stdout: '', stderr: 'Python was not found' };
  };
  assert.deepEqual(await gasestePython({ platforma: 'win32', ruleaza }), ['py', '-3']);
  assert.equal(await gasestePython({ platforma: 'darwin', ruleaza }), null);
  assert.equal(await gasestePython({ platforma: 'darwin', ruleaza: async () => ({ cod: 0, stdout: '3 8\n', stderr: '' }) }), null, 'cere cel puțin 3.9');
  assert.match(comandaPuneCheie('win32'), /^\.\\unelte\\python\\Scripts\\python\.exe nucleu\\cheie\.py pune kie$/);
  assert.equal(comandaPuneCheie('darwin'), 'unelte/python/bin/python nucleu/cheie.py pune kie');
  assert.match(pythonMediu('/r', 'darwin'), /unelte[\\/]python[\\/]bin[\\/]python$/);
  // fără mediul izolat: keyring și cheia sunt false, fără să ruleze cheie.py
  const s = await stareGenerare('/nu/exista', { platforma: 'darwin', ruleaza: async () => ({ cod: 0, stdout: '3 13\n', stderr: '' }) });
  assert.deepEqual(s, { python: ['python3'], keyring: false, cheie: false });
  // Python rulează izolat (-I): un PYTHONPATH plantat nu încarcă alt keyring
  assert.ok(apeluri.every((a) => / -I -X utf8 /.test(a)), apeluri.join('\n'));
});

test('cheia: lipsa (codul 1) e null, orice alt eșec al seifului e SeifIndisponibil, fără ieșirea standard în mesaj', async () => {
  const { radacina, curata } = creeazaRadacinaTemp({ fisiere: { 'unelte/python/bin/python': '' } });
  try {
    const cu = (r) => ({ platforma: 'darwin', ruleaza: async () => r });
    assert.equal(await citesteCheie(radacina, cu({ cod: 1, stdout: '', stderr: '' })), null);
    assert.equal(await citesteCheie(radacina, cu({ cod: 0, stdout: 'valoarea\n', stderr: '' })), 'valoarea');
    await assert.rejects(citesteCheie(radacina, cu({ cod: -1, stdout: 'valoarea', stderr: 'timeout' })),
      (e) => e instanceof SeifIndisponibil && /-1/.test(e.message) && !/valoarea/.test(e.message));
    // stareGenerare: un seif care nu răspunde nu e „cheie lipsă”
    const ruleaza = async (cmd, arg) => (arg.includes('verifica') ? { cod: -1, stdout: '', stderr: 'termen depășit' } : { cod: 0, stdout: 'ok\n', stderr: '' });
    const s = await stareGenerare(radacina, { platforma: 'darwin', ruleaza });
    assert.equal(s.cheie, false);
    assert.match(s.seif, /codul -1: termen depășit/);
  } finally {
    curata();
  }
});

test('doctor --generare: fără Python e eroare, fără keyring propune instalarea, cheia lipsă e doar avertisment', async () => {
  const fara = await doctorGenerare({ radacina: '/r', dependente: { stare: async () => ({ python: null, keyring: false, cheie: false }) } });
  assert.equal(fara.ok, false);
  assert.match(fara.erori[0].sugestie, /INSTALARE\.md/);

  const faraKeyring = await doctorGenerare({ radacina: '/r', dependente: { stare: async () => ({ python: ['python3'], keyring: false, cheie: false }) } });
  assert.equal(faraKeyring.ok, false);
  assert.match(faraKeyring.erori[0].sugestie, /--instaleaza-keyring/);

  let stare = { python: ['python3'], keyring: false, cheie: false };
  let instalat = 0;
  const cuInstalare = await doctorGenerare({
    radacina: '/r', instaleaza: true,
    dependente: { stare: async () => stare, instaleaza: async () => { instalat++; stare = { python: ['/r/unelte/python/bin/python'], keyring: true, cheie: false }; return { ok: true, detaliu: '' }; } },
  });
  assert.equal(instalat, 1);
  assert.equal(cuInstalare.ok, true);
  assert.equal(cuInstalare.avertismente[0].cod, 'kie-cheie-lipsa');
  assert.match(cuInstalare.mesaj, /mai puțin cheia Kie/);

  const faraSeif = await doctorGenerare({ radacina: '/r', dependente: { stare: async () => ({ python: ['p'], keyring: true, cheie: false, seif: 'codul -1' }) } });
  assert.equal(faraSeif.ok, false);
  assert.equal(faraSeif.erori[0].camp, 'mediu.seif');
  assert.match(faraSeif.erori[0].sugestie, /cheie\.py verifica kie/);
});

/** O rădăcină cu biblioteca mini, prețurile și un Kie simulat care întoarce un inel. */
function context(o = {}) {
  const { radacina, curata } = creeazaRadacinaTemp({ biblioteciMini: true, fisiere: { 'nucleu/preturi.json': PRETURI } });
  const imagine = o.imagine ?? codificaPng({ ...(() => { const g = imagineGri(240, 240, inel(120, 120, 50, 70)); return { latime: 240, inaltime: 240, canale: 1, date: g.gri }; })() });
  const jurnal = [];
  const client = (cheie) => ({
    async incarca(octeti, nume) { jurnal.push(['incarca', cheie, octeti.subarray(1, 4).toString('latin1'), nume]); return 'https://kie.test/ref.png'; },
    async creeaza(prompt, ref) { jurnal.push(['creeaza', prompt, ref]); if (o.esec) throw o.esec; return 't-1'; },
    async asteapta(id) { jurnal.push(['asteapta', id]); if (o.asteapta) return o.asteapta(); return 'https://kie.test/rez.png'; },
    async descarca() { jurnal.push(['descarca']); return o.descarca ? o.descarca() : imagine; },
  });
  const dependente = {
    stare: async () => o.stare ?? { python: ['p'], keyring: true, cheie: true },
    cheie: async () => { if (o.seif) throw o.seif; return o.faraCheie ? null : 'cheia'; },
    client,
    azi: () => '2026-10-26',
  };
  return { radacina, curata, jurnal, dependente };
}

const desen = (id = 'p-brutar', subiect = 'un brutar care scoate pâinea din cuptor') => ['desen', id, subiect];

test('--estimeaza: costul din tabelul datat și ce lipsește, fără nicio cerere la Kie', async () => {
  const c = context({ stare: { python: ['python3'], keyring: false, cheie: false } });
  try {
    const r = await comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE, estimeaza: true }, dependente: c.dependente });
    assert.equal(r.ok, true);
    assert.equal(r.rezultat.gata, false);
    assert.equal(r.rezultat.lipsa, 'keyring');
    assert.match(r.rezultat.text, /1 desen, 6 credite Kie, cam 0,03 \$ \(prețul din 26\.10\.2026\)/);
    assert.match(r.rezultat.text, /cel mai apropiat desen din bibliotecă/);
    assert.deepEqual(c.jurnal, []);
    const gata = await comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE, estimeaza: true }, dependente: { ...c.dependente, stare: async () => ({ python: ['p'], keyring: true, cheie: true }) } });
    assert.equal(gata.rezultat.gata, true);
    assert.match(gata.rezultat.text, /așteaptă-i acordul/);
  } finally {
    c.curata();
  }
});

test('generarea: referința urcată, promptul cu subiectul, piesa în proprii/ cu licența și proveniența', async () => {
  const c = context();
  try {
    const r = await comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente });
    assert.equal(r.ok, true);
    assert.deepEqual(c.jurnal[0], ['incarca', 'cheia', 'PNG', 'referinta-stil.png']);
    assert.equal(c.jurnal[1][1], construiestePrompt('un brutar care scoate pâinea din cuptor'));
    assert.match(c.jurnal[1][1], /Draw: un brutar care scoate pâinea din cuptor\. /);
    assert.deepEqual(c.jurnal[1][2], ['https://kie.test/ref.png']);
    const piesa = gasestePiesa(incarcaCatalog(c.radacina), 'p-brutar');
    assert.equal(piesa.familie, 'proprie');
    assert.deepEqual(piesa.roluri, ['ink', 'fond']);
    assert.equal(piesa.animatie.implicit, 'contur-umplere');
    assert.match(piesa.licenta, /generat de cursant prin Kie \(gpt-image-2-image-to-image\), 2026-10-26; în răspunderea cursantului/);
    assert.equal(piesa.generat.model, MODEL);
    assert.equal(piesa.generat.data, '2026-10-26');
    assert.equal(piesa.generat.sarcina, 't-1');
    assert.deepEqual(piesa.generat.termeni, { ...TERMENI, surse: [...TERMENI.surse] });
    assert.ok(piesa.acoperire_cerneala > 0.4 && piesa.acoperire_cerneala < 0.6);
    assert.equal(piesa.descriere, 'un brutar care scoate pâinea din cuptor');
    assert.ok(existsSync(join(c.radacina, 'proprii', 'generate', 'p-brutar-1.png')));
    assert.equal(piesa.generat.imagine, 'generate/p-brutar-1.png');
    const jurnal = citesteJurnal(c.radacina);
    assert.deepEqual(jurnal.generari.map((g) => [g.id, g.incercare, g.credite, g.usd, g.stare, g.sarcina]), [['p-brutar', 1, 6, 0.03, 'pus', 't-1']]);
    assert.match(r.rezultat.text, /desen arata p-brutar/);
  } finally {
    c.curata();
  }
});

test('fără seif sau fără cheie: eroare clară, fără nicio cerere la Kie', async () => {
  for (const [o, cod] of [[{ stare: { python: null, keyring: false, cheie: false } }, 'generare-nepregatita'], [{ faraCheie: true }, 'kie-cheie-lipsa'],
    [{ seif: new SeifIndisponibil('codul -1') }, 'generare-nepregatita']]) {
    const c = context(o);
    try {
      await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
        (e) => e instanceof EroareFatala && e.eroareMg.cod === cod);
      assert.deepEqual(c.jurnal, []);
    } finally {
      c.curata();
    }
  }
});

test('Kie refuză sau eșuează înainte de sarcină: kie-refuz / kie-esuat, fără jurnal de cost', async () => {
  for (const [esec, cod] of [[new EroareKie('x', { credit: true }), 'kie-refuz'], [new EroareKie('y'), 'kie-esuat']]) {
    const c = context({ esec });
    try {
      await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
        (e) => e.eroareMg?.cod === cod);
      assert.equal(existsSync(join(c.radacina, 'proprii', 'generate', 'jurnal.json')), false);
    } finally {
      c.curata();
    }
  }
});

test('un desen nefolosibil: costul rămâne în jurnal, imaginea se păstrează, piesa nu intră', async () => {
  const alb = codificaPng({ latime: 20, inaltime: 20, canale: 1, date: new Uint8Array(400).fill(255) });
  const c = context({ imagine: alb });
  try {
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
      (e) => e.eroareMg?.cod === 'desen-generat-nefolosibil' && /proprii\/generate\/p-brutar-1\.png/.test(e.eroareMg.mesaj));
    assert.deepEqual(citesteJurnal(c.radacina).generari.map((g) => g.stare), ['nefolosibil']);
    assert.equal(gasestePiesa(incarcaCatalog(c.radacina), 'p-brutar'), null);
    // reia nu reia o încercare încheiată; a doua încercare nu suprascrie imaginea plătită
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: ['reia', 'p-brutar'], optiuni: {}, dependente: c.dependente }),
      (e) => /s-a încheiat/.test(e.eroareMg?.mesaj));
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
      (e) => /p-brutar-2\.png/.test(e.eroareMg?.mesaj));
    assert.ok(existsSync(join(c.radacina, 'proprii', 'generate', 'p-brutar-1.png')));
    assert.deepEqual(citesteJurnal(c.radacina).generari.map((g) => g.incercare), [1, 2]);
  } finally {
    c.curata();
  }
});

test('argumentele greșite sunt refuzate înainte de orice cost', async () => {
  const c = context();
  try {
    const cazuri = [
      [['imagine', 'p-x', 'subiect bun'], 'argument-necunoscut'],
      [desen('brutar'), 'valoare-invalida'],
      [desen('p-x', 'ok'), 'valoare-invalida'],
      [desen('p-x', 'un brutar <script>'), 'valoare-invalida'],
      [[...desen(), 'in plus'], 'argument-necunoscut'],
    ];
    for (const [pozitionale, cod] of cazuri) {
      await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale, optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
        (e) => e.eroareMg?.cod === cod, JSON.stringify(pozitionale));
    }
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: 'a,b' }, dependente: c.dependente }),
      (e) => e.eroareMg?.cod === 'desen-etichete-putine');
    await comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente });
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
      (e) => e.eroareMg?.cod === 'valoare-invalida' && /Există deja/.test(e.eroareMg.mesaj));
    assert.equal(c.jurnal.filter((j) => j[0] === 'creeaza').length, 1);
  } finally {
    c.curata();
  }
});

function citesteJurnal(radacina) {
  return JSON.parse(readFileSync(join(radacina, 'proprii', 'generate', 'jurnal.json'), 'utf8'));
}

test('sarcina eșuată la Kie după pornire: notată esuat, fără cost', async () => {
  const c = context({ asteapta: () => { throw new EroareKie('Sarcina t-1 a eșuat la Kie: nu', { esuat: true }); } });
  try {
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
      (e) => e.eroareMg?.cod === 'kie-esuat' && /nu se plătește/.test(e.eroareMg.sugestie));
    assert.deepEqual(citesteJurnal(c.radacina).generari.map((g) => [g.sarcina, g.stare]), [['t-1', 'esuat']]);
  } finally {
    c.curata();
  }
});

test('sarcina rămasă în curs (termen, rețea): jurnalul o ține, iar reia o termină fără sarcină nouă', async () => {
  let gata = false;
  const c = context({ asteapta: () => { if (!gata) throw new EroareKie('Sarcina t-1 nu s-a terminat în 90 s.'); return 'https://kie.test/rez.png'; } });
  try {
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
      (e) => e.eroareMg?.cod === 'kie-esuat' && /poate fi plătită/.test(e.eroareMg.mesaj) && /genereaza reia p-brutar/.test(e.eroareMg.sugestie) && !/nu costă\./.test(e.eroareMg.mesaj));
    const [intrare] = citesteJurnal(c.radacina).generari;
    assert.equal(intrare.stare, 'in-curs');
    assert.equal(intrare.prompt, construiestePrompt('un brutar care scoate pâinea din cuptor'));
    assert.deepEqual(intrare.etichete, ETICHETE.split(','));
    gata = true;
    const r = await comandaGenereaza({ radacina: c.radacina, pozitionale: ['reia', 'p-brutar'], optiuni: {}, dependente: c.dependente });
    assert.equal(r.ok, true);
    assert.match(r.rezultat.text, /reluarea nu costă/);
    assert.equal(c.jurnal.filter((j) => j[0] === 'creeaza').length, 1);
    assert.deepEqual(citesteJurnal(c.radacina).generari.map((g) => g.stare), ['pus']);
    const piesa = gasestePiesa(incarcaCatalog(c.radacina), 'p-brutar');
    assert.deepEqual(piesa.etichete, ETICHETE.split(','));
    assert.equal(piesa.generat.sarcina, 't-1');
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: ['reia', 'p-brutar'], optiuni: {}, dependente: c.dependente }),
      (e) => /deja în proprii/.test(e.eroareMg?.mesaj));
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: ['reia', 'p-altul'], optiuni: {}, dependente: c.dependente }),
      (e) => /Nu există nicio generare/.test(e.eroareMg?.mesaj));
  } finally {
    c.curata();
  }
});

test('reia după descărcare: vectorizează din imaginea de pe disc, fără Kie și fără cheie', async () => {
  const c = context({ faraCheie: true });
  try {
    const dir = join(c.radacina, 'proprii', 'generate');
    mkdirSync(dir, { recursive: true });
    const g = imagineGri(240, 240, inel(120, 120, 50, 70));
    writeFileSync(join(dir, 'p-brutar-1.png'), codificaPng({ latime: 240, inaltime: 240, canale: 1, date: g.gri }));
    writeFileSync(join(dir, 'jurnal.json'), JSON.stringify({ versiune: 1, generari: [{
      id: 'p-brutar', incercare: 1, data: '2026-10-26', model: MODEL, sarcina: 't-9', credite: 6, usd: 0.03, subiect: 'un brutar',
      prompt: construiestePrompt('un brutar'), etichete: ETICHETE.split(','), stare: 'descarcat', imagine: 'generate/p-brutar-1.png',
    }] }));
    const r = await comandaGenereaza({ radacina: c.radacina, pozitionale: ['reia', 'p-brutar'], optiuni: {}, dependente: c.dependente });
    assert.equal(r.ok, true);
    assert.deepEqual(c.jurnal, []);
    assert.equal(gasestePiesa(incarcaCatalog(c.radacina), 'p-brutar').generat.sarcina, 't-9');
  } finally {
    c.curata();
  }
});

test('un rezultat care nu e PNG se păstrează cu extensia lui și e nefolosibil', async () => {
  const c = context({ descarca: () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]) });
  try {
    await assert.rejects(comandaGenereaza({ radacina: c.radacina, pozitionale: desen(), optiuni: { etichete: ETICHETE }, dependente: c.dependente }),
      (e) => e.eroareMg?.cod === 'desen-generat-nefolosibil' && /p-brutar-1\.jpg/.test(e.eroareMg.mesaj));
    assert.ok(existsSync(join(c.radacina, 'proprii', 'generate', 'p-brutar-1.jpg')));
  } finally {
    c.curata();
  }
});
