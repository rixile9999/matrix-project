import { describe, expect, it } from 'vitest';
import { sameOriginPrivate as ok } from './hooks.server.ts';

describe('sameOriginPrivate', () => {
	it('accepts same-origin requests on private hosts, http or https', () => {
		expect(ok('http://localhost:5173', 'localhost:5173')).toBe(true);
		expect(ok('http://192.168.0.7:5173', '192.168.0.7:5173')).toBe(true);
		expect(ok('http://100.110.192.13:5173', '100.110.192.13:5173')).toBe(true);
		expect(ok('http://mac-studio:5173', 'mac-studio:5173')).toBe(true);
		expect(ok('https://my-mac.example-tailnet.ts.net', 'my-mac.example-tailnet.ts.net')).toBe(true);
	});
	it('rejects other sites, missing headers and rebinding hosts', () => {
		expect(ok('https://evil.example', 'localhost:5173')).toBe(false);
		expect(ok('http://localhost:9999', 'localhost:5173')).toBe(false);
		expect(ok(null, 'localhost:5173')).toBe(false);
		expect(ok('null', 'localhost:5173')).toBe(false);
		expect(ok('http://evil.example:5173', 'evil.example:5173')).toBe(false);
		expect(ok('http://8.8.8.8:5173', '8.8.8.8:5173')).toBe(false);
	});
});
