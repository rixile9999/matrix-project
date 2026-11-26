<script lang="ts">
	// The strip of one finished session, two to four observations, and (optionally) the one-tap self report.
	import { renderInline } from '#lib/inline.ts';
	import SessionStrip from './SessionStrip.svelte';
	import { SELF_LABEL } from '#lib/core/debrief.ts';
	import type { DebriefSessionCard, SelfState } from '#lib/types.ts';

	let { card, askSelf = false, heading = '' }: { card: DebriefSessionCard; askSelf?: boolean; heading?: string } = $props();

	let self = $state<SelfState | null>(null);
	let saving = $state(false);
	$effect(() => {
		self = card.self;
	});
	async function pick(st: SelfState) {
		if (saving) return;
		const next = self === st ? null : st;
		saving = true;
		try {
			const r = await fetch(`/lang/${card.problemId}/self`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: card.id, state: next ?? 'none' }) });
			if (r.ok && ((await r.json()) as { recorded: boolean }).recorded) self = next;
		} finally {
			saving = false;
		}
	}
</script>

<section class="dc" aria-label={heading || '이번 세션'}>
	{#if heading}<h3 class="dc-h">{heading}</h3>{/if}
	<SessionStrip strip={card.strip} />
	<div class="seen">
		{#each card.observations as o (o.key)}
			<div>
				<span class="k">{o.label}</span>
				{@html renderInline(o.text)}
				{#if o.pattern}<a class="go" href="/debrief#note-{o.pattern}">노트 보기</a>{/if}
			</div>
		{/each}
	</div>
	{#if askSelf}
		<div class="self">
			<span class="q">방금 머리 상태는?</span>
			<div class="chips" role="group" aria-label="자기 보고">
				{#each Object.entries(SELF_LABEL) as [k, v] (k)}
					<button class="chip" type="button" aria-pressed={self === k} disabled={saving} onclick={() => pick(k as SelfState)}>{v}</button>
				{/each}
			</div>
			<small>누르지 않아도 됩니다. 쌓이면 상태별 통과율과 맞춰 봅니다.</small>
		</div>
	{/if}
</section>

<style>
	.dc { display: flex; flex-direction: column; gap: 14px; }
	.dc-h { margin: 0; font: 500 13px var(--f-mono); letter-spacing: .08em; color: var(--muted); }
	.seen { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0 24px; }
	.seen div { border-top: 1px solid var(--line); padding: 11px 0 4px; font-size: 14px; line-height: 1.6; min-width: 0; }
	.k { display: block; font: 500 12px var(--f-mono); color: var(--muted); margin-bottom: 2px; }
	.go { margin-left: 6px; font-size: 13px; color: var(--accent); }
	.self { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--line); }
	.q { font-size: 14px; color: var(--muted); }
	.chips { display: flex; gap: 6px; }
	.chip[aria-pressed='true'] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
	small { color: var(--muted); font-size: 12.5px; }
</style>
