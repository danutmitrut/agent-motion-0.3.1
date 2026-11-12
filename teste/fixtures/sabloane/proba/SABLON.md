---
nume: proba
motor: hyperframes
versiune_schema: 1
formate: [vertical, patrat]
fps: 30
teme: [noapte, hartie, curat]
durata: { min: 3, max: 30, implicita: 6 }
verificari: [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17]
verificari_partiale: {}
---

# Șablonul de probă

Fixture de test, nu șablon pentru cursanți. Implementează interfața comună din `docs/interfete/sablon.md` cât mai simplu, ca nucleul să poată fi testat fără `reel-ilustrat`.

## Ce face

Fiecare scenă are tipul `titlu` și unul sau două rânduri de cel mult 22 de caractere. Fiecare scenă stă pe ecran exact 3 s (destul pentru formula timpului de citire, C09, la textele scurte ale probei): textul e complet după o jumătate de secundă și de acolo imaginea stă pe loc: compoziția e statică, deci cronologia declară ferestre statice `citire` de la textul complet la sfârșitul fiecărei scene, iar ultima jumătate de secundă a videoului e fereastra `pauza-finala`. Durata videoului e de 3 s pe scenă.

## Ce construiește

Un singur `index.html` HyperFrames static (rădăcina are `data-no-timeline`), cu câte un clip pe scenă și textele ca noduri de text. Fără GSAP, fără fonturi încorporate, fără desene și fără nicio adresă `http`.

## Ce verifică în plus față de schemă

- un rând de titlu gol sau doar cu spații: `valoare-invalida`;
- un rând cu un număr impar de `*`: `accent-neinchis`.

## Erorile

Aici trimit sugestiile lui C12, C13 și C14 care nu pot numi un câmp din `date.json` („vezi în SABLON.md al șablonului rubrica erorilor”). Șablonul nu are durate, desene sau atmosferă în date, deci reparațiile sunt puține:

- `cadre-goale` (C12): fiecare scenă are un text, deci un cadru gol înseamnă un text pe care nu-l vede nimeni: verifică `scene[i].titlu` (nu e gol) și `stil.tema`;
- `text-invizibil` (C13): textul se pierde în fundal; schimbă `stil.tema` (culorile vin doar din temă sau din brand);
- `video-inghetat` (C14): imaginea e statică prin construcție, iar cronologia declară ferestrele statice; o găsire în afara lor e o problemă a șablonului, nu a datelor.
