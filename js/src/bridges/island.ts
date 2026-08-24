import type { Schema } from '../types.ts';

/**
 * Read a schema data island rendered by the Blade tier —
 * `<script type="application/json" data-laranail-schema="{id}">` — and
 * parse it. A missing or malformed island returns null, never throws: the
 * progressive-enhancement floor (§6.5) says a schema that fails to load
 * degrades to "server decides", not to a broken page.
 */
export function readSchemaIsland(id: string, root: Document | Element = document): Schema | null {
    const island = root.querySelector(
        `script[type="application/json"][data-laranail-schema="${cssEscape(id)}"]`,
    );

    if (island === null) return null;

    try {
        const parsed: unknown = JSON.parse(island.textContent ?? '');

        if (typeof parsed !== 'object' || parsed === null || !('fields' in parsed)) return null;

        return parsed as Schema;
    } catch {
        return null;
    }
}

function cssEscape(value: string): string {
    const scope = globalThis as { CSS?: { escape?: (v: string) => string } };

    return scope.CSS?.escape?.(value) ?? value.replace(/["\\]/g, '\\$&');
}
