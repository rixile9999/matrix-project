<script lang="ts">
	import { t } from '#lib/i18n.svelte.ts';
	// Coaching on request: the Operator reads only the listed facts; each kept sentence shows the facts it cites.
	// Beside it: what to try next (a warm-up, or a one-week experiment measured against my own records). Choosing is optional.
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { renderInline } from '#lib/inline.ts';
	import type { DebriefData, DebriefReading, DebriefReadingResponse } from '#lib/types.ts';

	let { data }: { data: DebriefData } = $props();

	let backend = $state(untrack(() => data.defaultBackend));
	let reading = $state<DebriefReading | null>(untrack(() => data.reading));
	let busy = $state(false);
	let error = $state('');
	let cites = $state(true);
	$effect(() => {
		page.data.locale;
		reading = data.reading;
		backend = data.defaultBackend;
		error = '';
	});

	async function ask() {
		if (busy) return;
		busy = true;
		error = '';
		const requestLocale = page.data.locale;
		try {
			const r = await fetch('/debrief/reading', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backend }) });
			const j = (await r.json()) as DebriefReadingResponse;
			if (page.data.locale !== requestLocale) return;
			if ('reading' in j) reading = j.reading;
			else error = j.error;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
	const when = (at: number) => {
		const d = new Date(at * 1000);
		return `${d.getMonth() + 1}${t('월', '/')} ${d.getDate()}${t('일', '')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	};

	let choosing = $state(false);
	async function choose(id: string) {
		if (choosing) return;
		choosing = true;
		try {
			await fetch('/debrief/choice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ choice: data.choice?.id === id ? '' : id }) });
			await invalidateAll();
		} finally {
			choosing = false;
		}
	}
</script>

<div class="coach">
	<div class="letter" class:off={!cites}>
		<div class="from">
			<label>Operator
				<select bind:value={backend} aria-label={t('백엔드', 'Backend')} disabled={busy}>
					{#each data.backends as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
				</select>
			</label>
			<button class="btn small" type="button" onclick={ask} disabled={busy || data.factCount === 0}>{busy ? t('읽는 중…', 'Reading…') : reading ? t('다시', 'Again') : t('읽어 줘', 'Read')}</button>
			{#if reading}<button class="link" type="button" aria-pressed={cites} onclick={() => (cites = !cites)}>{cites ? t('근거 숨기기', 'Hide evidence') : t('근거 보기', 'Show evidence')}</button>{/if}
		</div>
		{#if busy}<p class="status" aria-live="polite"><span class="pulse"></span></p>{/if}
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		{#if reading}
			<p class="stamp mono">{when(reading.createdAt)} · {reading.backendName}</p>
			{#each reading.sentences as s, i (i)}
				<div class="sent">
					<p>{@html renderInline(s.text)}</p>
					<div class="cite">{#each s.facts as f (f.id)}<span title={f.text}>{f.text}</span>{/each}</div>
				</div>
			{/each}
		{/if}
		<p class="send">{t('읽기를 누르면 기록 요약이 선택한 모델 제공자에게 전송됩니다.', 'Reading sends the record summary to the selected model provider.')}</p>
	</div>

	<div class="next">
		<h4>{t('다음', 'Next')}</h4>
		{#if data.warmup}
			<form method="POST" action="/lang?/start">
				<input type="hidden" name="problemId" value={data.warmup.problemId} />
				<button class="choice" type="submit">
					<b>{data.warmup.title}</b>
					<em>{t('시작', 'Start')}</em>
				</button>
			</form>
		{/if}
		{#each data.experiments as x (x.id)}
			<button class="choice" type="button" aria-pressed={data.choice?.id === x.id} disabled={choosing} onclick={() => choose(x.id)}>
				<b>{x.title}</b>
				<em>{data.choice?.id === x.id ? t('진행 중', 'In progress') : t('한 주 실험', 'One-week experiment')}</em>
			</button>
		{/each}
		{#if data.choice}
			<div class="result">
				<div><span>{t('전', 'Before')}</span><b class="mono">{data.choice.result.before}</b></div>
				<div><span>{t('후', 'After')}</span><b class="mono">{data.choice.result.after}</b></div>
			</div>
		{/if}
	</div>
</div>

<style>
	.coach { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 340px); gap: 32px; align-items: start; }
	@media (max-width: 900px) { .coach { grid-template-columns: minmax(0, 1fr); } }
	.letter { display: flex; flex-direction: column; gap: 18px; }
	.from { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font: 500 12px var(--f-mono); color: var(--muted); }
	.from select { margin-left: 6px; background: transparent; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 3px 8px; font: inherit; }
	.link { border: 0; background: none; padding: 0; font: 500 12px var(--f-mono); color: var(--accent); cursor: pointer; }
	.stamp { margin: 0; font-size: 12px; color: var(--muted); }
	.sent p { margin: 0; font: 400 clamp(17px, 2vw, 20px)/1.65 var(--f-body); max-width: 42ch; text-wrap: pretty; }
	.cite { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
	.cite span { font: 500 11.5px var(--f-mono); color: var(--muted); border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.off .cite { display: none; }
	.send { margin: 0; font-size: 12px; color: var(--muted); }
	.next h4 { font: 500 12px var(--f-mono); letter-spacing: .08em; color: var(--muted); margin: 0 0 12px; }
	.next form { margin: 0; }
	.choice { width: 100%; text-align: left; border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 14px; padding: 13px 16px; margin-bottom: 10px; display: grid; gap: 4px; cursor: pointer; font: inherit; }
	.choice:hover { border-color: var(--muted); }
	.choice[aria-pressed='true'] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
	.choice b { font: 500 15px var(--f-body); }
	.choice em { font: 500 11.5px var(--f-mono); font-style: normal; color: var(--accent); }
	.result { border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 6px; font-size: 13px; }
	.result div { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); }
	.result b { color: var(--ink); font-weight: 500; }
</style>
