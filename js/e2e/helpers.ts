import type { Page } from '@playwright/test';

/**
 * Every spec drives the real bundle in a real page: setContent + inject,
 * no dev server, no network. `boot` evaluates in the PAGE, so specs
 * express intent as plain browser code — the same code a consumer writes.
 */
export async function bootPage(page: Page, html: string): Promise<void> {
    await page.setContent(
        `<!DOCTYPE html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Fixture</h1>${html}</main></body></html>`,
    );
    await page.addScriptTag({ path: 'js/e2e/.bundle/laranail.js' });
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
