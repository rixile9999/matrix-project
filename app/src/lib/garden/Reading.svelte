<script lang="ts">
	import { untrack } from 'svelte';
	// "이번 주 풀이": written only when asked; the latest reading of the week, each sentence with the facts it rests on.
	import type { GardenData, GardenReading, GardenReadingResponse } from '#lib/types.ts';

	let { week, reading: saved, backends, defaultBackend }: { week: GardenData['week']; reading: GardenReading | null; backends: GardenData['backends']; defaultBackend: string } = $props();

	let fresh = $state<GardenReading | null>(null);
	let backend = $state(untrack(() => defaultBackend)); // bind:value with '' matched no option and left the select blank
	let busy = $state(false);
	let error = $state('');
	let open = $state<Record<number, boolean>>({});
	const reading = $derived(fresh ?? saved);
	const pick = $derived(backend || defaultBackend);
	const when = $derived(reading ? new Date(reading.createdAt * 1000).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

	async function ask() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const res = await fetch('/garden/reading', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backend: pick }) });
			const j = (await res.json().catch(() => null)) as GardenReadingResponse | null;
			if (j && 'reading' in j) {
				fresh = j.reading;
				open = {};
			} else error = j && 'error' in j ? j.error : '풀이를 받지 못했습니다.';
		} catch {
			error = '풀이를 받지 못했습니다. 서버에 닿지 않았습니다.';
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
				<button type="button" class="why" aria-expanded={!!open[i]} onclick={() => (open[i] = !open[i])}>{open[i] ? '근거 접기' : '근거 보기'}</button>
				{#if open[i]}
					<ul class="facts">
						{#each s.facts as f (f.id)}<li>{f.text}</li>{/each}
					</ul>
				{/if}
			</div>
		{/each}
	{:else if week.factCount === 0}
		<p class="a-sub">이번 주 기록이 아직 없습니다. 기록이 생기면 한 주를 읽을 수 있습니다.</p>
	{:else}
		<p class="a-sub">아직 이번 주 풀이가 없습니다. 아래 버튼을 눌렀을 때만 만듭니다.</p>
	{/if}

	<div class="ask">
		<div class="row">
			<button type="button" class="a-btn small" class:ghost={!!reading} disabled={busy || week.factCount === 0} onclick={ask}>
				{busy ? '읽는 중…' : reading ? '다시 풀이받기' : '이번 주 풀이받기'}
			</button>
			<label class="sel">
				<span class="sr">풀이를 쓸 Operator</span>
				<select bind:value={backend} disabled={busy} aria-label="풀이를 쓸 Operator">
					{#each backends as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
				</select>
			</label>
		</div>
		{#if busy}<p class="a-small">기록을 읽고 쓰는 데 1분 가까이 걸릴 수 있습니다.</p>{/if}
		{#if error}<p class="a-err" role="alert">{error}</p>{/if}
	</div>
	<p class="note">Operator가 이번 주({week.label}) 기록의 사실만 받아 쓴 글입니다. 사람을 평가하지 않고, 문장마다 근거가 된 기록을 볼 수 있습니다. 누를 때만 만들어지며 다시 받으면 새 글이 쌓입니다.</p>
</div>

<style>
	.reading { display: flex; flex-direction: column; gap: 16px; }
	.meta { margin: 0; font: 500 12px var(--a-mono); color: var(--a-dim); }
	.s p { margin: 0; font-size: 17px; line-height: 1.7; text-wrap: pretty; max-width: 34ch; overflow-wrap: anywhere; }
	.why { display: block; margin-top: 4px; border: 0; background: none; padding: 6px 0; min-height: 32px; font: 500 12px var(--a-mono); color: var(--a-warm); text-align: left; cursor: pointer; }
	.facts { margin: 2px 0 0; padding: 0 0 0 12px; border-left: 1px solid var(--a-faint); list-style: none; display: flex; flex-direction: column; gap: 6px; }
	.facts li { font-size: 12.5px; color: var(--a-dim); line-height: 1.55; overflow-wrap: anywhere; }
	.ask { display: flex; flex-direction: column; gap: 8px; }
	.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
	select { font: 13px var(--a-body); color: var(--a-ink); background: transparent; border: 1px solid rgba(236, 235, 230, .26); border-radius: 999px; padding: 8px 14px; min-height: 36px; }
	select option { background: #0b0c11; color: #ecebe6; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	.note { margin: 0; font-size: 12.5px; color: var(--a-dim); }
</style>
