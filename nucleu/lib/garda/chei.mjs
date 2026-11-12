// Detectarea cheilor API în text (conținutul unui Write sau Edit, o comandă). Doar module native.

const TIPARE = [
  ['anthropic', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['openai', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['github', /\bgh[pousr]_[A-Za-z0-9]{36}\b/],
  ['github-pat', /\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ['slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['aws', /\bAKIA[0-9A-Z]{16}\b/],
  ['generic', /\b[A-Z0-9_]*(API[_-]?KEY|SECRET|TOKEN|PAROLA|CHEIE)[A-Z0-9_]*\s*[:=]\s*["']?[A-Za-z0-9._\-]{20,}/i],
];

/**
 * @param {unknown} text
 * @returns {null | { tip: string }}
 */
export function gasesteCheie(text) {
  if (typeof text !== 'string' || text === '') return null;
  for (const [tip, tipar] of TIPARE) {
    if (tipar.test(text)) return { tip };
  }
  return null;
}
