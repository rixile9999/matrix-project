import type { Handle } from '@sveltejs/kit/hooks';

// This app runs submitted Scala code on this machine, so every state-changing request must
// come from a page served by this app, reached through a private address:
//  - same origin: the Origin header's host must equal the host the request was sent to
//    (works for http and https alike, and covers JSON endpoints, not only forms);
//  - private host: localhost, a Tailscale name/address or a LAN address. This also stops
//    DNS-rebinding pages, whose Origin and Host would match each other.
const PRIVATE_HOST =
	/^(localhost|127\.0\.0\.1|\[::1\]|[\w-]+|[\w-]+\.local|[\w.-]+\.ts\.net|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+)$/;

export function sameOriginPrivate(origin: string | null, host: string | null): boolean {
	if (!origin || !host) return false;
	try {
		const o = new URL(origin);
		return o.host === host && PRIVATE_HOST.test(o.hostname);
	} catch {
		return false;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const { method, headers } = event.request;
	if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
		const host = headers.get('x-forwarded-host') ?? headers.get('host');
		if (!sameOriginPrivate(headers.get('origin'), host)) {
			return new Response('다른 사이트에서 온 요청이라 거부했습니다.', { status: 403 });
		}
	}
	return resolve(event);
};
