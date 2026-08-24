import type { FieldStatus } from '../form/FieldState.ts';
import type { RenderContext, Renderer } from './Renderer.ts';

/**
 * The default renderer: entirely data-driven, so "support framework X" is
 * one preset OBJECT, never a subclass. The vocabulary is calibrated
 * against Pristine's and vanillajs-form-validator's option sets (§3.5) so
 * migrating from either is a preset.
 *
 * Messages are written with `textContent`, never `innerHTML` — server
 * strings are trusted for CONTENT, not for markup, and a translation
 * carrying an angle bracket must render as text.
 */
export interface ClassMapPreset {
    /** Classes applied to the control per state; multi-class strings allowed. */
    input?: Partial<Record<FieldStatus, string>>;
    /** Classes applied to the resolved wrapper per state. */
    wrapper?: Partial<Record<FieldStatus, string>>;
    /** The element created per message. */
    message?: { tag?: string; classes?: string };
    /** Where messages land when nothing more specific claims them. */
    container?: string | ((input: Element, ctx: RenderContext) => Element | null);
    summary?: { classes?: string; itemClasses?: string };
}

const MESSAGE_MARKER = 'data-laranail-message';
const SUMMARY_MARKER = 'data-laranail-summary';

export class ClassMapRenderer implements Renderer {
    private readonly touchedInputs = new Set<Element>();
    private readonly preset: ClassMapPreset;

    constructor(preset: ClassMapPreset = {}) {
        this.preset = preset;
    }

    showErrors(field: string, messages: string[], ctx: RenderContext): void {
        this.clearErrors(field, ctx);

        const container = this.placeInto(field, ctx);
        if (container === null) return;

        for (const text of messages) {
            const element = ctx.form.ownerDocument.createElement(this.preset.message?.tag ?? 'div');
            element.setAttribute(MESSAGE_MARKER, field);
            element.id = messageId(ctx.validatorId, field);
            applyClasses(element, this.preset.message?.classes);
            element.textContent = text;
            container.appendChild(element);
        }
    }

    clearErrors(field: string, ctx: RenderContext): void {
        for (const stale of Array.from(
            ctx.form.querySelectorAll(`[${MESSAGE_MARKER}="${cssEscape(field)}"]`),
        )) {
            stale.remove();
        }
    }

    setFieldState(field: string, state: FieldStatus, ctx: RenderContext): void {
        if (ctx.input !== null) {
            this.touchedInputs.add(ctx.input);
            swapStateClasses(ctx.input, this.preset.input, state);
        }

        if (ctx.wrapper !== null) {
            this.touchedInputs.add(ctx.wrapper);
            swapStateClasses(ctx.wrapper, this.preset.wrapper, state);
        }
    }

    renderSummary(errors: Array<{ field: string; message: string }>, form: HTMLFormElement): void {
        form.querySelector(`[${SUMMARY_MARKER}]`)?.remove();

        if (errors.length === 0) return;

        const summary = form.ownerDocument.createElement('div');
        summary.setAttribute(SUMMARY_MARKER, '');
        summary.setAttribute('role', 'alert');
        applyClasses(summary, this.preset.summary?.classes);

        const list = form.ownerDocument.createElement('ul');

        for (const { field, message } of errors) {
            const item = form.ownerDocument.createElement('li');
            applyClasses(item, this.preset.summary?.itemClasses);

            const link = form.ownerDocument.createElement('a');
            link.href = '#';
            link.textContent = message;
            link.addEventListener('click', (event) => {
                event.preventDefault();
                const target = form.querySelector<HTMLElement>(
                    `[name="${cssEscape(field)}"], [data-laranail-field="${cssEscape(field)}"]`,
                );
                target?.scrollIntoView({
                    behavior: prefersReducedMotion(form) ? 'auto' : 'smooth',
                });
                target?.focus({ preventScroll: true });
            });

            item.appendChild(link);
            list.appendChild(item);
        }

        summary.appendChild(list);
        form.prepend(summary);
    }

    destroy(): void {
        for (const element of this.touchedInputs) {
            for (const classes of Object.values({
                ...this.preset.input,
                ...this.preset.wrapper,
            })) {
                removeClasses(element, classes);
            }
        }

        this.touchedInputs.clear();
    }

    /**
     * The legacy four-step placement chain, proven and carried forward:
     * explicit data-attribute target → resolver wrapper → configured
     * container → after the input itself.
     */
    private placeInto(field: string, ctx: RenderContext): Element | null {
        const explicit = ctx.input?.getAttribute('data-laranail-errors');

        if (explicit !== null && explicit !== undefined && explicit !== '') {
            const target = ctx.form.querySelector(explicit);
            if (target !== null) return target;
        }

        if (ctx.wrapper !== null) return ctx.wrapper;

        const configured = this.preset.container;

        if (typeof configured === 'function' && ctx.input !== null) {
            const target = configured(ctx.input, ctx);
            if (target !== null) return target;
        }

        if (typeof configured === 'string' && ctx.input !== null) {
            const target = ctx.input.closest(configured);
            if (target !== null) return target;
        }

        if (ctx.input?.parentElement) return ctx.input.parentElement;

        return ctx.form;
    }
}

export function messageId(validatorId: string, field: string): string {
    return `${validatorId}-error-${field.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

function applyClasses(element: Element, classes: string | undefined): void {
    if (classes !== undefined && classes !== '') element.classList.add(...classes.split(/\s+/));
}

function removeClasses(element: Element, classes: string | undefined): void {
    if (classes !== undefined && classes !== '') element.classList.remove(...classes.split(/\s+/));
}

function swapStateClasses(
    element: Element,
    map: Partial<Record<FieldStatus, string>> | undefined,
    state: FieldStatus,
): void {
    if (map === undefined) return;

    for (const classes of Object.values(map)) removeClasses(element, classes);
    applyClasses(element, map[state]);
}

function prefersReducedMotion(form: HTMLFormElement): boolean {
    const view = form.ownerDocument.defaultView;

    return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** CSS.escape with a fallback for environments without it. */
function cssEscape(value: string): string {
    const scope = globalThis as { CSS?: { escape?: (v: string) => string } };

    return scope.CSS?.escape?.(value) ?? value.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);
}
