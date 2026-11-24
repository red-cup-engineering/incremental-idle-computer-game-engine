/** Historical regression inputs, not the authored Little Worlds catalog.
 * Captured from engine 7cff7c23515a6cd4948603cb22fd89c829519ab2.
 * Engine proofs must run without a title catalog, generator, browser or build.
 */
import { defineWorld } from '../../src/engine.mjs';
import definitions from './world-definitions.json' with { type: 'json' };
export const WORLD_DEFINITIONS = definitions;
export const WORLDS = Object.freeze(definitions.map(defineWorld));
