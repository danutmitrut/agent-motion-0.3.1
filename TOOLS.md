# Unelte

Totul trece prin `mg`. Lista completă a comenzilor și a opțiunilor: `node nucleu/mg.mjs --help`.

| Comandă | Ce face | Stare |
| --- | --- | --- |
| `node nucleu/mg.mjs doctor` | verifică și pregătește instalarea; `--confirma-canar` confirmă testul gărzii | activă |
| `node nucleu/mg.mjs nou <proiect> --sablon reel-ilustrat` | creează `video/<proiect>/` din șablon | activă |
| `node nucleu/mg.mjs nou <proiect> --sablon text-animat` | creează `video/<proiect>/` pentru un video doar cu text, vertical sau pătrat | activă |
| `node nucleu/mg.mjs nou <proiect> --sablon overlay-filmare --filmare <cale>` | creează `video/<proiect>/` din filmarea cursantului (copia de lucru, transcrierea, `cadre/verificare-1fps.jpg`); prima dată cere `--instaleaza-transcrierea`, după acordul cursantului (~670 MB) | activă |
| `node nucleu/mg.mjs nou <proiect> --sablon date-serie` | creează `video/<proiect>/` pentru un grafic din cifre, vertical, 6-60 s (titlu, cifră, bare, comparație, final), sau pentru o serie de testimoniale dintr-un tabel, câte un film de 6-20 s pe om, randat cu Remotion; prima dată cere `--instaleaza-motorul`, după acordul cursantului (~340 MB) | activă |
| `node nucleu/mg.mjs nou <proiect-nou> --din <proiect>` | proiect nou din datele unuia vechi, când `mg randeaza` cere asta (T5); cel vechi rămâne neatins | activă |
| `node nucleu/mg.mjs desen lista`, `cauta`, `arata`, `verifica`, `adauga` | alege, arată și verifică desenele din biblioteci | activă |
| `node nucleu/mg.mjs randeaza <proiect>` | `--doar-verificare`, `--schita` sau randarea completă, cu verificările și foaia de contact | activă |
| `node nucleu/mg.mjs corectura <proiect>` | după predare: `--deschide`, `--din-nou` (a doua încercare), `--verifica`, `--propuneri` (după două încercări ratate) | activă |
| `node nucleu/mg.mjs genereaza desen <p-nume> "<subiect>" --etichete "<e1,e2,e3,e4>"` | un desen nou prin Kie, cu cheia cursantului: `--estimeaza` spune costul și ce lipsește, fără să cheltuie; fără el, garda cere aprobarea | activă |
| `node nucleu/mg.mjs doctor --generare` | verifică Python, seiful și cheia Kie; `--instaleaza-keyring` face seiful, după acordul cursantului | activă |
| `node nucleu/mg.mjs actualizeaza` | actualizarea kitului | rezervată, încă indisponibilă |

Versiuni fixate (sursa: `nucleu/VERSIUNI.json`): HyperFrames 0.8.96, Remotion 4.0.529, GSAP 3.14.2, Lucide 1.49.0, Node 22 sau mai nou, Claude Code 2.1.271 sau mai nou. Referințele oficiale HyperFrames 0.8.96 (`hyperframes`, `hyperframes-cli`, `media-use`) stau în `motoare/hyperframes/referinta/`; le citesc doar când `SABLON.md` trimite la un fișier anume.
