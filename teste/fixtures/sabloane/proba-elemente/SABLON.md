---
nume: proba-elemente
motor: hyperframes
versiune_schema: 1
formate: [vertical]
fps: 30
teme: [noapte, hartie, curat]
durata: { min: 3, max: 15, implicita: 6 }
verificari: [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C16, C17, S01, S02]
stadii: { S01: build, S02: mp4 }
verificari_partiale: {}
---

# Șablonul de probă cu elemente

Fixture de test, nu șablon pentru cursanți. E a doua implementare de referință a interfeței din `docs/interfete/sablon.md`: datele nu au `scene`, ci `elemente`, iar șablonul folosește hook-urile opționale `blocScenariu`, `verificariBuild` și `verificariProprii`, plus `stadii:` în frontmatter. Nu declară C15 (exersează o verificare comună nedeclarată).

## Ce face

Fiecare element are un text de cel mult 22 de caractere și stă pe ecran exact 3 s (destul pentru formula timpului de citire, C09): textul e complet după o jumătate de secundă și de acolo imaginea stă pe loc: compoziția e statică, deci cronologia declară ferestre statice `citire` de la textul complet la sfârșitul fiecărui element, iar ultima jumătate de secundă a videoului e fereastra `pauza-finala`. Durata videoului e de 3 s pe element.

## Ce construiește

Un singur `index.html` HyperFrames static (rădăcina are `data-no-timeline` și `data-proba-elemente`), cu câte un clip pe element (`id="el-N"`) și textele ca noduri de text. Fără GSAP, fără fonturi încorporate, fără desene și fără nicio adresă `http`.

## Ce verifică în plus față de schemă

- un text gol sau doar cu spații: `valoare-invalida`;
- S01 (pe build): `index.html` are atributul `data-proba-elemente`;
- S02 (pe MP4): fișierul MP4 nu e gol.

## Erorile

Aici trimit sugestiile lui C12, C13 și C14 care nu pot numi un câmp din `date.json` („vezi în SABLON.md al șablonului rubrica erorilor”). Șablonul nu are durate, desene sau atmosferă în date, deci reparațiile sunt puține:

- `cadre-goale` (C12): fiecare element are un text, deci un cadru gol înseamnă un text pe care nu-l vede nimeni: verifică `elemente[i].text` (nu e gol) și `stil.tema`;
- `text-invizibil` (C13): textul se pierde în fundal; schimbă `stil.tema` (culorile vin doar din temă sau din brand);
- `video-inghetat` (C14): imaginea e statică prin construcție, iar cronologia declară ferestrele statice; o găsire în afara lor e o problemă a șablonului, nu a datelor.
