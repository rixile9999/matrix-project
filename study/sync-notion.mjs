// node study/sync-notion.mjs [study/notes/YYYY-MM-DD.md ...]
// Syncs dated study notes (Markdown) to Notion as nicely formatted child pages (upsert by title).
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const studyDir = dirname(fileURLToPath(import.meta.url));
const envPath = join(studyDir, '.env.local');
const NOTION_VERSION = '2022-06-28';

function loadEnv(path) {
	const raw = readFileSync(path, 'utf8');
	const out = {};
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq > 0) out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
	}
	return out;
}

const env = { ...loadEnv(envPath), ...process.env };
if (!env.NOTION_TOKEN) throw new Error('NOTION_TOKEN이 study/.env.local에 없습니다.');
if (!env.NOTION_PARENT_PAGE_ID) throw new Error('NOTION_PARENT_PAGE_ID가 study/.env.local에 없습니다.');

const headers = {
	Authorization: `Bearer ${env.NOTION_TOKEN}`,
	'Notion-Version': NOTION_VERSION,
	'Content-Type': 'application/json',
};

async function notion(method, path, body) {
	const res = await fetch(`https://api.notion.com/v1${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await res.json();
	if (!res.ok) {
		throw new Error(`Notion API ${method} ${path} (${res.status}): ${data.message ?? JSON.stringify(data)}`);
	}
	return data;
}

const VALID_CODE_LANGS = new Set([
	'abap', 'arduino', 'bash', 'basic', 'c', 'clojure', 'coffeescript', 'c++', 'c#', 'css',
	'dart', 'diff', 'docker', 'elixir', 'elm', 'erlang', 'flow', 'fortran', 'f#', 'gherkin',
	'glsl', 'go', 'graphql', 'groovy', 'haskell', 'html', 'java', 'javascript', 'json', 'julia',
	'kotlin', 'latex', 'less', 'lisp', 'livescript', 'lua', 'makefile', 'markdown', 'markup',
	'matlab', 'mermaid', 'nix', 'objective-c', 'ocaml', 'pascal', 'perl', 'php', 'plain text',
	'powershell', 'prolog', 'protobuf', 'python', 'r', 'reason', 'ruby', 'rust', 'sass', 'scala',
	'scheme', 'scss', 'shell', 'sql', 'swift', 'typescript', 'vb.net', 'verilog', 'vhdl',
	'visual basic', 'webassembly', 'xml', 'yaml', 'java/c/c++/c#',
]);

function mapLang(raw) {
	const l = (raw || '').trim().toLowerCase();
	if (l === 'ts') return 'typescript';
	if (l === 'js') return 'javascript';
	if (l === 'sh' || l === 'zsh') return 'bash';
	if (l === 'vim' || l === 'text' || l === 'txt' || !l) return 'plain text';
	return VALID_CODE_LANGS.has(l) ? l : 'plain text';
}

function chunkText(str, max = 1900) {
	const out = [];
	for (let i = 0; i < str.length; i += max) out.push(str.slice(i, i + max));
	return out.length ? out : [''];
}

function parseRichText(input) {
	const text = input.replace(/<br\s*\/?>/gi, '\n').replace(/\\\|/g, '|');
	const tokens = [];
	const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
	let last = 0;
	for (const m of text.matchAll(re)) {
		if (m.index > last) pushSegment(tokens, text.slice(last, m.index), {});
		const tok = m[0];
		if (tok.startsWith('**')) {
			pushSegment(tokens, tok.slice(2, -2), { bold: true });
		} else if (tok.startsWith('`')) {
			pushSegment(tokens, tok.slice(1, -1), { code: true });
		} else if (tok.startsWith('*')) {
			pushSegment(tokens, tok.slice(1, -1), { italic: true });
		} else if (tok.startsWith('[')) {
			const lm = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/.exec(tok);
			if (lm) pushSegment(tokens, lm[1], {}, lm[2]);
		}
		last = m.index + tok.length;
	}
	if (last < text.length) pushSegment(tokens, text.slice(last), {});
	return tokens.length ? tokens : [{ type: 'text', text: { content: '' } }];
}

function pushSegment(arr, content, annotations, linkUrl = null) {
	if (!content) return;
	for (const part of chunkText(content)) {
		const item = {
			type: 'text',
			text: linkUrl ? { content: part, link: { url: linkUrl } } : { content: part },
		};
		if (Object.keys(annotations).length) item.annotations = annotations;
		arr.push(item);
	}
}

function splitTableRow(line) {
	const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	const cells = [];
	let cur = '';
	for (let i = 0; i < trimmed.length; i++) {
		if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
			cur += '\\|';
			i++;
		} else if (trimmed[i] === '|') {
			cells.push(cur.trim());
			cur = '';
		} else {
			cur += trimmed[i];
		}
	}
	cells.push(cur.trim());
	return cells;
}

function markdownToNotion(md, fallbackTitle) {
	const lines = md.replace(/\r\n/g, '\n').split('\n');
	let title = fallbackTitle;
	let i = 0;

	if (lines[0]?.startsWith('# ')) {
		title = lines[0].slice(2).trim();
		i = 1;
	}

	const blocks = [];
	// Add clean table of contents right after summary callout
	let insertedToc = false;

	const parseListBlock = (startIdx, baseIndent) => {
		const items = [];
		let idx = startIdx;
		while (idx < lines.length) {
			const line = lines[idx];
			if (!line.trim()) {
				// Look ahead: if next non-empty line is a continuation/nested item at deeper indent, keep going
				const nextIdx = lines.findIndex((l, k) => k > idx && l.trim());
				if (nextIdx !== -1 && (lines[nextIdx].match(/^ */)[0].length > baseIndent)) {
					idx++;
					continue;
				}
				break;
			}
			const indent = line.match(/^ */)[0].length;
			if (indent < baseIndent) break;
			if (indent > baseIndent) {
				// Attach nested content to the last list item
				if (!items.length) break;
				const prev = items[items.length - 1];
				const prevPayload = prev[prev.type];
				prevPayload.children = prevPayload.children ?? [];

				const trimmed = line.trim();
				if (trimmed.startsWith('```')) {
					const lang = mapLang(trimmed.slice(3));
					const codeLines = [];
					idx++;
					while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
						codeLines.push(lines[idx].replace(new RegExp(`^ {0,${indent}}`), ''));
						idx++;
					}
					if (idx < lines.length) idx++;
					prevPayload.children.push({
						object: 'block',
						type: 'code',
						code: { language: lang, rich_text: chunkText(codeLines.join('\n')).map((c) => ({ type: 'text', text: { content: c } })) },
					});
					continue;
				}
				if (/^[-*] /.test(trimmed) || /^\d+\. /.test(trimmed)) {
					const nested = parseListBlock(idx, indent);
					prevPayload.children.push(...nested.items);
					idx = nested.nextIdx;
					continue;
				}
				prevPayload.children.push({
					object: 'block',
					type: 'paragraph',
					paragraph: { rich_text: parseRichText(trimmed) },
				});
				idx++;
				continue;
			}

			const trimmed = line.trim();
			const bm = /^[-*] (.+)$/.exec(trimmed);
			const nm = /^\d+\. (.+)$/.exec(trimmed);
			if (bm) {
				items.push({
					object: 'block',
					type: 'bulleted_list_item',
					bulleted_list_item: { rich_text: parseRichText(bm[1]) },
				});
				idx++;
			} else if (nm) {
				items.push({
					object: 'block',
					type: 'numbered_list_item',
					numbered_list_item: { rich_text: parseRichText(nm[1]) },
				});
				idx++;
			} else {
				break;
			}
		}
		return { items, nextIdx: idx };
	};

	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();

		if (!trimmed) {
			i++;
			continue;
		}

		// Special styling: turn "## 1. 오늘 진행 요약" into a highlighted Callout card + TOC
		if (/^##\s+1\.\s*오늘 진행 요약/.test(trimmed)) {
			i++;
			const summaryChildren = [];
			while (i < lines.length && !lines[i].trim().startsWith('## ') && lines[i].trim() !== '---') {
				const t = lines[i].trim();
				if (t.startsWith('- ') || t.startsWith('* ')) {
					summaryChildren.push({
						object: 'block',
						type: 'bulleted_list_item',
						bulleted_list_item: { rich_text: parseRichText(t.slice(2)) },
					});
				} else if (t) {
					summaryChildren.push({
						object: 'block',
						type: 'paragraph',
						paragraph: { rich_text: parseRichText(t) },
					});
				}
				i++;
			}
			blocks.push({
				object: 'block',
				type: 'callout',
				callout: {
					icon: { type: 'emoji', emoji: '🎯' },
					color: 'blue_background',
					rich_text: [{ type: 'text', text: { content: '오늘 진행 요약' }, annotations: { bold: true } }],
					children: summaryChildren,
				},
			});
			if (!insertedToc) {
				blocks.push({ object: 'block', type: 'table_of_contents', table_of_contents: { color: 'gray' } });
				insertedToc = true;
			}
			continue;
		}

		if (trimmed === '---' || trimmed === '***') {
			blocks.push({ object: 'block', type: 'divider', divider: {} });
			i++;
			continue;
		}

		if (trimmed.startsWith('## ')) {
			blocks.push({
				object: 'block',
				type: 'heading_2',
				heading_2: { rich_text: parseRichText(trimmed.slice(3)), color: 'default' },
			});
			i++;
			continue;
		}

		if (trimmed.startsWith('### ')) {
			blocks.push({
				object: 'block',
				type: 'heading_3',
				heading_3: { rich_text: parseRichText(trimmed.slice(4)), color: 'default' },
			});
			i++;
			continue;
		}

		if (trimmed.startsWith('```')) {
			const lang = mapLang(trimmed.slice(3));
			const codeLines = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith('```')) {
				codeLines.push(lines[i]);
				i++;
			}
			if (i < lines.length) i++;
			blocks.push({
				object: 'block',
				type: 'code',
				code: {
					language: lang,
					rich_text: chunkText(codeLines.join('\n')).map((c) => ({ type: 'text', text: { content: c } })),
				},
			});
			continue;
		}

		if (trimmed.startsWith('> ')) {
			const qLines = [];
			while (i < lines.length && lines[i].trim().startsWith('> ')) {
				qLines.push(lines[i].trim().slice(2));
				i++;
			}
			blocks.push({
				object: 'block',
				type: 'callout',
				callout: {
					icon: { type: 'emoji', emoji: '💡' },
					color: 'gray_background',
					rich_text: parseRichText(qLines.join('\n')),
				},
			});
			continue;
		}

		// Markdown table
		if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
			const headerCells = splitTableRow(trimmed);
			const width = headerCells.length;
			const rows = [headerCells];
			i += 2;
			while (i < lines.length && lines[i].trim().startsWith('|')) {
				const r = splitTableRow(lines[i]);
				while (r.length < width) r.push('');
				rows.push(r.slice(0, width));
				i++;
			}
			blocks.push({
				object: 'block',
				type: 'table',
				table: {
					table_width: width,
					has_column_header: true,
					has_row_header: false,
					children: rows.map((cells) => ({
						object: 'block',
						type: 'table_row',
						table_row: { cells: cells.map((c) => parseRichText(c)) },
					})),
				},
			});
			continue;
		}

		// Lists
		if (/^[-*] /.test(trimmed) || /^\d+\. /.test(trimmed)) {
			const indent = line.match(/^ */)[0].length;
			const parsed = parseListBlock(i, indent);
			blocks.push(...parsed.items);
			i = parsed.nextIdx;
			continue;
		}

		// Paragraph
		const paraLines = [trimmed];
		i++;
		while (
			i < lines.length &&
			lines[i].trim() &&
			!lines[i].trim().startsWith('#') &&
			!lines[i].trim().startsWith('```') &&
			!lines[i].trim().startsWith('|') &&
			!lines[i].trim().startsWith('> ') &&
			lines[i].trim() !== '---' &&
			!/^[-*] /.test(lines[i].trim()) &&
			!/^\d+\. /.test(lines[i].trim())
		) {
			paraLines.push(lines[i].trim());
			i++;
		}
		blocks.push({
			object: 'block',
			type: 'paragraph',
			paragraph: { rich_text: parseRichText(paraLines.join(' ')) },
		});
	}

	return { title, blocks };
}

async function listChildBlocks(blockId) {
	const results = [];
	let cursor;
	do {
		const qs = cursor ? `?page_size=100&start_cursor=${encodeURIComponent(cursor)}` : '?page_size=100';
		const data = await notion('GET', `/blocks/${blockId}/children${qs}`);
		results.push(...data.results);
		cursor = data.has_more ? data.next_cursor : null;
	} while (cursor);
	return results;
}

async function appendBlocks(pageId, blocks) {
	for (let i = 0; i < blocks.length; i += 100) {
		await notion('PATCH', `/blocks/${pageId}/children`, { children: blocks.slice(i, i + 100) });
	}
}

async function syncNote(filePath) {
	const absPath = resolve(filePath);
	const md = readFileSync(absPath, 'utf8');
	const fallbackTitle = basename(absPath, '.md');
	const { title, blocks } = markdownToNotion(md, fallbackTitle);

	const parentChildren = await listChildBlocks(env.NOTION_PARENT_PAGE_ID);
	const existing = parentChildren.find((b) => b.type === 'child_page' && b.child_page?.title === title);

	let pageId;
	let pageUrl;
	if (existing) {
		pageId = existing.id;
		const oldBlocks = await listChildBlocks(pageId);
		for (const b of oldBlocks) {
			await notion('DELETE', `/blocks/${b.id}`);
		}
		await appendBlocks(pageId, blocks);
		const page = await notion('GET', `/pages/${pageId}`);
		pageUrl = page.url;
		console.log(`Updated: ${title} (${blocks.length} blocks) -> ${pageUrl}`);
	} else {
		const firstBatch = blocks.slice(0, 100);
		const created = await notion('POST', '/pages', {
			parent: { page_id: env.NOTION_PARENT_PAGE_ID },
			icon: { type: 'emoji', emoji: '📘' },
			properties: {
				title: { title: [{ type: 'text', text: { content: title } }] },
			},
			children: firstBatch,
		});
		pageId = created.id;
		pageUrl = created.url;
		if (blocks.length > 100) await appendBlocks(pageId, blocks.slice(100));
		console.log(`Created: ${title} (${blocks.length} blocks) -> ${pageUrl}`);
	}
}

const args = process.argv.slice(2);
let files = args;
if (!files.length) {
	const notesDir = join(studyDir, 'notes');
	files = readdirSync(notesDir)
		.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
		.sort()
		.map((f) => join(notesDir, f));
}

if (!files.length) {
	console.log('동기화할 노트가 없습니다.');
	process.exit(0);
}

for (const f of files) {
	await syncNote(f);
}
