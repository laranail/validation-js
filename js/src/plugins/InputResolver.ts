/**
 * The archive's best contract, carried forward in shape: an enhanced
 * widget (select2, flatpickr, …) hides its real input, and a resolver
 * teaches the runtime where the VALUE lives, which element counts as the
 * WRAPPER for error placement and state classes, and which EVENTS mean
 * "the user changed something".
 *
 * Registry-based and zero-cost when absent: the first resolver whose
 * `detect` answers wins; no resolver means the plain DOM reading applies.
 * Third parties register theirs through `validator.use()` — never by
 * editing core.
 */
export interface InputResolver {
    /** A short name, for diagnostics. */
    name: string;
    detect(element: Element): boolean;
    getValue(element: Element): unknown;
    getWrapper(element: Element): Element | null;
    /** DOM event names that should trigger (debounced) validation. */
    events(element: Element): string[];
}

export class ResolverRegistry {
    private readonly resolvers: InputResolver[] = [];

    constructor(initial: InputResolver[] = []) {
        this.resolvers.push(...initial);
    }

    register(resolver: InputResolver): void {
        this.resolvers.push(resolver);
    }

    resolve(element: Element): InputResolver | null {
        return this.resolvers.find((resolver) => resolver.detect(element)) ?? null;
    }
}
