// Decuparea filmării ca în compoziție (object-fit: cover; object-position: focus_x% 50%), pentru verificările
// care compară MP4-ul cu sursa (C12-C14 în modul „comparat cu sursa”, S10). Planul H, H07.

/**
 * @param {{latime: number, inaltime: number}} sursa copia de lucru
 * @param {{latime: number, inaltime: number}} tinta cadrul compoziției
 * @param {number} focusX 0-100
 * @returns {{scala: [number, number], crop: [number, number, number, number]}}
 */
export function decupare(sursa, tinta, focusX = 50) {
  const s = Math.max(tinta.latime / sursa.latime, tinta.inaltime / sursa.inaltime);
  const sw = Math.max(tinta.latime, Math.round(sursa.latime * s));
  const sh = Math.max(tinta.inaltime, Math.round(sursa.inaltime * s));
  return { scala: [sw, sh], crop: [tinta.latime, tinta.inaltime, Math.round(((sw - tinta.latime) * focusX) / 100), Math.round((sh - tinta.inaltime) / 2)] };
}

/** Filtrul ffmpeg al decupării: scale la mărimea acoperitoare, apoi crop la cadrul compoziției. */
export function filtruDecupare(sursa, tinta, focusX = 50) {
  const { scala: [sw, sh], crop: [w, h, x, y] } = decupare(sursa, tinta, focusX);
  return `scale=${sw}:${sh}:flags=bicubic,crop=${w}:${h}:${x}:${y}`;
}
