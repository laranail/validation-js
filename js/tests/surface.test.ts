import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../src/index.ts';

/**
 * The §12.1 boundary on the JS side, enforced the way the PHP side's
 * StabilityBoundaryTest enforces its half: the runtime's stable surface
 * is an explicit list, and the main entry point must export exactly it.
 * A new export is a deliberate act (add it here, document it, and it is
 * SemVer-covered from that moment); a removed or renamed export is a
 * major, and this test is what makes that a red build instead of a
 * silent break.
 */
const STABLE_EXPORTS = [
    // Engine
    'validate',
    'validateAsync',
    'interpolate',
    'SCHEMA_VERSION',
    'checks',
    'isEmpty',
    'sizeOf',
    'toRegExp',
    // Composition roots
    'createValidator',
    'createHeadless',
    'HeadlessForm',
    // Form runtime
    'FormController',
    'Scheduler',
    'pristine',
    'readControl',
    'readForm',
    'toName',
    'toPath',
    // Paths
    'capturedKeys',
    'expand',
    'get',
    'has',
    'substituteAsterisks',
    // Events
    'Emitter',
    // Rendering + plugins
    'ClassMapRenderer',
    'messageId',
    'headlessRenderer',
    'presets',
    'resolvers',
    'ResolverRegistry',
    // i18n
    'pluralise',
    'resolveMessage',
    // Transport
    'RemoteChannel',
] as const;

test('the main entry point exports exactly the stable surface', () => {
    const actual = Object.keys(api).sort();
    const expected = [...STABLE_EXPORTS].sort();

    assert.deepEqual(
        actual,
        expected,
        'js/src/index.ts and the stable-surface list disagree — adding an export is deliberate (list it here and document it); removing one is a major.',
    );
});

test('every stable export is a real value, not a dangling re-export', () => {
    for (const name of STABLE_EXPORTS) {
        assert.notEqual(
            (api as Record<string, unknown>)[name],
            undefined,
            `${name} is exported but undefined`,
        );
    }
});
