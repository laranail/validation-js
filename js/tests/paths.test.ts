import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get, has } from '../src/paths.ts';

/**
 * Direct unit rows for the dotted-path readers, mirroring Laravel's Arr::get
 * and Arr::has. The differential fixtures exercise these only through whole
 * validations, which leaves the guard clauses under-pinned — the first
 * mutation run left survivors on exactly the hostile-input lines the
 * prototype-walk fix hardened. Each row documents the Laravel verdict it
 * mirrors.
 */

test('get: traversing through null or undefined yields undefined', () => {
    // Arr::get(['a' => null], 'a.b') === null — never an error, never a value.
    assert.equal(get({ a: null }, 'a.b'), undefined);
    assert.equal(get({ a: undefined }, 'a.b'), undefined);
    assert.equal(get({}, 'a.b.c'), undefined);
});

test('get: a primitive is not traversable', () => {
    // Arr::get(['a' => 'hi'], 'a.0') === null. A String object HAS an own
    // '0' property, so skipping the typeof guard would surface 'h'.
    assert.equal(get({ a: 'hi' }, 'a.0'), undefined);
    assert.equal(get({ a: 42 }, 'a.0'), undefined);
    assert.equal(get({ a: true }, 'a.length'), undefined);
});

test('get: reads only own properties, never the prototype', () => {
    // Arr::get sees only the data that was sent.
    assert.equal(get({ meta: { x: 1 } }, 'meta.constructor'), undefined);
    assert.equal(get({ meta: { x: 1 } }, 'meta.toString'), undefined);
    assert.equal(get({ meta: { x: 1 } }, 'meta.x'), 1);
});

test('get: array indices resolve, everything else on an array does not', () => {
    const values = { items: ['a', 'b'] };

    assert.equal(get(values, 'items.0'), 'a');
    assert.equal(get(values, 'items.1'), 'b');
    assert.equal(get(values, 'items.2'), undefined);
    assert.equal(get(values, 'items.-1'), undefined);
    assert.equal(get(values, 'items.x'), undefined);
    // 'length' is an OWN property of a JS array; Laravel has no such key.
    assert.equal(get(values, 'items.length'), undefined);
});

test('has: array presence is a bounded integer index, nothing else', () => {
    const values = { items: ['a', 'b'] };

    // Arr::has(['items' => ['a','b']], 'items.1') === true; 2, -1, 'x' and
    // 'length' are all absent. hasOwn on the array would answer true for
    // 'length' (an own property) — the Array.isArray branch exists to keep
    // JS array internals out of the data model.
    assert.equal(has(values, 'items.0'), true);
    assert.equal(has(values, 'items.1'), true);
    assert.equal(has(values, 'items.2'), false);
    assert.equal(has(values, 'items.-1'), false);
    assert.equal(has(values, 'items.x'), false);
    assert.equal(has(values, 'items.length'), false);
});

test('has: own properties only, prototype names read as absent', () => {
    assert.equal(has({ meta: { x: 1 } }, 'meta.x'), true);
    assert.equal(has({ meta: { x: 1 } }, 'meta.constructor'), false);
    assert.equal(has({ meta: { x: 1 } }, 'meta.hasOwnProperty'), false);
    assert.equal(has({ a: null }, 'a'), true);
    assert.equal(has({ a: null }, 'a.b'), false);
});
