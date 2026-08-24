import { Emitter, type EventName, type Handler } from './events/Emitter.ts';
import { emptyHooks, type Hooks, type Notifier, silentNotifier } from './events/hooks.ts';
import type { FieldState } from './form/FieldState.ts';
import { FormController } from './form/FormController.ts';
import { type Mode, Scheduler } from './form/Scheduler.ts';
import { type LocalisedMessage, resolveMessage } from './i18n/messages.ts';
import { type InputResolver, ResolverRegistry } from './plugins/InputResolver.ts';
import { headlessRenderer, type Renderer } from './render/Renderer.ts';
import type { Check } from './rules.ts';
import type { RemoteChannel } from './transport/RemoteChannel.ts';
import type { Result, Schema, Values } from './types.ts';
import { type EngineOptions, validate, validateAsync } from './validate.ts';

/**
 * The composition root (§5.3): one factory, every collaborator injectable
 * with a working default, everything instance-scoped (§5.10). Attaching a
 * second validator to a form REPLACES the first (destroying it) rather
 * than double-binding — React StrictMode's double-effect, HMR and
 * Turbo/Livewire re-renders all hit this path, and a silent double-bind
 * is the classic way form libraries break there.
 */
export interface ValidatorOptions {
    renderer?: Renderer;
    resolvers?: InputResolver[];
    rules?: Record<string, Check>;
    messages?: Record<string, string>;
    mode?: Mode;
    debounce?: number;
    notifier?: Notifier;
    locale?: string;
    /** A RemoteChannel resolving undetermined fields through the server. */
    transport?: RemoteChannel;
}

export interface Plugin {
    install(api: {
        registerRule: (
            name: string,
            check: Check,
            options?: { message?: LocalisedMessage },
        ) => void;
        registerResolver: (resolver: InputResolver) => void;
        on: (name: EventName, handler: Handler) => () => void;
    }): void;
}

export interface Validator {
    readonly id: string;
    validate(): Promise<Result>;
    validateField(field: string): Promise<void>;
    submit(): Promise<boolean>;
    state(field: string): FieldState;
    explain(field: string): { state: FieldState; client: string[]; server: string[] };
    on(name: EventName, handler: Handler): () => void;
    use(plugin: Plugin): Validator;
    registerRule(name: string, check: Check, options?: { message?: LocalisedMessage }): void;
    destroy(): void;
    /** For the leak assertion: what would survive a destroy(). */
    leakReport(): { listeners: number; timers: number };
}

const attached = new WeakMap<HTMLFormElement, Validator>();
let counter = 0;

function nextId(): string {
    const scope = globalThis as { crypto?: { randomUUID?: () => string } };
    const unique = scope.crypto?.randomUUID?.() ?? String(++counter);

    return `laranail-${unique.slice(0, 8)}`;
}

export function createValidator(
    form: HTMLFormElement,
    schema: Schema,
    options: ValidatorOptions = {},
): Validator {
    // Idempotent attach: the previous instance is torn down completely
    // before the new one binds — replace, never stack.
    attached.get(form)?.destroy();

    const id = nextId();
    const locale = options.locale ?? 'en';
    const emitter = new Emitter(id, form);
    const scheduler = new Scheduler({
        ...(options.mode !== undefined ? { mode: options.mode } : {}),
        ...(options.debounce !== undefined ? { debounce: options.debounce } : {}),
    });
    const resolvers = new ResolverRegistry(options.resolvers ?? []);
    const hooks: Hooks = emptyHooks();
    const rules: Record<string, Check> = { ...options.rules };
    const ruleMessages: Record<string, string> = {};

    const controller = new FormController(form, {
        schema,
        emitter,
        scheduler,
        renderer: options.renderer ?? headlessRenderer,
        resolvers,
        hooks,
        notifier: options.notifier ?? silentNotifier,
        rules,
        ruleMessages,
        validatorId: id,
        transport: options.transport ?? null,
    });

    const registerRule = (
        name: string,
        check: Check,
        ruleOptions: { message?: LocalisedMessage } = {},
    ): void => {
        rules[name] = check;
        const message = resolveMessage(ruleOptions.message, locale);

        if (message !== undefined) {
            ruleMessages[name] = message;
        } else if (ruleOptions.message === undefined) {
            // Never a blank or a raw :placeholder — but say so where a
            // developer will see it.
            console.warn(
                `[laranail] client rule "${name}" registered without a message; failures will use the generic fallback.`,
            );
        }
    };

    if (options.messages !== undefined) {
        // Field-keyed overrides ride the engine's message merge; RULE-keyed
        // entries (no dot) register as rule fallbacks.
        for (const [key, message] of Object.entries(options.messages)) {
            if (!key.includes('.')) ruleMessages[key] = message;
        }
    }

    controller.attach();

    const validator: Validator = {
        id,
        validate: () => controller.validate(),
        validateField: (field) => controller.validateField(field),
        submit: () => controller.submit(),
        state: (field) => controller.state(field),
        explain: (field) => controller.explain(field),
        on: (name, handler) => emitter.on(name, handler),
        use(plugin) {
            plugin.install({
                registerRule,
                registerResolver: (resolver) => resolvers.register(resolver),
                on: (name, handler) => emitter.on(name, handler),
            });

            return validator;
        },
        registerRule,
        destroy() {
            controller.destroy();
            attached.delete(form);
        },
        leakReport: () => controller.leakReport,
    };

    attached.set(form, validator);

    return validator;
}

/**
 * The DOM-free facade (§6.10): the same instance-scoped rules and
 * messages over the bare engine, for SSR, workers, tests, and the
 * framework hooks that manage their own rendering.
 */
export function createHeadless(
    schema: Schema,
    options: Pick<ValidatorOptions, 'rules' | 'messages'> = {},
): {
    validate(values: Values): Result;
    validateAsync(values: Values): Promise<Result>;
    registerRule(name: string, check: Check): void;
} {
    const rules: Record<string, Check> = { ...options.rules };
    const engineOptions = (): EngineOptions => ({
        rules,
        ...(options.messages !== undefined ? { messages: options.messages } : {}),
    });

    return {
        validate: (values) => validate(values, schema, engineOptions()),
        validateAsync: (values) => validateAsync(values, schema, engineOptions()),
        registerRule: (name, check) => {
            rules[name] = check;
        },
    };
}
