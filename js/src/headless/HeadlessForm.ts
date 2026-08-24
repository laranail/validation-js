import type { Check } from '../rules.ts';
import type { RemoteOutcome } from '../transport/RemoteChannel.ts';
import type { Result, Schema, Values } from '../types.ts';
import { type EngineOptions, validateAsync } from '../validate.ts';

/**
 * The stateful DOM-free form (§5.9): values in, verdict-and-state out. This
 * is the substrate the framework adapters wrap — React, Vue, a Nova custom
 * field — where the framework owns rendering and this class owns exactly
 * `values → { valid, errors, touched, validating, undetermined }`. It never
 * touches the DOM; a DOM-mutating validator fights the reconciler, a
 * state-out one composes with it.
 *
 * The snapshot is REPLACED on change and stable between changes, which is
 * the contract `useSyncExternalStore` (and any subscribe-based reactivity)
 * needs to avoid render loops.
 */
export interface HeadlessSnapshot {
    values: Values;
    /** No known client failure. NOT "the server will accept it". */
    valid: boolean;
    errors: Record<string, string[]>;
    touched: Record<string, boolean>;
    validating: boolean;
    /** Fields only the server can decide, minus those a transport settled. */
    undetermined: string[];
}

/**
 * What the facade needs from a transport — `RemoteChannel` satisfies it,
 * and a test (or a Nova field with its own fetch discipline) can hand in
 * anything with the same shape.
 */
export interface RemoteTransport {
    resolve(values: Record<string, unknown>, fields: string[]): Promise<RemoteOutcome>;
    abort(): void;
}

export interface HeadlessFormOptions {
    values?: Values;
    rules?: Record<string, Check>;
    messages?: Record<string, string>;
    transport?: RemoteTransport;
}

export class HeadlessForm {
    private readonly schema: Schema;
    private readonly rules: Record<string, Check>;
    private readonly messages: Record<string, string> | undefined;
    private readonly transport: RemoteTransport | null;
    private readonly listeners = new Set<() => void>();
    private readonly sequence = new Map<string, number>();

    private values: Values;
    private errors: Record<string, string[]> = {};
    private touched: Record<string, boolean> = {};
    private undetermined: string[] = [];
    private inFlight = 0;
    private epoch = 0;
    private destroyed = false;
    private current: HeadlessSnapshot;

    constructor(schema: Schema, options: HeadlessFormOptions = {}) {
        this.schema = schema;
        this.rules = { ...options.rules };
        this.messages = options.messages;
        this.transport = options.transport ?? null;
        this.values = { ...options.values };
        this.current = this.build();
    }

    snapshot(): HeadlessSnapshot {
        return this.current;
    }

    /** True after destroy(); adapters recreate instead of reviving. */
    get isDestroyed(): boolean {
        return this.destroyed;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    setValue(path: string, value: unknown): void {
        if (this.destroyed) return;
        this.values = { ...this.values, [path]: value };
        this.publish();
    }

    setValues(values: Values): void {
        if (this.destroyed) return;
        this.values = { ...this.values, ...values };
        this.publish();
    }

    touch(path: string): void {
        if (this.destroyed) return;
        this.touched = { ...this.touched, [path]: true };
        this.publish();
    }

    /**
     * Merge a server 422 map onto the form — the fields are marked touched
     * so a touched-filtering UI shows what the server said.
     */
    setErrors(errors: Record<string, string[]>): void {
        if (this.destroyed) return;
        this.errors = { ...this.errors, ...errors };

        for (const field of Object.keys(errors)) {
            this.touched = { ...this.touched, [field]: true };
        }

        this.publish();
    }

    /**
     * The whole form. `only` narrows what is REPORTED — everything is still
     * evaluated, so cross-field rules see the full picture — which is the
     * wizard/step case (§6.5), in Precognition's own vocabulary.
     */
    async validate(options: { only?: string[] } = {}): Promise<Result> {
        const epoch = this.epoch;
        const result = await this.run();
        if (this.destroyed || epoch !== this.epoch) return result;

        const only = options.only;
        const scope = only === undefined ? null : new Set(only);

        this.apply(result, scope);
        this.publish();

        return result;
    }

    /**
     * One field: the form is EVALUATED whole, the outcome APPLIED to this
     * field plus fields already showing errors — fixing A clears A without
     * painting a failure onto untouched B. Latest-wins per field.
     */
    async validateField(path: string): Promise<void> {
        const token = (this.sequence.get(path) ?? 0) + 1;
        this.sequence.set(path, token);
        const epoch = this.epoch;

        const result = await this.run();
        if (this.destroyed || epoch !== this.epoch || this.sequence.get(path) !== token) return;

        const scope = new Set([path, ...Object.keys(this.errors)]);
        this.apply(result, scope);
        this.publish();

        const undecided = result.undetermined.filter((name) => scope.has(name));

        if (this.transport !== null && undecided.length > 0) {
            await this.resolveRemotely(undecided, token, path, epoch);
        }
    }

    reset(values: Values = {}): void {
        if (this.destroyed) return;
        // A bumped epoch invalidates every in-flight evaluation — a slow
        // check finished after a reset must not repaint the cleared form.
        this.epoch += 1;
        this.values = { ...values };
        this.errors = {};
        this.touched = {};
        this.undetermined = [];
        this.publish();
    }

    destroy(): void {
        this.destroyed = true;
        this.epoch += 1;
        this.transport?.abort();
        this.listeners.clear();
    }

    // ------------------------------------------------------------------

    private async run(): Promise<Result> {
        this.inFlight += 1;
        this.publish();

        try {
            const options: EngineOptions = {
                rules: this.rules,
                ...(this.messages !== undefined ? { messages: this.messages } : {}),
            };

            return await validateAsync(this.values, this.schema, options);
        } finally {
            this.inFlight -= 1;
            this.publish();
        }
    }

    private apply(result: Result, scope: Set<string> | null): void {
        const next: Record<string, string[]> = scope === null ? {} : { ...this.errors };

        if (scope !== null) {
            for (const field of scope) delete next[field];
        }

        for (const failure of result.failures) {
            if (scope !== null && !scope.has(failure.field)) continue;
            (next[failure.field] ??= []).push(failure.message);
        }

        this.errors = next;
        this.undetermined =
            scope === null
                ? [...result.undetermined]
                : [
                      ...this.undetermined.filter((field) => !scope.has(field)),
                      ...result.undetermined.filter((field) => scope.has(field)),
                  ];
    }

    private async resolveRemotely(
        fields: string[],
        token: number,
        triggering: string,
        epoch: number,
    ): Promise<void> {
        const transport = this.transport;
        if (transport === null) return;

        this.inFlight += 1;
        this.publish();

        let outcome: RemoteOutcome;

        try {
            outcome = await transport.resolve({ ...this.values }, fields);
        } finally {
            this.inFlight -= 1;
        }

        if (
            this.destroyed ||
            epoch !== this.epoch ||
            this.sequence.get(triggering) !== token ||
            outcome.kind === 'stale'
        ) {
            this.publish();
            return;
        }

        if (outcome.kind === 'unreachable') {
            // Degradable, never fail-open: the fields stay undetermined and
            // no verdict is manufactured in either direction (§10.12).
            this.publish();
            return;
        }

        const errors = { ...this.errors };
        const settled = new Set(fields);

        for (const field of fields) {
            const serverErrors = outcome.kind === 'failures' ? (outcome.errors[field] ?? []) : [];

            if (serverErrors.length > 0) errors[field] = serverErrors;
            else delete errors[field];
        }

        this.errors = errors;
        this.undetermined = this.undetermined.filter((field) => !settled.has(field));
        this.publish();
    }

    private build(): HeadlessSnapshot {
        return {
            values: this.values,
            valid: Object.keys(this.errors).length === 0,
            errors: this.errors,
            touched: this.touched,
            validating: this.inFlight > 0,
            undetermined: this.undetermined,
        };
    }

    private publish(): void {
        const next = this.build();
        const previous = this.current;

        if (
            next.values === previous.values &&
            next.errors === previous.errors &&
            next.touched === previous.touched &&
            next.undetermined === previous.undetermined &&
            next.validating === previous.validating
        ) {
            return;
        }

        this.current = next;

        for (const listener of [...this.listeners]) listener();
    }
}
