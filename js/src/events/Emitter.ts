/**
 * The validator's event surface — dual-channel by design (§5.6):
 *
 * 1. An instance emitter (`on`/`off`) for code that holds the validator.
 * 2. Bubbling, cancelable DOM `CustomEvent`s (`laranail:*`) on the form's
 *    own elements, so Alpine/HTMX/delegated listeners integrate without
 *    ever importing this package. The legacy documented these and never
 *    dispatched them; that mismatch was a named bug, so dispatching is
 *    part of `emit()` itself — it cannot be forgotten per call site.
 *
 * Every DOM detail carries `{ validatorId }` so two instances on one page
 * never cross-fire through one delegated listener (§5.10).
 */
export type EventName =
    | 'field:validating'
    | 'field:validated'
    | 'form:validated'
    | 'form:submit'
    | 'form:error'
    | 'remote:start'
    | 'remote:settled'
    | 'state:changed';

export type Handler = (detail: Record<string, unknown>, event: CustomEvent) => void;

export class Emitter {
    private readonly target = new EventTarget();
    private readonly validatorId: string;
    private readonly root: Element | null;

    constructor(validatorId: string, root: Element | null) {
        this.validatorId = validatorId;
        this.root = root;
    }

    on(name: EventName, handler: Handler): () => void {
        const listener = (event: Event): void => {
            const custom = event as CustomEvent<Record<string, unknown>>;
            handler(custom.detail, custom);
        };

        this.target.addEventListener(name, listener);

        return () => this.target.removeEventListener(name, listener);
    }

    /**
     * Fire on the instance channel and, when an element is in play, as a
     * bubbling `laranail:`-prefixed DOM event from that element (falling
     * back to the form). Returns false when a cancelable event was
     * preventDefault()ed on either channel.
     */
    emit(
        name: EventName,
        detail: Record<string, unknown>,
        options: { cancelable?: boolean; element?: Element | null } = {},
    ): boolean {
        const payload = { ...detail, validatorId: this.validatorId };
        const cancelable = options.cancelable ?? false;

        const instanceEvent = new CustomEvent(name, { detail: payload, cancelable });
        const instanceOk = this.target.dispatchEvent(instanceEvent);

        const anchor = options.element ?? this.root;
        let domOk = true;

        if (anchor !== null && typeof anchor.dispatchEvent === 'function') {
            domOk = anchor.dispatchEvent(
                new CustomEvent(`laranail:${name}`, { detail: payload, bubbles: true, cancelable }),
            );
        }

        return instanceOk && domOk;
    }
}
