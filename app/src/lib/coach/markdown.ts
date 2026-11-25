import { renderInline } from '../inline.ts';

// Minimal Markdown for answers: paragraphs, "- " / "1. " lists, **bold**, `code`. Everything is HTML-escaped first
// (renderInline), so the result is safe for {@html}.
function inline(text: string): string {
	return renderInline(text)
		.split(/(<code>.*?<\/code>)/)
		.map((part, i) => (i % 2 ? part : part.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')))
		.join('');
}

export function renderMarkdown(text: string): string {
	const out: string[] = [];
	let para: string[] = [];
	let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
	const flushPara = () => {
		if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
		para = [];
	};
	const flushList = () => {
		if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`);
		list = null;
	};
	for (const line of text.split('\n')) {
		const li = line.match(/^\s*(?:([-*])|\d+[.)])\s+(.*)$/);
		if (li) {
			flushPara();
			const tag = li[1] ? 'ul' : 'ol';
			if (list && list.tag !== tag) flushList();
			(list ??= { tag, items: [] }).items.push(li[2]);
		} else if (!line.trim()) {
			flushPara();
			flushList();
		} else {
			flushList();
			para.push(line.replace(/^#{1,6}\s+/, '').trimEnd());
		}
	}
	flushPara();
	flushList();
	return out.join('');
}
