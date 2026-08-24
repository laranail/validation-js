import { expect, test } from '@playwright/test';
import { bootPage, schemaFor } from './helpers.ts';

/**
 * The remote channel end to end in a real browser, with the endpoint
 * mocked at the network layer — the wire contract (full payload,
 * Validate-Only header) is asserted on what actually left the page.
 */

const FORM = '<form><input name="email" id="email"></form>';

const SCHEMA = schemaFor({
    email: { client: [{ rule: 'required' }, { rule: 'email' }], server: ['unique'] },
});

function boot(page: import('@playwright/test').Page): Promise<unknown> {
    return page.evaluate((schema) => {
        const w = window as never as {
            Laranail: {
                createValidator: Function;
                ClassMapRenderer: new (p?: unknown) => unknown;
                RemoteChannel: new (url: string) => unknown;
            };
        };
        const form = document.querySelector('form') as HTMLFormElement;
        (window as never as { v: unknown }).v = w.Laranail.createValidator(form, schema, {
            renderer: new w.Laranail.ClassMapRenderer({}),
            transport: new w.Laranail.RemoteChannel('/validate/profile'),
        });
    }, SCHEMA);
}

test('a server failure paints the server message on the undetermined field', async ({ page }) => {
    await bootPage(page, FORM);

    let request: { payload: unknown; validateOnly: string | undefined } | undefined;

    await page.route('**/validate/profile', async (route) => {
        request = {
            payload: route.request().postDataJSON(),
            validateOnly:
                (await route.request().headerValue('precognition-validate-only')) ?? undefined,
        };
        await route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: JSON.stringify({ errors: { email: ['That address is already registered.'] } }),
        });
    });

    await boot(page);

    const email = page.locator('#email');
    await email.fill('taken@b.co');
    await email.blur();

    await expect(page.locator('[data-laranail-message="email"]')).toContainText(
        'already registered',
    );
    await expect(email).toHaveAttribute('aria-invalid', 'true');

    // The wire carried the FULL payload and named the undetermined field.
    expect(request?.payload).toEqual({ email: 'taken@b.co' });
    expect(request?.validateOnly).toBe('email');
});

test('a 204 is the one moment an undetermined field earns valid', async ({ page }) => {
    await bootPage(page, FORM);
    await page.route('**/validate/profile', (route) => route.fulfill({ status: 204 }));
    await boot(page);

    const email = page.locator('#email');
    await email.fill('fresh@b.co');
    await email.blur();

    await expect
        .poll(async () =>
            page.evaluate(
                () =>
                    (window as never as { v: { state(f: string): { status: string } } }).v.state(
                        'email',
                    ).status,
            ),
        )
        .toBe('valid');
});

test('an unreachable endpoint degrades to transient undetermined, never a verdict', async ({
    page,
}) => {
    await bootPage(page, FORM);
    await page.route('**/validate/profile', (route) => route.abort('connectionrefused'));
    await boot(page);

    const email = page.locator('#email');
    await email.fill('someone@b.co');
    await email.blur();

    await expect
        .poll(async () =>
            page.evaluate(() =>
                (
                    window as never as {
                        v: { state(f: string): { status: string; reason?: string } };
                    }
                ).v.state('email'),
            ),
        )
        .toMatchObject({ status: 'undetermined', reason: 'transient' });

    await expect(page.locator('[data-laranail-message="email"]')).toHaveCount(0);
});
