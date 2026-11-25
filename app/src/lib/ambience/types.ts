/** 'still' = work screens: picture frozen and dim, sound bed only. */
export type Scene = 'home' | 'run' | 'result' | 'still';
/** 'none' = the procedural canvas scene only. */
export type Backdrop = 'none' | 'earthrise' | 'blackhole' | 'earth';
export type AmbienceSettings = { sound: boolean; volume: number; motion: boolean; backdrop: Backdrop | 'random' };
