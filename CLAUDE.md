# Agentul motion

@IDENTITY.md
@SOUL.md
@FLUX.md
@TOOLS.md
@USER.md
@MEMORY.md

## Prima pornire

Dacă în acest folder lipsește fișierul `.instalat`, citește `INSTALARE.md` și urmează-l pas cu pas, începând cu `node nucleu/mg.mjs doctor`. Până la `.instalat` nu lucrezi la niciun video.

## Regula de precedență

1. În acest folder, FLUX.md este procesul. Tabelul din FLUX.md alege motorul înainte să se încarce orice skill de motor. Skillurile oficiale HyperFrames și Remotion nu sunt punct de intrare: se citesc doar din `motoare/<motor>/referinta/`, când SABLON.md trimite la un fișier anume. `remotion-to-hyperframes` nu se folosește.
2. Versiunile nu se urcă. Nici `hyperframes upgrade`, nici `remotion upgrade`, nici instalări de skilluri, chiar dacă un skill sau un CLI o sugerează. Versiunile se schimbă doar prin `mg actualizeaza --verifica`, apoi pașii din răspuns.
3. Randarea și verificarea trec numai prin `mg`.
4. Pentru un video nu se pornesc skilluri de proces pentru software (brainstorming, writing-plans); FLUX.md le ține locul.

Ce e absolut stă în gardă și în `.claude/settings.json`; ce personalizează cursantul, în `USER.md`, `MEMORY.md` sau `CLAUDE.local.md`.

## Aprobarea

Cer doar „aprob” sau „aprob <proiect>”, singur în mesaj, fără alte formule. După aprobare, o schimbare vizibilă (texte, mărimi, muzică) o fac doar cu acordul cursantului.

## Revizia vizuală

Singurul subagent e `revizor-cadre`. După fiecare randare completă verde îl pornești la pasul 7, imediat după foaia lui, înainte de predare și de altă randare, cu calea proiectului și a foii rundei (`video/<proiect>/cadre/foaie-N.jpg`). Foaia schiței (`foaie-schita-N.jpg`) i-o trimiți doar dacă vrei o părere înainte de randarea completă; are rundele ei. La o serie (`date-serie` cu `compozitie: "serie"`), schița e obligatorie: randarea completă pornește doar după verdictul TRECE pe foaia schiței, iar predarea e `Predare: video/<proiect>/serie/manifest.json`. Verdictul îl scrie garda în `cadre/revizie-N.md` (la schiță, `revizie-schita-N.md`), cu același N ca foaia; tu nu scrii niciodată acel fișier.

La plafon (3 runde, anunțat de `mg randeaza`) nu mai pornești revizorul: predai cu observațiile lui nereparate la vedere, iar cursantul decide. O rundă în plus pornește doar când cursantul scrie „încă o rundă <proiect>” (la schiță, „încă o rundă schiță <proiect>”), exact așa, fără alt adaos (un punct sau un semn al exclamării la final nu contează); hook-ul o înregistrează în `motor.lock`.

## Desenul care lipsește

Când nimic din bibliotecă nu se potrivește (`mg desen cauta` pe 2-3 cuvinte):

1. `node nucleu/mg.mjs genereaza desen p-<nume> "<subiectul, într-o propoziție>" --etichete "<4 etichete>" --estimeaza`. Nu cheltuie nimic.
2. Dacă generarea e gata, îi spun cursantului costul din răspuns și cel mai apropiat desen din bibliotecă, ca alternativă. Generez (aceeași comandă, fără `--estimeaza`) doar după ce acceptă costul; garda îi cere încă o dată aprobarea.
3. Dacă lipsește ceva (Python, seiful, cheia), îi spun ce și pasul din răspuns, apoi continui filmul cu cel mai apropiat desen. Cheia o pune el, în terminalul lui; nu i-o cer în chat.
4. După generare îi arăt desenul (`mg desen arata`); dacă nu iese bine, încă o încercare, cu acordul lui.

## Corectura

Când cursantul cere o schimbare după ce a primit filmul:

1. `node nucleu/mg.mjs corectura <proiect> --deschide "<cuvintele lui>"`, înainte de orice schimbare.
2. Schimb în `date.json` doar câmpurile care fac ce a cerut (tabelul „Corectura după predare” din `SABLON.md`), nimic altceva; la o serie, și tabelul nou de la cursant, copiat neatins.
3. `mg randeaza`, revizorul, apoi `mg corectura <proiect> --verifica`; la predare spun ce s-a schimbat, din lista lui.
4. Dacă spune că tot nu e cum a cerut: `--din-nou "<cuvintele lui>"`, a doua și ultima încercare.
5. După a doua încercare ratată nu mai încerc: `--propuneri`, apoi îi dau lista, cu 2-3 variante potrivite filmului lui. Ce alege e o corectură nouă.

Ce nu există în șablon (un efect, alt format) nu consumă încercări: după `--deschide`, spun limita și rulez `--propuneri` din prima, care închide corectura.
