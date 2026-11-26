import { debriefData } from '#lib/server/debrief.ts';
import { recentStatsReviews } from '#lib/server/stats.ts';

export const load = ({ url }) => ({
	...debriefData(url.searchParams.get('day')),
	statsReviews: recentStatsReviews()
});
