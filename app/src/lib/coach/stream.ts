import type { CoachEvent } from '../types.ts';

/** Reads an NDJSON response incrementally: yields one event per complete line; a partial last line waits for its newline. */
export async function* readEvents(res: Response): AsyncGenerator<CoachEvent> {
	const reader = res.body?.getReader();
	if (!reader) return;
	const dec = new TextDecoder();
	let buf = '';
	const parse = (line: string): CoachEvent | null => {
		try {
			return JSON.parse(line) as CoachEvent;
		} catch {
			return null;
		}
	};
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += dec.decode(value, { stream: true });
		for (let nl = buf.indexOf('\n'); nl >= 0; nl = buf.indexOf('\n')) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			const ev = line ? parse(line) : null;
			if (ev) yield ev;
		}
	}
	buf += dec.decode();
	const last = buf.trim() ? parse(buf.trim()) : null;
	if (last) yield last;
}
