import { expect, test } from '@playwright/test';
import { bootPage, schemaFor } from './helpers.ts';

const SCHEMA = schemaFor(
    { email: { client: [{ rule: 'required' }, { rule: 'email' }] } },
    { 'email.email': 'The :attribute must be a valid email address.' },
);

const PRESET_CASES = [
    { preset: 'bootstrap5', inputClass: 'is-invalid', messageClass: 'invalid-feedback' },
    { preset: 'tailwind', inputClass: 'border-red-500', messageClass: 'text-red-600' },
    { preset: 'vanilla', inputClass: 'ln-invalid', messageClass: 'ln-error' },
] as const;

for (const { preset, inputClass, messageClass } of PRESET_CASES) {
    test(`the ${preset} preset paints failure state and recovers cleanly`, async ({ page }) => {
        await bootPage(page, '<form><input name="email" id="email"></form>');

        await page.evaluate(
            ({ schema, presetName }) => {
                const w = window as never as {
                    Laranail: {
                        createValidator: Function;
                        ClassMapRenderer: new (p: unknown) => unknown;
                        presets: Record<string, unknown>;
                    };
                };
                const form = document.querySelector('form') as HTMLFormElement;
                w.Laranail.createValidator(form, schema, {
                    renderer: new w.Laranail.ClassMapRenderer(w.Laranail.presets[presetName]),
                });
            },
            { schema: SCHEMA, presetName: preset },
        );

        const email = page.locator('#email');
        await email.fill('nope');
        await email.blur();

        await expect(email).toHaveClass(new RegExp(inputClass));
        await expect(page.locator('[data-laranail-message="email"]')).toHaveClass(
            new RegExp(messageClass),
        );

        await email.fill('a@b.co');
        await email.blur();

        await expect(email).not.toHaveClass(new RegExp(inputClass));
    });
}

test('a translated message with markup renders as text, never HTML', async ({ page }) => {
    await bootPage(page, '<form><input name="email" id="email"></form>');

    const html = await page.evaluate(async (schema) => {
        const w = window as never as {
            Laranail: { createValidator: Function; ClassMapRenderer: new (p?: unknown) => unknown };
        };
        const form = document.querySelector('form') as HTMLFormElement;

        (schema as { messages: Record<string, string> }).messages['email.email'] =
            '<img src=x onerror=alert(1)> not an email';

        const validator = w.Laranail.createValidator(form, schema, {
            renderer: new w.Laranail.ClassMapRenderer(),
        }) as { validate(): Promise<unknown> };

        (document.querySelector('#email') as HTMLInputElement).value = 'nope';
        await validator.validate();

        return document.querySelector('[data-laranail-message="email"]')?.innerHTML ?? '';
    }, SCHEMA);

    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
});

test('the explicit data-attribute wins the placement chain', async ({ page }) => {
    await bootPage(
        page,
        `<form>
           <div id="custom-slot"></div>
           <input name="email" id="email" data-laranail-errors="#custom-slot">
         </form>`,
    );

    await page.evaluate((schema) => {
        const w = window as never as {
            Laranail: { createValidator: Function; ClassMapRenderer: new (p?: unknown) => unknown };
        };
        const form = document.querySelector('form') as HTMLFormElement;
        w.Laranail.createValidator(form, schema, { renderer: new w.Laranail.ClassMapRenderer() });
    }, SCHEMA);

    const email = page.locator('#email');
    await email.fill('nope');
    await email.blur();

    await expect(page.locator('#custom-slot [data-laranail-message="email"]')).toHaveCount(1);
});

test('an input-group resolver places errors after the whole group', async ({ page }) => {
    await bootPage(
        page,
        `<form>
           <div class="field-wrap">
             <div class="input-group">
               <span class="input-group-text">@</span>
               <input name="email" id="email">
             </div>
           </div>
         </form>`,
    );

    await page.evaluate((schema) => {
        const w = window as never as {
            Laranail: {
                createValidator: Function;
                ClassMapRenderer: new (p?: unknown) => unknown;
                resolvers: { inputGroupResolver: unknown };
            };
        };
        const form = document.querySelector('form') as HTMLFormElement;
        w.Laranail.createValidator(form, schema, {
            renderer: new w.Laranail.ClassMapRenderer(),
            resolvers: [w.Laranail.resolvers.inputGroupResolver],
        });
    }, SCHEMA);

    const email = page.locator('#email');
    await email.fill('nope');
    await email.blur();

    // The message landed in the group's PARENT, not inside the group.
    await expect(page.locator('.field-wrap > [data-laranail-message="email"]')).toHaveCount(1);
    await expect(page.locator('.input-group [data-laranail-message]')).toHaveCount(0);
});
