import type { Page } from '@playwright/test';

/**
 * Every spec drives the real bundle in a real page: setContent + inject,
 * no dev server, no network. `boot` evaluates in the PAGE, so specs
 * express intent as plain browser code — the same code a consumer writes.
 */
export async function bootPage(
    page: Page,
    html: string,
    bundles: string[] = ['laranail.js'],
): Promise<void> {
    const document = `<!DOCTYPE html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1>${html}</main></body></html>`;

    // A REAL origin, not setContent's about:blank: a relative fetch('/…')
    // has no base to resolve against on about:blank and throws — which
    // made every transport spec quietly exercise the unreachable path —
    // and document.cookie is a SecurityError there too.
    await page.route('https://fixture.test/', (route) =>
        route.fulfill({ contentType: 'text/html', body: document }),
    );
    await page.goto('https://fixture.test/');

    for (const bundle of bundles) {
        await page.addScriptTag({ path: `js/e2e/.bundle/${bundle}` });
    }
}

/** A minimal schema literal, typed loosely — the page evaluates it as data. */
export function schemaFor(
    fields: Record<
        string,
        { client: Array<{ rule: string; params?: Record<string, string> }>; server?: string[] }
    >,
    messages: Record<string, string> = {},
): unknown {
    return {
        version: 1,
        fields: Object.fromEntries(
            Object.entries(fields).map(([name, definition]) => [
                name,
                {
                    attribute: null,
                    client: definition.client.map((rule) => ({ params: {}, ...rule })),
                    server: definition.server ?? [],
                },
            ]),
        ),
        messages,
        messageVariants: {},
    };
}
