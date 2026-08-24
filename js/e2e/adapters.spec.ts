import { expect, test } from '@playwright/test';
import { bootPage, schemaFor } from './helpers.ts';

/**
 * The React adapter against real React under StrictMode — the framework
 * owns every DOM node, the library only answers with state, and the
 * double-mount is exactly the trap the adapter must survive (§5.9).
 */

const SCHEMA = schemaFor(
    { email: { client: [{ rule: 'required' }, { rule: 'email' }] } },
    { 'email.email': 'The email field must be a valid email address.' },
);

async function mount(page: import('@playwright/test').Page): Promise<void> {
    await bootPage(page, '<div id="root"></div>', ['react-demo.js']);
    await page.evaluate((schema) => {
        (window as never as { mountReactDemo: (s: unknown) => void }).mountReactDemo(schema);
    }, SCHEMA);
}

test('React renders the library state it is handed — invalid, then recovered', async ({ page }) => {
    await mount(page);

    const email = page.locator('#email');
    await email.fill('nope');
    await email.blur();

    await expect(page.locator('[data-error="email"]')).toContainText('valid email address');

    await email.fill('a@b.co');
    await email.blur();
    await expect(page.locator('[data-error="email"]')).toHaveCount(0);
});

test('handleSubmit gates on the verdict and hands over the values', async ({ page }) => {
    await mount(page);

    // Invalid: submit refuses, no submitted marker.
    await page.locator('button').click();
    await expect(page.locator('[data-error="email"]')).toBeVisible();
    await expect(page.locator('[data-submitted]')).toHaveCount(0);

    // Settle the blur-triggered revalidation first: the error element
    // unmounting mid-click shifts the button and swallows the click — a
    // real-page hazard, but this spec is about the submit gate.
    await page.locator('#email').fill('a@b.co');
    await page.locator('#email').blur();
    await expect(page.locator('[data-error="email"]')).toHaveCount(0);

    await page.locator('button').click();
    await expect(page.locator('[data-submitted]')).toHaveText('a@b.co');
});

test('StrictMode double-mount neither doubles state nor drops it', async ({ page }) => {
    await mount(page);

    // If the second mount had revived a destroyed form, typing would do
    // nothing; if subscriptions doubled, errors would render twice.
    const email = page.locator('#email');
    await email.fill('nope');
    await email.blur();

    await expect(page.locator('[data-error="email"]')).toHaveCount(1);
});
