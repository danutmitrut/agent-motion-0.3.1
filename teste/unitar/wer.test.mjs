// Funcțiile pure din unelte/wer/masoara.mjs (planul H, H18): normalizarea, distanța pe cuvinte, FLEURS și documentul.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeazaWer, wer, citesteTsvFleurs, alegeClipuri, totalWer, de, concluzie, curataAfisare, documentMarkdown, limitaEsantion } from '../../unelte/wer/masoara.mjs';

const MASOARA = fileURLToPath(new URL('../../unelte/wer/masoara.mjs', import.meta.url));

const SEDILA_S = String.fromCodePoint(0x015f);
const SEDILA_T = String.fromCodePoint(0x0163);

test('normalizarea: litere mici, ș și ț cu virgulă, fără punctuație, cratima desparte', () => {
  assert.deepEqual(normalizeazaWer('Bună, sunt Andreea!'), ['bună', 'sunt', 'andreea']);
  assert.deepEqual(normalizeazaWer(`${SEDILA_S}ase ${SEDILA_T}ări`), ['șase', 'țări']);
  assert.deepEqual(normalizeazaWer('într-o zi, „ceva” - nou'), ['într', 'o', 'zi', 'ceva', 'nou']);
  assert.deepEqual(normalizeazaWer('În 2015.'), ['în', '2015']);
  assert.deepEqual(normalizeazaWer('  '), []);
});

test('wer: substituiri, ștergeri și inserări numărate pe cuvinte', () => {
  assert.deepEqual(wer('unu doi trei', 'unu doi trei'), { cuvinte: 3, substituiri: 0, stergeri: 0, inserari: 0, erori: 0, wer: 0 });
  assert.deepEqual(wer('unu doi trei', 'unu doi patru'), { cuvinte: 3, substituiri: 1, stergeri: 0, inserari: 0, erori: 1, wer: 1 / 3 });
  assert.deepEqual(wer('unu doi trei patru', 'unu trei patru'), { cuvinte: 4, substituiri: 0, stergeri: 1, inserari: 0, erori: 1, wer: 0.25 });
  assert.deepEqual(wer('unu doi', 'unu și doi'), { cuvinte: 2, substituiri: 0, stergeri: 0, inserari: 1, erori: 1, wer: 0.5 });
  assert.equal(wer('Claude Code e aici.', 'cloud cod e aici').wer, 0.5);
  assert.equal(wer('', '').wer, 0);
  assert.equal(wer('', 'ceva').wer, 1);
});

const TSV = [
  '1537\tb.wav\tPuteți vedea piramidele.\tputeți vedea piramidele\tp u t e ț i |\t93120\tMALE',
  '1537\ta.wav\tPuteți vedea piramidele.\tputeți vedea piramidele\tp u t e ț i |\t80000\tFEMALE',
  '1600\tc.wav\tAstăzi e soare.\tastăzi e soare\ta s t |\t48000\tMALE',
  '1700\td.wav\tMâine plouă.\tmâine plouă\tm â |\t32000\tFEMALE',
  '',
].join('\n');

test('FLEURS: rândurile din dev.tsv și alegerea clipurilor descărcate, câte unul pe frază, în ordinea numelui', () => {
  const r = citesteTsvFleurs(TSV);
  assert.equal(r.length, 4);
  assert.deepEqual(r[0], { id: '1537', fisier: 'b.wav', referinta: 'Puteți vedea piramidele.', durata: 5.8, gen: 'MALE' });
  const alese = alegeClipuri(r, new Set(['a.wav', 'b.wav', 'c.wav']), 5);
  assert.deepEqual(alese.map((x) => x.fisier), ['a.wav', 'c.wav']);
  assert.deepEqual(alegeClipuri(r, new Set(['a.wav', 'b.wav', 'c.wav', 'd.wav']), 2).map((x) => x.fisier), ['a.wav', 'c.wav']);
});

test('totalul adună erorile și cuvintele; concluzia urmează pragurile de 10% și 20%', () => {
  assert.deepEqual(totalWer([{ cuvinte: 10, erori: 1 }, { cuvinte: 30, erori: 5 }]), { cuvinte: 40, erori: 6, wer: 0.15 });
  assert.match(concluzie(0.1), /bună/);
  assert.match(concluzie(0.15), /utilizabilă/);
  assert.match(concluzie(0.21), /slabă/);
});

test('documentul: tabelul cu fiecare clip și totalul, cu virgulă zecimală, fără em dash', () => {
  const rezultate = [
    { fisier: 'a.wav', durata: 5, gen: 'FEMALE', referinta: 'Puteți vedea piramidele.', ipoteza: 'Puteți vedea piramidele.', ...wer('Puteți vedea piramidele.', 'Puteți vedea piramidele.') },
    { fisier: 'c.wav', durata: 3, gen: 'MALE', referinta: 'Astăzi e soare.', ipoteza: 'Astăzi a soare.', ...wer('Astăzi e soare.', 'Astăzi a soare.') },
  ];
  const md = documentMarkdown({ data: '2026-10-18', rezultate, motor: { runtime: 'sherpa-onnx-node', versiune: '1.13.8', model: 'm', revizie: 'r' } });
  assert.match(md, /^# Rata de eroare a transcrierii Parakeet în română$/m);
  assert.match(md, /^\| `a\.wav` \| 5,0 s \| femeie \| 3 \| 0 \| 0 \| 0 \| 0,0% \|$/m);
  assert.match(md, /^\| `c\.wav` \| 3,0 s \| bărbat \| 3 \| 1 \| 0 \| 0 \| 33,3% \|$/m);
  assert.match(md, /^\| Total \| 8,0 s \| \| 6 \| 1 \| 0 \| 0 \| 16,7% \|$/m);
  assert.match(md, /utilizabilă/);
  assert.match(md, /Mozilla Data Collective/);
  assert.equal(/[\u2013\u2014]/.test(md), false);
});

test('afișarea în document: fără linii lungi, sedile sau emoji, chiar dacă referința sau transcrierea le au', () => {
  const lung = String.fromCodePoint(0x2013);
  assert.equal(curataAfisare(`1999${lung}2000, ${SEDILA_S}i ${SEDILA_T}ara`), '1999-2000, și țara');
  const md = documentMarkdown({ data: '2026-10-18', motor: { runtime: 'r', versiune: 'v', model: 'm', revizie: 'x' },
    rezultate: [{ fisier: 'a.wav', durata: 1, gen: null, referinta: `a ${lung} b`, ipoteza: `${SEDILA_S}i`, ...wer('a b', 'și') }] });
  assert.equal([...md].some((c) => [0x2013, 0x2014, 0x015f, 0x0163].includes(c.codePointAt(0))), false);
  assert.match(md, /\| nespecificat \|/);
});

test('„de” după numeral doar la 00 și 20-99', () => {
  assert.equal(`108${de(108)} cuvinte`, '108 cuvinte');
  assert.equal(`120${de(120)} cuvinte`, '120 de cuvinte');
  assert.equal(`19${de(19)} cuvinte`, '19 cuvinte');
  assert.equal(`100${de(100)} cuvinte`, '100 de cuvinte');
});

test('documentul: platforma în antet și trimiterea spre măsurătoarea altei platforme, cu cifra din raportul ei', () => {
  const motor = { runtime: 'sherpa-onnx-node', versiune: '1.13.8', model: 'm', revizie: 'r' };
  const rezultate = [{ fisier: 'a.wav', durata: 5, gen: 'MALE', referinta: 'unu doi', ipoteza: 'unu doi', ...wer('unu doi', 'unu doi') }];
  const implicit = documentMarkdown({ data: '2026-10-19', rezultate, motor });
  assert.match(implicit, /transcrise pe Mac \(`darwin-arm64`\) pe drumul lui/);
  assert.equal(implicit.includes('alt text pe fiecare platformă'), false);
  const vezi = { platforma: { nume: 'Windows', cod: 'win32-x64' }, data: '2026-10-20', cuvinte: 120, wer: 0.125, fisier: 'wer-parakeet-ro-windows.md' };
  const md = documentMarkdown({ data: '2026-10-19', rezultate, motor, platforma: { nume: 'Mac', cod: 'darwin-arm64' }, vezi });
  assert.match(md, /Aceleași clipuri, măsurate pe Windows la 2026-10-20: 12,5% pe 120 de cuvinte, în `wer-parakeet-ro-windows\.md`\./);
  const pe = documentMarkdown({ data: '2026-10-20', rezultate, motor, platforma: { nume: 'Windows', cod: 'win32-x64' } });
  assert.match(pe, /transcrise pe Windows \(`win32-x64`\) pe drumul lui/);
});

test('limita eșantionului, din rezultate: clipurile, cuvintele, cine vorbește și cât mută rata o eroare', () => {
  const clip = (gen, ref) => ({ fisier: 'a.wav', durata: 1, gen, referinta: ref, ipoteza: ref, ...wer(ref, ref) });
  const zece = 'unu doi trei patru cinci șase șapte opt nouă zece';
  assert.equal(limitaEsantion([clip('MALE', zece), clip('MALE', zece)]),
    '- Eșantionul e mic: 2 clipuri, 20 de cuvinte, iar toți vorbitorii sunt bărbați, deci vocile de femei nu sunt măsurate. O eroare în plus sau în minus mută rata cu 5,0%: cifra e un ordin de mărime, nu o valoare exactă.');
  assert.match(limitaEsantion([clip('FEMALE', zece)]), /toate vorbitoarele sunt femei, deci vocile de bărbați nu sunt măsurate/);
  assert.match(limitaEsantion([clip('MALE', zece), clip('FEMALE', zece), clip('FEMALE', zece), clip(null, zece)]), /vorbitorii: 1 bărbat, 2 femei, 1 cu genul nespecificat\./);
  // documentul o are prima în „Ce rămâne deschis”
  const md = documentMarkdown({ data: '2026-10-19', rezultate: [clip('MALE', zece)], motor: { runtime: 'r', versiune: 'v', model: 'm', revizie: 'x' } });
  assert.match(md.split('## Ce rămâne deschis\n\n')[1], /^- Eșantionul e mic: 1 clip, 10 cuvinte/);
});

test('--din reface documentul dintr-un raport existent, fără măsurătoare (fără Parakeet și fără clipuri)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-wer-din-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rezultate = [{ fisier: 'a.wav', durata: 5, gen: 'MALE', referinta: 'unu doi', ipoteza: 'unu trei', ...wer('unu doi', 'unu trei') }];
  const motor = { runtime: 'sherpa-onnx-node', versiune: '1.13.8', model: 'm', revizie: 'r' };
  const raport = (data, platforma) => ({ data, platforma, motor, total: totalWer(rezultate), rezultate });
  fs.writeFileSync(path.join(dir, 'mac.json'), JSON.stringify(raport('2026-10-19', { nume: 'Mac', cod: 'darwin-arm64' })));
  fs.writeFileSync(path.join(dir, 'win.json'), JSON.stringify(raport('2026-10-20', { nume: 'Windows', cod: 'win32-x64' })));
  const doc = path.join(dir, 'doc.md');
  execFileSync(process.execPath, [MASOARA, '--din', path.join(dir, 'mac.json'), '--doc', doc, '--vezi-si', path.join(dir, 'win.json'), '--vezi-doc', 'win.md']);
  const asteptat = documentMarkdown({ data: '2026-10-19', rezultate, motor, platforma: { nume: 'Mac', cod: 'darwin-arm64' },
    vezi: { platforma: { nume: 'Windows', cod: 'win32-x64' }, data: '2026-10-20', cuvinte: 2, wer: 0.5, fisier: 'win.md' } });
  assert.equal(fs.readFileSync(doc, 'utf8'), asteptat);
  // --din cere --doc și nu merge cu --fleurs
  assert.throws(() => execFileSync(process.execPath, [MASOARA, '--din', path.join(dir, 'mac.json')], { stdio: 'pipe' }));
  assert.throws(() => execFileSync(process.execPath, [MASOARA, '--din', path.join(dir, 'mac.json'), '--doc', doc, '--fleurs', dir], { stdio: 'pipe' }));
});
