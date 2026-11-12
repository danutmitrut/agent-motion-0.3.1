// Formele de răspuns ale hook-urilor (code.claude.com/docs/en/hooks, „Decision control”). Doar module native.
// Garda nu întoarce niciodată permissionDecision „allow”: un allow ar sări peste dialogul de permisiuni al cursantului.
// „Permite” înseamnă stdout gol și cod 0.

/** @param {string} motiv @returns {string} JSON PreToolUse deny; codul 2 îl pune apelantul */
export function refuza(motiv) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motiv } });
}

/** @param {string} motiv @returns {string} JSON PreToolUse ask (dialogul nativ de aprobare), cu cod 0 */
export function intreaba(motiv) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: motiv } });
}

/** @param {string} motiv @returns {string} JSON pentru Stop și SubagentStop: oprirea e refuzată, Claude continuă */
export function blocheazaStop(motiv) {
  return JSON.stringify({ decision: 'block', reason: motiv });
}

/** @param {string} eveniment @param {string} text @returns {string} JSON cu context adăugat (UserPromptSubmit) */
export function context(eveniment, text) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: eveniment, additionalContext: text } });
}
