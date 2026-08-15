import { get, sibling } from './paths.ts';
import type { Values } from './types.ts';

/**
 * The client-side rule implementations.
 *
 * Each mirrors Laravel's `ValidatesAttributes` method of the same name. Where
 * this file deliberately differs from a naive reading, the reason is in a
 * comment — those are the places a re-implementation usually goes wrong.
 */

/**
 * `File` and `FileList` are browser globals. This library also runs under
 * Node — server-side rendering, and its own test suite — where referencing
 * them unguarded is a ReferenceError rather than a false. Guarding is not
 * defensive style; without it the library crashes outside a browser.
 */
function isFileList(value: unknown): value is { length: number } {
    return typeof FileList !== 'undefined' && value instanceof FileList;
}

function isFile(value: unknown): value is { size: number } {
    return typeof File !== 'undefined' && value instanceof File;
}

/** Laravel treats null, '', [] and an empty file as "not present". */
export function isEmpty(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (isFileList(value)) return value.length === 0;
    return false;
}

/**
 * The size of a value, in the unit the rule means.
 *
 * This is the subtlety behind min/max/between/size: the SAME rule means a
 * character count for a string, a magnitude for a number, an element count for
 * an array, and kilobytes for a file. Laravel decides by the value's type plus
 * whether a numeric rule is present, and so does this.
 */
export function sizeOf(value: unknown, isNumeric: boolean): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        // A numeric string under a numeric rule is compared by VALUE, not by
        // length. "9" is greater than "10" by length and smaller by value, and
        // getting this backwards is the classic bug.
        return isNumeric && value.trim() !== '' && !Number.isNaN(Number(value))
            ? Number(value)
            : [...value].length; // spread, so an emoji counts as one character
    }
    if (Array.isArray(value)) return value.length;
    if (isFile(value)) return value.size / 1024;
    if (isFileList(value)) return value.length;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return 0;
}

// No dot required: Laravel's default `email` is egulias RFCValidation,
// which accepts `a@b`. Requiring a TLD here would reject in the browser
// what the server accepts — the worst direction for a client check.
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULID = /^[0-7][0-9ABCDEFGHJKMNPQRSTVWXYZ]{25}$/i;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function str(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
}

function num(value: string | undefined): number {
    return Number(value ?? 0);
}

/** Is this value comparable as a number at all? */
function numeric(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;
    return value.trim() !== '' && !Number.isNaN(Number(value));
}

/**
 * Context a check may need beyond its own value.
 *
 * `numericField` is the important one: Laravel decides whether a size rule
 * means "length" or "value" from the presence of a numeric rule ON THE FIELD,
 * not from whether the value happens to look numeric. `max:5` passes for "6"
 * because the size is the string length; add `numeric` and it fails.
 */
export interface Context {
    values: Values;
    field: string;
    numericField: boolean;
}

export type Check = (value: unknown, params: Record<string, string>, ctx: Context) => boolean;

/** Rules Laravel runs even when the value is absent or empty. */
export const IMPLICIT = new Set([
    'required', 'filled', 'present', 'accepted', 'declined', 'confirmed', 'same', 'different',
]);

export const checks: Record<string, Check> = {
    required: (v) => !isEmpty(v),
    filled: (v) => !isEmpty(v),
    present: (v) => v !== undefined,
    // Presence modifiers are structural: they change whether OTHER rules run,
    // and never fail on their own.
    nullable: () => true,
    sometimes: () => true,

    array: (v) => Array.isArray(v),
    boolean: (v) => [true, false, 1, 0, '1', '0'].includes(v as never),
    integer: (v) => numeric(v) && Number.isInteger(Number(v)),
    numeric: (v) => numeric(v),
    string: (v) => typeof v === 'string',
    json: (v) => {
        if (typeof v !== 'string') return false;
        try {
            JSON.parse(v);
            return true;
        } catch {
            return false;
        }
    },

    max: (v, p, c) => sizeOf(v, c.numericField) <= num(p.value),
    min: (v, p, c) => sizeOf(v, c.numericField) >= num(p.value),
    size: (v, p, c) => sizeOf(v, c.numericField) === num(p.value),
    between: (v, p, c) => {
        const size = sizeOf(v, c.numericField);
        return size >= num(p.min) && size <= num(p.max);
    },
    digits: (v, p) => /^\d+$/.test(str(v)) && str(v).length === num(p.digits),
    digits_between: (v, p) => {
        const s = str(v);
        return /^\d+$/.test(s) && s.length >= num(p.min) && s.length <= num(p.max);
    },

    alpha: (v) => /^[\p{L}\p{M}]+$/u.test(str(v)),
    alpha_dash: (v) => /^[\p{L}\p{M}\p{N}_-]+$/u.test(str(v)),
    alpha_num: (v) => /^[\p{L}\p{M}\p{N}]+$/u.test(str(v)),
    ascii: (v) => /^[\x00-\x7F]*$/.test(str(v)),
    email: (v) => EMAIL.test(str(v)),
    hex_color: (v) => HEX_COLOR.test(str(v)),
    ip: (v, p, c) => checks.ipv4(v, p, c) || checks.ipv6(v, p, c),
    ipv4: (v) => IPV4.test(str(v)) && str(v).split('.').every((o) => Number(o) <= 255),
    ipv6: (v) => {
        // Delegating to the platform rather than hand-rolling: IPv6 has
        // compressed forms, zone ids and IPv4-mapped notation, and a regex
        // that covers them all is longer than it is correct.
        try {
            return str(v).includes(':') && new URL(`http://[${str(v)}]`).hostname !== '';
        } catch {
            return false;
        }
    },
    lowercase: (v) => str(v) === str(v).toLowerCase(),
    uppercase: (v) => str(v) === str(v).toUpperCase(),
    mac_address: (v) => MAC.test(str(v)),
    ulid: (v) => ULID.test(str(v)),
    uuid: (v) => UUID.test(str(v)),
    url: (v) => {
        try {
            const parsed = new URL(str(v));
            // URL accepts any scheme, including javascript: and file:. Laravel
            // uses an allow-list, and matching it here matters because a `url`
            // rule that passes javascript: in the browser and fails on the
            // server is worse than one that just fails.
            return ['http:', 'https:', 'ftp:', 'ftps:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    },
    regex: (v, p) => toRegExp(p.pattern)?.test(str(v)) ?? true,
    not_regex: (v, p) => !(toRegExp(p.pattern)?.test(str(v)) ?? false),

    in: (v, p) => Object.values(p).includes(str(v)),
    not_in: (v, p) => !Object.values(p).includes(str(v)),

    accepted: (v) => ['yes', 'on', '1', 1, true, 'true'].includes(v as never),
    declined: (v) => ['no', 'off', '0', 0, false, 'false'].includes(v as never),
    confirmed: (v, p, c) => str(v) === str(other(c, p.other ?? `${basename(c.field)}_confirmation`)),
    same: (v, p, c) => str(v) === str(other(c, p.other)),
    different: (v, p, c) => str(v) !== str(other(c, p.other)),

    gt: (v, p, c) => compare(v, p.value, c) > 0,
    gte: (v, p, c) => compare(v, p.value, c) >= 0,
    lt: (v, p, c) => compare(v, p.value, c) < 0,
    lte: (v, p, c) => compare(v, p.value, c) <= 0,

    starts_with: (v, p) => Object.values(p).some((prefix) => str(v).startsWith(prefix)),
    ends_with: (v, p) => Object.values(p).some((suffix) => str(v).endsWith(suffix)),
    doesnt_start_with: (v, p) => !Object.values(p).some((prefix) => str(v).startsWith(prefix)),
    doesnt_end_with: (v, p) => !Object.values(p).some((suffix) => str(v).endsWith(suffix)),
    // Laravel's `contains` asks whether the ATTRIBUTE ARRAY contains the given
    // values. It is not a substring test — `contains:foo` fails for the string
    // 'a foo b', which is the opposite of what the name suggests.
    contains: (v, p) => Array.isArray(v) && Object.values(p).every((n) => v.map(str).includes(n)),
    doesnt_contain: (v, p) => Array.isArray(v) && !Object.values(p).some((n) => v.map(str).includes(n)),

    decimal: (v, p) => {
        const match = /^[+-]?\d*\.(\d+)$|^[+-]?\d+$/.exec(str(v));
        if (!match) return false;
        const places = match[1]?.length ?? 0;
        const min = num(p.min);
        const max = p.max === undefined ? min : num(p.max);
        return places >= min && places <= max;
    },
    multiple_of: (v, p) => {
        const divisor = num(p.value);
        if (divisor === 0 || !numeric(v)) return false;
        // Scale to integers before the modulo: 0.3 % 0.1 is 0.09999999999999998
        // in IEEE 754, so a direct remainder reports a false failure.
        const scale = 10 ** Math.max(decimals(String(v)), decimals(String(divisor)));
        return Math.round(Number(v) * scale) % Math.round(divisor * scale) === 0;
    },
};

function decimals(value: string): number {
    return value.split('.')[1]?.length ?? 0;
}

/**
 * Another field's value, resolved relative to the current row.
 *
 * Inside `items.0.password`, `same:password_confirmation` means the sibling in
 * the SAME row. Resolving at the top level would compare every row against one
 * shared field, which is not what the form means.
 */
function other(ctx: Context, name: string | undefined): unknown {
    return name === undefined ? undefined : get(ctx.values, sibling(ctx.field, name, ctx.values));
}

/** The last segment of a dotted path — `items.0.email` is `email`. */
function basename(field: string): string {
    return field.split('.').pop() ?? field;
}

/** Compare against a literal, or against another field when one is named. */
function compare(value: unknown, name: string | undefined, ctx: Context): number {
    const resolved = other(ctx, name);
    const against = resolved === undefined ? name : resolved;
    const a = sizeOf(value, ctx.numericField || numeric(value));
    const b = sizeOf(against, ctx.numericField || numeric(against));
    return a === b ? 0 : a > b ? 1 : -1;
}

/**
 * A PHP regex literal (`/^a$/i`) turned into a JavaScript one.
 *
 * Returns null when it cannot be translated — PHP's PCRE has constructs
 * JavaScript lacks, such as possessive quantifiers and recursion. A null makes
 * the rule PASS on the client rather than fail, because the server will still
 * check it, and failing a valid value in the browser is the worse error.
 */
export function toRegExp(pattern: string | undefined): RegExp | null {
    if (!pattern) return null;
    const match = /^([/#~%])(.*)\1([imsuxADSUXJn]*)$/s.exec(pattern);
    if (!match) return null;
    const [, , body, modifiers] = match;
    try {
        return new RegExp(body, modifiers.replace(/[^gimsuy]/g, ''));
    } catch {
        return null;
    }
}
