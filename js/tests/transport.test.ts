import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RemoteChannel } from '../src/transport/RemoteChannel.ts';

/**
 * The channel against an injected fetch — every §10.12 degradation path,
 * plus the Precognition contract itself: full payload, Validate-Only
 * header, XSRF from the cookie, latest-wins abort.
 */

function respond(status: number, body?: unknown): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

test('sends the full payload with the Validate-Only header and XSRF token', async () => {
    let seen: { url: string; init: RequestInit } | undefined;

    const channel = new RemoteChannel('/validate/profile', {
        fetch: (async (url: string, init: RequestInit) => {
            seen = { url, init };
            return respond(204);
        }) as never,
        cookies: () => 'other=1; XSRF-TOKEN=tok%3Den; theme=dark',
    });

    const outcome = await channel.resolve({ email: 'a@b.co', name: 'x' }, ['email']);

    assert.deepEqual(outcome, { kind: 'clean' });
    assert.equal(seen?.url, '/validate/profile');
    const headers = seen?.init.headers as Record<string, string>;
    assert.equal(headers.Precognition, 'true');
    assert.equal(headers['Precognition-Validate-Only'], 'email');
    assert.equal(headers['X-XSRF-TOKEN'], 'tok=en');
    assert.equal(seen?.init.body, JSON.stringify({ email: 'a@b.co', name: 'x' }));
    assert.equal(seen?.init.credentials, 'same-origin');
});

test('422 becomes failures, everything else degrades to unreachable', async () => {
    const outcomes: unknown[] = [];

    for (const [status, body] of [
        [422, { errors: { email: ['Taken.'] } }],
        [500, undefined],
        [403, undefined],
        [429, undefined],
    ] as const) {
        const channel = new RemoteChannel('/v', {
            fetch: (async () => respond(status, body)) as never,
            cookies: () => '',
        });
        outcomes.push(await channel.resolve({}, ['email']));
    }

    assert.deepEqual(outcomes[0], { kind: 'failures', errors: { email: ['Taken.'] } });
    assert.deepEqual(outcomes[1], { kind: 'unreachable' });
    assert.deepEqual(outcomes[2], { kind: 'unreachable' });
    assert.deepEqual(outcomes[3], { kind: 'unreachable' });
});

test('a network error is unreachable, never a verdict', async () => {
    const channel = new RemoteChannel('/v', {
        fetch: (async () => {
            throw new TypeError('offline');
        }) as never,
        cookies: () => '',
    });

    assert.deepEqual(await channel.resolve({}, []), { kind: 'unreachable' });
});

test('a newer resolve aborts the older, which reports stale', async () => {
    let release: (() => void) | undefined;

    const channel = new RemoteChannel('/v', {
        fetch: (async (_url: string, init: RequestInit) => {
            await new Promise<void>((resolve, reject) => {
                release = resolve;
                (init.signal as AbortSignal).addEventListener('abort', () =>
                    reject(new DOMException('aborted', 'AbortError')),
                );
            });
            return respond(204);
        }) as never,
        cookies: () => '',
    });

    const slow = channel.resolve({ v: 'first' }, ['email']);
    const fast = channel.resolve({ v: 'second' }, ['email']);

    release?.();

    const [slowOutcome, fastOutcome] = await Promise.all([slow, fast]);

    assert.deepEqual(slowOutcome, { kind: 'stale' });
    assert.deepEqual(fastOutcome, { kind: 'clean' });
});
