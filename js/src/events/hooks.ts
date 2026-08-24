/**
 * The hook pipeline — the JS mirror of the PHP side's before()/after():
 * ordered, removable transformations around the three moments a consumer
 * most wants to intervene in. A `beforeSubmit` hook returning `false`
 * vetoes the submit, which is how "confirm before send" composes without
 * a renderer.
 */
export interface Hooks {
    beforeValidate: Array<(field: string, value: unknown) => unknown>;
    afterValidate: Array<(field: string, errors: string[]) => string[]>;
    beforeSubmit: Array<(payload: Record<string, unknown>) => Record<string, unknown> | false>;
}

export function emptyHooks(): Hooks {
    return { beforeValidate: [], afterValidate: [], beforeSubmit: [] };
}

export function applyBeforeValidate(hooks: Hooks, field: string, value: unknown): unknown {
    return hooks.beforeValidate.reduce((current, hook) => hook(field, current), value);
}

export function applyAfterValidate(hooks: Hooks, field: string, errors: string[]): string[] {
    return hooks.afterValidate.reduce((current, hook) => hook(field, current), errors);
}

export function applyBeforeSubmit(
    hooks: Hooks,
    payload: Record<string, unknown>,
): Record<string, unknown> | false {
    let current = payload;

    for (const hook of hooks.beforeSubmit) {
        const result = hook(current);
        if (result === false) return false;
        current = result;
    }

    return current;
}

/**
 * Notifications stay THIN on purpose — a `notify` sink with a no-op
 * default. The live-region renderer subscribes to the same stream a
 * consumer can route to any toast library; UI frameworks are a renderer
 * concern, never core.
 */
export interface Notifier {
    notify(level: 'info' | 'error', event: string, detail: Record<string, unknown>): void;
}

export const silentNotifier: Notifier = { notify: () => {} };
