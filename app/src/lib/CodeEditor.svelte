<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { EditorView } from '@codemirror/view';
	import type { Compartment } from '@codemirror/state';

	let {
		doc,
		readonly = false,
		onchange,
		onrun,
		label
	}: { doc: string; readonly?: boolean; onchange?: (code: string) => void; onrun?: () => void; label: string } = $props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;
	let lock: Compartment | undefined;
	const initial = untrack(() => doc);
	const initialReadonly = untrack(() => readonly);

	onMount(() => {
		let gone = false;
		(async () => {
			const [{ EditorView, keymap, lineNumbers, highlightActiveLine }, { EditorState, Compartment }, { StreamLanguage, HighlightStyle, syntaxHighlighting, indentUnit, bracketMatching }, { scala }, { defaultKeymap, history, historyKeymap, indentWithTab }, { tags: t }] =
				await Promise.all([
					import('@codemirror/view'),
					import('@codemirror/state'),
					import('@codemirror/language'),
					import('@codemirror/legacy-modes/mode/clike'),
					import('@codemirror/commands'),
					import('@lezer/highlight')
				]);
			if (gone) return;
			lock = new Compartment();
			const theme = EditorView.theme({
				'&': { color: 'var(--ink)', backgroundColor: 'var(--surface)', fontSize: '13.5px', height: '100%' },
				'.cm-scroller': { fontFamily: 'var(--f-mono)', lineHeight: '1.55', overflow: 'auto' },
				'.cm-content': { caretColor: 'var(--ink)', padding: '8px 0' },
				'.cm-cursor': { borderLeftColor: 'var(--ink)' },
				'.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', border: 'none' },
				'.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--ink) 5%, transparent)' },
				'.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
				'&.cm-focused': { outline: '2px solid var(--accent)', outlineOffset: '-2px' },
				'&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': {
					backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)'
				},
				'.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)', outline: 'none' }
			});
			const hl = HighlightStyle.define([
				{ tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword], color: 'var(--rk-violet)' },
				{ tag: [t.string, t.special(t.string)], color: 'var(--rk-green)' },
				{ tag: [t.number, t.bool, t.atom], color: 'var(--rk-orange)' },
				{ tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--muted)', fontStyle: 'italic' },
				{ tag: [t.typeName, t.className], color: 'var(--rk-cyan)' },
				{ tag: [t.definition(t.variableName), t.function(t.variableName)], color: 'var(--rk-blue)' },
				{ tag: t.meta, color: 'var(--rk-orange)' }
			]);
			view = new EditorView({
				parent: host,
				state: EditorState.create({
					doc: initial,
					extensions: [
						lineNumbers(),
						highlightActiveLine(),
						history(),
						bracketMatching(),
						indentUnit.of('  '),
						EditorState.tabSize.of(2),
						StreamLanguage.define(scala),
						syntaxHighlighting(hl),
						theme,
						keymap.of([{ key: 'Mod-Enter', run: () => (onrun?.(), true) }, indentWithTab, ...defaultKeymap, ...historyKeymap]),
						EditorView.updateListener.of((u) => {
							if (u.docChanged) onchange?.(u.state.doc.toString());
						}),
						lock.of([EditorState.readOnly.of(initialReadonly), EditorView.editable.of(!initialReadonly), EditorView.contentAttributes.of({ 'aria-label': label })])
					]
				})
			});
			apply();
		})();
		return () => {
			gone = true;
			view?.destroy();
			view = undefined;
		};
	});

	async function apply() {
		if (!view || !lock) return;
		const { EditorState } = await import('@codemirror/state');
		const { EditorView } = await import('@codemirror/view');
		view.dispatch({ effects: lock.reconfigure([EditorState.readOnly.of(readonly), EditorView.editable.of(!readonly), EditorView.contentAttributes.of({ 'aria-label': label })]) });
	}
	$effect(() => {
		readonly;
		label;
		apply();
	});
</script>

<div class="cm-host" bind:this={host}></div>
