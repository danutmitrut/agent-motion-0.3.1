// Sigla videoului (spec 7.2): din brand (fișierul din folderul brandului) sau din date.sigla (resurse/), .svg sau .png,
// cel mult 2 MB. Dimensiunile se citesc din fișier (PNG: IHDR; SVG: viewBox, altfel width și height), fără dependențe.
import fs from 'node:fs';
import path from 'node:path';
import { deschidereSvg } from '../../../../nucleu/lib/sdk.mjs';

export const MIME_SIGLA = Object.freeze({ svg: 'image/svg+xml', png: 'image/png' });
const SEMNATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {Buffer} continut
 * @param {'svg'|'png'} extensie
 * @returns {{latime: number, inaltime: number}|null}
 */
export function dimensiuniSigla(continut, extensie) {
  if (extensie === 'png') {
    if (continut.length < 24 || !continut.subarray(0, 8).equals(SEMNATURA_PNG) || continut.toString('latin1', 12, 16) !== 'IHDR') return null;
    const latime = continut.readUInt32BE(16);
    const inaltime = continut.readUInt32BE(20);
    return latime > 0 && inaltime > 0 ? { latime, inaltime } : null;
  }
  const d = deschidereSvg(continut.toString('utf8').trim());
  if (!d) return null;
  const vb = /(?:^|\s)viewBox="([^"]+)"/.exec(d.atribute);
  if (vb) {
    const n = vb[1].trim().split(/[\s,]+/).map(Number);
    return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? { latime: n[2], inaltime: n[3] } : null;
  }
  const w = /(?:^|\s)width="([\d.]+)(?:px)?"/.exec(d.atribute);
  const h = /(?:^|\s)height="([\d.]+)(?:px)?"/.exec(d.atribute);
  if (!w || !h) return null;
  const latime = Number(w[1]);
  const inaltime = Number(h[1]);
  return latime > 0 && inaltime > 0 ? { latime, inaltime } : null;
}

/**
 * De unde vine sigla: brandul are prioritate (cu brand, date.sigla e deja stil-contrazice-brand în nucleu).
 * @param {object} date
 * @param {object|null} brand fișa din citesteBrand (dir absolut)
 * @param {string} dirProiect absolut
 * @returns {{cale: string|null, camp: 'brand'|'sigla', loc: string, invalida?: boolean}|null} invalida: brand.sigla nu e un nume de fișier din folderul brandului
 */
export function sursaSigla(date, brand, dirProiect) {
  if (brand && brand.sigla !== undefined && brand.sigla !== null) {
    const loc = `Sigla din brandul „${brand.nume}”`;
    // brand.sigla vine din frontmatter, netestat: trebuie să fie un nume de fișier din folderul brandului
    if (typeof brand.sigla !== 'string' || brand.sigla.trim() === '') return { cale: null, camp: 'brand', loc, invalida: true };
    const radacina = path.resolve(brand.dir);
    const cale = path.resolve(radacina, brand.sigla);
    if (!cale.startsWith(radacina + path.sep)) return { cale: null, camp: 'brand', loc, invalida: true };
    return { cale, camp: 'brand', loc };
  }
  if (typeof date.sigla === 'string') return { cale: path.join(dirProiect, ...date.sigla.split('/')), camp: 'sigla', loc: 'Sigla' };
  return null;
}

/**
 * @param {string} cale absolută
 * @param {number} maxOcteti
 */
export function citesteSigla(cale, maxOcteti) {
  const extensie = path.extname(cale).slice(1).toLowerCase();
  if (!Object.hasOwn(MIME_SIGLA, extensie)) return { ok: false, motiv: 'extensie' };
  let stat;
  try {
    stat = fs.statSync(cale);
  } catch {
    return { ok: false, motiv: 'lipsa' };
  }
  if (!stat.isFile()) return { ok: false, motiv: 'lipsa' };
  if (stat.size > maxOcteti) return { ok: false, motiv: 'mare', octeti: stat.size };
  const continut = fs.readFileSync(cale);
  const dim = dimensiuniSigla(continut, extensie);
  if (!dim) return { ok: false, motiv: 'dimensiuni' };
  return { ok: true, extensie, mime: MIME_SIGLA[extensie], continut, latime: dim.latime, inaltime: dim.inaltime, octeti: stat.size };
}

/**
 * Cutia siglei în build: cea mai mare cu raportul fișierului care încape în [cw, ch], în pixeli întregi.
 * @returns {{w: number, h: number}}
 */
export function potrivesteSigla(latime, inaltime, [cw, ch]) {
  const s = Math.min(cw / latime, ch / inaltime);
  return { w: Math.max(1, Math.round(latime * s)), h: Math.max(1, Math.round(inaltime * s)) };
}
