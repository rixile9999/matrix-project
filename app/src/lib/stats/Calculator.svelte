<script lang="ts">
	import { tick } from 'svelte';
	import { t } from '#lib/i18n.svelte.ts';
	import LanguageSwitch from '#lib/LanguageSwitch.svelte';
	import type { Copy } from './types.ts';

	let { fields = [], insertAnswer }: {
		fields?: { label: Copy }[];
		insertAnswer?: (index: number, value: string) => void;
	} = $props();
	let panel: HTMLDialogElement;
	let input: HTMLInputElement;
	let expression = $state('');
	let history = $state<{ expression: string; value: number }[]>([]);
	let target = $state(0);
	let error = $state<'invalid' | 'load' | null>(null);
	let busy = $state(false);
	const uid = $props.id();
	const shortcuts = ['sqrt(', 'mean(', 'std(', 'log(', 'exp(', '^', '(', ')', ',', '%'];
	const keypad = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '+'];

	function open() {
		panel.showModal();
		input.focus();
	}

	async function insert(token: string) {
		const start = input.selectionStart ?? expression.length;
		const end = input.selectionEnd ?? start;
		if (expression.length - (end - start) + token.length > 160) return;
		expression = expression.slice(0, start) + token + expression.slice(end);
		error = null;
		await tick();
		input.focus();
		input.setSelectionRange(start + token.length, start + token.length);
	}

	async function evaluate(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !expression.trim()) return;
		busy = true;
		error = null;
		const source = expression.trim();
		try {
			const { calculate } = await import('./calculator.ts');
			const value = calculate(source);
			if (Number.isFinite(value)) history = [{ expression: source, value }, ...history].slice(0, 20);
			else error = 'invalid';
		} catch {
			error = 'load';
		} finally {
			busy = false;
		}
	}
</script>

<button type="button" class="launcher btn ghost small" onclick={open} aria-haspopup="dialog">{t('계산기', 'Calculator')}</button>
<dialog bind:this={panel} aria-labelledby={uid}>
	<div class="barline">
		<h2 id={uid}>{t('계산기', 'Calculator')}</h2>
		<LanguageSwitch />
		<form method="dialog"><button class="btn ghost small">{t('닫기', 'Close')}</button></form>
	</div>
	<form class="calculator-form" onsubmit={evaluate}>
		<label for={uid + '-expr'}>{t('수식', 'Expression')}</label>
		<input id={uid + '-expr'} bind:this={input} bind:value={expression} oninput={() => error = null}
			maxlength="160" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="1 - (1/2)^3" />
		<div class="shortcuts">
			{#each shortcuts as token (token)}
				<button type="button" onclick={() => insert(token)}>{token.endsWith('(') ? token.slice(0, -1) : token}</button>
			{/each}
			<button type="button" disabled={!history.length} onclick={() => insert('(' + history[0].value + ')')} title={t('직전 결과 삽입', 'Insert previous result')}>Ans</button>
			<button type="button" onclick={() => { expression = ''; error = null; input.focus(); }}>{t('지우기', 'Clear')}</button>
		</div>
		<div class="keys">
			{#each keypad as token (token)}<button type="button" onclick={() => insert(token)}>{token}</button>{/each}
			<button class="equals" disabled={busy || !expression.trim()} aria-label={t('계산', 'Calculate')}>=</button>
		</div>
		{#if error}<p role="alert">{error === 'load' ? t('계산기를 불러오지 못했습니다. 다시 시도하세요.', 'Calculator could not load. Try again.') : t('수식, 괄호, 함수의 입력값을 확인하세요.', 'Check the expression, parentheses, and function arguments.')}</p>{/if}
	</form>
	<details class="help"><summary>{t('함수 사용법', 'Function guide')}</summary>
		<p>{t('mean은 평균, std는 표본표준편차입니다. 값을 쉼표로 구분하세요.', 'Use mean for the average and std for the sample standard deviation. Separate values with commas.')}</p>
		<code>mean(2, 4, 6) = 4</code>
		<p>{t('log(x)는 자연로그, exp(x)는 지수함수입니다. sqrt, abs, min, max도 쓸 수 있습니다.', 'log(x) is the natural logarithm and exp(x) is the exponential. sqrt, abs, min, and max are also available.')}</p>
	</details>
	{#if history.length}
		<div class="history-bar"><h3>{t('계산 기록', 'History')}</h3>
			{#if fields.length > 1}<label>{t('답안 칸', 'Answer field')}
				<select bind:value={target}>{#each fields as field, i (i)}<option value={i}>{t(...field.label)}</option>{/each}</select>
			</label>{/if}
		</div>
	{/if}
	<ol aria-live="polite">
		{#each history as entry}
			<li><div><code>{entry.expression}</code><strong>= {entry.value}</strong></div>
				{#if insertAnswer && fields[target]}<button class="btn ghost small" type="button" onclick={() => {
					insertAnswer?.(target, String(entry.value)); panel.close();
				}}>{t('답안에 넣기', 'Use as answer')}</button>{/if}
			</li>
		{/each}
	</ol>
</dialog>

<style>
	@media (min-width: 1080px) {
		.launcher { position: fixed; inset: 40% 0 auto auto; z-index: 2; writing-mode: vertical-rl; padding: 14px 8px; border-radius: 8px 0 0 8px; background: var(--surface); }
	}
	dialog { position: fixed; inset: 0 0 0 auto; width: min(25rem, 100%); max-width: 100%; height: 100dvh; max-height: 100dvh; margin: 0; box-sizing: border-box; padding: 20px; border: 0; border-inline-start: 1px solid var(--line); color: var(--ink); background: var(--bg); overflow: auto; overscroll-behavior: contain; text-align: start; font: 15px/1.5 var(--f-body); }
	dialog::backdrop { background: rgb(0 0 0 / .32); }
	.barline, .history-bar, li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	h2 { margin: 0 auto 0 0; font: 700 24px var(--f-display); }
	h3 { margin: 0; font: 600 16px var(--f-display); }
	.calculator-form { margin: 22px 0 12px; display: grid; gap: 8px; }
	.calculator-form label, .help, .history-bar label { color: var(--muted); font-size: 13px; }
	input, select { border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 8px; border-radius: 6px; }
	input { width: 100%; box-sizing: border-box; font: 18px var(--f-mono); }
	.keys, .shortcuts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
	.shortcuts { grid-template-columns: repeat(6, 1fr); }
	.keys button, .shortcuts button { border: 1px solid var(--line); color: var(--ink); background: var(--surface); border-radius: 6px; padding: 7px 2px; font: 14px var(--f-mono); cursor: pointer; }
	.keys button { padding-block: 9px; font-size: 16px; }
	.keys .equals { background: var(--accent); color: var(--on-accent); }
	button:disabled { opacity: .5; }
	.help p { margin: 8px 0; }
	.history-bar { margin-top: 22px; flex-wrap: wrap; }
	select { max-width: 100%; }
	ol { margin: 8px 0 0; padding: 0; list-style: none; }
	li { padding: 10px 0; border-top: 1px solid var(--line); }
	li div { min-width: 0; overflow-wrap: anywhere; }
	li strong { display: block; font-family: var(--f-mono); }
	li button { flex: none; }
	@media (max-width: 640px) {
		dialog { inset: auto 0 0; width: 100%; height: auto; max-height: 84dvh; border: 1px solid var(--line); border-radius: 16px 16px 0 0; padding-bottom: max(18px, env(safe-area-inset-bottom)); }
	}
</style>
