import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { withAccount } from './db.ts';
import { createReading, gardenData } from './garden.ts';
import { withLocale } from './locale.ts';
import { act, findLesson, startRun } from './stats.ts';
import { askCoach } from './worker.ts';

vi.mock('./worker.ts', () => ({
	askCoach: vi.fn(),
	connectedCoaches: vi.fn(async () => ['codex'])
}));

it('builds and reads a statistics-only Garden from stored attempts in both locales', async () => {
	const root = mkdtempSync(join(tmpdir(), 'matrix-garden-'));
	const now = new Date(2026, 0, 6, 12).getTime();
	vi.stubEnv('MATRIX_DATA', root);
	const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
	try {
		await withAccount(randomUUID(), async () => {
			const lesson = findLesson('sample-space')!;
			const yesterday = now - 86_400_000;
			const solved = startRun(lesson, yesterday);
			act(lesson, solved, 'check', ['7/8'], yesterday + 500);
			startRun(lesson, now - (lesson.seconds + 5) * 1000);
			startRun(lesson, now);

			for (const locale of ['en', 'ko'] as const) {
				await withLocale(locale, async () => {
					const data = await gardenData();
					expect(data.days.map(({ form }) => form.numbers.statsRuns)).toEqual([1, 2]);
					expect(data.days[1].form.numbers.statsPassed).toBe(1);
					expect(data.rhythm.total).toBe(1);
					expect(data.week.factCount).toBeGreaterThan(0);
					expect(data.reading).toBeNull();
					const title = lesson.title[locale === 'en' ? 1 : 0];
					vi.mocked(askCoach).mockResolvedValueOnce(JSON.stringify({
						sentences: [{ text: title, facts: ['stats-lessons'] }]
					}));
					expect((await createReading('codex')).status).toBe(200);
					const prompt = vi.mocked(askCoach).mock.lastCall?.[1];
					expect(prompt).toContain(title);
					expect(prompt).not.toContain('7/8');
					expect((await gardenData()).reading?.sentences[0].facts[0].text).toContain(title);
				});
			}
		});
	} finally {
		clock.mockRestore();
		vi.unstubAllEnvs();
		rmSync(root, { recursive: true, force: true });
	}
});
