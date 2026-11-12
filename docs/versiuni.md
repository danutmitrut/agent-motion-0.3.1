# Cum se scoate o versiune nouă

Pentru cine întreține kitul (Dănuț și sesiunile Claude care lucrează la el), nu pentru agent.

1. Testele rapide pe Mac: `node --test teste/unitar/*.test.mjs teste/configuratie/*.test.mjs teste/garda/garda.test.mjs motoare/*/sabloane/*/teste/*.test.mjs`.
2. Suita completă pe laptopul Windows: `unelte/teste-windows/ruleaza.ps1`, cu Node 24. În GitHub Actions, integrarea pe Windows rulează doar la pornire manuală.
3. `versiune_kit` din `nucleu/VERSIUNI.json` crește la fiecare push pe `stabil`: ultima cifră pentru reparații, a doua pentru reguli sau funcții noi. Cursantul vede numărul în mesajele lui `mg actualizeaza`; cu același număr pe două versiuni, mesajul arată „de la 0.2.0 la 0.2.0”.
4. După orice schimbare în `nucleu/`, `node unelte/versiuni/actualizeaza-hashuri.mjs`.
5. Push pe `stabil`, apoi `mg actualizeaza` pe laptop, ca un cursant.
