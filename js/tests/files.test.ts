import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validate, validateAsync } from '../src/index.ts';
import type { Schema } from '../src/types.ts';

/**
 * File rules cannot ride the PHP-generated fixture — a File object does not
 * survive JSON. These pin the ADVISORY contract instead: the obviously-wrong
 * pick fails, a plausible one stays undetermined (the server reads the real
 * bytes), and nothing here ever green-ticks a file.
 */

function schemaFor(rule: string, params: Record<string, string> = {}): Schema {
    return {
        version: 1,
        fields: { field: { attribute: null, client: [{ rule, params }], server: [] } },
        messages: {},
        messageVariants: {},
    };
}

const png = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
const script = new File(['alert(1)'], 'payload.html', { type: 'text/html' });

test('a wrong extension fails fast; a matching one stays undetermined', () => {
    const schema = schemaFor('mimes', { '0': 'png', '1': 'jpg' });

    const wrong = validate({ field: script }, schema);
    assert.equal(wrong.valid, false);

    const plausible = validate({ field: png }, schema);
    assert.equal(plausible.valid, true);
    assert.deepEqual(plausible.undetermined, ['field']);
});

test('extensions reads the filename, case-insensitively', () => {
    const upper = new File(['x'], 'SCAN.PDF', { type: 'application/pdf' });

    assert.equal(validate({ field: upper }, schemaFor('extensions', { '0': 'pdf' })).valid, true);
    assert.equal(validate({ field: upper }, schemaFor('extensions', { '0': 'png' })).valid, false);
});

test('image trusts the declared type only far enough to reject non-images', () => {
    assert.equal(validate({ field: script }, schemaFor('image')).valid, false);

    const coarse = validate({ field: png }, schemaFor('image'));
    assert.equal(coarse.valid, true);
    assert.deepEqual(coarse.undetermined, ['field']);
});

test('file decides instance-ness and non-files fail it', () => {
    assert.equal(validate({ field: png }, schemaFor('file')).valid, true);
    assert.equal(validate({ field: 'not a file' }, schemaFor('file')).valid, false);
});

test('size rules read a file in kilobytes, as Laravel does', () => {
    const big = new File([new Uint8Array(3 * 1024)], 'big.bin');

    assert.equal(validate({ field: big }, schemaFor('max', { max: '2' })).valid, false);
    assert.equal(validate({ field: big }, schemaFor('max', { max: '4' })).valid, true);
});

test('dimensions rounds trip where images cannot be decoded, and async never lies', async () => {
    // Node has no createImageBitmap: the sync engine must answer
    // undetermined — a Promise truthiness-tested would pass everything,
    // which is the failure mode this pin exists for.
    const schema = schemaFor('dimensions', { '0': 'min_width=100' });

    const sync = validate({ field: png }, schema);
    assert.equal(sync.valid, true);
    assert.deepEqual(sync.undetermined, ['field']);

    const resolved = await validateAsync({ field: png }, schema);
    assert.deepEqual(resolved.undetermined, ['field']);

    // A non-file fails dimensions outright, sync and async alike.
    assert.equal(validate({ field: 'nope' }, schema).valid, false);
    assert.equal((await validateAsync({ field: 'nope' }, schema)).valid, false);
});
