# Instalarea la prima pornire

Citești acest fișier doar cât timp lipsește `.instalat`.

1. Rulează `node nucleu/mg.mjs doctor`. Poate dura câteva minute: instalează pachetele fixate, aduce Chrome pentru randare și face o randare de probă de 2 secunde.
2. Dacă raportul are erori, spune-i cursantului, pentru fiecare, mesajul și sugestia, în cuvinte simple. Cere-i permisiunea înainte de orice reparație. Nu reinstala Node, Python sau Claude Code fără acordul lui.
3. Testul gărzii (canarul). La final, `doctor` scrie fișierul `nucleu/.canar` și tipărește instrucțiunea. Citește `nucleu/.canar` (Read), apoi încearcă, cu uneltele tale, o scriere (Write) și o modificare (Edit) a lui; amândouă trebuie refuzate (le refuză `permissions.deny`, nu garda). Apoi rulează în terminal, din folderul agentului (Bash pe Mac, PowerShell pe Windows), exact așa: `node -e "require('fs').appendFileSync('nucleu/.canar','x')"`. Comanda trebuie refuzată de gardă, iar refuzul contează doar cu motivul în română al gărzii. Dacă Claude Code îi cere cursantului permisiunea pentru comandă, spune-i să o aprobe o singură dată, fără varianta care ține minte aprobarea: o gardă funcțională refuză comanda înainte de dialog. Nu căuta altă cale ca să ocolești refuzul.
4. Rulează `node nucleu/mg.mjs doctor --confirma-canar`.
5. Dacă vreo scriere a trecut, refuzul comenzii nu a venit cu motivul gărzii sau confirmarea pică, oprește-te. Spune-i cursantului că garda nu funcționează pe acest calculator și că nu poți lucra la videouri până nu se repară.
6. Când `doctor` iese verde și canarul e confirmat, `mg` scrie singur `.instalat`, `USER.md` și `MEMORY.md`. Nu le crea tu.

## Înainte de prima pornire (pentru cursant)

Pașii tăi, o singură dată, înainte să vorbești cu agentul.

1. **Programele.** Pe Windows: Git for Windows (git-scm.com, cu opțiunile implicite ale instalatorului) și Node 24 LTS pentru Windows x64 (nodejs.org, „Windows Installer (.msi)”). Pe Mac: Node 22 LTS pentru macOS (nodejs.org, „macOS Installer (.pkg)”); git vine cu instrumentele de linie de comandă Apple, pe care Mac-ul ți le propune la prima folosire. Claude Code îl ai deja; dacă `claude --version` arată ceva mai vechi de 2.1.271, îl actualizezi.
2. **Accesul.** Kitul e într-un depozit public pe GitHub, deci nu ai nevoie de cont și nici de invitație.
3. **Copierea kitului.** Pe Windows, deschizi PowerShell și rulezi `git clone --branch stabil https://github.com/danutmitrut/agent-motion-0.3.1.git C:\agent-motion`. Pe Mac, în Terminal: `git clone --branch stabil https://github.com/danutmitrut/agent-motion-0.3.1.git ~/agent-motion`. Nu ți se cere nicio autentificare.
4. **Prima pornire.** Pe Windows `cd C:\agent-motion`, pe Mac `cd ~/agent-motion`, apoi `claude`. Dacă îți spune că autentificarea a expirat sau nu ești conectat, scrii `/login` și intri din browser cu contul tău Claude. Îi scrii agentului orice, de exemplu „salut”. Vede că e prima pornire și face singur instalarea (câteva minute: pachetele, Chrome pentru randare, o randare de probă și testul gărzii), cerându-ți acordul la fiecare reparație.

## Pentru cursant

- Pe Windows, folderul recomandat e `C:\agent-motion`: fără OneDrive, fără diacritice în cale, cu căi scurte.
- Excluderea folderului din Microsoft Defender grăbește randarea. E opțională și o faci tu, din setările Windows, dacă vrei; agentul nu o face.
- Remotion, motorul graficelor din cifre (`date-serie`), nu se instalează la prima pornire. La primul video `date-serie`, agentul îți cere acordul pentru descărcare (~340 MB: pachetele și un Chrome Headless Shell). După o actualizare care schimbă pachetele, doctorul le aduce din nou, fără să mai întrebe. Excluderea din Defender, de mai sus, grăbește și descărcarea, și randarea.
- Remotion e gratuit pentru persoane și pentru firme de cel mult 3 oameni; de la 4 oameni, firma ta are nevoie de o Company License de la Remotion (remotion.dev/docs/license). Agentul nu cumpără și nu activează licențe.
- Python nu e necesar acum. E nevoie de el abia la prima generare de desene, iar agentul îți spune atunci ce ai de făcut.

## Generarea de desene

E opțională. Agentul ți-o propune doar când în bibliotecă nu e un desen potrivit și îți spune costul înainte.

1. **Python 3, o singură dată.** Pe Windows, de pe python.org, instalatorul pentru Windows pe 64 de biți, doar pentru contul tău: bifezi „Add python.exe to PATH” și nu bifezi nimic „for all users” sau „admin privileges”, deci nu ai nevoie de parola unui administrator. Pe Mac, `python3` vine cu instrumentele de linie de comandă Apple; dacă la prima verificare apare o fereastră care propune instalarea lor, o accepți (sau iei Python de pe python.org) și rulezi verificarea din nou. Apoi îi spui agentului să ruleze `node nucleu/mg.mjs doctor --generare`.
2. **Seiful pentru cheie.** Agentul îți cere acordul și rulează `node nucleu/mg.mjs doctor --generare --instaleaza-keyring` (descarcă ~1 MB de pe pypi.org, în folderul agentului).
3. **Cheia Kie.** O iei din contul tău de pe kie.ai (API Key). O pui tu, într-un terminal deschis în folderul agentului, nu în chat: pe Mac `unelte/python/bin/python nucleu/cheie.py pune kie`, pe Windows (PowerShell) `.\unelte\python\Scripts\python.exe nucleu\cheie.py pune kie`. Lipești cheia (nu se vede pe ecran) și apeși Enter. Stă în seiful sistemului (Keychain pe Mac, Credential Manager pe Windows).
4. **Costul.** Un desen costă cam 0,03 $ (6 credite), din contul tău Kie. Înainte de fiecare desen, agentul îți spune costul, iar Claude Code îți cere aprobarea.
5. **Drepturile.** Desenul generat e al tău și în răspunderea ta, ca orice desen propriu. Termenii Kie (verificați pe 26.10.2026) nu revendică desenele și nu interzic folosirea lor comercială, dar nici nu o acordă explicit. Dacă un client îți cere certitudine, întreabă Kie (support@kie.ai).
