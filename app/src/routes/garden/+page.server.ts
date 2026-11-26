import { gardenData } from '#lib/server/garden.ts';
import type { GardenData } from '#lib/types.ts';

export const load = async (): Promise<GardenData> => gardenData();
