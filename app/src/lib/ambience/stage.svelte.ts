// What the persistent ambience layer shows. The root layout mounts one <Ambience> for the whole app, so the video and the
// canvas keep running across navigation; each page only says which scene it is in. The root layout sets a default per route
// (before the page mounts), so a page that sets the stage itself wins.
import type { Scene, SoundMode } from './types';

export const stage = $state<{ scene: Scene; progress: number | undefined; bloom: number; dim: number; sound: SoundMode }>({
	scene: 'home', progress: undefined, bloom: 0,
	dim: 0, // 0 = the picture as is, up to 1 = hidden behind the ground colour (calm screens)
	sound: 'full'
});

/** Fires the one-off bloom and wave (the result moment). */
export const fireBloom = () => (stage.bloom += 1);
