import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validate } from '../src/index.ts';


// ---------------------------------------------------------------------------
// J8 / J15 — isolated regression pins (the final re-audit found the
// mechanisms shipped but no test naming the exact plan scenarios).
// ---------------------------------------------------------------------------

test('J8: required_if:other,null fails when other IS null — the null-param conversion', () => {
    const schema = {
        version: 1,
        fields: {
            reason: {
                attribute: null,
                client: [{ rule: 'required_if', params: { other: 'status', values: 'null' } }],
                server: [],
            },
        },
        messages: {},
    };

    // Laravel's parseDependentRuleParameters converts the literal 'null'
    // to a real null, so a null `status` triggers the requirement.
    const triggered = validate({ status: null, reason: '' }, schema as never);
    assert.equal(triggered.valid, false, "null value must match a declared 'null' parameter");

    const untriggered = validate({ status: 'active', reason: '' }, schema as never);
    assert.equal(untriggered.valid, true);
});

test('J15: :values never re-lists the dependent field for positional conditional params', () => {
    // A third-party schema writer emitting POSITIONAL params: index 0 is
    // the field name, the rest are values — the message must not name the
    // field among the values.
    const schema = {
        version: 1,
        fields: {
            reason: {
                attribute: null,
                client: [{ rule: 'required_if', params: { 0: 'status', 1: 'closed' } }],
                server: [],
            },
        },
        messages: { 'reason.required_if': 'Required when :other is :values.' },
    };

    const result = validate({ status: 'closed', reason: '' }, schema as never);
    assert.equal(result.valid, false);

    const message = result.failures[0]?.message ?? '';
    assert.ok(message.includes('closed'), `values missing from: ${message}`);
    assert.ok(!message.includes('status is status'), `field re-listed in values: ${message}`);
    assert.ok(!/is .*status/.test(message), `field leaked into :values: ${message}`);
});
