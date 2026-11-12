"""Cheile agentului motion, în seiful sistemului (spec 5.9): Keychain pe Mac, Credential Manager pe Windows.

Singurul cod Python pe care îl rulează cursantul. Cheia se pune ca valoare, niciodată ca nume.

    python nucleu/cheie.py pune kie       cere cheia ascuns (getpass), în terminalul cursantului, nu prin chat
    python nucleu/cheie.py verifica kie   spune doar dacă există (codul 0 da, 1 nu); nu afișează valoarea
    python nucleu/cheie.py sterge kie     scoate cheia din seif

Citirea valorii o face doar mg genereaza (nucleu/lib/genereaza/cheie.mjs), prin `citeste` cu canalul închis spre
mg; garda refuză orice comandă a agentului care atinge cheie.py sau keyring. mg îl rulează izolat (-I -X utf8).
"""
import getpass
import sys

SERVICIU = "agent-motion"
CHEI = {"kie": "Kie (kie.ai), pentru generarea de desene"}

COD_LIPSA = 1
COD_FARA_KEYRING = 2
COD_UTILIZARE = 3
COD_SEIF = 4  # seiful n-a răspuns (de exemplu, într-o sesiune SSH pe Windows nu există Credential Manager)


def seif():
    try:
        import keyring
    except ImportError:
        print("Lipsește biblioteca Python keyring. Rulează: node nucleu/mg.mjs doctor --generare", file=sys.stderr)
        sys.exit(COD_FARA_KEYRING)
    return keyring


def principal(argv):
    if len(argv) != 2 or argv[0] not in ("pune", "verifica", "sterge", "citeste") or argv[1] not in CHEI:
        print("Folosire: python nucleu/cheie.py pune|verifica|sterge kie", file=sys.stderr)
        return COD_UTILIZARE
    actiune, nume = argv
    k = seif()
    if actiune == "pune":
        valoare = getpass.getpass(f"Lipește cheia {CHEI[nume]} și apasă Enter (nu se vede pe ecran): ").strip()
        if not valoare:
            print("Nu ai lipit nimic; cheia nu s-a schimbat.", file=sys.stderr)
            return COD_LIPSA
        k.set_password(SERVICIU, nume, valoare)
        print(f"Cheia {nume} e pusă în seiful sistemului.")
        return 0
    valoare = k.get_password(SERVICIU, nume)
    if actiune == "verifica":
        print("da" if valoare else "nu")
        return 0 if valoare else COD_LIPSA
    if actiune == "sterge":
        if valoare:
            k.delete_password(SERVICIU, nume)
        print(f"Cheia {nume} nu mai e în seif.")
        return 0
    # citeste: doar pentru mg, care o ține în memorie și n-o afișează
    if not valoare:
        return COD_LIPSA
    sys.stdout.write(valoare)
    return 0


if __name__ == "__main__":
    # diacriticele ies corect și când ieșirea merge într-un fișier pe Windows (altfel, codarea ANSI a sistemului)
    for flux in (sys.stdout, sys.stderr):
        if hasattr(flux, "reconfigure"):
            flux.reconfigure(encoding="utf-8")
    try:
        sys.exit(principal(sys.argv[1:]))
    except (KeyboardInterrupt, EOFError):
        print("Oprit; cheia nu s-a schimbat.", file=sys.stderr)
        sys.exit(COD_LIPSA)
    except Exception as e:  # o excepție neprinsă ar ieși cu 1, adică „cheie lipsă”; seiful stricat are codul lui
        print(f"Seiful sistemului n-a răspuns: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(COD_SEIF)
