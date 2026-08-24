/**
 * When validation actually runs — the four modes and the per-field
 * debounce, isolated from WHAT runs so the timing rules are testable
 * without a DOM.
 *
 * The a11y contract (§11) is encoded here, not left to callers:
 *
 * - `submit`: only on submit.
 * - `blur`: on blur, and on submit.
 * - `change`: on every change (debounced), blur and submit.
 * - `eager` (default): on blur first; after a field has FAILED once,
 *   re-validate on input (debounced) so the user watches the error clear —
 *   but never on first keypress in an untouched field, which is the
 *   noisiest thing a form can do.
 */
export type Mode = 'submit' | 'blur' | 'change' | 'eager';

export interface SchedulerOptions {
    mode?: Mode;
    /** Debounce for input-driven validation, ms. */
    debounce?: number;
    /** Injectable clock for tests: setTimeout/clearTimeout lookalikes. */
    setTimeout?: (handler: () => void, ms: number) => unknown;
    clearTimeout?: (token: unknown) => void;
}

export class Scheduler {
    private readonly mode: Mode;
    private readonly delay: number;
    private readonly set: (handler: () => void, ms: number) => unknown;
    private readonly clear: (token: unknown) => void;
    private readonly timers = new Map<string, unknown>();
    private readonly failedOnce = new Set<string>();

    constructor(options: SchedulerOptions = {}) {
        this.mode = options.mode ?? 'eager';
        this.delay = options.debounce ?? 300;
        this.set = options.setTimeout ?? ((handler, ms) => setTimeout(handler, ms));
        this.clear = options.clearTimeout ?? ((token) => clearTimeout(token as number));
    }

    /** Should a BLUR of this field validate it? Every mode but submit-only. */
    shouldValidateOnBlur(): boolean {
        return this.mode !== 'submit';
    }

    /** Should an INPUT event on this field schedule a validation? */
    shouldValidateOnInput(field: string): boolean {
        if (this.mode === 'change') return true;
        if (this.mode === 'eager') return this.failedOnce.has(field);

        return false;
    }

    /** Record a failure so eager mode starts re-validating this field on input. */
    recordFailure(field: string): void {
        this.failedOnce.add(field);
    }

    recordSuccess(field: string): void {
        // Deliberately NOT removed from failedOnce: once a field has failed,
        // eager mode keeps live feedback on so the user sees a regression
        // immediately rather than at the next blur.
    }

    /**
     * Debounce `run` for this field. A newer call cancels the older one —
     * per FIELD, so typing in one input never delays another's check.
     */
    schedule(field: string, run: () => void): void {
        this.cancel(field);
        this.timers.set(
            field,
            this.set(() => {
                this.timers.delete(field);
                run();
            }, this.delay),
        );
    }

    cancel(field: string): void {
        const token = this.timers.get(field);

        if (token !== undefined) {
            this.clear(token);
            this.timers.delete(field);
        }
    }

    /** Every timer down — destroy() calls this; a leak here is a §5.10 bug. */
    cancelAll(): void {
        for (const token of this.timers.values()) this.clear(token);
        this.timers.clear();
        this.failedOnce.clear();
    }

    /** How many timers are live — the leak assertion reads this. */
    get pendingCount(): number {
        return this.timers.size;
    }
}
