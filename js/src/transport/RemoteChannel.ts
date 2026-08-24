/**
 * The Precognition-compatible remote channel (§5.7.2): the browser sends
 * the FULL current payload with `Precognition-Validate-Only` naming the
 * fields the engine could not decide — so "resolve only what the client
 * couldn't" is expressed in Precognition's own vocabulary, cross-field
 * server rules see the whole submission, and there is no bespoke
 * per-field protocol to maintain.
 *
 * Never the form's action URL (§10.4): the endpoint is explicit. Failure
 * is DEGRADABLE by design: offline, 500, aborted — every non-answer keeps
 * the fields undetermined (transient) and never manufactures a verdict in
 * either direction.
 */
export type RemoteOutcome =
    | { kind: 'clean' }
    | { kind: 'failures'; errors: Record<string, string[]> }
    | { kind: 'unreachable' }
    | { kind: 'stale' };

export interface RemoteChannelOptions {
    /** Injectable for tests and non-browser runtimes. */
    fetch?: typeof fetch;
    headers?: Record<string, string>;
    /** Reads the XSRF cookie; injectable for tests. */
    cookies?: () => string;
}

export class RemoteChannel {
    private readonly url: string;
    private readonly fetchImpl: typeof fetch;
    private readonly headers: Record<string, string>;
    private readonly cookies: () => string;
    private inFlight: AbortController | null = null;

    constructor(url: string, options: RemoteChannelOptions = {}) {
        this.url = url;
        // Bound, not bare: native fetch called as `this.fetchImpl(...)`
        // throws Illegal invocation in browsers (it insists on
        // `this === window`), which the degradation catch would silently
        // read as "unreachable" — Node never surfaces it, the browser
        // harness did.
        this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
        this.headers = options.headers ?? {};
        // Reading document.cookie THROWS SecurityError on restricted
        // documents (sandboxed frames, data: pages) — a channel that
        // crashes mid-resolve strands its fields at 'validating', which the
        // e2e harness caught on exactly such a page. No cookie is just
        // "no XSRF header": the server's CSRF gate answers, as it should.
        this.cookies =
            options.cookies ??
            (() => {
                try {
                    return typeof document === 'undefined' ? '' : document.cookie;
                } catch {
                    return '';
                }
            });
    }

    /**
     * Latest-wins: a new resolution ABORTS the in-flight one, whose caller
     * receives `stale` — the aborted request must produce no verdict at
     * all, not an "unreachable" that reads as a network problem.
     */
    async resolve(values: Record<string, unknown>, fields: string[]): Promise<RemoteOutcome> {
        this.inFlight?.abort();
        const controller = new AbortController();
        this.inFlight = controller;

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Precognition: 'true',
            ...this.headers,
        };

        if (fields.length > 0) {
            headers['Precognition-Validate-Only'] = fields.join(',');
        }

        const xsrf = this.xsrfToken();
        if (xsrf !== null) headers['X-XSRF-TOKEN'] = xsrf;

        let response: Response;

        try {
            response = await this.fetchImpl(this.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(values),
                signal: controller.signal,
                credentials: 'same-origin',
            });
        } catch {
            return controller.signal.aborted ? { kind: 'stale' } : { kind: 'unreachable' };
        } finally {
            if (this.inFlight === controller) this.inFlight = null;
        }

        if (controller.signal.aborted) return { kind: 'stale' };
        if (response.status === 204) return { kind: 'clean' };

        if (response.status === 422) {
            try {
                const body = (await response.json()) as { errors?: Record<string, string[]> };
                return { kind: 'failures', errors: body.errors ?? {} };
            } catch {
                return { kind: 'unreachable' };
            }
        }

        // 403, 429, 500 — every non-answer degrades identically.
        return { kind: 'unreachable' };
    }

    abort(): void {
        this.inFlight?.abort();
        this.inFlight = null;
    }

    /** Same-origin CSRF: Laravel's XSRF-TOKEN cookie, URL-decoded. */
    private xsrfToken(): string | null {
        const match = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(this.cookies());

        return match?.[1] === undefined ? null : decodeURIComponent(match[1]);
    }
}
