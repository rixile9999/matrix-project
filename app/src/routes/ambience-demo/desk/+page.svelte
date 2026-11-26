<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import LanguageSwitch from '#lib/LanguageSwitch.svelte';
	import CodeEditor from '#lib/CodeEditor.svelte';
	import { settings } from '#lib/ambience/settings.svelte.ts';
	import { t } from '#lib/i18n.svelte.ts';

	const exercises = $derived([
		{ title: t('가장 긴 증가 구간', 'Longest increasing run'),
		  prompt: t('정수 리스트에서 이웃한 값이 계속 커지는 구간을 찾으세요. 가장 긴 구간의 길이를 반환하세요.', 'Find the longest stretch of strictly increasing neighbours in a list of integers. Return its length.'),
		  detail: t('같은 값이 이어지면 구간이 끝납니다. 빈 리스트의 길이는 0입니다.', 'An equal value ends a run. An empty list has length 0.'),
		  input: 'List(1, 3, 5, 2, 4)', output: '3', starter: 'def longestRun(xs: List[Int]): Int =\n  ???\n' },
		{ title: t('연속 중복 제거', 'Collapse adjacent duplicates'),
		  prompt: t('정수 리스트에서 같은 값이 연이어 나타나면 첫 번째 값만 남기세요. 결과를 새 리스트로 반환하세요.', 'Keep the first value in each consecutive group of equal integers. Return the resulting list.'),
		  detail: t('서로 떨어져 있는 같은 값은 그대로 둡니다.', 'Equal values separated by another value stay in the list.'),
		  input: 'List(1, 1, 2, 2, 2, 1)', output: 'List(1, 2, 1)', starter: 'def collapse(xs: List[Int]): List[Int] =\n  ???\n' }
	]);
	let active = $state(true);
	let index = $state(0);
	let drafts = $state<(string | undefined)[]>([]);
	const exercise = $derived(exercises[index]);
	const reduce = new MediaQuery('prefers-reduced-motion: reduce');
	let movie = $state<HTMLVideoElement>();
	let visible = $state(true);
	let elapsed = $state(0);
	const remaining = $derived(Math.max(0, 400 - elapsed));

	$effect(() => {
		if (!active) return;
		const start = performance.now();
		const interval = setInterval(() => { elapsed = Math.floor((performance.now() - start) / 1000); }, 250);
		return () => clearInterval(interval);
	});
	$effect(() => {
		if (!movie) return;
		if (active || reduce.current || !settings.motion || !visible) movie.pause();
		else void movie.play().catch(() => {});
	});
	function openDesk() {
		index = 0;
		elapsed = 0;
		active = true;
	}
</script>

<svelte:head><title>{t('관측 데스크 시안', 'Observation desk preview')} · Matrix</title></svelte:head>
<svelte:document onvisibilitychange={() => (visible = !document.hidden)} />

<main class="station arena" class:active class:still={!settings.motion}>
	<header>
		<div class="identity"><a href="/spar">Matrix</a><span>/</span>{t('관측 데스크 시안', 'Observation desk preview')}</div>
		<LanguageSwitch />
	</header>

	<div class="window">
		<!-- The still is from this exact shot. Defer the movie until the sky is opened. -->
		{#if !active || movie}
			<video bind:this={movie} muted playsinline loop preload="metadata" poster="/video/earthrise-desk.jpg"
				onloadedmetadata={(e) => { e.currentTarget.currentTime = 18; }}>
				<source src="/video/full/earthrise.mp4" type="video/mp4" />
			</video>
		{/if}
		<div class="caption"><span>{t('달 지평선에서 본 지구', 'Earth from the lunar horizon')}</span><small>NASA / GSFC / SVS</small></div>
	</div>

	<section class="desk" aria-label={t('훈련 작업판', 'Training desk')}>
		<div class="lip" aria-hidden="true"><i></i></div>
		<div class="sheet">
			{#if active}
				<div class="rail">
					<div><b>Sprint</b><span class="separator"></span><span>{String(index + 1).padStart(2, '0')} / 02</span></div>
					<div><span>{t('남은 시간', 'Remaining')}</span><time>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</time></div>
				</div>
				<div class="work">
					<article>
						<h1>{exercise.title}</h1>
						<p>{exercise.prompt}</p><p class="detail">{exercise.detail}</p>
						<dl>
							<div><dt>{t('입력', 'Input')}</dt><dd><code>{exercise.input}</code></dd></div>
							<div><dt>{t('출력', 'Output')}</dt><dd><code>{exercise.output}</code></dd></div>
						</dl>
					</article>
					<div class="editor">
						<div class="file"><b>{index ? 'collapse' : 'longestRun'}.scala</b><span>Scala 3</span></div>
						{#key index}
							<CodeEditor doc={drafts[index] ?? exercise.starter} onchange={(code) => (drafts[index] = code)} label={t('Scala 코드', 'Scala code')} />
						{/key}
					</div>
				</div>
				<footer><button class="bare" onclick={() => (active = false)}>{t('관측창 보기', 'View horizon')}</button>
					{#if index === 0}<button class="primary" onclick={() => (index = 1)}>{t('다음 예제', 'Next example')}</button>
					{:else}<button class="primary" onclick={() => (active = false)}>{t('시안 마치기', 'Finish preview')}</button>{/if}
				</footer>
			{:else}
				<div class="lobby"><a href="/spar">{t('스파링으로 돌아가기', 'Back to Sparring')}</a><button class="primary" onclick={openDesk}>{t('훈련 시안 열기', 'Open training preview')}</button></div>
			{/if}
		</div>
	</section>
</main>

<style>
	.station {
		--paper: #182025; --ink: #f0ede1; --muted: #b1bcbf; --surface: #11191d; --accent: #d9c399;
		min-height: 100svh; background: #090d10; color: var(--ink); display: flex; flex-direction: column; color-scheme: dark;
	}
	header { min-height: 54px; padding: 8px clamp(20px, 5vw, 90px); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #363d3f; background: #11171a; }
	.identity { display: flex; align-items: baseline; gap: 14px; font-size: 14px; color: #c8cdca; }
	.identity span { color: #798384; }
	.identity a { color: var(--ink); font: 600 20px Georgia, serif; text-decoration: none; }
	.window { position: relative; overflow: hidden; height: max(56svh, calc(100svh - 156px)); flex: none; background: #06080a url('/video/earthrise-desk.jpg') center 42% / cover no-repeat; transition: height 420ms cubic-bezier(.22,.7,.2,1); }
	.active .window { height: clamp(132px, 23svh, 220px); }
	video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 42%; }
	.window::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 -20px 25px -21px #000; background: linear-gradient(0deg, #070d12a8, transparent 48%); }
	.caption { position: absolute; z-index: 1; bottom: 14px; left: clamp(20px, 5vw, 90px); right: clamp(20px, 5vw, 90px); display: flex; align-items: baseline; justify-content: space-between; gap: 10px; color: #faf8ed; text-shadow: 0 1px 4px #000; font-size: 13px; }
	.caption small { font: 12px var(--f-mono); }
	.desk { position: relative; flex: 1; background: var(--paper); }
	.lip { position: relative; height: 13px; border-top: 1px solid #abb1a7; border-bottom: 1px solid #070b0e; background: linear-gradient(#5b6665, #3d484a 20%, #354044 68%, #253036 70%); display: grid; place-items: center; }
	.lip::before, .lip::after { content: ''; position: absolute; inset-block: 2px; width: 28px; background: repeating-linear-gradient(110deg, transparent 0 5px, #848d87 6px, #253034 7px); opacity: .6; }
	.lip::before { left: 20px; }
	.lip::after { right: 20px; }
	.lip i { width: 68px; height: 3px; background: #1c2526; border-radius: 3px; box-shadow: 0 1px #737d7a; }
	.sheet { max-width: 1280px; margin: auto; padding: 0 clamp(20px, 5vw, 80px); }
	.rail, footer, .lobby { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.rail { min-height: 66px; border-bottom: 1px solid #475155; color: var(--muted); font: 13px var(--f-mono); }
	.rail div { display: flex; gap: 15px; align-items: baseline; }
	.rail b { color: var(--ink); font-size: 15px; }
	.separator { height: 11px; border-left: 1px solid #68716e; }
	time { color: var(--accent); font-variant-numeric: tabular-nums; font-size: 18px; min-width: 4ch; }
	.work { display: grid; grid-template-columns: .95fr 1.05fr; gap: clamp(26px, 5vw, 80px); padding: clamp(28px, 4vw, 60px) 0; align-items: stretch; }
	article, .editor { min-width: 0; }
	h1 { margin: 0 0 22px; color: var(--ink); line-height: 1.18; font-family: Georgia, 'AppleMyungjo', 'Batang', serif; font-size: clamp(29px, 3vw, 48px); font-weight: 500; letter-spacing: -.045em; text-wrap: balance; }
	p { margin: 0; font-size: 17px; line-height: 1.8; word-break: keep-all; }
	.detail { margin-top: 8px; color: #c0cbcc; font-size: 15px; }
	dl { margin: 25px 0 0; border-top: 1px solid #404b4d; }
	dl div { display: grid; grid-template-columns: 60px auto; gap: 8px; align-items: baseline; border-bottom: 1px solid #374247; padding: 8px 0; }
	dt { color: var(--muted); font-size: 13px; }
	dd { margin: 0; overflow-wrap: anywhere; }
	code, .file { font: 14px var(--f-mono); }
	.editor { display: flex; flex-direction: column; background: var(--surface); border: 1px solid #444f51; border-radius: 4px; overflow: hidden; }
	.file { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px; border-bottom: 1px solid #364246; }
	.file b { font-weight: 500; }
	.file span { font-size: 12px; color: var(--muted); }
	.editor :global(.cm-host) { flex: 1; min-height: 160px; }
	.editor :global(.cm-editor) { min-height: 160px; font-size: 15px; }
	.editor :global(.cm-content) { padding-block: 15px; }
	footer, .lobby { border-top: 1px solid #475155; padding: 17px 0 24px; }
	.lobby { border: 0; }
	button { font: 600 14px var(--f-body); cursor: pointer; }
	.primary { color: #1e2525; background: #dfcfb1; border: 1px solid #eee1cb; padding: 10px 18px; border-radius: 4px; }
	.primary:hover { background: #f3e6ce; }
	.bare, .lobby a { padding: 10px 0; background: none; border: 0; color: #c7d0cd; text-underline-offset: 4px; font-size: 14px; }
	.bare:hover { text-decoration: underline; }
	.station :focus-visible { outline: 2px solid #edcf95; outline-offset: 3px; }
	.still .window { transition: none; }
	@media (prefers-reduced-motion: reduce) { .window { transition: none; } }
	@media (max-width: 720px) {
		.active .window { height: clamp(110px, 15svh, 145px); }
		.work { grid-template-columns: 1fr; gap: 23px; padding: 25px 0; }
		.rail { min-height: 48px; }
		h1 { margin-bottom: 14px; }
		dl { margin-top: 17px; }
		.caption { bottom: 8px; }
	}
</style>
