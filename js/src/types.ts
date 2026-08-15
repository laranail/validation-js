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

export interface Schema {
    version: number;
    fields: Record<string, Field>;
    messages: Record<string, string>;
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
