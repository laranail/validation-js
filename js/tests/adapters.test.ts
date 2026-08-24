import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useValidation } from '../src/adapters/vue.ts';
import type { Schema } from '../src/types.ts';

/**
 * The Vue composable outside a component: Vue's reactivity works without
 * an app instance, so the wiring — snapshot → refs, helpers → form — is
 * provable under plain node. The React adapter needs a real renderer and
 * is proven in the Playwright suite instead.
 */
const SCHEMA: Schema = {
    version: 1,
    fields: {
        email: {
            attribute: null,
            client: [
                { rule: 'required', params: {} },
                { rule: 'email', params: {} },
            ],
            server: [],
        },
    },
    messages: { 'email.email': 'The email field must be a valid email address.' },
};

test('the composable exposes reactive refs that follow the form', async () => {
    const v = useValidation(SCHEMA, { values: { email: 'nope' } });

    assert.equal(v.valid.value, true);

    const result = await v.validate();

    assert.equal(result.valid, false);
    assert.equal(v.valid.value, false);
    assert.match(v.errors.value.email?.[0] ?? '', /valid email/);

    v.setValue('email', 'a@b.co');
    await v.validate();

    assert.equal(v.valid.value, true);
    assert.deepEqual(v.errors.value, {});

    v.form.destroy();
});

test('onBlur touches and validates the one field', async () => {
    const v = useValidation(SCHEMA, { values: { email: '' } });

    v.onInput('email', { target: { value: 'still-wrong' } });
    v.onBlur('email');

    // validateField is async; give the microtask queue one turn.
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(v.touched.value.email, true);
    assert.ok((v.errors.value.email?.length ?? 0) > 0);

    v.form.destroy();
});

test('setErrors surfaces a server 422 through the refs', () => {
    const v = useValidation(SCHEMA);

    v.setErrors({ email: ['Taken.'] });

    assert.deepEqual(v.errors.value.email, ['Taken.']);
    assert.equal(v.valid.value, false);

    v.form.destroy();
});
