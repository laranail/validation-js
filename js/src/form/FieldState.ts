/**
 * One field's runtime state — the layer the engine deliberately does not
 * have.
 *
 * The engine's verdict is three-valued (valid / invalid / undetermined);
 * `validating` is a RUNTIME fact about an async check in flight, and
 * `touched`/`dirty` are USER facts the a11y timing rules depend on
 * ("never validate an untouched field on first keypress"). Keeping them
 * here keeps Layer 0 synchronous and pure.
 */
export type FieldStatus = 'valid' | 'invalid' | 'validating' | 'undetermined' | 'pristine';

export interface FieldState {
    status: FieldStatus;
    /** The field has received and lost focus at least once. */
    touched: boolean;
    /** The value has changed from its initial reading. */
    dirty: boolean;
    /** Failure messages, in engine order. Empty unless invalid. */
    errors: string[];
    /**
     * Why an undetermined field is undetermined: a server-tier rule the
     * browser can never decide (`structural`) needs no retry affordance; a
     * remote check that could not reach the server (`transient`) may show
     * "couldn't verify, will check on submit". See §6.4.
     */
    reason?: 'structural' | 'transient';
}

export function pristine(): FieldState {
    return { status: 'pristine', touched: false, dirty: false, errors: [] };
}
