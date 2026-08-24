import { expect, test } from '@playwright/test';
import { bootPage, schemaFor } from './helpers.ts';

/**
 * The Phase-6 runtime surface: progressive enhancement (novalidate only
 * after successful init), server-error re-mapping, wizard-step partial
 * validation, and repeater-row refresh — each an easy-to-forget §6.5
 * concern with a real UX defect behind it.
 */

const FORM = `
<form>
    <input name="email" id="email">
    <input name="handle" id="handle">
</form>`;

const SCHEMA = schemaFor({
    email: { client: [{ rule: 'required' }, { rule: 'email' }] },
    handle: { client: [{ rule: 'required' }] },
});

function boot(page: import('@playwright/test').Page, schema: unknown = SCHEMA): Promise<unknown> {
    return page.evaluate((data) => {
        const w = window as never as {
            Laranail: { createValidator: Function; ClassMapRenderer: new (p?: unknown) => unknown };
        };
        const form = document.querySelector('form') as HTMLFormElement;
        (window as never as { v: unknown }).v = w.Laranail.createValidator(form, data, {
            renderer: new w.Laranail.ClassMapRenderer({}),
        });
    }, schema);
}

test('novalidate arrives only after init, and destroy() gives the form back', async ({ page }) => {
    await bootPage(page, FORM);

    // Before the runtime initializes, native constraints still own the form.
    await expect(page.locator('form')).not.toHaveAttribute('novalidate');

    await boot(page);
    await expect(page.locator('form')).toHaveAttribute('novalidate', '');

    await page.evaluate(() => (window as never as { v: { destroy(): void } }).v.destroy());
    await expect(page.locator('form')).not.toHaveAttribute('novalidate');
});

test('a hand-authored novalidate is not stolen by destroy()', async ({ page }) => {
    await bootPage(page, FORM.replace('<form>', '<form novalidate>'));
    await boot(page);
    await page.evaluate(() => (window as never as { v: { destroy(): void } }).v.destroy());

    await expect(page.locator('form')).toHaveAttribute('novalidate', '');
});

test('setErrors maps a server 422 onto the fields like any other failure', async ({ page }) => {
    await bootPage(page, FORM);
    await boot(page);

    await page.evaluate(() =>
        (window as never as { v: { setErrors(e: unknown): void } }).v.setErrors({
            handle: ['The handle has already been taken.'],
        }),
    );

    await expect(page.locator('[data-laranail-message="handle"]')).toContainText(
        'already been taken',
    );
    await expect(page.locator('#handle')).toHaveAttribute('aria-invalid', 'true');
});

test('validate({ only }) evaluates the whole form but reports one step', async ({ page }) => {
    await bootPage(page, FORM);
    await boot(page);

    await page.evaluate(() =>
        (window as never as { v: { validate(o?: unknown): Promise<unknown> } }).v.validate({
            only: ['email'],
        }),
    );

    await expect(page.locator('[data-laranail-message="email"]')).toBeVisible();
    await expect(page.locator('[data-laranail-message="handle"]')).toHaveCount(0);
});

test('refresh() forgets a removed repeater row instead of leaking it', async ({ page }) => {
    await bootPage(
        page,
        `<form>
            <input name="items[0][qty]" id="qty0">
            <input name="items[1][qty]" id="qty1">
        </form>`,
    );

    const schema = schemaFor({ 'items.*.qty': { client: [{ rule: 'required' }] } });
    await boot(page, schema);

    await page.locator('#qty1').focus();
    await page.locator('#qty1').blur();
    await expect(page.locator('[data-laranail-message="items.1.qty"]')).toBeVisible();

    await page.evaluate(() => {
        document.querySelector('#qty1')?.remove();
        (window as never as { v: { refresh(): void } }).v.refresh();
    });

    await expect(page.locator('[data-laranail-message="items.1.qty"]')).toHaveCount(0);

    const status = await page.evaluate(
        () =>
            (window as never as { v: { state(f: string): { status: string } } }).v.state(
                'items.1.qty',
            ).status,
    );
    expect(status).toBe('pristine');
});
