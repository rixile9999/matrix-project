<script lang="ts">
	import { Ambience, AmbienceControls, audio } from '#lib/ambience/index.ts';
	import { settings } from '#lib/ambience/settings.svelte.ts';
	import type { Scene } from '#lib/ambience/types.ts';
	import { t } from '#lib/i18n.svelte.ts';

	let scene: Scene = $state('home');
	let progress = $state(0.4);
	let useProgress = $state(false);
	let bloom = $state(0);
	let ok = 6, bad = 1;
	const scenes = $derived<[Scene, string][]>([['home', t('대기', 'Idle')], ['run', t('푸는 중', 'Working')], ['result', t('결과', 'Result')], ['still', t('작업 화면', 'Work view')]]);
	function playScore() {
		audio.enable(true);
		settings.sound = true;
	}
	function go(s: Scene) {
		scene = s;
		if (s === 'result') bloom++;
	}
</script>

<svelte:head><title>Ambience demo</title></svelte:head>
<Ambience {scene} progress={useProgress ? progress : undefined} {bloom} />

<main class="arena demo">
	<div class="bar">
		<div class="seg" role="group" aria-label={t('장면', 'Scene')}>
			{#each scenes as [s, label] (s)}
				<button type="button" aria-pressed={scene === s} onclick={() => go(s)}>{label}</button>
			{/each}
		</div>
		<label><input type="checkbox" bind:checked={useProgress} /> {t('진행도', 'Progress')} <input type="range" min="0" max="1" step="0.01" bind:value={progress} disabled={!useProgress} aria-label={t('진행도', 'Progress')} /></label>
		<button type="button" onclick={() => bloom++}>bloom</button>
		<button type="button" onclick={playScore}>{settings.track === 'space' ? t('긴 쉼 듣기', 'Play long rest') : t('반복 패턴 듣기', 'Play pattern')}</button>
		<button type="button" onclick={() => audio.sfx('ok')}>ok</button>
		<button type="button" onclick={() => audio.sfx('bad')}>bad</button>
		<button type="button" onclick={() => audio.sfx('tick')}>tick</button>
		<AmbienceControls />
	</div>

	<div class="hud">
		{#if scene === 'home'}
			<div class="a-top"><span>Sparring</span><span>23 {t('회의 기록', 'records')}</span></div>
			<h3 class="a-title">Sprint</h3>
			<p class="a-sub">{t('통과한 기본 문제 다섯 개를 이어서 풉니다.', 'Solve five passed basics in a row.')}</p>
			<div class="a-rows"><div class="a-kv"><span>{t('최고 기록', 'Best')}</span><b>6:42</b></div><div class="a-kv"><span>{t('지난 기록', 'Previous')}</span><b>7:15</b></div></div>
			<div class="a-row"><button class="a-btn" type="button" onclick={() => go('run')}>{t('시작', 'Start')}</button><button class="a-btn ghost" type="button">Recall</button></div>
		{:else if scene === 'run'}
			<div class="a-top"><span>Sprint · 03 / 05</span><span class="a-clock">3:48</span></div>
			<p class="a-sub">{t('여기까지 최고 기록보다', 'Compared with your best so far')} <b>12{t('초 빠름', 's faster')}</b></p>
			<div class="a-glass"><b>{t('단어 수 세기', 'Count words')}</b><span>{t('문장의 단어별 등장 횟수를 Map으로 돌려준다.', 'Return each word count as a Map.')}</span></div>
			<div class="a-glass"><pre class="a-code">def wordCount(s: String): Map[String, Int] =
  s.split(" ").groupBy(identity)
   .view.mapValues(_.length).toMap</pre></div>
			<div class="a-row"><button class="a-btn" type="button" onclick={() => go('result')}>{t('실행', 'Run')}</button><button class="a-btn ghost" type="button" onclick={() => audio.sfx(bad++ % 2 ? 'ok' : 'bad')}>{t('건너뛰기', 'Skip')}</button></div>
		{:else if scene === 'result'}
			<div class="a-top"><span>Sprint</span><span>{t('새 최고 기록', 'New best')}</span></div>
			<div class="a-big">6:27</div>
			<p class="a-sub">{t('지난 최고 6:42보다', 'Previous best 6:42 ·')} <b>{t('15초 빠름', '15s faster')}</b></p>
			<div class="a-rows"><div class="a-kv"><span>{t('가장 빨라진 곳', 'Fastest')}</span><b>{t('합 구하기', 'Sum')} −35s</b></div><div class="a-kv"><span>{t('가장 느려진 곳', 'Slowest')}</span><b>{t('앞의 둘', 'First two')} +36s</b></div></div>
			<div class="a-row"><button class="a-btn" type="button" onclick={() => go('home')}>{t('다시', 'Again')}</button><button class="a-btn ghost" type="button">{t('앞의 둘 다시 풀기', 'Redo first two')}</button></div>
		{:else}
			<div class="a-top"><span>{t('작업 화면', 'Work view')}</span><span class="a-clock">0:{ok < 10 ? '0' : ''}{ok}</span></div>
			<p class="a-sub">{t('그림은 멈추고 어두워지며, 피아노 패턴이 한층 작게 흐릅니다.', 'The picture stills and dims while the piano pattern recedes.')}</p>
			<div class="a-glass"><pre class="a-code">val xs = List(3, 1, 4)
xs.scanLeft(0)(_ + _)</pre></div>
			<div class="a-row"><button class="a-btn" type="button" onclick={() => go('home')}>{t('돌아가기', 'Back')}</button></div>
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
