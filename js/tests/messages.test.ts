import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, validate } from '../src/index.ts';
import type { Schema } from '../src/types.ts';

interface Case {
    attribute: string;
    rule: string;
    data: Record<string, unknown>;
    field: string;
    schema: Schema;
    laravel: string;
    id: string;
}

/**
 * The verdict grid compares booleans, so a runner can agree with Laravel on
 * every one and still print the wrong sentence. This fixture is the same
 * exercise applied to the text: each expected message came out of a validator
 * that really failed, not from anyone's memory of the wording.
 */
const cases: Case[] = JSON.parse(
    readFileSync(new URL('./fixtures/messages.json', import.meta.url), 'utf8'),
);

test('the message fixture is present', () => {
    assert.ok(cases.length > 10, `expected a real grid, got ${cases.length} cases`);
});

for (const c of cases) {
    test(`matches Laravel's message: ${c.id}`, () => {
        const failure = validate(c.data, c.schema).failures.find((f) => f.field === c.field);

        assert.ok(failure, `${c.id}: the runner reported no failure on ${c.field}`);
        assert.equal(failure.message, c.laravel, c.id);
    });
}

test('an unresolved placeholder never reaches the user', () => {
    // The class of bug rather than one instance of it: any `:token` left in a
    // rendered message is a parameter the runner could not name, and the user
    // reads it verbatim.
    for (const c of cases) {
        const failure = validate(c.data, c.schema).failures.find((f) => f.field === c.field);
        const leftover = failure?.message.match(/:[a-z_]+/g);

        assert.equal(
            leftover,
            null,
            `${c.id}: left ${leftover?.join(', ')} in "${failure?.message}"`,
        );
    }
});

test('a schema written before a parameter was renamed degrades that rule, not the form', () => {
    // The compatibility property, stated as the failure it prevents. A schema
    // whose `max` carries only the OLD parameter name is one this runner cannot
    // fully read. Guessing coerces the absent value to 0 and rejects every input
    // for exceeding a limit of nothing — a valid form blocked, which is the one
    // direction a client check must never fail in.
    const legacy = {
        version: 1,
        fields: {
            f: {
                attribute: null,
                client: [
                    { rule: 'required', params: {} },
                    { rule: 'max', params: { value: '255' } },
                ],
                server: [],
            },
        },
        messages: {},
    };

    const result = validate({ f: 'ok' }, legacy as never);

    // `required` still ran and passed; only `max` went to the server.
    assert.equal(result.valid, true);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.undetermined, ['f']);
});

test('a schema carrying both parameter names is decided here, not round tripped', () => {
    // What the exporter actually emits. Both names travel, so this runner finds
    // the one it reads and nothing degrades.
    const both = {
        version: 1,
        fields: {
            f: {
                attribute: null,
                client: [{ rule: 'max', params: { max: '2', value: '2' } }],
                server: [],
            },
        },
        messages: {},
    };

    assert.deepEqual(validate({ f: 'ab' }, both as never).undetermined, []);
    assert.equal(validate({ f: 'ab' }, both as never).valid, true);
    assert.equal(validate({ f: 'abc' }, both as never).valid, false);
});

test('a variadic rule with no values is undetermined rather than always false', () => {
    // `in` with an empty list matches nothing and would fail every input. That
    // is a verdict produced from missing data, reached a different way.
    const empty = {
        version: 1,
        fields: { f: { attribute: null, client: [{ rule: 'in', params: {} }], server: [] } },
        messages: {},
    };

    const result = validate({ f: 'a' }, empty as never);

    assert.equal(result.valid, true);
    assert.deepEqual(result.undetermined, ['f']);
});

test('a rule name added since this runner was published degrades to undetermined', () => {
    const future = {
        version: 1,
        fields: {
            f: {
                attribute: null,
                client: [{ rule: 'some_rule_from_2027', params: {} }],
                server: [],
            },
        },
        messages: {},
    };

    assert.deepEqual(validate({ f: 'a' }, future as never).undetermined, ['f']);
});

test('a top-level key this runner has never heard of is ignored', () => {
    // Additive changes must not disturb an older runner. This is what "ignores
    // what it does not recognise" means in practice.
    const extended = {
        version: 1,
        fields: { f: { attribute: null, client: [{ rule: 'required', params: {} }], server: [] } },
        messages: {},
        somethingAddedLater: { f: 'whatever' },
    };

    assert.equal(validate({ f: 'x' }, extended as never).valid, true);
});

test('only a MAJOR version change sends the whole schema to the server', () => {
    const restructured = {
        version: 99,
        fields: { 'items.*.qty': { attribute: null, client: [], server: [] } },
        messages: {},
    };

    const result = validate({ items: [{ qty: '1' }, { qty: '2' }] }, restructured as never);

    assert.equal(result.valid, true);
    assert.deepEqual(result.undetermined, ['items.0.qty', 'items.1.qty']);
});

test('the runner agrees with the exporter about the major version', () => {
    // Both fixtures are written by the PHP exporter, so a bump on one side
    // without the other shows up here rather than as a wrong verdict.
    assert.equal(cases[0]?.schema.version, SCHEMA_VERSION);
});
