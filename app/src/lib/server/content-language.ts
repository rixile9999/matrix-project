// This dictionary includes solutions and hints. Resolve only the fields a session may see.
import translations from './translations/scala.en.json' with { type: 'json' };
import { english } from './locale.ts';
import type { JudgeResult } from '../core/lang.ts';

const entries: Record<string, string> = translations;
export function contentText(source: string): string {
	if (!english()) return source;
	if (!/[가-힣]/.test(source)) return source;
	return source.split('\n').map(line => {
		const text = line.trim();
		return Object.hasOwn(entries, text) ? line.replace(text, () => entries[text]) : line;
	}).join('\n');
}

const prose = new Set(['title', 'statement', 'notes', 'targets', 'intent', 'hints', 'summary', 'points', 'when', 'steps', 'prompt', 'why', 'short', 'rule', 'text', 'scala2']);

// Visit only authored display fields. Arrays of executable lines, test matchers and
// trace option values must remain byte-for-byte identical to the grading fixtures.
export function readPack<T>(json: string): T {
	const data = JSON.parse(json);
	if (english()) {
		function visit(node: unknown, field: string, trace = false): unknown {
			if (typeof node === 'string') return prose.has(field) && !(trace && field === 'text') ? contentText(node) : node;
			if (Array.isArray(node)) return node.map(item => visit(item, field, trace));
			if (node && typeof node === 'object') {
				const record = node as Record<string, unknown>;
				for (const key of Object.keys(record)) {
					record[key] = visit(record[key], field === 'chapters' ? 'title' : key, trace || record.kind === 'trace');
				}
			}
			return node;
		}
		return visit(data, '') as T;
	}
	return data;
}

export function displayJudge(result: JudgeResult): JudgeResult {
	if (!english()) return result;
	const refactor = /^테스트는 통과했지만 (.+) 사용이 남아 있습니다\. 이 문제는 그것 없이 다시 쓰는 것이 목표입니다\.$/.exec(result.output);
	return {
		...result,
		output: refactor ? `Tests passed. Rewrite the solution without ${refactor[1]}.` : result.output,
		cases: result.cases.map(c => ({ ...c, name: c.name.split(' › ').map(contentText).join(' › ') }))
	};
}
