import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeadlessForm } from '../src/headless/HeadlessForm.ts';
import type { Schema } from '../src/types.ts';

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
        handle: {
            attribute: null,
            client: [{ rule: 'required', params: {} }],
            server: ['unique'],
        },
    },
    messages: {},
};

test('a fresh form is untouched, error-free and not validating', () => {
    const form = new HeadlessForm(SCHEMA, { values: { email: '' } });
    const state = form.snapshot();

    assert.equal(state.valid, true);
    assert.deepEqual(state.errors, {});
    assert.deepEqual(state.touched, {});
    assert.equal(state.validating, false);
    assert.deepEqual(state.values, { email: '' });
});

test('snapshot identity is stable until something changes', () => {
    const form = new HeadlessForm(SCHEMA);

    assert.equal(form.snapshot(), form.snapshot());

    form.setValue('email', 'a@b.co');
    const after = form.snapshot();
    assert.notEqual(after, form.snapshot() === after ? undefined : after);
    assert.equal(form.snapshot(), form.snapshot());
});

test('validate() fills errors and flips valid; subscribers hear each change', async () => {
    const form = new HeadlessForm(SCHEMA);
    let notifications = 0;
    const unsubscribe = form.subscribe(() => {
        notifications += 1;
    });

    const result = await form.validate();

    assert.equal(result.valid, false);
    assert.equal(form.snapshot().valid, false);
    assert.ok((form.snapshot().errors.email?.length ?? 0) > 0);
    assert.ok(notifications >= 1);

    unsubscribe();
    const seen = notifications;
    form.setValue('email', 'x');
    assert.equal(notifications, seen);
});

test('undetermined fields are reported, never counted as errors', async () => {
    const form = new HeadlessForm(SCHEMA, {
        values: { email: 'a@b.co', handle: 'imani' },
    });

    const result = await form.validate();

    assert.equal(result.valid, true);
    assert.deepEqual(form.snapshot().undetermined, ['handle']);
    assert.equal(form.snapshot().errors.handle, undefined);
});

test('validateField paints only that field plus fields already showing errors', async () => {
    const form = new HeadlessForm(SCHEMA, { values: { email: '', handle: '' } });

    await form.validateField('email');

    assert.ok((form.snapshot().errors.email?.length ?? 0) > 0);
    // handle is also empty and required — but the user has not met it yet.
    assert.equal(form.snapshot().errors.handle, undefined);

    form.setValue('email', 'a@b.co');
    await form.validateField('email');
    assert.equal(form.snapshot().errors.email, undefined);
});

test('touch() marks a field and reset() clears everything', async () => {
    const form = new HeadlessForm(SCHEMA, { values: { email: '' } });

    form.touch('email');
    await form.validate();
    assert.equal(form.snapshot().touched.email, true);
    assert.equal(form.snapshot().valid, false);

    form.reset({ email: 'fresh@b.co' });
    const state = form.snapshot();
    assert.deepEqual(state.errors, {});
    assert.deepEqual(state.touched, {});
    assert.deepEqual(state.undetermined, []);
    assert.deepEqual(state.values, { email: 'fresh@b.co' });
});

test('setErrors merges a server 422 map and marks those fields touched', () => {
    const form = new HeadlessForm(SCHEMA);

    form.setErrors({ handle: ['The handle has already been taken.'] });

    assert.deepEqual(form.snapshot().errors.handle, ['The handle has already been taken.']);
    assert.equal(form.snapshot().touched.handle, true);
    assert.equal(form.snapshot().valid, false);
});

test('validate({ only }) reports the listed fields while evaluating everything', async () => {
    const form = new HeadlessForm(SCHEMA, { values: { email: '', handle: '' } });

    const result = await form.validate({ only: ['handle'] });

    assert.equal(result.valid, false);
    assert.ok((form.snapshot().errors.handle?.length ?? 0) > 0);
    assert.equal(form.snapshot().errors.email, undefined);
});

test('a transport resolves undetermined fields; failures carry the server message', async () => {
    const form = new HeadlessForm(SCHEMA, {
        values: { email: 'a@b.co', handle: 'taken' },
        transport: {
            resolve: async (_values, fields) => ({
                kind: 'failures',
                errors: Object.fromEntries(fields.map((f) => [f, ['Already taken.']])),
            }),
            abort: () => {},
        },
    });

    await form.validateField('handle');

    assert.deepEqual(form.snapshot().errors.handle, ['Already taken.']);
    assert.deepEqual(form.snapshot().undetermined, []);
});

test('a clean transport answer is the one moment an undetermined field earns valid', async () => {
    const form = new HeadlessForm(SCHEMA, {
        values: { email: 'a@b.co', handle: 'fresh' },
        transport: {
            resolve: async () => ({ kind: 'clean' }),
            abort: () => {},
        },
    });

    await form.validateField('handle');

    assert.equal(form.snapshot().errors.handle, undefined);
    assert.deepEqual(form.snapshot().undetermined, []);
});

test('an unreachable transport leaves the field undetermined — never a verdict', async () => {
    const form = new HeadlessForm(SCHEMA, {
        values: { email: 'a@b.co', handle: 'someone' },
        transport: {
            resolve: async () => ({ kind: 'unreachable' }),
            abort: () => {},
        },
    });

    await form.validateField('handle');

    assert.equal(form.snapshot().errors.handle, undefined);
    assert.deepEqual(form.snapshot().undetermined, ['handle']);
});

test('destroy() aborts the transport and later calls are inert', async () => {
    let aborted = false;
    const form = new HeadlessForm(SCHEMA, {
        transport: {
            resolve: async () => ({ kind: 'clean' }),
            abort: () => {
                aborted = true;
            },
        },
    });

    form.destroy();
    assert.equal(aborted, true);

    form.setValue('email', 'x');
    await form.validate();
    assert.deepEqual(form.snapshot().errors, {});
});
