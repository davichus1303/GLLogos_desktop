/**
 * GLogos App — entrada principal.
 *
 * Se lanza como proceso independiente (GJS), ya sea desde la extensión
 * (con --version, --book, --chapter, --verse como contexto) o desde el
 * escritorio vía el archivo .desktop.
 */

import {GLogosApplication} from './application.js';

const application = new GLogosApplication();
application.run(globalThis.ARGV);
