// What the persistent ambience layer shows. /spar/+layout.svelte mounts one <Ambience> for all Sparring pages, so the
// video and the canvas keep running across navigation; each page only says which scene it is in.
import type { Scene } from './types';

export const stage = $state<{ scene: Scene; progress: number | undefined; bloom: number }>({ scene: 'home', progress: undefined, bloom: 0 });

/** Fires the one-off bloom and wave (the result moment). */
export const fireBloom = () => (stage.bloom += 1);
