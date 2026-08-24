import type { ClassMapPreset } from './ClassMapRenderer.ts';

/**
 * Presets are DATA, not classes — supporting a CSS framework is exactly
 * one object here, and an application's own design system is a fourth one
 * it writes itself. Only the states a framework styles are listed;
 * unlisted states simply add nothing.
 */

export const vanilla: ClassMapPreset = {
    input: {
        invalid: 'ln-invalid',
        valid: 'ln-valid',
        validating: 'ln-validating',
    },
    message: { tag: 'div', classes: 'ln-error' },
    summary: { classes: 'ln-summary' },
};

export const bootstrap5: ClassMapPreset = {
    input: {
        invalid: 'is-invalid',
        valid: 'is-valid',
    },
    message: { tag: 'div', classes: 'invalid-feedback d-block' },
    summary: { classes: 'alert alert-danger' },
};

export const tailwind: ClassMapPreset = {
    input: {
        invalid: 'border-red-500 focus:ring-red-500',
        valid: 'border-green-500',
        validating: 'opacity-75',
    },
    message: { tag: 'p', classes: 'mt-1 text-sm text-red-600' },
    summary: { classes: 'rounded-md bg-red-50 p-4 text-sm text-red-700' },
};

export const bulma: ClassMapPreset = {
    input: {
        invalid: 'is-danger',
        valid: 'is-success',
    },
    message: { tag: 'p', classes: 'help is-danger' },
    summary: { classes: 'notification is-danger' },
};
