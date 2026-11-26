// What the persistent ambience layer shows. The root layout mounts one <Ambience> for the whole app, so the video and the
// canvas keep running across navigation; each page only says which scene it is in. The root layout sets a default per route
// (before the page mounts), so a page that sets the stage itself wins.
import type { Backdrop, Scene, SoundMode } from './types';

export const stage = $state<{ scene: Scene; progress: number | undefined; bloom: number; desk: boolean; dim: number; sound: SoundMode; view: boolean; viewBackdrop: Backdrop | null; viewFit: 'contain' | 'cover' }>({
	scene: 'home', progress: undefined, bloom: 0, desk: false,
	dim: 0, // 0 = the picture as is, up to 1 = hidden behind the ground colour (calm screens)
	sound: 'full',
	view: false, // view mode: the page steps aside and the backdrop is shown whole (full colour, no veil)
	viewBackdrop: null, // the backdrop picked inside view mode (not saved); null = the current one
	viewFit: 'contain'
});

/** Fires the one-off bloom and wave (the result moment). */
export const fireBloom = () => (stage.bloom += 1);
