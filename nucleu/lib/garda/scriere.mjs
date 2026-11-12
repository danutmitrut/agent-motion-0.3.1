// Decizia gărzii pentru Write și Edit. Doar module native.
import fs from 'node:fs';
import path from 'node:path';
import { clasificaCaleReala } from './cai.mjs';
import { gasesteCheie } from './chei.mjs';
import { extrageBlocMg, MARCAJ_START, MARCAJ_SFARSIT } from '../scenariu.mjs';

/** @typedef {{ decizie: 'permite'|'refuza'|'intreaba', motiv: string }} Decizie */

/** @returns {Decizie} */
function permite() {
  return { decizie: 'permite', motiv: '' };
}

/** @param {string} motiv @returns {Decizie} */
function refuz(motiv) {
  return { decizie: 'refuza', motiv };
}

/** @param {string} text */
function laLf(text) {
  return text.replace(/\r\n/g, '\n');
}

/** @param {string} text @param {string} subsir */
function numara(text, subsir) {
  return text.split(subsir).length - 1;
}

/** Ce trebuie să rămână identic într-un scenariu.md: blocul mg și numărul de marcaje. */
function amprentaBloc(text) {
  const t = text ?? '';
  const bloc = extrageBlocMg(t);
  return JSON.stringify([bloc ? bloc.bloc : null, numara(t, MARCAJ_START), numara(t, MARCAJ_SFARSIT)]);
}

/**
 * Aplică scrierea în memorie și o refuză dacă schimbă blocul dintre <!-- mg:start --> și <!-- mg:end -->.
 * @param {'Write'|'Edit'} unealta
 * @param {{file_path: string, content?: string, old_string?: string, new_string?: string, replace_all?: boolean}} toolInput
 * @param {string} relativ
 * @param {string} radacina
 * @returns {Decizie}
 */
function decideScenariu(unealta, toolInput, relativ, radacina) {
  let inainte;
  try {
    inainte = fs.readFileSync(path.join(radacina, ...relativ.split('/')), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') inainte = null;
    else return refuz(`Nu pot citi ${relativ} ca să verific blocul mg (${e && e.code ? e.code : 'eroare'}); din siguranță, refuz.`);
  }
  const vechi = inainte === null ? null : laLf(inainte).replace(/^\uFEFF/, '');
  let nou;
  if (unealta === 'Write') {
    nou = laLf(toolInput.content);
  } else {
    const de = laLf(toolInput.old_string);
    const cu = laLf(toolInput.new_string);
    if (vechi === null) nou = de === '' ? cu : null;
    else if (de === '') nou = cu;
    else if (!vechi.includes(de)) nou = vechi;
    else nou = toolInput.replace_all === true ? vechi.split(de).join(cu) : vechi.replace(de, () => cu);
  }
  // Edit pe un fișier inexistent eșuează singur în Claude Code, fără să scrie nimic.
  if (nou === null) return permite();
  if (amprentaBloc(vechi) !== amprentaBloc(nou)) {
    return refuz(`Blocul „Ce apare pe ecran” dintre ${MARCAJ_START} și ${MARCAJ_SFARSIT} din ${relativ} îl scrie doar mg. `
      + 'Modifică numai textul din afara blocului; blocul se regenerează cu node nucleu/mg.mjs randeaza <proiect> --doar-verificare.');
  }
  return permite();
}

/**
 * @param {'Write'|'Edit'} unealta
 * @param {{file_path?: unknown, content?: unknown, old_string?: unknown, new_string?: unknown, replace_all?: unknown}} toolInput
 * @param {string} radacina
 * @returns {Decizie}
 */
export function decideScriere(unealta, toolInput, radacina) {
  if (unealta !== 'Write' && unealta !== 'Edit') return refuz(`Garda nu cunoaște unealta ${String(unealta)}; din siguranță, refuz.`);
  if (!toolInput || typeof toolInput !== 'object' || typeof toolInput.file_path !== 'string' || toolInput.file_path.trim() === '') {
    return refuz('Cererea nu are o cale de fișier validă; din siguranță, refuz.');
  }
  if (unealta === 'Write' && typeof toolInput.content !== 'string') {
    return refuz('Cererea Write nu are conținut text; din siguranță, refuz.');
  }
  if (unealta === 'Edit' && (typeof toolInput.old_string !== 'string' || typeof toolInput.new_string !== 'string')) {
    return refuz('Cererea Edit nu are old_string și new_string; din siguranță, refuz.');
  }
  const cheie = gasesteCheie(unealta === 'Write' ? toolInput.content : toolInput.new_string);
  if (cheie) {
    return refuz(`Conținutul arată a cheie API (${cheie.tip}). Cheile nu se scriu niciodată în fișiere și nici în conversație; `
      + 'le pune cursantul în seiful sistemului, în terminalul lui.');
  }
  // F4: un symlink sau o joncțiune spre o zonă protejată primește zona reală
  const { zona, relativ, motiv } = clasificaCaleReala(toolInput.file_path, radacina);
  if (zona === 'kit') {
    return refuz(`${relativ}: ${motiv}. Dacă ceva din kit pare greșit, spune-i cursantului și notează în jurnal.md.`);
  }
  if (zona === 'generat') {
    return refuz(`${relativ}: ${motiv}. Rulează comanda mg potrivită (de exemplu node nucleu/mg.mjs randeaza <proiect>) în loc să scrii fișierul.`);
  }
  if (zona === 'configuratie') {
    return refuz(`${relativ}: ${motiv}. Dacă trebuie schimbat ceva acolo, spune-i cursantului ce să modifice și de ce; el editează fișierul.`);
  }
  if (zona === 'scenariu') return decideScenariu(unealta, toolInput, relativ, radacina);
  return permite();
}
