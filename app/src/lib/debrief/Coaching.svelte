<script lang="ts">
	// Coaching on request: the Operator reads only the listed facts; each kept sentence shows the facts it cites.
	// Beside it: what to try next (a warm-up, or a one-week experiment measured against my own records). Choosing is optional.
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { renderInline } from '#lib/inline.ts';
	import type { DebriefData, DebriefReading, DebriefReadingResponse } from '#lib/types.ts';

	let { data }: { data: DebriefData } = $props();

	let backend = $state(untrack(() => data.defaultBackend));
	let reading = $state<DebriefReading | null>(untrack(() => data.reading));
	let busy = $state(false);
	let error = $state('');
	let cites = $state(true);
	$effect(() => {
		reading = data.reading;
	});

	async function ask() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const r = await fetch('/debrief/reading', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backend }) });
			const j = (await r.json()) as DebriefReadingResponse;
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
		return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
				<select bind:value={backend} aria-label="백엔드" disabled={busy}>
					{#each data.backends as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
				</select>
			</label>
			<button class="btn small" type="button" onclick={ask} disabled={busy || data.factCount === 0}>{busy ? '읽는 중…' : reading ? '다시 읽기' : '기록 읽어 주기'}</button>
			{#if reading}<button class="link" type="button" aria-pressed={cites} onclick={() => (cites = !cites)}>{cites ? '근거 숨기기' : '근거 보기'}</button>{/if}
		</div>
		{#if busy}<p class="status" aria-live="polite"><span class="pulse"></span>기록 {data.factCount}개 사실을 읽고 있습니다. 1–2분 걸릴 수 있습니다.</p>{/if}
		{#if error}<p class="err" role="alert">{error}</p>{/if}
		{#if reading}
			<p class="stamp mono">{when(reading.createdAt)} · {reading.backendName}</p>
			{#each reading.sentences as s, i (i)}
				<div class="sent">
					<p>{@html renderInline(s.text)}</p>
					<div class="cite">{#each s.facts as f (f.id)}<span title={f.text}>{f.text}</span>{/each}</div>
				</div>
			{/each}
		{:else if !busy}
			<p class="empty">{data.factCount ? `버튼을 누르면 Operator가 기록에서 뽑은 사실 ${data.factCount}개만 읽고 코칭을 씁니다. 문장마다 근거가 붙고, 근거 없는 문장은 버립니다.` : '읽을 기록이 아직 없습니다.'}</p>
		{/if}
	</div>

	<div class="next">
		<h4>다음에 해 볼 일 · 하나만 골라도 됩니다</h4>
		{#if data.warmup}
			<form method="POST" action="/lang?/start">
				<input type="hidden" name="problemId" value={data.warmup.problemId} />
				<button class="choice" type="submit">
					<b>{@html renderInline(`\`${data.warmup.short}\` 다지기`)}</b>
					<span>{data.warmup.title}. 가장 자주 나온 실수의 규칙을 쓰는 문제입니다.</span>
					<em>바로 시작</em>
				</button>
			</form>
		{/if}
		{#each data.experiments as x (x.id)}
			<button class="choice" type="button" aria-pressed={data.choice?.id === x.id} disabled={choosing} onclick={() => choose(x.id)}>
				<b>한 주 실험: {x.title}</b>
				<span>{x.detail}</span>
				<em>{data.choice?.id === x.id ? '진행 중 · 다시 누르면 그만둡니다' : '실험'}</em>
			</button>
		{/each}
		{#if data.choice}
			<div class="result">
				<span class="mono">{when(data.choice.at)}부터 · {data.choice.result.label}</span>
				<div><span>고르기 전 2주</span><b class="mono">{data.choice.result.before}</b></div>
				<div><span>고른 뒤 ({data.choice.result.afterSessions}세션)</span><b class="mono">{data.choice.result.after}</b></div>
			</div>
		{:else}
			<small>실험을 고르면 고르기 전과 뒤를 같은 잣대로 나란히 보여 줍니다.</small>
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
	.empty { margin: 0; color: var(--muted); max-width: 52ch; }
	.next h4 { font: 500 12px var(--f-mono); letter-spacing: .08em; color: var(--muted); margin: 0 0 12px; }
	.next form { margin: 0; }
	.choice { width: 100%; text-align: left; border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 14px; padding: 13px 16px; margin-bottom: 10px; display: grid; gap: 4px; cursor: pointer; font: inherit; }
	.choice:hover { border-color: var(--muted); }
	.choice[aria-pressed='true'] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
	.choice b { font: 500 15px var(--f-body); }
	.choice span { font-size: 13px; color: var(--muted); }
	.choice em { font: 500 11.5px var(--f-mono); font-style: normal; color: var(--accent); }
	.result { border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 6px; font-size: 13px; }
	.result > span { font-size: 12px; color: var(--muted); }
	.result div { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); }
	.result b { color: var(--ink); font-weight: 500; }
	small { color: var(--muted); font-size: 12.5px; }
</style>
