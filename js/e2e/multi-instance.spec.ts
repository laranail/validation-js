import { expect, test } from '@playwright/test';
import { bootPage, schemaFor } from './helpers.ts';

const TWO_FORMS = `
  <form id="a"><input name="email" id="a-email"><button type="submit">A</button></form>
  <form id="b"><input name="email" id="b-email"><button type="submit">B</button></form>`;

const SCHEMA = schemaFor(
    { email: { client: [{ rule: 'required' }, { rule: 'email' }] } },
    { 'email.email': 'The :attribute must be a valid email address.' },
);

test('two validators with overlapping field names never cross-fire', async ({ page }) => {
    await bootPage(page, TWO_FORMS);

    const outcome = await page.evaluate(async (schema) => {
        const w = window as never as {
            Laranail: { createValidator: Function; ClassMapRenderer: new (p: unknown) => unknown };
        };
        const a = document.querySelector('#a') as HTMLFormElement;
        const b = document.querySelector('#b') as HTMLFormElement;

        const events: string[] = [];
        document.addEventListener('laranail:field:validated', ((event: CustomEvent) => {
            const detail = event.detail as { validatorId: string; field: string };
            // The event fires FROM the control; attribute it to its form.
            const owner = (event.target as Element).closest('form') as HTMLFormElement;
            events.push(`${owner.id}:${detail.validatorId}`);
        }) as EventListener);

        const va = w.Laranail.createValidator(a, schema, {
            renderer: new w.Laranail.ClassMapRenderer({}),
        }) as {
            id: string;
            validateField(f: string): Promise<void>;
        };
        const vb = w.Laranail.createValidator(b, schema, {
            renderer: new w.Laranail.ClassMapRenderer({}),
        }) as {
            id: string;
            validateField(f: string): Promise<void>;
        };

        (document.querySelector('#a-email') as HTMLInputElement).value = 'bad';
        (document.querySelector('#b-email') as HTMLInputElement).value = 'a@b.co';

        await Promise.all([va.validateField('email'), vb.validateField('email')]);

        return {
            ids: [va.id, vb.id],
            events,
            aErrors: document.querySelectorAll('#a [data-laranail-message]').length,
            bErrors: document.querySelectorAll('#b [data-laranail-message]').length,
        };
    }, SCHEMA);

    expect(outcome.ids[0]).not.toBe(outcome.ids[1]);
    expect(outcome.aErrors).toBe(1);
    expect(outcome.bErrors).toBe(0);

    // A delegated listener can attribute every event to its instance.
    for (const entry of outcome.events) {
        const [formId, validatorId] = entry.split(':');
        expect(validatorId).toBe(formId === 'a' ? outcome.ids[0] : outcome.ids[1]);
    }
});

test('attaching twice replaces (StrictMode/HMR), never double-binds', async ({ page }) => {
    await bootPage(page, TWO_FORMS);

    const outcome = await page.evaluate(async (schema) => {
        const w = window as never as { Laranail: { createValidator: Function } };
        const form = document.querySelector('#a') as HTMLFormElement;

        const first = w.Laranail.createValidator(form, schema) as { destroy(): void };
        const second = w.Laranail.createValidator(form, schema) as { id: string };

        // Drive the DOM the way a user would: if the first instance were
        // still bound, TWO validators would react to this blur.
        const reactions: string[] = [];
        document.addEventListener('laranail:field:validating', ((event: CustomEvent) => {
            reactions.push((event.detail as { validatorId: string }).validatorId);
        }) as EventListener);

        const input = document.querySelector('#a-email') as HTMLInputElement;
        input.value = 'bad';
        input.dispatchEvent(new Event('focusout', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));

        return { reactions, secondId: second.id, sameInstance: first === (second as unknown) };
    }, SCHEMA);

    // Exactly one instance reacted, and it is the replacement.
    expect(outcome.reactions).toEqual([outcome.secondId]);
    expect(outcome.sameInstance).toBe(false);
});

test('destroy is leak-free and leaves the surviving instance intact', async ({ page }) => {
    await bootPage(page, TWO_FORMS);

    const outcome = await page.evaluate(async (schema) => {
        const w = window as never as {
            Laranail: { createValidator: Function; ClassMapRenderer: new (p: unknown) => unknown };
        };
        const a = document.querySelector('#a') as HTMLFormElement;
        const b = document.querySelector('#b') as HTMLFormElement;

        const va = w.Laranail.createValidator(a, schema, {
            renderer: new w.Laranail.ClassMapRenderer({}),
        }) as {
            validateField(f: string): Promise<void>;
            destroy(): void;
            leakReport(): { listeners: number; timers: number };
        };
        const vb = w.Laranail.createValidator(b, schema, {
            renderer: new w.Laranail.ClassMapRenderer({}),
        }) as {
            validateField(f: string): Promise<void>;
        };

        const aInput = document.querySelector('#a-email') as HTMLInputElement;
        aInput.value = 'bad';
        await va.validateField('email');

        // Destroy A mid-life; B keeps validating.
        va.destroy();

        const afterDestroy = {
            leaks: va.leakReport(),
            ariaInvalid: aInput.getAttribute('aria-invalid'),
            describedBy: aInput.getAttribute('aria-describedby'),
            liveRegions: document.querySelectorAll('#a [data-laranail-live]').length,
        };

        (document.querySelector('#b-email') as HTMLInputElement).value = 'bad';
        await vb.validateField('email');

        return {
            afterDestroy,
            bStillWorks: document.querySelectorAll('#b [data-laranail-message]').length,
        };
    }, SCHEMA);

    expect(outcome.afterDestroy.leaks).toEqual({ listeners: 0, timers: 0 });
    expect(outcome.afterDestroy.ariaInvalid).toBeNull();
    expect(outcome.afterDestroy.describedBy).toBeNull();
    expect(outcome.afterDestroy.liveRegions).toBe(0);
    expect(outcome.bStillWorks).toBe(1);
});

test('a stale slow async check never overwrites a newer verdict', async ({ page }) => {
    await bootPage(page, TWO_FORMS);

    const status = await page.evaluate(async (schema) => {
        const w = window as never as { Laranail: { createValidator: Function } };
        const form = document.querySelector('#a') as HTMLFormElement;
        const input = document.querySelector('#a-email') as HTMLInputElement;

        const validator = w.Laranail.createValidator(form, schema, {
            rules: {
                // Slow for the FIRST value, instant afterwards — the classic
                // stale-response shape.
                slowcheck: (value: unknown) =>
                    new Promise((resolve) =>
                        setTimeout(() => resolve(value !== 'first'), value === 'first' ? 150 : 0),
                    ),
            },
        }) as { validateField(f: string): Promise<void>; state(f: string): { status: string } };

        (
            schema as {
                fields: Record<string, { client: Array<{ rule: string; params: object }> }>;
            }
        ).fields.email.client.push({ rule: 'slowcheck', params: {} });

        input.value = 'first';
        const slow = validator.validateField('email');

        input.value = 'a@b.co';
        const fast = validator.validateField('email');

        await Promise.all([slow, fast]);
        await new Promise((resolve) => setTimeout(resolve, 200));

        return validator.state('email').status;
    }, SCHEMA);

    // The slow rejection of 'first' resolved AFTER the fast pass of the
    // newer value; latest wins, so the field is valid.
    expect(status).toBe('valid');
});
