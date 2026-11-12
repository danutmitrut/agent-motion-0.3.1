// Tiparele pazei one-line (C05, C12, F5): o singură sursă pentru fara-one-line.test.mjs și fara-lc-in-contracte.test.mjs.
// Agentul nu are desene one-line (decizia din 2026-10-07): nici trasee lc-, nici „linie continuă” în orice formă.
export const TIPARE_ONE_LINE = Object.freeze([
  [/(?<![a-z0-9])lc-[a-z0-9]/i, 'trasee lc-'],
  [/lini(?:e|a|ei|i|ile|ilor)\s+continu/i, '„linie continuă” (orice formă)'],
  [/\bone[\s-]?line\b/i, '„one-line”'],
]);
