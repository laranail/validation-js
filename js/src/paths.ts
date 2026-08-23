import type { Values } from './types.ts';

/**
 * Dotted-path reads and wildcard expansion, matching Laravel's own.
 *
 * A schema field key is a PATTERN, not a key. `items.*.email` never appears in
 * the submitted data — Laravel expands it against what was actually sent and
 * validates each concrete path. A runner that looked the pattern up literally
 * would find nothing and report a failure on a field nobody submitted, which
 * is worse than doing nothing: it blocks a valid form with a message naming a
 * field that does not exist.
 */

/** Read `items.0.email` out of nested objects and arrays. */
export function get(values: unknown, path: string): unknown {
    let current: unknown = values;

    for (const segment of path.split('.')) {
        if (current === null || current === undefined) return undefined;

        if (Array.isArray(current)) {
            const index = Number(segment);
            if (!Number.isInteger(index) || index < 0) return undefined;
            current = current[index];
            continue;
        }

        if (typeof current !== 'object') return undefined;

        // Own properties only: a bare index read finds 'constructor' and
        // friends on Object.prototype, so a hostile-looking path resolved to
        // a function and read as "present" — Laravel's Arr::get sees only
        // the data that was actually sent.
        current = Object.hasOwn(current, segment)
            ? (current as Record<string, unknown>)[segment]
            : undefined;
    }

    return current;
}

/** Whether the path exists at all, which `required` and `sometimes` both need. */
export function has(values: unknown, path: string): boolean {
    const segments = path.split('.');
    const last = segments.pop();
    if (last === undefined) return false;

    const parent = segments.length === 0 ? values : get(values, segments.join('.'));

    if (Array.isArray(parent)) {
        const index = Number(last);
        return Number.isInteger(index) && index >= 0 && index < parent.length;
    }

    // Object.hasOwn, never `in`: the `in` operator walks the prototype
    // chain, so a path segment like 'constructor' reads as present on every
    // object and a presence-conditional rule fires on data that was never
    // sent. Own properties are the only ones Laravel's Arr::has can see.
    return typeof parent === 'object' && parent !== null && Object.hasOwn(parent, last);
}

/**
 * Expand a wildcard pattern against the data into concrete paths.
 *
 * `items.*.email` over two items becomes `items.0.email` and `items.1.email`.
 * An empty or absent collection expands to NOTHING, which is why
 * `items.*.email => required` passes for `{items: []}`: there is no item, so
 * there is no field to require. Laravel behaves the same way, and a runner
 * that reported one missing field there would disagree with the server on the
 * most common empty-form case.
 */
export function expand(pattern: string, values: Values): string[] {
    if (!pattern.includes('*')) return [pattern];

    const [before, ...rest] = pattern.split('*');
    const prefix = before.replace(/\.$/, '');
    const suffix = rest.join('*').replace(/^\./, '');
    const collection = prefix === '' ? values : get(values, prefix);

    if (collection === null || collection === undefined) return [];

    const keys = Array.isArray(collection)
        ? collection.map((_, index) => String(index))
        : typeof collection === 'object'
          ? Object.keys(collection)
          : [];

    return keys.flatMap((key) => {
        const resolved = prefix === '' ? key : `${prefix}.${key}`;
        // Recurse: a pattern may hold more than one wildcard, and the second
        // can only be expanded once the first is concrete.
        return suffix === '' ? [resolved] : expand(`${resolved}.${suffix}`, values);
    });
}

/**
 * Resolve a rule's reference to another field, relative to the row first.
 *
 * Inside `items.0.password`, a `same:password_confirmation` means the sibling
 * in the SAME row. Resolving it at the top level would compare every row
 * against one shared field, which is not what the form means.
 */
export function sibling(field: string, other: string, values: Values): string {
    const segments = field.split('.');
    segments.pop();

    while (segments.length > 0) {
        const candidate = `${segments.join('.')}.${other}`;
        if (has(values, candidate)) return candidate;
        segments.pop();
    }

    return other;
}
