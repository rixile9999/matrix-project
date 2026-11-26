<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { t } from '#lib/i18n.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const stage = $derived(data.job.stage);
	const label = $derived(stage === 'extracting' ? t('페이지 읽는 중', 'Reading pages')
		: stage === 'planning' ? t('개념과 선수관계 정리 중', 'Mapping concepts and prerequisites')
		: t('문제 작성 및 근거 확인 중', 'Writing exercises and checking sources'));

	$effect(() => {
		if (stage === 'failed' || stage === 'done') return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try { await invalidate('matrix:pdf-job'); }
			finally { if (!stopped) timer = setTimeout(poll, 4000); }
		};
		timer = setTimeout(poll, 4000);
		return () => { stopped = true; clearTimeout(timer); };
	});
</script>

<svelte:head><title>{t('문제집 생성', 'Practice set generation')} · Matrix</title></svelte:head>
<main class="body job">
	<a href="/library">← {t('PDF 문제집', 'PDF sets')}</a>
	<h1>{data.job.sourceName}</h1>
	{#if data.job.error}
		<p role="alert">{t(data.job.error.ko, data.job.error.en)}</p>
		<a class="btn" href="/library">{t('PDF 다시 선택', 'Choose a PDF again')}</a>
	{:else}
		<div role="status">
			<h2>{label}</h2>
			<progress aria-label={label} value={data.job.completed} max={data.job.total}></progress>
			<span>{data.job.completed} / {data.job.total}</span>
		</div>
		<p>{t('이 화면을 닫아도 생성은 계속됩니다. 완료된 문제집은 회원의 PDF 목록에 표시됩니다.', 'You can close this page. The finished set will appear in the member library.')}</p>
		<noscript><a href={`/library/jobs/${data.job.id}`}>{t('진행 상태 새로고침', 'Refresh progress')}</a></noscript>
	{/if}
</main>

<style>
	.job { max-width: 44rem; margin-inline: auto; padding: clamp(24px, 5vw, 56px); }
	h1 { margin-block: 20px; overflow-wrap: anywhere; font: 600 clamp(26px, 5vw, 40px)/1.1 var(--f-display); }
	h2 { font-size: 18px; margin: 0 0 8px; }
	progress { width: min(100%, 24rem); accent-color: var(--accent); }
	span { margin-inline-start: .5rem; font-variant-numeric: tabular-nums; }
	p { color: var(--muted); }
</style>
