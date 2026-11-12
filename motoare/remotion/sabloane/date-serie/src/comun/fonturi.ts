// Fonturile temei, din build/fonturi/ (folderul public al lui Remotion e build/): câte un loadFont pe fiecare fișier
// woff2 din props.fonturi, cu unicodeRange-ul lui din font.json. Randarea așteaptă toate fonturile (delayRender);
// un font care nu se încarcă oprește randarea cu eroarea lui (cancelRender), nu cade pe un font de sistem.
import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import { loadFont } from '@remotion/fonts';
import type { Font } from '../tipuri';

export function useFonturi(fonturi: Font[]): void {
  const [asteptare] = useState(() => delayRender('fonturile din props.fonturi'));
  useEffect(() => {
    Promise.all(
      fonturi.map((f) =>
        loadFont({ family: f.familie, url: staticFile(f.url), weight: f.greutate, unicodeRange: f.unicodeRange, format: 'woff2' }),
      ),
    )
      .then(() => continueRender(asteptare))
      .catch((err) => cancelRender(err));
  }, [fonturi, asteptare]);
}
