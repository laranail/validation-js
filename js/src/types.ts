/** The schema exported by the PHP side. See docs/schema.md — that document is the contract. */

export interface Rule {
    rule: string;
    /**
     * Named for rules that have names (`{"min":"1","max":"5"}`), positional
     * for variadic ones (`in`, `starts_with`), which arrive as a JSON array
     * because PHP coerces numeric-string keys to integers. Read them with
     * `Object.values()`, which handles both.
     */
    params: Record<string, string> | string[];
}

export interface Field {
    /** Human name for messages, or null to derive one from the key. */
    attribute: string | null;
    /** Rules the browser can decide. */
    client: Rule[];
    /** Rules that need the server. Their presence makes a field undetermined, never invalid. */
    server: string[];
}

/** A message template, with `:attribute` and the rule's placeholders unfilled. */
export type Message = string;

/**
 * The per-type variants of a size rule's message, keyed `numeric` / `array` /
 * `file` / `string`. Which one applies is not knowable at export time — it
 * depends on the rule set, on the value, and for gt/gte/lt/lte on whether the
 * value is numeric — so all four travel and the runner picks.
 */
export type MessageVariants = Record<string, string>;

export interface Schema {
    /** The format's MAJOR version. Additive changes do not move it. */
    version: number;
    fields: Record<string, Field>;
    messages: Record<string, Message>;
    /**
     * Optional, and absent from a schema written before it existed — which is
     * exactly why it is a key of its own rather than a change to `messages`.
     * A runner that has never heard of it reads `messages` and is correct;
     * one that has gets the right variant.
     */
    messageVariants?: Record<string, MessageVariants>;
}

export interface Failure {
    field: string;
    rule: string;
    message: string;
}

export interface Result {
    /** No client rule failed. NOT the same as "the server will accept it". */
    valid: boolean;
    failures: Failure[];
    /**
     * Fields carrying at least one server-only rule.
     *
     * These are not valid and not invalid — the browser cannot tell. A form
     * should still submit when `valid` is true and this is non-empty; the
     * server gives the real answer.
     */
    undetermined: string[];
}

export type Values = Record<string, unknown>;
