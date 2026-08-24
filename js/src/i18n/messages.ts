/**
 * The i18n seam — deliberately small. Server strings are the source of
 * truth and are never overridden here; this module owns only what a
 * CLIENT-registered rule needs: picking a string for the active locale
 * and Laravel-style `|` pluralisation.
 */
export type LocalisedMessage = string | Record<string, string>;

export function resolveMessage(
    message: LocalisedMessage | undefined,
    locale: string,
): string | undefined {
    if (message === undefined || typeof message === 'string') return message;

    return message[locale] ?? message[locale.split('-')[0] ?? ''] ?? message.en;
}

/**
 * Laravel's `trans_choice` split: `"one apple|many apples"` picks by
 * count, with the optional `{0}`/`[2,*]` range syntax honoured where
 * present.
 */
export function pluralise(message: string, count: number): string {
    const parts = message.split('|');
    if (parts.length === 1) return message;

    for (const part of parts) {
        const exact = /^\{(\d+)\}\s*(.*)$/s.exec(part);
        if (exact && Number(exact[1]) === count) return exact[2] ?? '';

        const range = /^\[(\d+),(\d+|\*)\]\s*(.*)$/s.exec(part);
        if (range) {
            const from = Number(range[1]);
            const to = range[2] === '*' ? Number.POSITIVE_INFINITY : Number(range[2]);
            if (count >= from && count <= to) return range[3] ?? '';
        }
    }

    const plain = parts.filter((part) => !/^[{[]/.test(part));

    return (count === 1 ? plain[0] : (plain[1] ?? plain[0])) ?? message;
}
