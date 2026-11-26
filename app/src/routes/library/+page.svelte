<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { BACKENDS, type BackendId } from '#lib/core/coach.ts';
	import { t } from '#lib/i18n.svelte.ts';
	import { PDF_PAGE_TEXT_LIMIT, PDF_SOURCE_MAX_PAGES, PDF_UPLOAD_MAX_BYTES, type BiText } from '#lib/pdf-sets.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let chosenBackend = $state<BackendId>();
	const preferredBackend = $derived(chosenBackend ?? form?.backend);
	const backend = $derived(
		preferredBackend && data.backends.includes(preferredBackend) ? preferredBackend : data.backends[0]
	);
	let busy = $state(false);
	let submitError = $state<BiText | null>(null);
	const error = $derived(submitError ?? form?.error);
	const maxMiB = PDF_UPLOAD_MAX_BYTES / (1024 * 1024);

	const submit: SubmitFunction = ({ cancel }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		submitError = null;
		return async ({ result, update }) => {
			try {
				if (result.type === 'error') {
					submitError = result.status === 413
						? {
							ko: `${maxMiB} MiB 이하인 PDF를 선택하세요.`,
							en: `Choose a PDF that is ${maxMiB} MiB or smaller.`
						}
						: {
							ko: '업로드에 실패했습니다. 잠시 후 다시 시도하세요.',
							en: 'The upload failed. Try again shortly.'
						};
					return;
				}
				await update();
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head><title>{t('PDF 문제집', 'PDF sets')} · Matrix</title></svelte:head>

<main class="body library">
	<header class="intro">
		<h1>{t('PDF 문제집', 'PDF sets')}</h1>
	</header>

	<div class="library-grid">
		<section aria-labelledby="sets-title" class="sets">
			<h2 id="sets-title">{t('문제집 목록', 'Practice sets')}</h2>
			{#if data.sets.length === 0}
				<p class="empty">{t('아직 공유된 문제집이 없습니다.', 'No sets have been shared yet.')}</p>
			{:else}
				<ul>
					{#each data.sets as set (set.id)}
						<li>
							<a class="set" href="/library/{set.id}" data-sveltekit-preload-data="off">
								<div>
									<strong>{t(set.title.ko, set.title.en)}</strong>
									{#if !set.isShared}<span class="source">{t('비공개', 'Private')}</span>{/if}
									{#if set.sourceName}<span class="source">{set.sourceName}</span>{/if}
								</div>
								<span class="count">{t(`${set.count}문제`, `${set.count} questions`)} <span aria-hidden="true">→</span></span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="upload" aria-labelledby="upload-title">
			<h2 id="upload-title">{t('PDF로 생성', 'Create from a PDF')}</h2>
			<p>{t('AI가 영어와 한국어로 객관식 문제 3~5개를 만듭니다.', 'AI generates 3–5 multiple-choice questions in English and Korean.')}</p>

			{#if data.backends.length}
				<form method="POST" enctype="multipart/form-data" use:enhance={submit} aria-busy={busy}>
					<input type="hidden" name="requestId" value={form?.requestId ?? data.requestId} />
					<input type="hidden" name="visibility" value="members" />
					<fieldset disabled={busy}>
						<div class="file-field">
							<label for="pdf-file">{t('PDF 파일', 'PDF file')}</label>
							<input id="pdf-file" name="pdf" type="file" accept=".pdf,application/pdf" required aria-describedby="file-help" />
							<p id="file-help" class="help">{t(`텍스트를 선택할 수 있는 PDF · 최대 ${maxMiB} MiB`, `PDF with selectable text · up to ${maxMiB} MiB`)}</p>
						</div>
						<div class="provider-field">
							<label for="pdf-provider">{t('제공자', 'Provider')}</label>
							<select id="pdf-provider" name="backend" bind:value={() => backend, (value) => (chosenBackend = value)} required>
								{#each data.backends as id (id)}
									<option value={id}>{BACKENDS[id]}</option>
								{/each}
							</select>
						</div>
						<p id="pdf-privacy" class="help">
							{t(
								`선택한 제공자에게 PDF의 처음 ${PDF_SOURCE_MAX_PAGES}쪽에서 쪽당 최대 ${PDF_PAGE_TEXT_LIMIT.toLocaleString('ko-KR')}자를 추출해 보냅니다. 생성된 문제집은 로그인한 모든 회원에게 공개됩니다. 원본 PDF는 저장하지 않으며, 풀이 기록은 비공개입니다.`,
								`The selected provider receives up to ${PDF_PAGE_TEXT_LIMIT.toLocaleString('en-US')} characters per page from the first ${PDF_SOURCE_MAX_PAGES} pages. All signed-in members can use the generated set. The original PDF is discarded, and your progress is private.`
							)}
						</p>
						<button class="btn" type="submit" aria-describedby="pdf-privacy">
							{busy ? t('문제 생성 중…', 'Generating questions…') : t('문제집 생성 및 공개', 'Generate and share')}
						</button>
					</fieldset>
				</form>
			{:else}
				<div class="connect">
					<p>{t('PDF로 문제를 만들려면 코치 제공자를 연결하세요.', 'Connect a coach provider to generate questions from a PDF.')}</p>
					<a class="btn ghost" href="/settings/coach">{t('코치 설정 열기', 'Open Coach settings')} <span aria-hidden="true">↗</span></a>
				</div>
			{/if}

			{#if busy}
				<p class="progress" role="status"><span class="pulse" aria-hidden="true"></span>{t('PDF에서 문제를 만드는 중입니다. 잠시 기다려 주세요.', 'Creating questions from your PDF. This can take a moment.')}</p>
			{:else if error}
				<p class="err" role="alert">{t(error.ko, error.en)}</p>
			{/if}
		</section>
	</div>
</main>

<style>
	.library { width: min(100%, 66rem); margin-inline: auto; padding: clamp(20px, 4vw, 44px); }
	.intro { padding-bottom: clamp(14px, 2vw, 22px); border-bottom: 1px solid var(--line); }
	h1 { margin: 0; font: 600 clamp(32px, 6vw, 55px)/1.05 var(--f-display); letter-spacing: -.045em; }
	h2 { margin: 0; font: 600 clamp(20px, 4vw, 25px)/1.2 var(--f-display); letter-spacing: -.025em; }
	p { margin: 0; }
	.upload > p:not(.err) { margin-top: 7px; color: var(--muted); }
	.library-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: clamp(18px, 3vw, 32px); align-items: start; }
	.upload { min-width: 0; padding: clamp(16px, 3vw, 24px); border: 1px solid var(--line); border-radius: var(--r); background: var(--surface); }
	fieldset { display: grid; gap: 16px; margin: 20px 0 0; padding: 0; border: 0; min-inline-size: 0; }
	label { display: block; margin-bottom: 5px; font-weight: 600; }
	.file-field { padding: 12px; border: 1px dashed var(--line); border-radius: 8px; background: color-mix(in srgb, var(--accent) 4%, var(--surface)); }
	input[type='file'], select { display: block; width: 100%; font: inherit; color: var(--ink); }
	input[type='file']::file-selector-button, select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; }
	input[type='file']::file-selector-button { margin-inline-end: 8px; cursor: pointer; }
	input:focus-visible, select:focus-visible, .set:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
	.help { color: var(--muted); font-size: 13px; }
	.file-field .help { margin-top: 5px; }
	.connect { margin-top: 20px; display: grid; gap: 10px; justify-items: start; }
	.progress { display: flex; align-items: center; gap: 7px; font-size: 13px; }
	.upload .err, .upload .progress { margin-top: 12px; }
	.sets { min-width: 0; padding-block: 11px; }
	.sets .empty { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 14px; }
	ul { margin: 12px 0 0; padding: 0; list-style: none; }
	li { border-top: 1px solid var(--line); }
	li:last-child { border-bottom: 1px solid var(--line); }
	.set { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 13px 2px; color: var(--ink); text-decoration: none; }
	.set:hover strong { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
	.set > div { display: grid; min-width: 0; gap: 2px; overflow-wrap: anywhere; }
	.source, .count { color: var(--muted); font-size: 13px; }
	.count { flex: none; }
	.count span { margin-inline-start: 3px; color: var(--accent); }
	@media (max-width: 650px) {
		.library-grid { grid-template-columns: minmax(0, 1fr); }
	}
</style>
