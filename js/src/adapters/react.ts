import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import {
    HeadlessForm,
    type HeadlessFormOptions,
    type HeadlessSnapshot,
} from '../headless/HeadlessForm.ts';
import type { Result, Schema, Values } from '../types.ts';

/**
 * The React adapter (§5.9): a thin hook over {@link HeadlessForm} in the
 * react-hook-form shape — `getFieldProps`, `handleSubmit`, `errors`,
 * `touched`, `validating`. React owns the DOM; the library owns verdict
 * and state, delivered through `useSyncExternalStore` so tearing-free
 * under concurrent rendering.
 *
 * This is the OFFLINE-FIRST adapter — the engine decides the pure rules
 * with zero round-trip. For a Laravel round-trip on `unique`/`exists`,
 * compose with Precognition's own `laravel-precognition-react` (reused,
 * not reimplemented — §14.8) or hand this hook a `transport`.
 */
export interface FieldProps {
    name: string;
    value: string;
    onChange: (event: { target: { value: string; checked?: boolean; type?: string } }) => void;
    onBlur: () => void;
}

export interface UseValidationReturn extends HeadlessSnapshot {
    setValue(path: string, value: unknown): void;
    setErrors(errors: Record<string, string[]>): void;
    reset(values?: Values): void;
    validate(options?: { only?: string[] }): Promise<Result>;
    validateField(path: string): Promise<void>;
    getFieldProps(path: string): FieldProps;
    handleSubmit(
        onValid: (values: Values) => void | Promise<void>,
    ): (event?: { preventDefault?: () => void }) => Promise<void>;
    /** The underlying form, for anything the sugar does not cover. */
    form: HeadlessForm;
}

export function useValidation(
    schema: Schema,
    options: HeadlessFormOptions = {},
): UseValidationReturn {
    const ref = useRef<HeadlessForm | null>(null);
    const [, forceRender] = useReducer((n: number) => n + 1, 0);

    if (ref.current === null || ref.current.isDestroyed) {
        ref.current = new HeadlessForm(schema, options);
    }

    const form = ref.current;

    // StrictMode's shape is mount → cleanup → effect-again WITHOUT a
    // render in between, so the render-time recreate above never runs and
    // the surviving component would hold a destroyed form — every update
    // silently dropped. The effect re-run is the one hook that fires after
    // that cleanup: recreate there and force the render that rewires
    // subscriptions and callbacks to the fresh instance.
    useEffect(() => {
        if (ref.current === null || ref.current.isDestroyed) {
            ref.current = new HeadlessForm(schema, options);
            forceRender();
        }

        const live = ref.current;

        return () => live.destroy();
        // Recreate only on remount — a changed schema mid-life is a new form.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const snapshot = useSyncExternalStore(
        useCallback((listener: () => void) => form.subscribe(listener), [form]),
        () => form.snapshot(),
        () => form.snapshot(),
    );

    const getFieldProps = useCallback(
        (path: string): FieldProps => ({
            name: path,
            value: String(form.snapshot().values[path] ?? ''),
            onChange: (event) => {
                const target = event.target;
                form.setValue(path, target.type === 'checkbox' ? target.checked : target.value);
            },
            onBlur: () => {
                form.touch(path);
                void form.validateField(path);
            },
        }),
        [form],
    );

    const handleSubmit = useCallback(
        (onValid: (values: Values) => void | Promise<void>) =>
            async (event?: { preventDefault?: () => void }): Promise<void> => {
                event?.preventDefault?.();
                const result = await form.validate();

                // Undetermined fields do not block: the submit handler is
                // where the server gives the real answer (§6.8).
                if (result.valid) {
                    await onValid(form.snapshot().values);
                    return;
                }

                // A refused submit marks the failures touched, so a
                // touched-filtering UI reveals what stopped it.
                for (const failure of result.failures) form.touch(failure.field);
            },
        [form],
    );

    return {
        ...snapshot,
        setValue: (path, value) => form.setValue(path, value),
        setErrors: (errors) => form.setErrors(errors),
        reset: (values) => form.reset(values),
        validate: (validateOptions) => form.validate(validateOptions),
        validateField: (path) => form.validateField(path),
        getFieldProps,
        handleSubmit,
        form,
    };
}
