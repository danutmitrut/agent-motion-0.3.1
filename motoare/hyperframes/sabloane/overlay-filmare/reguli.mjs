// valideaza pentru overlay-filmare (docs/interfete/sablon.md; spec 7.4, „Verificări specifice”): durata, S01, C03, S02-S05.
// S06 cere fontul real și stă în planifica (plan.mjs). Funcție fără efecte: citește doar fișierele proiectului.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eroare, avertisment, verificaTexteDate, secundeCuZecimala as secunde } from '../../../../nucleu/lib/sdk.mjs';
import { citesteFilmare, fereastra } from './context.mjs';
import { aplicaCorecturi } from './corecturi.mjs';
import { idElement, timpiElemente } from './timp.mjs';
import { verificaOcupare } from './benzi.mjs';

const sha = (cale) => crypto.createHash('sha256').update(fs.readFileSync(cale)).digest('hex');
const CUVINTE_FUNCTIONALE_RO = ['și', 'că', 'de', 'la', 'în', 'pe', 'nu', 'cu', 'să', 'mai'];

/** Câmpurile de text din date, pentru C03 (aceleași nume ca în blocul „Ce apare pe ecran”). */
export function campuriText(date) {
  const lista = [];
  const pune = (camp, text) => { if (typeof text === 'string' && text !== '') lista.push({ camp, text }); };
  (date.elemente ?? []).forEach((e, i) => {
    const c = `elemente[${i}]`;
    for (const k of ['eticheta', 'nume', 'rol', 'prefix', 'sufix', 'text', 'autor', 'cta', 'detaliu']) pune(`${c}.${k}`, e[k]);
    (e.titlu ?? []).forEach((t, j) => pune(`${c}.titlu[${j}]`, t));
    (e.puncte ?? []).forEach((p, j) => pune(`${c}.puncte[${j}].text`, p.text));
  });
  (date.corecturi ?? []).forEach((c, i) => pune(`corecturi[${i}].in`, c.in));
  (date.subtitrari?.evidentiaza ?? []).forEach((t, i) => pune(`subtitrari.evidentiaza[${i}]`, t));
  return lista;
}

/**
 * Id-urile elementelor sunt unice (spec 7.4; decizia 30): id-ul e `ref`-ul din cronologie, numele din scenariu și din verdict.
 * Se compară id-urile efective, deci și un id dat care ia numele implicit al altui element (`e2` pe primul element).
 */
export function verificaIduri(elemente = []) {
  const erori = [];
  const vazute = new Map();
  elemente.forEach((e, j) => {
    const id = idElement(e, j);
    if (!vazute.has(id)) {
      vazute.set(id, j);
      return;
    }
    const i = vazute.get(id);
    // câmpul e al unui id scris în date: unul dintre cele două e sigur dat (cele implicite sunt diferite între ele)
    const k = e.id !== undefined ? j : i;
    const implicit = (x) => (elemente[x].id === undefined ? ' (implicit)' : '');
    erori.push(eroare('overlay-filmare-id-dublu', `elemente[${k}].id`,
      `Elementele ${i + 1} și ${j + 1} au același id, „${id}”${implicit(i) || implicit(j)}; id-ul e numele elementului în scenariu și în verdict, deci trebuie să fie unic.`,
      `Dă-i lui elemente[${k}] alt id (de exemplu „${id}-${k + 1}”) sau scoate-i id-ul, ca mg să-l numească e${k + 1}.`));
  });
  return erori;
}

function verificaSursa(ctx, filmare) {
  for (const k of ['original', 'lucru']) {
    const cale = path.join(ctx.dirProiect, ...filmare[k].cale.split('/'));
    if (!fs.existsSync(cale) || sha(cale) !== filmare[k].sha256) {
      return [eroare('overlay-filmare-sursa-schimbata', 'filmare.fisier', `${filmare[k].cale} nu mai e fișierul copiat de mg nou (sha256 diferit sau fișier lipsă).`,
        'Nu repara aici: creează un proiect nou din filmare (node nucleu/mg.mjs nou <proiect-nou> --sablon overlay-filmare --filmare <clip>).')];
    }
  }
  return [];
}

function verificaRaport(raport, limba, P) {
  const e = [];
  const pune = (camp, mesaj, sugestie) => e.push(eroare('overlay-filmare-transcriere-slaba', camp, mesaj, sugestie));
  const ALTA = 'Verifică sunetul filmării; dacă vorbești clar, dă subtitrările din CapCut sau YouTube ca .srt, la un proiect nou, cu --transcriere.';
  if (raport.cuvinte_pe_secunda < P.cps[0] || raport.cuvinte_pe_secunda > P.cps[1]) pune('corecturi', `Transcrierea are ${secunde(raport.cuvinte_pe_secunda)} cuvinte pe secundă pe intervalul vorbit (normal: ${secunde(P.cps[0])}-${secunde(P.cps[1])}).`, ALTA);
  if (raport.procent_simboluri > P.simboluri) pune('corecturi', `${Math.round(raport.procent_simboluri * 100)}% din cuvinte erau simboluri de muzică sau caractere necunoscute (maximum ${P.simboluri * 100}%).`, ALTA);
  if (raport.procent_scurte > P.scurte) pune('corecturi', `${Math.round(raport.procent_scurte * 100)}% din cuvinte durează sub 0,05 s (maximum ${P.scurte * 100}%).`, ALTA);
  if (raport.durata_max > P.durata_max) pune('corecturi', `Un cuvânt durează ${secunde(raport.durata_max)} s (maximum ${secunde(P.durata_max)} s): transcrierea a prins o pauză sau zgomot.`, ALTA);
  if ((limba ?? 'ro') === 'ro' && raport.procent_functionale < P.functionale_ro) {
    pune('limba', `Transcrierea pare în altă limbă: doar ${Math.round(raport.procent_functionale * 100)}% din cuvinte sunt cuvinte uzuale românești (${CUVINTE_FUNCTIONALE_RO.join(', ')}); minimul e ${P.functionale_ro * 100}%.`,
      'Dacă filmarea e în altă limbă, pune limba ei în date.json (de exemplu "limba": "en") și creează proiectul din nou cu --limba; altfel, verifică sunetul.');
  }
  return e;
}

function avertismenteTranscriere(cuvinte) {
  const r = verificaTexteDate({}, cuvinte.filter((c) => !c.ascuns).map((c) => ({ camp: `transcriere.${c.id}`, text: c.text })));
  const ids = [...new Set(r.erori.map((e) => e.camp.slice('transcriere.'.length)))];
  if (ids.length === 0) return [];
  return [avertisment('overlay-filmare-transcriere-text', 'corecturi', `Transcrierea are emoji, linii de pauză sau caractere de cod în cuvintele ${ids.join(', ')}; așa ar apărea în subtitrări.`,
    'Repară-le cu corecturi (corecturi[], cu din și in) sau ascunde-le cu in: "".')];
}

export function valideaza(date, ctx) {
  const iduri = verificaIduri(date.elemente ?? []);
  const f = citesteFilmare(ctx);
  if (f.erori.length > 0) return { erori: [...iduri, ...f.erori], avertismente: [] };
  const erori = [...iduri];
  const avertismente = [];
  const { start, sfarsit, durata } = fereastra(date, f.filmare);
  if (sfarsit > f.filmare.durata + 0.01) {
    erori.push(eroare('overlay-filmare-durata', 'filmare.sfarsit', `filmare.sfarsit (${secunde(sfarsit)} s) e după finalul filmării (${secunde(f.filmare.durata)} s).`, `Pune filmare.sfarsit cel mult ${secunde(f.filmare.durata)} sau null.`));
  } else if (durata < ctx.sablon.meta.durata.min - 1e-9 || durata > ctx.sablon.meta.durata.max + 1e-9) {
    erori.push(eroare('overlay-filmare-durata', date.filmare?.start !== undefined ? 'filmare.start' : 'filmare.sfarsit',
      `Între filmare.start și filmare.sfarsit sunt ${secunde(durata)} s; videoul are între ${ctx.sablon.meta.durata.min} și ${ctx.sablon.meta.durata.max} s.`, 'Schimbă filmare.start sau filmare.sfarsit.'));
  }
  if (erori.length > iduri.length) return { erori, avertismente }; // durata greșită: restul nu se poate evalua
  // felia 2: jos-de-tot există doar pe vertical; pe orizontal, jos e deja la marginea zonei sigure (decizia 9 din planul H)
  if (date.subtitrari?.pozitie === 'jos-de-tot' && !Object.hasOwn(ctx.sablon.implicite.formate[date.format].benzi, 'jos-de-tot')) {
    erori.push(eroare('valoare-invalida', 'subtitrari.pozitie', `Pe formatul ${date.format}, subtitrările nu pot coborî sub banda jos: ea stă deja la marginea de jos a zonei sigure.`,
      'Pune subtitrari.pozitie pe "jos"; dacă acoperă ceva important, încearcă subtitrari.marime "S" sau "mijloc".'));
    return { erori, avertismente };
  }
  erori.push(...verificaSursa(ctx, f.filmare));
  const c03 = verificaTexteDate(date, campuriText(date));
  erori.push(...c03.erori);
  avertismente.push(...c03.avertismente);
  const cor = aplicaCorecturi(f.transcriere.cuvinte, date.corecturi ?? []);
  erori.push(...cor.erori);
  avertismente.push(...avertismenteTranscriere(cor.cuvinte));
  const implicite = ctx.sablon.implicite;
  const ritm = implicite.ritm[date.stil?.ritm ?? 'normal'];
  const t = timpiElemente(date.elemente ?? [], { cuvinte: cor.cuvinte, start, durata, ritm, implicite });
  erori.push(...t.erori);
  if (t.erori.length === 0) erori.push(...verificaOcupare(t.elemente, { date, durata, implicite, format: date.format }));
  erori.push(...verificaRaport(f.raport, date.limba ?? f.filmare.transcriere.limba, implicite.transcriere));
  return { erori, avertismente };
}
