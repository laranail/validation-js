import { createValidator, type Validator, type ValidatorOptions } from '../createValidator.ts';
import type { Mode } from '../form/Scheduler.ts';
import { RemoteChannel } from '../transport/RemoteChannel.ts';
import { readSchemaIsland } from './island.ts';

/**
 * The declarative bridge for server-rendered stacks (§6.5): Blade, HTMX,
 * Turbo, Livewire pages. Mark a form and boot() wires it:
 *
 * ```html
 * <form data-laranail="signup" data-laranail-mode="eager">…</form>
 * <script type="application/json" data-laranail-schema="signup">…</script>
 * ```
 *
 * `boot()` scans, attaches (idempotently — createValidator replaces, never
 * stacks, so a partial swap that re-renders a form just re-inits it), and
 * listens for the swap events of each ecosystem: `htmx:afterSwap`,
 * `turbo:load`/`turbo:frame-load`, `livewire:navigated`. Under Livewire
 * the form must sit inside `wire:ignore` — Livewire morphs DOM it owns,
 * and a validator's painted messages inside morphed DOM are fought, not
 * kept (§5.9).
 */
export interface AutobootOptions extends ValidatorOptions {
    /** data-laranail-endpoint's default when the attribute is absent. */
    endpoint?: string;
    root?: Document;
}

export interface AutobootHandle {
    /** Scan a subtree now — what the swap listeners call for you. */
    scan(root?: ParentNode): Validator[];
    validators(): Validator[];
    /** Remove the swap listeners and destroy every attached validator. */
    stop(): void;
}

const SWAP_EVENTS = ['htmx:afterSwap', 'turbo:load', 'turbo:frame-load', 'livewire:navigated'];

export function boot(options: AutobootOptions = {}): AutobootHandle {
    const root = options.root ?? document;
    // Keyed by form: a re-scan of a live form REPLACES its entry, exactly
    // as createValidator replaces the validator underneath.
    const attached = new Map<HTMLFormElement, Validator>();

    const scan = (scope: ParentNode = root): Validator[] => {
        const created: Validator[] = [];

        for (const form of scope.querySelectorAll<HTMLFormElement>('form[data-laranail]')) {
            const id = form.getAttribute('data-laranail') ?? 'default';
            const schema = readSchemaIsland(id === '' ? 'default' : id, root);

            // No island, no takeover: the form keeps native constraints
            // and the server round-trip (§6.5's progressive floor).
            if (schema === null) continue;

            const mode = form.getAttribute('data-laranail-mode');
            const debounce = form.getAttribute('data-laranail-debounce');
            const endpoint = form.getAttribute('data-laranail-endpoint') ?? options.endpoint;

            const validator = createValidator(form, schema, {
                ...options,
                ...(mode !== null ? { mode: mode as Mode } : {}),
                ...(debounce !== null ? { debounce: Number(debounce) } : {}),
                ...(endpoint !== undefined && options.transport === undefined
                    ? { transport: new RemoteChannel(endpoint) }
                    : {}),
            });

            attached.set(form, validator);
            created.push(validator);
        }

        return created;
    };

    const onSwap = (event: Event): void => {
        const target = (event as CustomEvent<{ target?: unknown }>).detail?.target;
        scan(target instanceof Element ? (target.parentNode ?? root) : root);
        prune();
    };

    const prune = (): void => {
        for (const [form, validator] of attached) {
            // A validator whose form left the document on a swap leaks its
            // listeners forever; destroy is the only correct answer.
            if (!root.contains(form)) {
                validator.destroy();
                attached.delete(form);
            }
        }
    };

    for (const name of SWAP_EVENTS) root.addEventListener(name, onSwap);
    scan();

    return {
        scan,
        validators: () => [...attached.values()],
        stop: () => {
            for (const name of SWAP_EVENTS) root.removeEventListener(name, onSwap);
            for (const validator of attached.values()) validator.destroy();
            attached.clear();
        },
    };
}
