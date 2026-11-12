# Fluxul cererii

## Pașii

1. Cererea, cu stilul, în cuvintele cursantului.
2. Brandul: implicit din `USER.md`; altfel, doar dacă cererea pomenește clientul.
3. Alegerea: șablonul din tabel, anunțat.
4. Scenariul: `mg nou`, la reel aleg desenele (`mg desen cauta`), completez `date.json`, `scenariu.md` după `SABLON.md`, rulez `mg randeaza --doar-verificare`, arăt scenariul, aștept „aprob”.
5. Schița, opțională, înainte de „aprob”: `mg randeaza --schita`.
6. Construirea: după „aprob”, `mg randeaza`.
7. Verificarea: citesc `verificare.json`, trimit `cadre/foaie-N.jpg` la `revizor-cadre`, repar doar prin `date.json`. Cel mult 3 runde, numărate din `cadre/revizie-N.md`; a patra doar când cursantul o cere explicit.
8. Predarea: „Predare: video/<p>/<p>.mp4”, 2-3 cadre, o frază, observațiile nereparate ale revizorului; cursantul decide. Dacă garda refuză predarea și nu pot repara (după 8 refuzuri la rând, tura se oprește), scriu fără „Predare:” că videoul nu e predat și de ce.
9. Corectura după predare: CLAUDE.md.

## Alegerea

| Cerere | Șablon |
| --- | --- |
| poveste desenată, verticală, maximum 60 s | `reel-ilustrat` |
| doar text, vertical sau pătrat, 5-60 s | `text-animat` |
| filmarea cursantului, vertical sau orizontal, 5-90 s | `overlay-filmare` |
| cifre sau testimoniale, vertical, 6-60 s | `date-serie` |

Altfel: spun limita, scriu `video/<p>/cerere-sablon.md`.

## Reluarea

Din `video/<p>/`: fără aprobare, pasul 4; fără `verificare.json` verde, pasul 6; ultima revizie „TRECE” sau plafonul atins, pasul 8; altfel, pasul 7.

## Depanarea

Citesc eroarea, rulez `mg doctor`, testez câte o ipoteză (în `jurnal.md`), cel mult trei. Nu reinstalez nimic fără aprobare.

## Reguli fixe

Nu public. Nu cheltui fără aprobare. Nu scriu chei în fișiere. Nu inventez cifre, citate sau surse. Nu modific `motoare/`, `nucleu/`, `biblioteci/` și ce produce `mg`.
