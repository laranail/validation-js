import { createValidator, type Validator, type ValidatorOptions } from '../createValidator.ts';
import { readSchemaIsland } from './island.ts';

/**
 * The Alpine bridge (§6.5): `Alpine.plugin(laranailAlpine())` registers a
 * `laranailForm` component and a `$laranail` magic. Alpine is a DOM-owning
 * context in the §5.9 matrix, so the bridge drives the full
 * `FormController` path — the component finds its `<form>`, reads the
 * schema island by id, and owns the validator's lifecycle alongside its
 * own.
 *
 * ```html
 * <form x-data="laranailForm('signup')">…</form>
 * ```
 *
 * Component names evaluate inside `x-data` as JavaScript, so the name is
 * camelCase (`laranailForm`) per the org naming rules — a hyphen would
 * parse as subtraction.
 */
interface AlpineLike {
    data(name: string, component: (...args: unknown[]) => Record<string, unknown>): void;
    magic(name: string, fn: (el: Element) => unknown): void;
}

const byForm = new WeakMap<HTMLFormElement, Validator>();

export function laranailAlpine(defaults: ValidatorOptions = {}): (alpine: AlpineLike) => void {
    return (alpine) => {
        alpine.data('laranailForm', function laranailForm(this: { $el: Element }, ...args) {
            const schemaId = typeof args[0] === 'string' ? args[0] : 'default';
            const options = (args[1] ?? {}) as ValidatorOptions;

            return {
                validator: null as Validator | null,

                init(this: { $el: Element; validator: Validator | null }) {
                    const form =
                        this.$el instanceof HTMLFormElement
                            ? this.$el
                            : this.$el.querySelector('form');
                    if (form === null) return;

                    const schema = readSchemaIsland(schemaId, this.$el.ownerDocument);
                    if (schema === null) return;

                    this.validator = createValidator(form, schema, { ...defaults, ...options });
                    byForm.set(form, this.validator);
                },

                destroy(this: { $el: Element; validator: Validator | null }) {
                    this.validator?.destroy();
                    this.validator = null;
                },
            };
        });

        // Registered WITHOUT the dollar — Alpine prefixes magics itself,
        // so 'laranail' is what makes `$laranail` resolve.
        alpine.magic('laranail', (el) => byForm.get(el.closest('form') as HTMLFormElement) ?? null);
    };
}
