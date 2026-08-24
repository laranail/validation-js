import { type ComputedRef, computed, getCurrentInstance, onBeforeUnmount, shallowRef } from 'vue';
import {
    HeadlessForm,
    type HeadlessFormOptions,
    type HeadlessSnapshot,
} from '../headless/HeadlessForm.ts';
import type { Result, Schema, Values } from '../types.ts';

/**
 * The Vue 3 composable (§5.9): reactive refs over {@link HeadlessForm} in
 * the VeeValidate shape. Vue owns the DOM; the library owns verdict and
 * state — a `shallowRef` swaps the whole immutable snapshot, so reactivity
 * costs one trigger per change, not a deep watch.
 *
 * Offline-first by design; compose with `laravel-precognition-vue`
 * (reused, not reimplemented — §14.8) or a `transport` for the server
 * round-trip rules.
 */
export interface UseValidationReturn {
    values: ComputedRef<Values>;
    errors: ComputedRef<Record<string, string[]>>;
    touched: ComputedRef<Record<string, boolean>>;
    validating: ComputedRef<boolean>;
    undetermined: ComputedRef<string[]>;
    valid: ComputedRef<boolean>;
    setValue(path: string, value: unknown): void;
    setErrors(errors: Record<string, string[]>): void;
    reset(values?: Values): void;
    validate(options?: { only?: string[] }): Promise<Result>;
    validateField(path: string): Promise<void>;
    touch(path: string): void;
    /** v-model glue: `:value="values.email"` + `@input="onInput('email', $event)"`. */
    onInput(path: string, event: { target: { value: string } }): void;
    onBlur(path: string): void;
    /** The underlying form, for anything the sugar does not cover. */
    form: HeadlessForm;
}

export function useValidation(
    schema: Schema,
    options: HeadlessFormOptions = {},
): UseValidationReturn {
    const form = new HeadlessForm(schema, options);
    const state = shallowRef<HeadlessSnapshot>(form.snapshot());
    const stop = form.subscribe(() => {
        state.value = form.snapshot();
    });

    // Outside a component (a test, a plain script) there is nothing to
    // unmount from; the caller owns form.destroy() there.
    if (getCurrentInstance() !== null) {
        onBeforeUnmount(() => {
            stop();
            form.destroy();
        });
    }

    return {
        values: computed(() => state.value.values),
        errors: computed(() => state.value.errors),
        touched: computed(() => state.value.touched),
        validating: computed(() => state.value.validating),
        undetermined: computed(() => state.value.undetermined),
        valid: computed(() => state.value.valid),
        setValue: (path, value) => form.setValue(path, value),
        setErrors: (errors) => form.setErrors(errors),
        reset: (values) => form.reset(values),
        validate: (validateOptions) => form.validate(validateOptions),
        validateField: (path) => form.validateField(path),
        touch: (path) => form.touch(path),
        onInput: (path, event) => form.setValue(path, event.target.value),
        onBlur: (path) => {
            form.touch(path);
            void form.validateField(path);
        },
        form,
    };
}
