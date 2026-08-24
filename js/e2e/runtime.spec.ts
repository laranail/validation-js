import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { bootPage, schemaFor } from './helpers.ts';

const FORM = `
  <form id="f">
    <label for="email">Email</label>
    <input id="email" name="email" type="text">
    <label for="name">Name</label>
    <input id="name" name="name" type="text">
    <button type="submit">Send</button>
  </form>`;

const SCHEMA = schemaFor(
    {
        email: { client: [{ rule: 'required' }, { rule: 'email' }] },
        name: { client: [{ rule: 'required' }] },
    },
    {
        'email.required': 'The :attribute field is required.',
        'email.email': 'The :attribute must be a valid email address.',
        'name.required': 'The :attribute field is required.',
    },
);

test('blur validates, aria attributes appear, and recovery removes only ours', async ({ page }) => {
    await bootPage(page, FORM);
    await page.evaluate((schema) => {
        const form = document.querySelector('form') as HTMLFormElement;
        (window as never as { v: unknown }).v = (
            window as never as { Laranail: { createValidator: Function } }
        ).Laranail.createValidator(form, schema, {
            renderer: new (
                window as never as { Laranail: { ClassMapRenderer: new (p: unknown) => unknown } }
            ).Laranail.ClassMapRenderer({}),
        });
    }, SCHEMA);

    const email = page.locator('#email');
    await email.fill('not-an-email');
    await email.blur();

    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', /-error-email/);
    await expect(page.locator('[data-laranail-message="email"]')).toContainText('valid email');

    // The live region announced it, politely and invisibly.
    await expect(page.locator('[data-laranail-live]')).toContainText('valid email');

    await email.fill('a@b.co');
    await email.blur();

    await expect(email).not.toHaveAttribute('aria-invalid', 'true');
    await expect(email).not.toHaveAttribute('aria-describedby', /-error-email/);
    await expect(page.locator('[data-laranail-message="email"]')).toHaveCount(0);
});

test('eager mode: silent while typing untouched, live after a failure, debounced', async ({
    page,
}) => {
    await bootPage(page, FORM);
    await page.evaluate((schema) => {
        const w = window as never as {
            Laranail: { createValidator: Function; ClassMapRenderer: new (p: unknown) => unknown };
        };
        const form = document.querySelector('form') as HTMLFormElement;
        w.Laranail.createValidator(form, schema, {
            renderer: new w.Laranail.ClassMapRenderer({}),
            debounce: 50,
        });
    }, SCHEMA);

    const email = page.locator('#email');

    // First keypresses in an untouched field must not validate.
    await email.pressSequentially('nope');
    await page.waitForTimeout(150);
    await expect(page.locator('[data-laranail-message="email"]')).toHaveCount(0);

    // Blur fails it; eager mode switches on live re-validation.
    await email.blur();
    await expect(page.locator('[data-laranail-message="email"]')).toHaveCount(1);

    // Caret to the END before typing — pressSequentially types at the
    // caret, and a refocused input parks it at position 0.
    await email.click();
    await page.keyboard.press('End');
    await page.keyboard.type('@b.co');
    await expect(page.locator('[data-laranail-message="email"]')).toHaveCount(0, { timeout: 1000 });
});

test('submit blocks on failure with summary, focus and axe-clean markup', async ({ page }) => {
    await bootPage(page, FORM);
    await page.evaluate((schema) => {
        const w = window as never as {
            Laranail: { createValidator: Function; ClassMapRenderer: new (p: unknown) => unknown };
        };
        const form = document.querySelector('form') as HTMLFormElement;
        w.Laranail.createValidator(form, schema, { renderer: new w.Laranail.ClassMapRenderer({}) });
    }, SCHEMA);

    await page.click('button[type=submit]');

    const summary = page.locator('[data-laranail-summary]');
    await expect(summary).toBeVisible();
    await expect(summary).toHaveAttribute('role', 'alert');
    await expect(summary.locator('li')).toHaveCount(2);

    // Focus lands on the first invalid control.
    await expect(page.locator('#email')).toBeFocused();

    // The failure markup itself passes axe.
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
});

test('a cancelable laranail:form:submit reaches plain DOM listeners', async ({ page }) => {
    await bootPage(page, FORM);

    const outcome = await page.evaluate(async (schema) => {
        const w = window as never as { Laranail: { createValidator: Function } };
        const form = document.querySelector('form') as HTMLFormElement;
        const seen: string[] = [];

        form.addEventListener('laranail:form:submit', ((event: CustomEvent) => {
            seen.push(`submit:${(event.detail as { validatorId: string }).validatorId}`);
            event.preventDefault();
        }) as EventListener);

        const validator = w.Laranail.createValidator(form, schema) as {
            submit(): Promise<boolean>;
        };

        (document.querySelector('#email') as HTMLInputElement).value = 'a@b.co';
        (document.querySelector('#name') as HTMLInputElement).value = 'Alice';

        const allowed = await validator.submit();

        return { seen, allowed };
    }, SCHEMA);

    expect(outcome.seen).toHaveLength(1);
    expect(outcome.allowed).toBe(false);
});

test('a registered client rule uses its own message', async ({ page }) => {
    await bootPage(page, FORM);

    const message = await page.evaluate(async (schema) => {
        const w = window as never as {
            Laranail: { createValidator: Function; ClassMapRenderer: new (p: unknown) => unknown };
        };
        const form = document.querySelector('form') as HTMLFormElement;

        const validator = w.Laranail.createValidator(form, schema, {
            renderer: new w.Laranail.ClassMapRenderer({}),
        }) as { registerRule: Function; validate(): Promise<unknown> };

        validator.registerRule(
            'shouty',
            (value: unknown) => typeof value !== 'string' || value === value.toUpperCase(),
            {
                message: 'The :attribute must be shouty.',
            },
        );

        (
            schema as {
                fields: Record<string, { client: Array<{ rule: string; params: object }> }>;
            }
        ).fields.name.client.push({ rule: 'shouty', params: {} });

        (document.querySelector('#email') as HTMLInputElement).value = 'a@b.co';
        (document.querySelector('#name') as HTMLInputElement).value = 'quiet';

        await validator.validate();

        return document.querySelector('[data-laranail-message="name"]')?.textContent;
    }, SCHEMA);

    expect(message).toBe('The name must be shouty.');
});
