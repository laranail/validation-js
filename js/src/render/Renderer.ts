import type { FieldStatus } from '../form/FieldState.ts';

/**
 * Painting is an adapter; state and events are the runtime's only
 * obligations. A renderer receives already-decided facts and draws them —
 * it can never change a verdict, and the a11y attributes live in the CORE
 * (FormController) precisely so no adapter can un-ship them.
 */
export interface RenderContext {
    form: HTMLFormElement;
    input: Element | null;
    /** The wrapper an InputResolver nominated, when one did. */
    wrapper: Element | null;
    validatorId: string;
}

export interface Renderer {
    showErrors(field: string, messages: string[], ctx: RenderContext): void;
    clearErrors(field: string, ctx: RenderContext): void;
    setFieldState(field: string, state: FieldStatus, ctx: RenderContext): void;
    renderSummary(errors: Array<{ field: string; message: string }>, form: HTMLFormElement): void;
    destroy(): void;
}

/** A renderer that draws nothing — the headless default. */
export const headlessRenderer: Renderer = {
    showErrors: () => {},
    clearErrors: () => {},
    setFieldState: () => {},
    renderSummary: () => {},
    destroy: () => {},
};
