/** 'still' = work screens: picture frozen and dim, softened score. */
export type Scene = 'home' | 'run' | 'result' | 'still';
/** 'none' = the procedural canvas scene only. */
export type Backdrop = 'none' | 'earthrise' | 'blackhole' | 'earth';
export type MusicTrack = 'patterns' | 'space';
export type AmbienceSettings = { track: MusicTrack; sound: boolean; volume: number; motion: boolean; backdrop: Backdrop | 'random' };
/** How much of the sound scene plays (see audio.setMode). */
export type SoundMode = 'full' | 'bed' | 'quiet';
