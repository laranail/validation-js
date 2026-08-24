import { Emitter } from '../events/Emitter.ts';
import type { Hooks, Notifier } from '../events/hooks.ts';
import { applyAfterValidate, applyBeforeSubmit, applyBeforeValidate } from '../events/hooks.ts';
import type { ResolverRegistry } from '../plugins/InputResolver.ts';
import { messageId } from '../render/ClassMapRenderer.ts';
import type { Renderer } from '../render/Renderer.ts';
import type { Check } from '../rules.ts';
import type { RemoteChannel } from '../transport/RemoteChannel.ts';
import type { Result, Schema } from '../types.ts';
import { validateAsync } from '../validate.ts';
import { type FieldState, pristine } from './FieldState.ts';
import { readForm, toName, toPath } from './NameMapper.ts';
import { Scheduler } from './Scheduler.ts';

/**
 * Layer 1: binds a real form to the engine and owns everything the engine
 * deliberately does not — WHEN validation runs (Scheduler), what the user
 * has touched (FieldState), how failures are painted (Renderer, injected)
 * and announced (a11y, HERE in core so no renderer can un-ship it).
 *
 * Everything is instance state; the §5.10 guarantee is structural. Four
 * delegated listeners bind the whole form, and destroy() removes exactly
 * those four plus every timer, aria attribute and generated element —
 * SPA route changes create and destroy validators repeatedly, so the
 * teardown path is a correctness requirement with its own test.
 */
export interface ControllerDeps {
    schema: Schema;
    emitter: Emitter;
    scheduler: Scheduler;
    renderer: Renderer;
    resolvers: ResolverRegistry;
    hooks: Hooks;
    notifier: Notifier;
    rules: Record<string, Check>;
    ruleMessages: Record<string, string>;
    validatorId: string;
    /** Optional: resolves undetermined fields through the server (§5.7). */
    transport: RemoteChannel | null;
}

export class FormController {
    private readonly states = new Map<string, FieldState>();
    private readonly sequence = new Map<string, number>();
    private readonly listeners: Array<[string, EventListener]> = [];
    private readonly describedByUs = new Set<Element>();
    private liveRegion: HTMLElement | null = null;
    private destroyed = false;
    private addedNovalidate = false;

    private readonly form: HTMLFormElement;
    private readonly deps: ControllerDeps;

    constructor(form: HTMLFormElement, deps: ControllerDeps) {
        this.form = form;
        this.deps = deps;
    }

    attach(): void {
        // Progressive enhancement is the floor (§6.5): native HTML5
        // constraints own the form until the runtime is REALLY attached —
        // if this script never runs, nothing was taken away. Only what we
        // set do we take back on destroy.
        if (!this.form.hasAttribute('novalidate')) {
            this.form.setAttribute('novalidate', '');
            this.addedNovalidate = true;
        }

        this.listen('focusout', (event) => {
            const field = this.fieldFrom(event.target);
            if (field === null) return;

            this.touch(field);

            if (this.deps.scheduler.shouldValidateOnBlur()) void this.validateField(field);
        });

        const onInput = (event: Event): void => {
            const field = this.fieldFrom(event.target);
            if (field === null) return;

            this.markDirty(field);

            if (this.deps.scheduler.shouldValidateOnInput(field)) {
                this.deps.scheduler.schedule(field, () => void this.validateField(field));
            }
        };

        this.listen('input', onInput);
        this.listen('change', onInput);

        this.listen('submit', (event) => {
            event.preventDefault();
            void this.submit(event);
        });
    }

    /**
     * The engine's verdict for the whole form, through the hook pipeline.
     * `only` narrows what is REPORTED to those fields (the wizard/step
     * case, §6.5) — everything is still evaluated, so cross-field rules
     * see the full picture, exactly Precognition's validate-only shape.
     */
    async validate(options: { only?: string[] } = {}): Promise<Result> {
        const values = this.collect();
        const result = await validateAsync(values, this.effectiveSchema(), {
            rules: this.deps.rules,
        });

        this.applyResult(result, options.only === undefined ? null : new Set(options.only));
        this.deps.emitter.emit('form:validated', { valid: result.valid, result });

        return result;
    }

    async validateField(field: string): Promise<void> {
        const token = (this.sequence.get(field) ?? 0) + 1;
        this.sequence.set(field, token);

        this.transition(field, (state) => ({ ...state, status: 'validating' }));
        this.deps.emitter.emit('field:validating', { field }, { element: this.controlFor(field) });

        // The whole form is EVALUATED (cross-field rules need the full
        // picture) but only the triggered field's outcome — plus fields the
        // user has already seen feedback on — is APPLIED. Painting an
        // untouched field's failure because its neighbour blurred is the
        // noisiest thing a form can do, and §11 forbids it.
        const values = this.collect();
        const result = await validateAsync(values, this.effectiveSchema(), {
            rules: this.deps.rules,
        });

        // Latest-wins: a slower older check must never overwrite what a
        // newer keystroke's check decided — the stale-response race, closed
        // with a monotonic token per field rather than trust in timing.
        if (this.sequence.get(field) !== token || this.destroyed) return;

        const scope = new Set([field]);

        for (const [seen, state] of this.states) {
            if (state.status !== 'pristine' && state.status !== 'validating') scope.add(seen);
        }
        scope.add(field);

        this.applyResult(result, scope);
        this.deps.emitter.emit(
            'field:validated',
            { field, state: this.states.get(field) },
            { element: this.controlFor(field) },
        );

        // Live remote resolution for what the engine could not decide —
        // narrowed to the scope so an untouched field is never probed. On
        // SUBMIT the channel deliberately stays quiet: undetermined fields
        // submit normally and the real request is the server's last word.
        const undecided = result.undetermined.filter((name) => scope.has(name));

        if (this.deps.transport !== null && undecided.length > 0) {
            await this.resolveRemotely(values, undecided, token, field);
        }
    }

    private async resolveRemotely(
        values: Record<string, unknown>,
        fields: string[],
        token: number,
        triggering: string,
    ): Promise<void> {
        const transport = this.deps.transport;
        if (transport === null) return;

        for (const name of fields) {
            this.transition(name, (state) => ({ ...state, status: 'validating' }));
        }

        this.deps.emitter.emit('remote:start', { fields });
        const outcome = await transport.resolve(values, fields);

        // Latest-wins mirrors the sync path; a stale abort paints nothing.
        if (outcome.kind === 'stale' || this.destroyed || this.sequence.get(triggering) !== token) {
            return;
        }

        this.deps.emitter.emit('remote:settled', { fields, outcome: outcome.kind });

        for (const name of fields) {
            const control = this.controlFor(name);
            const ctx = {
                form: this.form,
                input: control,
                wrapper:
                    control === null
                        ? null
                        : (this.deps.resolvers.resolve(control)?.getWrapper(control) ?? null),
                validatorId: this.deps.validatorId,
            };

            if (outcome.kind === 'failures' && (outcome.errors[name]?.length ?? 0) > 0) {
                const errors = outcome.errors[name] as string[];
                this.deps.scheduler.recordFailure(name);
                this.transition(name, (state) => ({ ...state, status: 'invalid', errors }));
                this.deps.renderer.showErrors(name, errors, ctx);
                this.deps.renderer.setFieldState(name, 'invalid', ctx);
                this.markInvalid(control, name);
                this.announce(errors[0] ?? '');
                continue;
            }

            if (outcome.kind === 'unreachable') {
                // Degradable, never fail-open: the field stays undetermined
                // with the retriable reason, and the failure is reported —
                // §10.12.
                this.transition(name, (state) => ({
                    ...state,
                    status: 'undetermined',
                    errors: [],
                    reason: 'transient',
                }));
                this.deps.renderer.setFieldState(name, 'undetermined', ctx);
                continue;
            }

            // 'clean': the server validated exactly these fields and found
            // nothing — the one moment an undetermined field earns 'valid'.
            this.deps.renderer.clearErrors(name, ctx);
            this.clearInvalid(control);
            this.transition(name, (state) => ({ ...state, status: 'valid', errors: [] }));
            this.deps.renderer.setFieldState(name, 'valid', ctx);
        }

        if (outcome.kind === 'unreachable') {
            this.deps.emitter.emit('form:error', { transport: true, fields });
            this.deps.notifier.notify('error', 'remote:unreachable', { fields });
        }
    }

    async submit(sourceEvent?: Event): Promise<boolean> {
        const result = await this.validate();
        const payload = applyBeforeSubmit(this.deps.hooks, this.collect());

        if (payload === false || !result.valid) {
            if (!result.valid) {
                this.deps.renderer.renderSummary(
                    result.failures.map(({ field, message }) => ({ field, message })),
                    this.form,
                );
                this.focusFirstInvalid(result);
                this.announce(result.failures[0]?.message ?? '');
            }

            this.deps.emitter.emit('form:error', { failures: result.failures });
            this.deps.notifier.notify('error', 'form:error', { failures: result.failures });

            return false;
        }

        const allowed = this.deps.emitter.emit(
            'form:submit',
            { values: payload },
            { cancelable: true },
        );

        if (allowed && sourceEvent !== undefined) {
            // Re-dispatching would loop; native submission is explicit.
            this.form.submit();
        }

        return allowed;
    }

    /**
     * Map a real submit's 422 back onto the fields (§6.5 server-error
     * re-mapping) — server-only rules surface in the same UI, through the
     * same renderer and aria plumbing, as any client failure.
     */
    setErrors(errors: Record<string, string[]>): void {
        for (const [field, messages] of Object.entries(errors)) {
            if (messages.length === 0) continue;

            const control = this.controlFor(field);
            const ctx = {
                form: this.form,
                input: control,
                wrapper:
                    control === null
                        ? null
                        : (this.deps.resolvers.resolve(control)?.getWrapper(control) ?? null),
                validatorId: this.deps.validatorId,
            };

            this.deps.scheduler.recordFailure(field);
            this.transition(field, (state) => ({ ...state, status: 'invalid', errors: messages }));
            this.deps.renderer.showErrors(field, messages, ctx);
            this.deps.renderer.setFieldState(field, 'invalid', ctx);
            this.markInvalid(control, field);
        }

        const first = Object.values(errors).find((messages) => messages.length > 0);
        this.announce(first?.[0] ?? '');
    }

    /**
     * Re-sync with a mutated DOM (§6.5 repeater rows, HTMX/Turbo partial
     * swaps): state for a field whose control is gone is cleared — painted
     * message, timers, sequence and all — instead of leaking. New rows need
     * nothing here; the four listeners are delegated on the form, so a
     * control that appears is live the moment it exists.
     */
    refresh(): void {
        for (const field of [...this.states.keys()]) {
            if (this.controlFor(field) !== null) continue;

            this.deps.scheduler.cancel(field);
            this.deps.renderer.clearErrors(field, {
                form: this.form,
                input: null,
                wrapper: null,
                validatorId: this.deps.validatorId,
            });
            this.states.delete(field);
            this.sequence.delete(field);
        }
    }

    explain(field: string): { state: FieldState; client: string[]; server: string[] } {
        const definition = Object.entries(this.deps.schema.fields).find(
            ([pattern]) => pattern === field || matchesPattern(pattern, field),
        )?.[1];

        return {
            state: this.states.get(field) ?? pristine(),
            client: definition?.client.map((rule) => rule.rule) ?? [],
            server: definition?.server ?? [],
        };
    }

    state(field: string): FieldState {
        return this.states.get(field) ?? pristine();
    }

    destroy(): void {
        this.destroyed = true;

        for (const [name, listener] of this.listeners) {
            this.form.removeEventListener(name, listener);
        }
        this.listeners.length = 0;

        this.deps.scheduler.cancelAll();
        this.deps.transport?.abort();
        this.deps.renderer.destroy();

        for (const element of this.describedByUs) {
            element.removeAttribute('aria-invalid');
            this.stripOurDescribedBy(element);
        }
        this.describedByUs.clear();

        this.liveRegion?.remove();
        this.liveRegion = null;
        this.states.clear();
        this.sequence.clear();

        if (this.addedNovalidate) {
            this.form.removeAttribute('novalidate');
            this.addedNovalidate = false;
        }
    }

    /** How many listeners/timers are live — the leak assertion reads these. */
    get leakReport(): { listeners: number; timers: number } {
        return { listeners: this.listeners.length, timers: this.deps.scheduler.pendingCount };
    }

    // ------------------------------------------------------------------

    private collect(): Record<string, unknown> {
        const values = readForm(this.form);

        for (const field of Object.keys(values)) {
            values[field] = applyBeforeValidate(this.deps.hooks, field, values[field]);
        }

        return values;
    }

    /** `scope === null` applies everything (submit); a Set limits painting. */
    private applyResult(result: Result, scope: Set<string> | null): void {
        const failuresByField = new Map<string, string[]>();

        for (const failure of result.failures) {
            const messages = failuresByField.get(failure.field) ?? [];
            messages.push(this.resolveMessage(failure.rule, failure.message, failure.field));
            failuresByField.set(failure.field, messages);
        }

        const seen = new Set<string>([
            ...failuresByField.keys(),
            ...result.undetermined,
            ...this.states.keys(),
        ]);

        for (const field of seen) {
            if (scope !== null && !scope.has(field)) continue;
            const control = this.controlFor(field);
            const ctx = {
                form: this.form,
                input: control,
                wrapper:
                    control === null
                        ? null
                        : (this.deps.resolvers.resolve(control)?.getWrapper(control) ?? null),
                validatorId: this.deps.validatorId,
            };

            const errors = applyAfterValidate(
                this.deps.hooks,
                field,
                failuresByField.get(field) ?? [],
            );

            if (errors.length > 0) {
                this.deps.scheduler.recordFailure(field);
                this.transition(field, (state) => ({ ...state, status: 'invalid', errors }));
                this.deps.renderer.showErrors(field, errors, ctx);
                this.deps.renderer.setFieldState(field, 'invalid', ctx);
                this.markInvalid(control, field);
                this.announce(errors[0] ?? '');
                continue;
            }

            this.deps.renderer.clearErrors(field, ctx);
            this.clearInvalid(control);

            if (result.undetermined.includes(field)) {
                this.transition(field, (state) => ({
                    ...state,
                    status: 'undetermined',
                    errors: [],
                    reason: 'structural',
                }));
                this.deps.renderer.setFieldState(field, 'undetermined', ctx);
                continue;
            }

            this.deps.scheduler.recordSuccess(field);
            this.transition(field, (state) => ({ ...state, status: 'valid', errors: [] }));
            this.deps.renderer.setFieldState(field, 'valid', ctx);
        }
    }

    /**
     * A client-registered rule has no server message; when the engine fell
     * back to its generic sentence and the rule registered one, the
     * registered one wins — interpolated for :attribute only, since a
     * client rule's params never crossed a wire.
     */
    private resolveMessage(rule: string, engineMessage: string, field: string): string {
        const registered = this.deps.ruleMessages[rule];

        if (registered === undefined || !engineMessage.endsWith('field is invalid.')) {
            return engineMessage;
        }

        return registered.replaceAll(':attribute', field.replaceAll(/[._]/g, ' '));
    }

    private effectiveSchema(): Schema {
        return this.deps.schema;
    }

    private fieldFrom(target: EventTarget | null): string | null {
        if (!(target instanceof Element)) return null;

        const name = target.getAttribute('name');
        if (name === null || name === '') return null;

        return toPath(name);
    }

    private controlFor(field: string): Element | null {
        const byName =
            this.form.querySelector(`[name="${cssEscape(toName(field))}"]`) ??
            this.form.querySelector(`[name="${cssEscape(toName(field))}[]"]`) ??
            this.form.querySelector(`[name="${cssEscape(field)}"]`);

        return byName;
    }

    private touch(field: string): void {
        this.transition(field, (state) => ({ ...state, touched: true }));
    }

    private markDirty(field: string): void {
        this.transition(field, (state) => ({ ...state, dirty: true }));
    }

    private transition(field: string, mutate: (state: FieldState) => FieldState): void {
        const next = mutate(this.states.get(field) ?? pristine());
        this.states.set(field, next);
        this.deps.emitter.emit('state:changed', { field, state: next });
    }

    private markInvalid(control: Element | null, field: string): void {
        if (control === null) return;

        control.setAttribute('aria-invalid', 'true');
        this.describedByUs.add(control);

        // NON-destructive describedby: append our generated id, never
        // replace a hand-authored one — and remove only ours on the way out.
        const ours = messageId(this.deps.validatorId, field);
        const existing = (control.getAttribute('aria-describedby') ?? '')
            .split(/\s+/)
            .filter((id) => id !== '' && id !== ours);
        control.setAttribute('aria-describedby', [...existing, ours].join(' '));
    }

    private clearInvalid(control: Element | null): void {
        if (control === null) return;

        control.removeAttribute('aria-invalid');
        this.stripOurDescribedBy(control);
    }

    private stripOurDescribedBy(control: Element): void {
        const prefix = `${this.deps.validatorId}-error-`;
        const kept = (control.getAttribute('aria-describedby') ?? '')
            .split(/\s+/)
            .filter((id) => id !== '' && !id.startsWith(prefix));

        if (kept.length === 0) control.removeAttribute('aria-describedby');
        else control.setAttribute('aria-describedby', kept.join(' '));
    }

    private focusFirstInvalid(result: Result): void {
        const first = result.failures[0];
        if (first === undefined) return;

        const control = this.controlFor(first.field);

        if (control instanceof HTMLElement) {
            control.scrollIntoView({ behavior: this.reducedMotion() ? 'auto' : 'smooth' });
            control.focus({ preventScroll: true });
        }
    }

    /**
     * One visually-hidden polite live region per form, owned by core:
     * renderer-independent announcements are what make the a11y bar a
     * guarantee instead of a preset's good intentions.
     */
    private announce(message: string): void {
        if (message === '') return;

        if (this.liveRegion === null) {
            const region = this.form.ownerDocument.createElement('div');
            region.setAttribute('aria-live', 'polite');
            region.setAttribute('data-laranail-live', '');
            region.style.cssText =
                'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
            this.form.appendChild(region);
            this.liveRegion = region;
        }

        this.liveRegion.textContent = message;
    }

    private reducedMotion(): boolean {
        const view = this.form.ownerDocument.defaultView;

        return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    }

    private listen(name: string, listener: EventListener): void {
        this.form.addEventListener(name, listener);
        this.listeners.push([name, listener]);
    }
}

function matchesPattern(pattern: string, field: string): boolean {
    if (!pattern.includes('*')) return false;

    const expression = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('[^.]+')}$`);

    return expression.test(field);
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssEscape(value: string): string {
    const scope = globalThis as { CSS?: { escape?: (v: string) => string } };

    return scope.CSS?.escape?.(value) ?? value.replace(/["\\]/g, '\\$&');
}
