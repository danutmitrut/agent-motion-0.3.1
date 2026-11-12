// Ajutor comun pentru testele de configurație (importuri.test.mjs, buget-cuvinte.test.mjs, revizor.test.mjs).

// Fișierele cursantului: lipsesc din repo, mg doctor le creează din exemple (spec 9.2).
export const ALE_CURSANTULUI = Object.freeze({ 'USER.md': 'USER.exemplu.md', 'MEMORY.md': 'MEMORY.exemplu.md' });

// Claude Code nu importă din blocuri de cod și din `cod` în linie (code.claude.com/docs/en/memory).
export function extrageImporturi(text) {
  const faraCod = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...faraCod.matchAll(/(?:^|\s)@([^\s]+)/g)].map((m) => m[1]);
}

// Un cuvânt = o secvență fără spații care conține cel puțin o literă sau o cifră (semnele Markdown nu se numără).
export function numaraCuvinte(text) {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}
