// node study/stats.mjs  →  study/STATS.md   (reads study/log.jsonl and study/notes/YYYY-MM-DD.md)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const logPath = process.argv[2] ?? join(dir, 'log.jsonl');
const outPath = process.argv[3] ?? join(dir, 'STATS.md');
const now = process.argv[4] ? new Date(process.argv[4]) : new Date();

const events = readFileSync(logPath, 'utf8').split('\n').filter((l) => l.trim()).map((l, i) => {
	try { return JSON.parse(l); } catch { throw new Error(`log.jsonl ${i + 1}번째 줄을 읽을 수 없습니다`); }
});
const mins = (s) => { const m = /^(\d+(?:\.\d+)?)\s*(m|s)?$/.exec(String(s ?? '').trim()); return m ? (m[2] === 's' ? +m[1] / 60 : +m[1]) : null; };
const ymd = (d) => new Intl.DateTimeFormat('sv-SE').format(d); // local YYYY-MM-DD
const addDays = (dateStr, days) => new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const today = ymd(now);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '–');
const key = (e) => `${e.field}/${e.id}`;

// one record per problem
const problems = new Map();
const recalls = new Map();
for (const e of events) {
	if (e.event === 'recalled' && e.note) {
		recalls.set(e.note, [...(recalls.get(e.note) ?? []), e]);
		continue;
	}
	if (!e.id) continue;
	if (e.event === 'asked') { const q = problems.get(key(e)); if (q) q.asked++; continue; }
	const p = problems.get(key(e)) ?? { field: e.field, id: e.id, parent: e.parent ?? null, depth: e.depth ?? 0, answers: [], reviews: [], offered: 0, accepted: 0, declined: 0, example: false, revisit: null, asked: 0 };
	if (e.event === 'posed') { p.parent = e.parent ?? null; p.depth = e.depth ?? 0; p.posedAt = e.at; }
	if (e.event === 'answered') p.answers.push(e);
	if (e.event === 'reviewed') p.reviews.push(e);
	if (e.event === 'offered') p.offered++;
	if (e.event === 'accepted') p.accepted++;
	if (e.event === 'declined') p.declined++;
	if (e.event === 'example') p.example = true;
	if (e.event === 'revisit') p.revisit = e.due;
	problems.set(key(e), p);
}
const all = [...problems.values()];
const first = (p) => p.reviews[0]?.verdict ?? null;
const last = (p) => p.reviews.at(-1)?.verdict ?? null;
const passedAfter = (p, due) => p.reviews.some((r) => r.verdict === 'pass' && ymd(new Date(r.at)) >= due);
const avg = (xs) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–');
const median = (xs) => { if (!xs.length) return '–'; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1); };
const reviewed = all.filter((p) => p.reviews.length);

const lines = [];
const table = (head, rows) => { if (!rows.length) return; lines.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''); };
lines.push('# 학습 통계', '', `기준: ${today} · 기록 ${events.length}줄`, '');

lines.push('## 전체', '');
table(['문제', '분석됨', '첫 답 통과', '끝내 통과', '평균 시도', '내려감', '예제', '질문'], [[
	all.length, reviewed.length, pct(reviewed.filter((p) => first(p) === 'pass').length, reviewed.length),
	pct(reviewed.filter((p) => last(p) === 'pass').length, reviewed.length), avg(all.filter((p) => p.answers.length).map((p) => p.answers.length)),
	all.filter((p) => p.accepted).length, all.filter((p) => p.example).length, events.filter((e) => e.event === 'asked').length
]]);

lines.push('## 분야별', '');
const fields = [...new Set(all.map((p) => p.field))];
table(['분야', '문제', '첫 답 통과', '평균 시간(분)', '경과 중앙값(분)', '빈 곳', '실수'], fields.map((f) => {
	const ps = all.filter((p) => p.field === f), rs = ps.filter((p) => p.reviews.length);
	const ts = ps.flatMap((p) => p.answers.map((a) => mins(a.time))).filter((x) => x !== null);
	const causes = ps.flatMap((p) => p.reviews.map((r) => r.cause));
	return [f, ps.length, pct(rs.filter((p) => first(p) === 'pass').length, rs.length), avg(ts), median(ps.flatMap((p) => p.answers.map((a) => a.elapsed)).filter((x) => typeof x === 'number')), causes.filter((c) => c === 'gap').length, causes.filter((c) => c === 'slip').length];
}));

lines.push('## 문제별', '');
table(['문제', '깊이', '시도', '첫 판정', '마지막 판정', '질문'], all.map((p) => [key(p), p.depth, p.answers.length, first(p) ?? '–', last(p) ?? '–', p.asked]));

lines.push('## 깊이별', '');
table(['깊이', '문제', '첫 답 통과'], [...new Set(all.map((p) => p.depth))].sort((a, b) => a - b).map((d) => {
	const rs = reviewed.filter((p) => p.depth === d);
	return [d, all.filter((p) => p.depth === d).length, pct(rs.filter((p) => first(p) === 'pass').length, rs.length)];
}));

lines.push('## 빈 곳', '');
const gaps = new Map();
for (const e of events) if (e.event === 'reviewed' && e.cause === 'gap' && e.gap) gaps.set(e.gap, [...(gaps.get(e.gap) ?? []), key(e)]);
if (gaps.size) table(['빈 곳', '횟수', '문제'], [...gaps].sort((a, b) => b[1].length - a[1].length).map(([g, ks]) => [g, ks.length, [...new Set(ks)].join(', ')]));
else lines.push('없음', '');

lines.push('## 노트 복습', '');
const notesDir = join(dirname(logPath), 'notes');
const noteDates = new Set(recalls.keys());
if (existsSync(notesDir)) {
	for (const f of readdirSync(notesDir)) {
		const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(f);
		if (m) noteDates.add(m[1]);
	}
}
const noteRows = [...noteDates].sort().map((note) => {
	const rs = recalls.get(note) ?? [];
	const lastRec = rs.at(-1);
	const next = lastRec ? (lastRec.next ?? null) : addDays(note, 1);
	const lastMissed = lastRec ? `${lastRec.missed ?? 0}/${lastRec.asked ?? 0}` : '–';
	const status = !next ? '완료' : next <= today ? '꺼낼 차례' : '대기';
	return [note, rs.length, lastMissed, next ?? '–', status];
});
if (noteRows.length) table(['노트', '꺼낸 횟수', '직전 오답', '다음 차례', '상태'], noteRows);
else lines.push('없음', '');

lines.push('## 내려갔다 올라온 문제', '');
const parents = all.filter((p) => all.some((c) => c.parent === p.id && c.field === p.field));
table(['문제', '하위 문제', '하위 통과', '다시 답한 결과', '다시 풀 날', '해결'], parents.map((p) => {
	const subs = all.filter((c) => c.parent === p.id && c.field === p.field);
	const again = p.reviews.length > 1 ? last(p) : '–';
	const due = p.depth === 0 ? p.revisit : null; // only root problems are revisited
	const solved = due ? (passedAfter(p, due) ? '해결' : due <= today ? '풀 차례' : '대기') : '–';
	return [key(p), subs.length, `${subs.filter((c) => last(c) === 'pass').length}/${subs.length}`, again, due ?? '–', solved];
}));
if (!parents.length) lines.push('없음', '');

lines.push('## 제안', '');
const offered = all.reduce((a, p) => a + p.offered, 0), accepted = all.reduce((a, p) => a + p.accepted, 0);
lines.push(offered ? `하위 문제 제안 ${offered} · 수락 ${accepted} (${pct(accepted, offered)})` : '없음', '');

lines.push('## 도움', '');
const helps = new Map();
for (const e of events) if (e.event === 'answered') helps.set(e.help ?? '모름', (helps.get(e.help ?? '모름') ?? 0) + 1);
if (helps.size) table(['도움', '답'], [...helps].map(([h, n]) => [h, n]));
else lines.push('없음', '');

writeFileSync(outPath, lines.join('\n'));
console.log(`${outPath} (${all.length}문제, ${events.length}줄)`);
