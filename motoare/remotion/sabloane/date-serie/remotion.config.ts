// Configurația Remotion a șablonului: minimă, fără Tailwind, cu webpack-ul implicit (spec 7.3). Remotion caută fișierul
// în rădăcina proiectului lui (motoare/remotion, primul package.json), deci aici e doar documentație: toate opțiunile
// (public-dir, props, codec, pixel format, color space, concurență) le dă mg în linia de comandă.
import { Config } from '@remotion/cli/config';

Config.setOverwriteOutput(true);
