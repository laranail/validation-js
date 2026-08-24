/**
 * Date parsing for the date rule family — a documented SHAPE SET, not a
 * strtotime port.
 *
 * PHP's strtotime reads relative phrases, ordinal weekdays and a few dozen
 * formats; reproducing it would be a second implementation that disagrees at
 * the edges, in a file whose whole methodology is "never disagree". So this
 * parser decides the shapes forms actually submit — ISO 8601, the slash and
 * dash conventions strtotime assigns (slashes American m/d/Y, dashes European
 * d-m-Y), and compact Ymd — and answers `'unknown'` for everything else,
 * which the engine turns into a round trip.
 *
 * Values without an explicit offset are read as UTC. That is not "the
 * server's timezone", but both sides of every comparison go through this same
 * parser, so comparisons stay internally consistent — the one place a fixed
 * convention could diverge from Laravel is a value WITH an offset against a
 * literal without one, which the fixture grid covers.
 */

export type ParsedDate = number | 'unknown' | null;

const ISO =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|z|[+-]\d{2}:?\d{2})?)?$/;
const SLASH_YMD = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const SLASH_MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DASH_DMY = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
const COMPACT = /^(\d{4})(\d{2})(\d{2})$/;

/** PHP's checkdate: real month, real day for that month and year >= 1. */
export function checkdate(month: number, day: number, year: number): boolean {
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysIn(month, year);
}

function daysIn(month: number, year: number): number {
    return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

function isLeap(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function offsetMinutes(token: string | undefined): number {
    if (token === undefined || token === 'Z' || token === 'z') return 0;

    const match = /^([+-])(\d{2}):?(\d{2})$/.exec(token);
    if (!match) return 0;

    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === '-' ? -minutes : minutes;
}

function timestamp(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    offset = 0,
): number | null {
    if (!checkdate(month, day, year)) return null;
    if (hour > 23 || minute > 59 || second > 59) return null;

    return Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000;
}

/**
 * A value's timestamp (ms), `null` when it is date-shaped but not a real
 * date (2023-02-31), and `'unknown'` when it is outside the shape set.
 */
export function parseDate(value: unknown): ParsedDate {
    if (typeof value !== 'string') return typeof value === 'number' ? 'unknown' : null;

    const iso = ISO.exec(value);
    if (iso) {
        return timestamp(
            Number(iso[1]),
            Number(iso[2]),
            Number(iso[3]),
            Number(iso[4] ?? 0),
            Number(iso[5] ?? 0),
            Number(iso[6] ?? 0),
            offsetMinutes(iso[7]),
        );
    }

    const ymd = SLASH_YMD.exec(value) ?? COMPACT.exec(value);
    if (ymd) return timestamp(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

    const mdy = SLASH_MDY.exec(value);
    if (mdy) return timestamp(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));

    const dmy = DASH_DMY.exec(value);
    if (dmy) return timestamp(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

    return 'unknown';
}

/**
 * The `date_format` token subset this runner translates. A format using
 * anything outside it — timezone names, ordinal suffixes, localised month
 * names — answers `'unknown'` and rounds trip.
 */
const TOKENS: Record<string, string> = {
    Y: '(\\d{4})',
    y: '(\\d{2})',
    m: '(\\d{2})',
    n: '(\\d{1,2})',
    d: '(\\d{2})',
    j: '(\\d{1,2})',
    H: '(\\d{2})',
    G: '(\\d{1,2})',
    h: '(\\d{2})',
    g: '(\\d{1,2})',
    i: '(\\d{2})',
    s: '(\\d{2})',
    v: '(\\d{3})',
    u: '(\\d{6})',
    A: '(AM|PM)',
    a: '(am|pm)',
    U: '(-?\\d+)',
};

const SEMANTIC = new Set(['Y', 'y', 'm', 'n', 'd', 'j', 'H', 'G', 'h', 'g', 'i', 's', 'A', 'a']);

/**
 * Whether the value matches a PHP date format EXACTLY — width, separators
 * and calendar. Mirrors `createFromFormat('!'.$format)` plus Laravel's
 * round-trip check, which together reject `2023-6-5` for `Y-m-d`.
 */
export function matchesFormat(value: string, format: string): boolean | 'unknown' {
    let pattern = '';
    const semantics: string[] = [];

    for (let i = 0; i < format.length; i++) {
        const token = format[i] as string;

        if (token === '\\') {
            pattern += escapeLiteral(format[++i] ?? '');
            continue;
        }

        const translated = TOKENS[token];

        if (translated !== undefined) {
            pattern += translated;
            if (SEMANTIC.has(token) || token === 'U') semantics.push(token);
            else semantics.push('');
            continue;
        }

        if (/[A-Za-z]/.test(token)) return 'unknown';

        pattern += escapeLiteral(token);
    }

    const match = new RegExp(`^${pattern}$`).exec(value);
    if (!match) return false;

    const parts: Record<string, number> = {};
    let meridiem: string | undefined;

    semantics.forEach((token, index) => {
        const captured = match[index + 1];
        if (token === '' || captured === undefined) return;
        if (token === 'A' || token === 'a') {
            meridiem = captured.toLowerCase();
            return;
        }
        parts[token] = Number(captured);
    });

    const month = parts.m ?? parts.n;
    const day = parts.d ?? parts.j;
    const year = parts.Y ?? (parts.y === undefined ? undefined : 2000 + parts.y);

    if (month !== undefined && (month < 1 || month > 12)) return false;

    if (month !== undefined && day !== undefined) {
        if (!checkdate(month, day, year ?? 2000)) return false;
    } else if (day !== undefined && (day < 1 || day > 31)) {
        return false;
    }

    const hour24 = parts.H ?? parts.G;
    if (hour24 !== undefined && hour24 > 23) return false;

    const hour12 = parts.h ?? parts.g;
    if (hour12 !== undefined && (hour12 < 1 || hour12 > 12)) return false;
    if (hour12 !== undefined && meridiem === undefined) {
        // A 12-hour token without a meridiem token still parses in PHP; the
        // hour range above is all that can be checked.
    }

    if ((parts.i ?? 0) > 59 || (parts.s ?? 0) > 59) return false;

    return true;
}

function escapeLiteral(character: string): string {
    return character.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
