import { matchesFormat, parseDate } from './dates.ts';
import { expand, get, has } from './paths.ts';
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
        return isNumeric && numeric(value) ? Number(value) : [...value].length; // spread, so an emoji counts as one character
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

/**
 * PHP's `is_numeric` grammar, not JavaScript's `Number()`.
 *
 * The two disagree on more than they agree about at the edges, and every
 * disagreement is in the dangerous direction — the browser accepting what the
 * server rejects. `Number()` parses hexadecimal (`0x1A`), binary (`0b11`),
 * octal (`0o17`) and the word `Infinity`; `is_numeric` accepts none of them.
 *
 * The accepted form is: optional surrounding whitespace, an optional sign,
 * then digits with an optional fractional part or a bare fractional part, then
 * an optional exponent. Leading AND trailing whitespace are allowed because
 * PHP 8 allows both.
 */
const PHP_NUMERIC = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/;

export function numeric(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value !== 'string') return false;

    return PHP_NUMERIC.test(value);
}

/** Whether the value is a file, which decides one of the size-message variants. */
export function isFileValue(value: unknown): boolean {
    return isFile(value) || isFileList(value);
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
    /** The schema PATTERN the field expanded from — what `distinct` ranges over. */
    pattern: string;
    numericField: boolean;
    /** Whether the rule set declares the field an array — the other size-message variant. */
    arrayField: boolean;
}

/**
 * A check's answer is deliberately three-valued: `'undetermined'` means "this
 * runner cannot decide" — a bare `url` with a scheme outside the browser-safe
 * set is VALID to Laravel's ~200-scheme list more often than not, and both
 * verdicts would be guesses. The engine turns it into a round trip, the same
 * treatment an unknown rule gets.
 */
export type Verdict = boolean | 'undetermined';

export type Check = (value: unknown, params: Record<string, string>, ctx: Context) => Verdict;

/**
 * Rules Laravel runs even when the value is absent or empty.
 *
 * Every conditional-presence rule belongs here: their entire job is to decide
 * whether an ABSENT field should have been there, so skipping them on an empty
 * value would skip exactly the case they exist for.
 */
export const IMPLICIT = new Set([
    'required',
    'filled',
    'present',
    'present_if',
    'present_unless',
    'present_with',
    'present_with_all',
    'accepted',
    'accepted_if',
    'declined',
    'declined_if',
    'missing',
    'missing_if',
    'missing_unless',
    'missing_with',
    'missing_with_all',
    'required_if',
    'required_if_accepted',
    'required_if_declined',
    'required_unless',
    'required_with',
    'required_with_all',
    'required_without',
    'required_without_all',
]);

/*
 * `confirmed`, `same` and `different` are deliberately NOT in that set, though
 * they read like they belong: they compare against another field, so treating
 * an absent one as "nothing to compare" looks wrong.
 *
 * Laravel's own `$implicitRules` does not list them, and the consequence is
 * visible: `['other' => 'x']` against `field => same:other` PASSES on the
 * server, because an absent `field` never reaches the rule at all. Marking them
 * implicit here made the browser reject a payload Laravel accepts.
 */

/**
 * The parameters a check cannot work without.
 *
 * This is the guard that makes the two halves of this package independent. A
 * check that reads `p.max` on a schema which does not carry it gets `undefined`,
 * and the coercions underneath turn that into a NUMBER — `Number(undefined ?? 0)`
 * is 0 — so `max` silently becomes "no longer than nothing" and rejects every
 * value. A wrong verdict, from missing data, with no way for anyone to tell.
 *
 * Declared here rather than guarded inside each check so there is one place to
 * read, and so a rule added without thinking about it fails loudly in a test
 * rather than quietly in a browser. A rule whose parameters are all optional is
 * absent from this table.
 *
 * A missing parameter makes that rule UNDETERMINED — the same answer already
 * given for a rule this runner has never heard of. The field round trips; the
 * server decides.
 */
export const REQUIRED_PARAMS: Record<string, readonly string[]> = {
    max: ['max'],
    min: ['min'],
    size: ['size'],
    between: ['min', 'max'],
    digits: ['digits'],
    digits_between: ['min', 'max'],
    decimal: ['min'],
    multiple_of: ['value'],
    regex: ['pattern'],
    not_regex: ['pattern'],
    same: ['other'],
    different: ['other'],
    after: ['date'],
    after_or_equal: ['date'],
    before: ['date'],
    before_or_equal: ['date'],
    date_equals: ['date'],
    gt: ['value'],
    gte: ['value'],
    lt: ['value'],
    lte: ['value'],
    required_if: ['other'],
    required_unless: ['other'],
    required_if_accepted: ['other'],
    required_if_declined: ['other'],
    accepted_if: ['other'],
    declined_if: ['other'],
    prohibited_if: ['other'],
    prohibited_unless: ['other'],
    prohibited_if_accepted: ['other'],
    prohibited_if_declined: ['other'],
    missing_if: ['other'],
    missing_unless: ['other'],
    present_if: ['other'],
    present_unless: ['other'],
    max_digits: ['max'],
    min_digits: ['min'],
    in_array: ['other'],
};

/**
 * Rules whose parameters are a variadic list, so any one of them will do.
 *
 * `in` with no values matches nothing and would fail every input — the same
 * wrong-verdict-from-missing-data as above, reached a different way.
 */
export const REQUIRES_ANY_PARAM: ReadonlySet<string> = new Set([
    'date_format',
    'in',
    'not_in',
    'starts_with',
    'ends_with',
    'doesnt_start_with',
    'doesnt_end_with',
    'contains',
    'doesnt_contain',
    'required_with',
    'required_with_all',
    'required_without',
    'required_without_all',
]);

/**
 * The conditional family names its dependent FIELD at position 0, so a
 * third-party schema that carries parameters positionally still satisfies
 * `other` — the checks read it through the same fallback.
 */
export const NAMES_DEPENDENT_AT_ZERO: ReadonlySet<string> = new Set([
    'required_if',
    'required_unless',
    'required_if_accepted',
    'required_if_declined',
    'accepted_if',
    'declined_if',
    'prohibited_if',
    'prohibited_unless',
    'prohibited_if_accepted',
    'prohibited_if_declined',
    'missing_if',
    'missing_unless',
    'present_if',
    'present_unless',
]);

/** Whether this runner has everything it needs to decide the rule. */
export function hasRequiredParams(rule: string, params: Record<string, string>): boolean {
    const required = REQUIRED_PARAMS[rule];

    const satisfied = (name: string): boolean =>
        params[name] !== undefined ||
        (name === 'other' &&
            (NAMES_DEPENDENT_AT_ZERO.has(rule) || rule === 'in_array') &&
            params['0'] !== undefined);

    if (required !== undefined && !required.every(satisfied)) {
        return false;
    }

    return !REQUIRES_ANY_PARAM.has(rule) || Object.values(params).length > 0;
}

// Checks that other checks are DEFINED FROM live outside the literal — a
// `satisfies`-typed literal cannot reference itself while it is being typed.

const acceptedCheck: Check = (v) => ['yes', 'on', '1', 1, true, 'true'].includes(v as never);
const declinedCheck: Check = (v) => ['no', 'off', '0', 0, false, 'false'].includes(v as never);

// Leading zeros are rejected, matching PHP's FILTER_FLAG_IPV4. They are not
// cosmetic: `010.1.1.1` is read as octal by some resolvers and as decimal by
// others, which is why the filter refuses it — and accepting it here would
// pass an address the server rejects.
const ipv4Check: Check = (v) =>
    IPV4.test(str(v)) &&
    str(v)
        .split('.')
        .every((o) => Number(o) <= 255 && (o === '0' || !o.startsWith('0')));

const ipv6Check: Check = (v) => {
    // Delegating to the platform rather than hand-rolling: IPv6 has
    // compressed forms, zone ids and IPv4-mapped notation, and a regex
    // that covers them all is longer than it is correct.
    try {
        return str(v).includes(':') && new URL(`http://[${str(v)}]`).hostname !== '';
    } catch {
        return false;
    }
};

// Array values change the question. With an `array` rule on the field
// Laravel switches to loose SUBSET semantics (array_diff — every element
// in the list, nested arrays always fail); without one an array value
// simply fails `in`. Stringifying the array got both directions wrong:
// String(['a']) === 'a' green-ticked `in:a,b` for a multi-select, and
// failed `not_in` for a value Laravel accepts. `not_in` is Laravel's own
// definition — the exact negation of `in`.
const inCheck: Check = (v, p, c) => {
    if (Array.isArray(v)) {
        return (
            c.arrayField &&
            v.every((el) => !Array.isArray(el) && Object.values(p).includes(str(el)))
        );
    }

    return Object.values(p).includes(str(v));
};

// `satisfies` rather than a Record annotation: the literal keeps its keys,
// so an internal reference is statically known to exist. Dynamic lookups by
// rule NAME widen to `Check | undefined` at the call site — an unknown rule
// is a real runtime case (it becomes undetermined).
export const checks = {
    required: (v) => !isEmpty(v),
    // `filled` is `required` only when the key is THERE. An absent attribute
    // passes it — the rule says "if you send it, send something", which is not
    // the same as requiring it, and treating the two alike rejected a payload
    // Laravel accepts.
    filled: (v, _p, c) => (has(c.values, c.field) ? !isEmpty(v) : true),
    // Laravel's `present` asks whether the KEY exists, not whether the value is
    // anything in particular: `{name: null}` is present and passes. Testing the
    // value instead failed a payload Laravel accepts.
    present: (_v, _p, c) => has(c.values, c.field),
    // Presence modifiers are structural: they change whether OTHER rules run,
    // and never fail on their own.
    nullable: () => true,
    sometimes: () => true,

    array: (v) => Array.isArray(v),
    // A JavaScript array IS a list; PHP's associative arrays arrive here as
    // objects and correctly fail both.
    list: (v) => Array.isArray(v),
    required_array_keys: (v, p) => {
        if (v === null || typeof v !== 'object') return false;

        return Object.values(p).every((key) =>
            Array.isArray(v) ? Number(key) >= 0 && Number(key) < v.length : Object.hasOwn(v, key),
        );
    },
    // Digit-count bounds on the STRING form — '-12' has a non-digit and
    // fails, exactly as the vendor's [^0-9] scan does.
    max_digits: (v, p) => digitCount(v) !== null && (digitCount(v) as number) <= num(p.max),
    min_digits: (v, p) => digitCount(v) !== null && (digitCount(v) as number) >= num(p.min),
    // The value must appear among another field's expanded values, loosely —
    // in_array:users.*.id is the canonical spelling.
    in_array: (v, p, c) => {
        const pattern = p.other ?? p['0'];
        if (pattern === undefined) return false;

        return expand(pattern, c.values)
            .map((f) => get(c.values, f))
            .some((el) => looselyEquals(el, v));
    },
    // Unique among the OTHER expansions of the same pattern. `strict` and
    // `ignore_case` ride as flags, as they do in Laravel.
    distinct: (v, p, c) => {
        const flags = Object.values(p);
        const siblings = expand(c.pattern, c.values)
            .filter((f) => f !== c.field)
            .map((f) => get(c.values, f));

        return !siblings.some((el) => {
            if (flags.includes('ignore_case') && typeof v === 'string' && typeof el === 'string') {
                return el.toLowerCase() === v.toLowerCase();
            }

            return flags.includes('strict') ? strictEquals(el, v) : looselyEquals(el, v);
        });
    },
    // `boolean:strict` narrows to the real booleans — Laravel honours the
    // parameter, and the fixture proved it (1 and '1' fail under it).
    boolean: (v, p) =>
        Object.values(p).includes('strict')
            ? v === true || v === false
            : [true, false, 1, 0, '1', '0'].includes(v as never),
    integer: (v, p) =>
        Object.values(p).includes('strict')
            ? typeof v === 'number' && Number.isInteger(v)
            : phpInteger(v),
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

    // `p.max`/`p.min`/`p.size` rather than a shared `p.value`, because the key
    // is also what the message interpolates — see RuleCatalogue::PARAMETER_NAMES.
    max: (v, p, c) => sizeOf(v, c.numericField) <= num(p.max),
    min: (v, p, c) => sizeOf(v, c.numericField) >= num(p.min),
    size: (v, p, c) => sizeOf(v, c.numericField) === num(p.size),
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
    ip: (v, p, c) => ipv4Check(v, p, c) || ipv6Check(v, p, c),
    ipv4: ipv4Check,
    ipv6: ipv6Check,
    lowercase: (v) => str(v) === str(v).toLowerCase(),
    uppercase: (v) => str(v) === str(v).toUpperCase(),
    mac_address: (v) => MAC.test(str(v)),
    ulid: (v) => ULID.test(str(v)),
    uuid: (v) => UUID.test(str(v)),
    url: (v, p) => {
        let protocol: string;
        try {
            protocol = new URL(str(v)).protocol;
        } catch {
            return false;
        }

        // Parameters are an exact allow-list — `url:https` fails http://,
        // which the fixture pinned after the runner waved it through.
        const declared = Object.values(p);
        if (declared.length > 0) {
            return declared.map((scheme) => `${scheme.toLowerCase()}:`).includes(protocol);
        }

        // Bare `url`: the browser-safe schemes decide; anything else that
        // PARSES goes to the server. Laravel's allow-list has ~200 entries
        // (ws:, redis:, …) and neither verdict here would be honest —
        // javascript: is on that list too, which is exactly why guessing
        // "valid" for unknown schemes is the wrong kind of wrong.
        if (['http:', 'https:', 'ftp:', 'ftps:'].includes(protocol)) return true;

        return 'undetermined';
    },
    // The file pre-flight tier — ADVISORY by design. A browser knows a
    // file's name, declared type and byte size; only the server reads the
    // bytes. So these fail fast on the obviously-wrong pick (the UX win) and
    // answer 'undetermined' on a match, because a green tick from a
    // NAME-derived check is precisely the lie the server then exposes.
    file: (v) => (isFile(v) ? true : false),
    mimes: (v, p) => {
        if (!isFile(v)) return false;

        const name = (v as { name?: string }).name ?? '';
        const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';

        // Laravel's mimes speaks EXTENSIONS ('jpg'), guessed from content;
        // the browser's closest honest signal is the filename's own.
        return Object.values(p).some((allowed) => allowed.toLowerCase() === extension)
            ? 'undetermined'
            : false;
    },
    extensions: (v, p) => {
        if (!isFile(v)) return false;

        const name = (v as { name?: string }).name ?? '';
        const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';

        return Object.values(p).some((allowed) => allowed.toLowerCase() === extension)
            ? 'undetermined'
            : false;
    },
    image: (v) => {
        if (!isFile(v)) return false;

        const type = (v as { type?: string }).type ?? '';

        return type.startsWith('image/') ? 'undetermined' : false;
    },

    // The date family. `date` decides the documented shape set and answers
    // 'undetermined' outside it — a strtotime port would be a second
    // implementation that disagrees at exactly the edges nobody tests.
    date: (v) => {
        const parsed = parseDate(v);
        return parsed === 'unknown' ? 'undetermined' : parsed !== null;
    },
    date_format: (v, p) => {
        if (typeof v !== 'string') return false;

        // Laravel accepts several formats — any match passes. A format this
        // runner cannot translate poisons only the REJECT verdict: passing
        // one still passes, failing all with an untranslatable one among
        // them rounds trip.
        let sawUnknown = false;

        for (const format of Object.values(p)) {
            const matched = matchesFormat(v, format);
            if (matched === true) return true;
            if (matched === 'unknown') sawUnknown = true;
        }

        return sawUnknown ? 'undetermined' : false;
    },
    after: (v, p, c) => dateCompares(v, p.date, c, (d) => d > 0),
    after_or_equal: (v, p, c) => dateCompares(v, p.date, c, (d) => d >= 0),
    before: (v, p, c) => dateCompares(v, p.date, c, (d) => d < 0),
    before_or_equal: (v, p, c) => dateCompares(v, p.date, c, (d) => d <= 0),
    // The FULL timestamp, not the calendar day — the same divergence the
    // PHP optimizer shipped as P3, mirrored here so neither half repeats it.
    date_equals: (v, p, c) => dateCompares(v, p.date, c, (d) => d === 0),
    timezone: (v, p) => {
        // Parameters reach into DateTimeZone::listIdentifiers groups
        // (per_country and friends) — regional filtering the browser's
        // identifier list cannot reproduce.
        if (Object.values(p).length > 0) return 'undetermined';
        if (typeof v !== 'string') return false;

        let zones: string[];
        try {
            zones = Intl.supportedValuesOf('timeZone');
        } catch {
            return 'undetermined';
        }

        if (v === 'UTC' || zones.includes(v)) return true;

        // The two lists differ at the edges (legacy zones, links); a
        // definite rejection needs certainty the value is in neither.
        return /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(v) ? false : 'undetermined';
    },
    regex: (v, p) => toRegExp(p.pattern)?.test(str(v)) ?? true,
    not_regex: (v, p) => !(toRegExp(p.pattern)?.test(str(v)) ?? false),

    in: inCheck,
    not_in: (v, p, c) => !inCheck(v, p, c),

    // Conditional presence. Each decides from OTHER fields whether this one
    // is required, then defers to the same emptiness test `required` uses.
    // `required_if` alone starts with Laravel's Arr::has guard: an ABSENT
    // dependent means never required, while a PRESENT null one still goes
    // through value matching. `required_unless` has no such guard — absent
    // resolves to null and can match a declared 'null'.
    required_if: (v, p, c) =>
        !has(c.values, dependentField(p) ?? '') || !matchesCondition(p, c) ? true : !isEmpty(v),
    required_unless: (v, p, c) => (matchesCondition(p, c) ? true : !isEmpty(v)),
    required_if_accepted: (v, p, c) =>
        acceptedCheck(other(c, p.other), {}, c) ? !isEmpty(v) : true,
    required_if_declined: (v, p, c) =>
        declinedCheck(other(c, p.other), {}, c) ? !isEmpty(v) : true,
    // `required_with` asks whether ANY named field is present; `_all` whether
    // every one is. `_without` and `_without_all` are their negations, and the
    // asymmetry between the pairs is Laravel's, not a mistake here:
    // `required_without:a,b` fires when ANY is missing, `_without_all` only
    // when ALL are.
    required_with: (v, p, c) => (fields(p).some((f) => present(c, f)) ? !isEmpty(v) : true),
    required_with_all: (v, p, c) => (fields(p).every((f) => present(c, f)) ? !isEmpty(v) : true),
    required_without: (v, p, c) => (fields(p).some((f) => !present(c, f)) ? !isEmpty(v) : true),
    required_without_all: (v, p, c) =>
        fields(p).every((f) => !present(c, f)) ? !isEmpty(v) : true,

    accepted: acceptedCheck,
    accepted_if: (v, p, c) => (matchesCondition(p, c) ? acceptedCheck(v, {}, c) : true),
    declined: declinedCheck,
    declined_if: (v, p, c) => (matchesCondition(p, c) ? declinedCheck(v, {}, c) : true),

    // The prohibition family. `prohibited` reads oddly as `isEmpty` — it is
    // Laravel's `! validateRequired`: when the rule RUNS (present, non-blank
    // value) anything non-empty fails, and the engine's gating supplies the
    // pass for absent and blank values, exactly as isValidatable does.
    prohibited: (v) => isEmpty(v),
    prohibited_if: (v, p, c) => (matchesCondition(p, c) ? isEmpty(v) : true),
    prohibited_unless: (v, p, c) => (matchesCondition(p, c) ? true : isEmpty(v)),
    prohibited_if_accepted: (v, p, c) =>
        acceptedCheck(other(c, dependentField(p)), {}, c) ? isEmpty(v) : true,
    prohibited_if_declined: (v, p, c) =>
        declinedCheck(other(c, dependentField(p)), {}, c) ? isEmpty(v) : true,
    // `prohibits` points the other way: THIS field being filled forbids the
    // named ones from being filled.
    prohibits: (v, p, c) => isEmpty(v) || fields(p).every((f) => isEmpty(get(c.values, f))),

    // The missing family asks about the KEY, not the value — `{field: null}`
    // fails `missing`. All implicit: their whole job is judging absence.
    missing: (_v, _p, c) => !has(c.values, c.field),
    missing_if: (v, p, c) => (matchesCondition(p, c) ? !has(c.values, c.field) : true),
    missing_unless: (v, p, c) => (matchesCondition(p, c) ? true : !has(c.values, c.field)),
    // PRESENCE of the named fields triggers these — Arr::hasAny/has, not
    // filled-ness, which is where they differ from required_with's family.
    missing_with: (v, p, c) =>
        fields(p).some((f) => has(c.values, f)) ? !has(c.values, c.field) : true,
    missing_with_all: (v, p, c) =>
        fields(p).every((f) => has(c.values, f)) ? !has(c.values, c.field) : true,

    present_if: (v, p, c) => (matchesCondition(p, c) ? has(c.values, c.field) : true),
    present_unless: (v, p, c) => (matchesCondition(p, c) ? true : has(c.values, c.field)),
    present_with: (v, p, c) =>
        fields(p).some((f) => has(c.values, f)) ? has(c.values, c.field) : true,
    present_with_all: (v, p, c) =>
        fields(p).every((f) => has(c.values, f)) ? has(c.values, c.field) : true,
    // The default counterpart is the FULL concrete path plus `_confirmation`
    // — items.0.password looks for items.0.password_confirmation — which is
    // Laravel's own spelling: $attribute.'_confirmation', resolved from root.
    confirmed: (v, p, c) => strictEquals(v, other(c, p.other ?? `${c.field}_confirmation`)),
    // STRICT, like Laravel's === — an integer 1 is not '1', which matters
    // for JSON payloads where types survive the trip. Loose stringified
    // comparison green-ticked exactly those.
    same: (v, p, c) => strictEquals(v, other(c, p.other)),
    different: (v, p, c) => !strictEquals(v, other(c, p.other)),

    gt: (v, p, c) => comparesAs(v, p.value, c, (d) => d > 0),
    gte: (v, p, c) => comparesAs(v, p.value, c, (d) => d >= 0),
    lt: (v, p, c) => comparesAs(v, p.value, c, (d) => d < 0),
    lte: (v, p, c) => comparesAs(v, p.value, c, (d) => d <= 0),

    starts_with: (v, p) => Object.values(p).some((prefix) => str(v).startsWith(prefix)),
    ends_with: (v, p) => Object.values(p).some((suffix) => str(v).endsWith(suffix)),
    doesnt_start_with: (v, p) => !Object.values(p).some((prefix) => str(v).startsWith(prefix)),
    doesnt_end_with: (v, p) => !Object.values(p).some((suffix) => str(v).endsWith(suffix)),
    // Laravel's `contains` asks whether the ATTRIBUTE ARRAY contains the given
    // values. It is not a substring test — `contains:foo` fails for the string
    // 'a foo b', which is the opposite of what the name suggests.
    contains: (v, p) => Array.isArray(v) && Object.values(p).every((n) => v.map(str).includes(n)),
    doesnt_contain: (v, p) =>
        Array.isArray(v) && !Object.values(p).some((n) => v.map(str).includes(n)),

    decimal: (v, p) => {
        // The fraction may be EMPTY — '1.' is inside Laravel's grammar, and
        // rejecting it was a false block. A lone '.' is not a number though,
        // hence the lookahead requiring a digit somewhere.
        const match = /^[+-]?(?=.*\d)\d*\.(\d*)$|^[+-]?\d+$/.exec(str(v));
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
} satisfies Record<string, Check>;

function decimals(value: string): number {
    return value.split('.')[1]?.length ?? 0;
}

/**
 * Another field's value, resolved from the ROOT of the data — Laravel's
 * `getValue()` is `Arr::get($this->data, $parameter)` with no row awareness.
 *
 * Inside `items.0.password`, `same:password_confirmation` therefore reads the
 * TOP-LEVEL `password_confirmation`, green-ticking nothing Laravel would
 * reject. The row-relative meaning is spelled `same:items.*.password_confirmation`,
 * whose `*` the engine substitutes with the row's own index before this
 * function ever sees it (see paths.ts `substituteAsterisks`). Resolving the
 * bare name against the row first — the previous behaviour — accepted the
 * Laravel-wrong spelling and diverged on the Laravel-right one.
 */
function other(ctx: Context, name: string | undefined): unknown {
    return name === undefined ? undefined : get(ctx.values, name);
}

/** Every parameter as a field name — for the rules whose params are all fields. */
function fields(params: Record<string, string> | string[]): string[] {
    return Object.values(params);
}

/** Is another field present and non-empty, resolved relative to the row? */
function present(ctx: Context, name: string): boolean {
    return !isEmpty(other(ctx, name));
}

/** The dependent field a conditional rule names — `other`, or position 0. */
function dependentField(params: Record<string, string> | string[]): string | undefined {
    return (params as Record<string, string>).other ?? Object.entries(params)[0]?.[1];
}

/**
 * Does the dependent field hold one of the rule's values?
 *
 * `parseDependentRuleParameters`, faithfully: a boolean dependent converts
 * declared `true`/`false` to real booleans and compares STRICTLY (so `1`
 * never matches `true`); a NULL dependent converts a declared `null`
 * (case-insensitively) to a real null, which is how `required_if:other,null`
 * fires on a present-null value; everything else compares loose-by-string —
 * including the literal string 'null' matching a declared `null`, because no
 * conversion happens unless the dependent IS null.
 */
function matchesCondition(params: Record<string, string> | string[], ctx: Context): boolean {
    const entries = Object.entries(params);
    const values = entries
        .filter(([key]) => key !== 'other' && key !== '0')
        .map(([, value]) => value);
    const actual = other(ctx, dependentField(params));

    return values.some((value) => {
        if (typeof actual === 'boolean') {
            return value === (actual ? 'true' : 'false');
        }

        if (actual === null || actual === undefined) {
            return value.toLowerCase() === 'null';
        }

        return str(actual) === value;
    });
}

/**
 * Laravel's getDateTimestamp for the comparison family: the parameter is a
 * FIELD when one exists at that path, a literal otherwise. Relative phrases
 * ('tomorrow') and unshaped strings answer 'undetermined'; an unparseable
 * VALUE fails, as it does in Laravel.
 */
function dateCompares(
    value: unknown,
    name: string | undefined,
    ctx: Context,
    op: (difference: number) => boolean,
): Verdict {
    const fieldValue = name === undefined ? undefined : get(ctx.values, name);
    const comparand = parseDate(fieldValue !== undefined ? fieldValue : name);
    const own = parseDate(value);

    if (own === null) return false;
    if (own === 'unknown' || comparand === 'unknown' || comparand === null) return 'undetermined';

    return op(own - comparand);
}

/** The last segment of a dotted path — `items.0.email` is `email`. */
function basename(field: string): string {
    return field.split('.').pop() ?? field;
}

/**
 * `FILTER_VALIDATE_INT`'s grammar, which is narrower than "numeric and
 * whole": no fraction ('10.0'), no exponent ('1e2'), no leading zeros
 * ('010'), and nothing beyond PHP_INT range — every one of those was a
 * green tick Laravel refused. Surrounding whitespace and a sign are fine.
 */
function phpInteger(value: unknown): boolean {
    if (typeof value === 'number') return Number.isInteger(value);
    if (typeof value !== 'string') return false;

    const trimmed = value.trim();
    if (!/^[+-]?(?:0|[1-9]\d*)$/.test(trimmed)) return false;

    try {
        const parsed = BigInt(trimmed);
        return parsed >= -9223372036854775808n && parsed <= 9223372036854775807n;
    } catch {
        return false;
    }
}

/** The digit count of a value's string form, or null when it has non-digits. */
function digitCount(value: unknown): number | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;

    const rendered = String(value);

    return /^[0-9]+$/.test(rendered) ? rendered.length : null;
}

/**
 * PHP's loose `==` for the shapes that reach `in_array`-style checks:
 * numeric strings compare as numbers ('1' == '01'), other scalars by
 * string, null only to null.
 */
function looselyEquals(a: unknown, b: unknown): boolean {
    if (a === null || a === undefined || b === null || b === undefined) {
        return (a === null || a === undefined) === (b === null || b === undefined);
    }

    if (typeof a === 'object' || typeof b === 'object') return strictEquals(a, b);

    if (numeric(a) && numeric(b)) return Number(a) === Number(b);

    return str(a) === str(b);
}

/** PHP's `===`: strict for scalars, element-wise for arrays. */
function strictEquals(a: unknown, b: unknown): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((el, i) => strictEquals(el, b[i]));
    }

    return a === b;
}

/** PHP `gettype` agreement — Laravel's isSameType gate on comparisons. */
function sameType(a: unknown, b: unknown): boolean {
    return (Array.isArray(a) ? 'array' : typeof a) === (Array.isArray(b) ? 'array' : typeof b);
}

/**
 * Laravel's validateGt/Gte/Lt/Lte, branch for branch — the order matters:
 *
 *  1. No such FIELD and both sides numeric → numeric comparison against the
 *     literal.
 *  2. Numeric literal but non-numeric value → false.
 *  3. Field comparison under a numeric rule with both sides numeric →
 *     numeric.
 *  4. Different types → false.
 *  5. Otherwise BOTH sides measured by getSize with the ATTRIBUTE's numeric
 *     decision — one decision, two sides. The old per-side promotion read
 *     '10' as the number ten and 'abc' as three characters in the same
 *     comparison, which is how it failed 'abc' gt '10' where Laravel passes
 *     it (3 characters > 2 characters).
 */
function comparesAs(
    value: unknown,
    name: string | undefined,
    ctx: Context,
    op: (difference: number) => boolean,
): boolean {
    const comparedTo = other(ctx, name);

    // Laravel's shouldBeNumeric: a comparison rule ADDS ITSELF to the
    // attribute's numeric rules when the VALUE is numeric — one decision,
    // made from the value, then applied to getSize on BOTH sides. This is
    // the subtlety the old per-side promotion missed: '10' gt 'abc' measures
    // ten against three characters (passes), while 'abc' gt '10' measures
    // three characters against two (also passes) — asymmetric, and Laravel's.
    const numericAttribute = ctx.numericField || numeric(value);

    if (comparedTo === undefined || comparedTo === null) {
        return numeric(value) && numeric(name)
            ? op(sizeOf(value, numericAttribute) - Number(name))
            : false;
    }

    if (numeric(name)) return false;

    if (numericAttribute && numeric(value) && numeric(comparedTo)) {
        return op(Number(value) - Number(comparedTo));
    }

    if (!sameType(value, comparedTo)) return false;

    return op(sizeOf(value, numericAttribute) - sizeOf(comparedTo, numericAttribute));
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
    // Both groups always capture on a successful match; the fallbacks only
    // satisfy the type system's view of indexed access.
    const body = match[2] ?? '';
    const modifiers = match[3] ?? '';
    try {
        return new RegExp(body, modifiers.replace(/[^gimsuy]/g, ''));
    } catch {
        return null;
    }
}
