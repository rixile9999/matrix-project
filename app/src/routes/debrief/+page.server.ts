import { debriefData } from '#lib/server/debrief.ts';

export const load = ({ url }) => debriefData(url.searchParams.get('day'));
