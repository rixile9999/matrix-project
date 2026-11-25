<script lang="ts">
	import { Ambience, AmbienceControls, audio } from '#lib/ambience/index.ts';
	import type { Scene } from '#lib/ambience/types.ts';

	let scene: Scene = $state('home');
	let progress = $state(0.4);
	let useProgress = $state(false);
	let bloom = $state(0);
	let ok = 6, bad = 1;
	const scenes: [Scene, string][] = [['home', '대기'], ['run', '푸는 중'], ['result', '결과'], ['still', '작업 화면']];
	function go(s: Scene) {
		scene = s;
		if (s === 'result') bloom++;
	}
</script>

<svelte:head><title>Ambience demo</title></svelte:head>
<Ambience {scene} progress={useProgress ? progress : undefined} {bloom} />

<main class="arena demo">
	<div class="bar">
		<div class="seg" role="group" aria-label="장면">
			{#each scenes as [s, label] (s)}
				<button type="button" aria-pressed={scene === s} onclick={() => go(s)}>{label}</button>
			{/each}
		</div>
		<label><input type="checkbox" bind:checked={useProgress} /> 진행도 <input type="range" min="0" max="1" step="0.01" bind:value={progress} disabled={!useProgress} aria-label="진행도" /></label>
		<button type="button" onclick={() => bloom++}>bloom</button>
		<button type="button" onclick={() => audio.motifNow()}>리듬 지금 듣기</button>
		<button type="button" onclick={() => audio.sfx('ok')}>ok</button>
		<button type="button" onclick={() => audio.sfx('bad')}>bad</button>
		<button type="button" onclick={() => audio.sfx('tick')}>tick</button>
		<AmbienceControls />
	</div>

	<div class="hud">
		{#if scene === 'home'}
			<div class="a-top"><span>Sparring</span><span>23회의 기록</span></div>
			<h3 class="a-title">Sprint</h3>
			<p class="a-sub">통과한 기본 문제 다섯 개를 이어서 풉니다.</p>
			<div class="a-rows"><div class="a-kv"><span>최고 기록</span><b>6:42</b></div><div class="a-kv"><span>지난 기록</span><b>7:15</b></div></div>
			<div class="a-row"><button class="a-btn" type="button" onclick={() => go('run')}>시작</button><button class="a-btn ghost" type="button">Recall</button></div>
		{:else if scene === 'run'}
			<div class="a-top"><span>Sprint · 03 / 05</span><span class="a-clock">3:48</span></div>
			<p class="a-sub">여기까지 최고 기록보다 <b>12초 빠름</b></p>
			<div class="a-glass"><b>단어 수 세기</b><span>문장의 단어별 등장 횟수를 Map으로 돌려준다.</span></div>
			<div class="a-glass"><pre class="a-code">def wordCount(s: String): Map[String, Int] =
  s.split(" ").groupBy(identity)
   .view.mapValues(_.length).toMap</pre></div>
			<div class="a-row"><button class="a-btn" type="button" onclick={() => go('result')}>실행</button><button class="a-btn ghost" type="button" onclick={() => audio.sfx(bad++ % 2 ? 'ok' : 'bad')}>건너뛰기</button></div>
		{:else if scene === 'result'}
			<div class="a-top"><span>Sprint</span><span>새 최고 기록</span></div>
			<div class="a-big">6:27</div>
			<p class="a-sub">지난 최고 6:42보다 <b>15초 빠름</b></p>
			<div class="a-rows"><div class="a-kv"><span>가장 빨라진 곳</span><b>합 구하기 −35초</b></div><div class="a-kv"><span>가장 느려진 곳</span><b>앞의 둘 +36초</b></div></div>
			<div class="a-row"><button class="a-btn" type="button" onclick={() => go('home')}>다시</button><button class="a-btn ghost" type="button">앞의 둘 다시 풀기</button></div>
		{:else}
			<div class="a-top"><span>작업 화면</span><span class="a-clock">0:{ok < 10 ? '0' : ''}{ok}</span></div>
			<p class="a-sub">그림은 멈추고 어두워지며, 소리는 바탕만 남습니다.</p>
			<div class="a-glass"><pre class="a-code">val xs = List(3, 1, 4)
xs.scanLeft(0)(_ + _)</pre></div>
			<div class="a-row"><button class="a-btn" type="button" onclick={() => go('home')}>돌아가기</button></div>
		{/if}
	</div>
</main>

<style>
	:global(body) { background: #06070b; }
	.demo { min-height: 100vh; display: flex; flex-direction: column; padding: 12px; }
	.bar { background: rgba(6, 7, 11, .85); border-radius: 12px; padding: 8px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; color: var(--a-dim); }
	.bar button { font: 500 12px var(--a-body); color: var(--a-ink); background: transparent; border: 1px solid rgba(236, 235, 230, .16); border-radius: 999px; padding: 5px 12px; cursor: pointer; }
	.bar button[aria-pressed='true'] { border-color: var(--a-warm); color: var(--a-warm); }
	.seg { display: inline-flex; gap: 6px; }
	label { display: inline-flex; gap: 6px; align-items: center; }
	.demo :global(.hud) { flex: 1; }
</style>
