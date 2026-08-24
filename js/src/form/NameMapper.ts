/**
 * HTML form names ⇄ the engine's dotted paths, plus per-control value
 * reading.
 *
 * A browser posts `items[0][email]`; the schema and the engine speak
 * `items.0.email`. The mapping is mechanical but the corners are not:
 * a trailing `[]` means "collect every control of this name into an
 * array", checkboxes read as booleans only when they are alone under
 * their name, and `<select multiple>` is an array whatever its name
 * looks like.
 */

/** `items[0][email]` → `items.0.email`; a lone trailing `[]` is dropped. */
export function toPath(name: string): string {
    return name
        .replace(/\[\]$/, '')
        .replace(/\[([^\]]*)\]/g, '.$1')
        .replace(/\.$/, '');
}

/** `items.0.email` → `items[0][email]` — the inverse, for lookups by path. */
export function toName(path: string): string {
    const [head, ...rest] = path.split('.');

    return rest.reduce((name, segment) => `${name}[${segment}]`, head ?? '');
}

/**
 * The value a single control contributes, typed the way the ENGINE wants
 * it rather than the way the DOM stores it: an unchecked checkbox is
 * absent (HTML does not submit it), files are File objects, numbers stay
 * strings (that is what the server receives too).
 */
export function readControl(element: Element): unknown {
    if (element instanceof HTMLInputElement) {
        if (element.type === 'checkbox') return element.checked ? element.value : undefined;
        if (element.type === 'radio') return element.checked ? element.value : undefined;
        if (element.type === 'file') {
            const files = element.files;
            if (files === null || files.length === 0) return undefined;
            return element.multiple ? Array.from(files) : files[0];
        }

        return element.value;
    }

    if (element instanceof HTMLSelectElement) {
        if (element.multiple) {
            return Array.from(element.selectedOptions).map((option) => option.value);
        }

        return element.value;
    }

    if (element instanceof HTMLTextAreaElement) return element.value;

    return undefined;
}

/**
 * Every named control in a form, folded into the nested object the engine
 * validates. Later controls of the same name win, except:
 *
 * - `name[]` collects into an array in document order;
 * - radio groups contribute the CHECKED member (or nothing);
 * - checkbox groups sharing one plain name behave like radios do in
 *   Laravel's request parsing — last checked wins.
 */
export function readForm(form: HTMLFormElement): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    for (const element of Array.from(form.elements)) {
        const name = element.getAttribute('name');
        if (name === null || name === '') continue;

        const collects = name.endsWith('[]');
        const path = toPath(name);
        const value = readControl(element);

        if (value === undefined) continue;

        if (collects) {
            const existing = readAt(values, path);
            writeAt(values, path, Array.isArray(existing) ? [...existing, value] : [value]);
            continue;
        }

        writeAt(values, path, value);
    }

    return values;
}

function readAt(target: Record<string, unknown>, path: string): unknown {
    let current: unknown = target;

    for (const segment of path.split('.')) {
        if (current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[segment];
    }

    return current;
}

function writeAt(target: Record<string, unknown>, path: string, value: unknown): void {
    const segments = path.split('.');
    const last = segments.pop() as string;
    let current: Record<string, unknown> = target;

    for (const segment of segments) {
        const next = current[segment];

        if (next === null || typeof next !== 'object') {
            const created: Record<string, unknown> = {};
            current[segment] = created;
            current = created;
            continue;
        }

        current = next as Record<string, unknown>;
    }

    current[last] = value;
}
