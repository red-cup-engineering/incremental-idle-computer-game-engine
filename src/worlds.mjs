import { defineWorld } from './engine.mjs';
import { WORLD_DEFINITIONS } from './generated/world-definitions.mjs';

/** The game validates generated world definitions with defineWorld. */
export const WORLDS = Object.freeze(WORLD_DEFINITIONS.map(defineWorld));

export function worldById(id) { return WORLDS.find(world => world.id === id); }
