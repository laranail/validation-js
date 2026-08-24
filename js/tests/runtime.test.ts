import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scheduler } from '../src/form/Scheduler.ts';
import { pluralise, resolveMessage, toName, toPath } from '../src/index.ts';
import { RegexBuilder, regex } from '../src/regex.ts';

// ---------------------------------------------------------------------------
// NameMapper — bracket ⇄ dot
// ---------------------------------------------------------------------------

test('bracketed names map to dotted paths and back', () => {
    assert.equal(toPath('items[0][email]'), 'items.0.email');
    assert.equal(toPath('tags[]'), 'tags');
    assert.equal(toPath('plain'), 'plain');
    assert.equal(toName('items.0.email'), 'items[0][email]');
    assert.equal(toName('plain'), 'plain');
});

// ---------------------------------------------------------------------------
// Scheduler — timing rules, fake clock
// ---------------------------------------------------------------------------

function fakeClock(): {
    set: (handler: () => void, ms: number) => unknown;
    clear: (token: unknown) => void;
    tick: () => void;
    pending: number;
} {
    const handlers = new Map<number, () => void>();
    let next = 0;

    return {
        set: (handler) => {
            handlers.set(++next, handler);
            return next;
        },
        clear: (token) => {
            handlers.delete(token as number);
        },
        tick: () => {
            const due = [...handlers.values()];
            handlers.clear();
            for (const handler of due) handler();
        },
        get pending() {
            return handlers.size;
        },
    };
}

test('eager mode stays quiet until a field has failed once', () => {
    const scheduler = new Scheduler({ mode: 'eager' });

    assert.equal(scheduler.shouldValidateOnInput('email'), false);
    assert.equal(scheduler.shouldValidateOnBlur(), true);

    scheduler.recordFailure('email');
    assert.equal(scheduler.shouldValidateOnInput('email'), true);
    // Live feedback stays ON after recovery, so a regression shows at once.
    scheduler.recordSuccess('email');
    assert.equal(scheduler.shouldValidateOnInput('email'), true);
});

test('submit mode validates on neither blur nor input', () => {
    const scheduler = new Scheduler({ mode: 'submit' });

    assert.equal(scheduler.shouldValidateOnBlur(), false);
    assert.equal(scheduler.shouldValidateOnInput('email'), false);
});

test('debounce is per field and a newer call cancels the older', () => {
    const clock = fakeClock();
    const scheduler = new Scheduler({ setTimeout: clock.set, clearTimeout: clock.clear });
    const runs: string[] = [];

    scheduler.schedule('a', () => runs.push('a-first'));
    scheduler.schedule('b', () => runs.push('b'));
    scheduler.schedule('a', () => runs.push('a-second'));

    assert.equal(scheduler.pendingCount, 2);
    clock.tick();
    assert.deepEqual(runs.sort(), ['a-second', 'b']);
});

test('cancelAll leaves no timer behind — the destroy() leak contract', () => {
    const clock = fakeClock();
    const scheduler = new Scheduler({ setTimeout: clock.set, clearTimeout: clock.clear });

    scheduler.schedule('a', () => {});
    scheduler.schedule('b', () => {});
    scheduler.cancelAll();

    assert.equal(scheduler.pendingCount, 0);
    assert.equal(clock.pending, 0);
});

// ---------------------------------------------------------------------------
// Regex builder — the §6.9 cross-language corpus
// ---------------------------------------------------------------------------

test('the canonical part-number chain matches the PHP builder corpus', () => {
    const compiled = new RegexBuilder().digits(3).literal('-').letters(2).compile();

    assert.equal(compiled.test('123-Ab'), true);
    // JS `$` without /m is strict end-of-string, so the PCRE trailing-\n
    // trap the PHP builder needs `D` for cannot occur — pinned anyway.
    assert.equal(compiled.test('123-Ab\n'), false);
    assert.equal(compiled.test('x123-Ab'), false);
    assert.equal(compiled.test('123-Abx'), false);
});

test('literals escape and oneOf means its alternatives', () => {
    const compiled = new RegexBuilder().oneOf('cat', 'dog', 'a.b').compile();

    assert.equal(compiled.test('cat'), true);
    assert.equal(compiled.test('a.b'), true);
    assert.equal(compiled.test('axb'), false);
});

test('nested unbounded quantifiers are refused without the opt-in', () => {
    assert.throws(() =>
        new RegexBuilder().oneOrMore((r) => r.oneOrMore((inner) => inner.letters(1))).compile(),
    );

    const allowed = new RegexBuilder()
        .dangerouslyUnbounded()
        .oneOrMore((r) => r.oneOrMore((inner) => inner.letters(1)))
        .compile();

    assert.equal(allowed.test('abc'), true);
});

test('a raw pattern is first-class and rule() feeds registerRule', () => {
    const raw = regex('^\\d{3}-[A-Za-z]{2}$');

    assert.equal(raw.compile().test('123-Ab'), true);
    assert.equal(raw.rule()('123-Ab', {}, {} as never), true);
    assert.equal(raw.rule()(123, {}, {} as never), false);
});

// ---------------------------------------------------------------------------
// i18n seam
// ---------------------------------------------------------------------------

test('locale maps resolve with region fallback and en as last resort', () => {
    const message = { en: 'Invalid.', de: 'Ungültig.' };

    assert.equal(resolveMessage(message, 'de-CH'), 'Ungültig.');
    assert.equal(resolveMessage(message, 'fr'), 'Invalid.');
    assert.equal(resolveMessage('Plain.', 'de'), 'Plain.');
});

test('pluralise follows the Laravel | conventions', () => {
    assert.equal(pluralise('one apple|many apples', 1), 'one apple');
    assert.equal(pluralise('one apple|many apples', 3), 'many apples');
    assert.equal(pluralise('{0} none|{1} one|[2,*] many', 0), 'none');
    assert.equal(pluralise('{0} none|{1} one|[2,*] many', 7), 'many');
});
