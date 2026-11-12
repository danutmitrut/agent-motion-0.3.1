---
nume: proba-remotion
motor: remotion
versiune_schema: 1
formate: [vertical, patrat]
fps: 30
teme: [noapte, hartie, curat]
durata: { min: 3, max: 30, implicita: 6 }
verificari: [C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13, C14, C15, C16, C17]
verificari_partiale: {}
---

# Șablonul de probă pentru Remotion

Fixture de test, nu șablon pentru cursanți. Adaptorul Remotion al nucleului (planul I) trece pe el prin toate modurile lui `mg randeaza` înaintea șablonului `date-serie`, cum trece adaptorul HyperFrames prin `proba`.

## Ce face

Aceleași date, aceeași schemă și aceeași cronologie ca `proba`: fiecare scenă are tipul `titlu`, unul sau două rânduri de cel mult 22 de caractere și stă pe ecran exact 3 s; textul e complet după o jumătate de secundă, iar compoziția e statică, deci cronologia declară ferestre statice `citire` de la textul complet la sfârșitul fiecărei scene și fereastra `pauza-finala` în ultima jumătate de secundă.

## Ce construiește

Doar `build/props.json`: dimensiunile, numărul de cadre, culorile temei, mărimea textului și, pe scenă, cadrul de început, numărul de cadre, zona textului și rândurile. Compoziția `Proba` din `src/Root.tsx` doar desenează: fundalul și rândurile fiecărei scene, statice, în zona textului. Fără fonturi încorporate și fără nicio adresă `http`.

## Ce verifică în plus față de schemă

- un rând de titlu gol sau doar cu spații: `valoare-invalida`;
- un rând cu un număr impar de `*`: `accent-neinchis`.

## Erorile

Ca la `proba`: `cadre-goale` (C12) înseamnă un text pe care nu-l vede nimeni (verifică `scene[i].titlu` și `stil.tema`), `text-invizibil` (C13) cere altă `stil.tema`, iar `video-inghetat` (C14) în afara ferestrelor statice e o problemă a șablonului, nu a datelor.
