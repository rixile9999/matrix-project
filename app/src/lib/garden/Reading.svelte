<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	// "이번 주 풀이": written only when asked; the latest reading of the week, each sentence with the facts it rests on.
	import type { GardenData, GardenReading, GardenReadingResponse } from '#lib/types.ts';

	let { week, reading: saved, backends, defaultBackend }: { week: GardenData['week']; reading: GardenReading | null; backends: GardenData['backends']; defaultBackend: string } = $props();

	let fresh = $state<GardenReading | null>(null);
	let backend = $state(untrack(() => defaultBackend)); // bind:value with '' matched no option and left the select blank
	let busy = $state(false);
	let error = $state('');
	$effect(() => {
		page.data.locale;
		fresh = null;
		backend = defaultBackend;
		error = '';
	});
	const reading = $derived(fresh ?? saved);
	const pick = $derived(backend || defaultBackend);
	const when = $derived(reading ? new Date(reading.createdAt * 1000).toLocaleString(page.data.locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

	async function ask() {
		if (busy) return;
		busy = true;
		error = '';
		const requestLocale = page.data.locale;
		try {
			const res = await fetch('/garden/reading', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backend: pick }) });
			const j = (await res.json().catch(() => null)) as GardenReadingResponse | null;
			if (page.data.locale !== requestLocale) return;
			if (j && 'reading' in j) {
				fresh = j.reading;
			} else error = j && 'error' in j ? j.error : t('풀이를 받지 못했습니다.', 'Could not generate the reading.');
		} catch {
		error = t('풀이를 받지 못했습니다. 서버에 닿지 않았습니다.', 'Could not generate the reading. The server is unreachable.');
		} finally {
			busy = false;
		}
	}
</script>

<div class="reading">
	{#if reading}
		<p class="meta">{when} · {reading.backendName}</p>
		{#each reading.sentences as s, i (i)}
			<div class="s">
				<p>{s.text}</p>
			</div>
		{/each}
	{:else if week.factCount === 0}
		<p class="a-sub">{t('아직 읽을 한 주가 없습니다.', 'There is no week to read yet.')}</p>
	{:else}
		<p class="a-sub">{t('아직 풀이가 없습니다.', 'No reading yet.')}</p>
	{/if}

	<div class="ask">
		<a href="/settings/coach">{t('코치 연결 설정', 'Coach settings')}</a>
		{#if !backends.length}<p>{t('연결된 코치가 없습니다.', 'No coach is connected.')}</p>{:else}
		<div class="row">
			<button type="button" class="a-btn small" class:ghost={!!reading} disabled={busy || week.factCount === 0} onclick={ask}>
				{busy ? t('읽는 중…', 'Reading…') : reading ? t('다시 풀이받기', 'Read again') : t('이번 주 풀이받기', 'Read this week')}
			</button>
			<label class="sel">
				<span class="sr">{t('풀이를 쓸 Operator', 'Operator for the reading')}</span>
				<select bind:value={backend} disabled={busy} aria-label={t('풀이를 쓸 Operator', 'Operator for the reading')}>
					{#each backends as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
				</select>
			</label>
		</div>
		{/if}
		{#if busy}<p class="a-small">{t('기록을 읽고 쓰는 데 1분 가까이 걸릴 수 있습니다.', 'Reading and writing the record may take about a minute.')}</p>{/if}
		{#if error}<p class="a-err" role="alert">{error}</p>{/if}
	</div>
	<p class="note">{t('풀이를 받으면 이번 주 기록 요약이 선택한 모델 제공자에게 전송됩니다.', 'The weekly record summary is sent to the selected model provider.')}</p>
</div>

<style>
	.reading { display: flex; flex-direction: column; gap: 16px; }
	.meta { margin: 0; font: 500 12px var(--a-mono); color: var(--a-dim); }
	.s p { margin: 0; font-size: 17px; line-height: 1.7; text-wrap: pretty; max-width: 34ch; overflow-wrap: anywhere; }
	.ask { display: flex; flex-direction: column; gap: 8px; }
	.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
	select { font: 13px var(--a-body); color: var(--a-ink); background: transparent; border: 1px solid rgba(236, 235, 230, .26); border-radius: 999px; padding: 8px 14px; min-height: 36px; }
	select option { background: #0b0c11; color: #ecebe6; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.note { margin: 0; font-size: 12.5px; color: var(--a-dim); }
</style>
