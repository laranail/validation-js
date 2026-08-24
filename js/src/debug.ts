import type { Validator } from './createValidator.ts';
import type { FieldState } from './form/FieldState.ts';
import type { Result } from './types.ts';

/**
 * Structured console tracing (§5.8): why did this field fail, and — the
 * question that actually costs debugging time — why is it UNDETERMINED?
 * A separate module rather than a `debug: true` flag so it tree-shakes by
 * absence: production bundles that never import `./debug` carry zero
 * bytes of it.
 *
 * ```js
 * import { attachDebug } from '@laranail/validation-js/debug';
 * const detach = attachDebug(validator);
 * ```
 */
export interface DebugConsole {
    groupCollapsed(...args: unknown[]): void;
    groupEnd(): void;
    log(...args: unknown[]): void;
    info(...args: unknown[]): void;
}

export function attachDebug(
    validator: Validator,
    options: { console?: DebugConsole; label?: string } = {},
): () => void {
    const out = options.console ?? console;
    const label = options.label ?? validator.id;
    const offs: Array<() => void> = [];

    offs.push(
        validator.on('field:validated', (detail) => {
            const { field, state } = detail as { field: string; state?: FieldState };
            const explained = validator.explain(field);

            out.groupCollapsed(`[laranail:${label}] ${field} → ${state?.status ?? 'unknown'}`);
            out.log('client rules', explained.client);
            out.log('server rules', explained.server);

            if (state?.status === 'invalid') out.log('errors', state.errors);

            if (state?.status === 'undetermined') {
                out.info(
                    state.reason === 'transient'
                        ? 'undetermined (transient): the remote channel could not answer — the server decides on submit.'
                        : 'undetermined (structural): this field carries rules only the server can evaluate: ' +
                              explained.server.join(', '),
                );
            }

            out.groupEnd();
        }),
    );

    offs.push(
        validator.on('form:validated', (detail) => {
            const { result } = detail as { result?: Result };
            if (result === undefined) return;

            out.groupCollapsed(
                `[laranail:${label}] form → ${result.valid ? 'valid' : 'invalid'}` +
                    (result.undetermined.length > 0
                        ? ` (${result.undetermined.length} undetermined)`
                        : ''),
            );
            out.log('failures', result.failures);
            out.log('undetermined', result.undetermined);
            out.groupEnd();
        }),
    );

    offs.push(
        validator.on('remote:settled', (detail) => {
            out.log(`[laranail:${label}] remote settled`, detail);
        }),
    );

    return () => {
        for (const off of offs) off();
    };
}
