<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Support;

/**
 * Reads the shipped JavaScript engine's source as data: which rules its
 * `checks` map implements, and which schema major it declares. The doctor
 * command and the catalogue-drift guard both ask these questions — a rule
 * the exporter advertises as client-side but the runner cannot evaluate
 * is a silent hole (§7.2), so the two lists are pinned to EXACT agreement
 * rather than manually synced.
 */
final class EngineIntrospection
{
    /** @return list<string> The rule names the JS engine's checks map implements. */
    public static function engineRuleNames(): array
    {
        $source = self::read('js/src/rules.ts');

        if ($source === null) {
            return [];
        }

        $start = strpos($source, 'export const checks = {');
        $end = $start === false ? false : strpos($source, '} satisfies Record<string, Check>;', $start);

        if ($start === false || $end === false) {
            return [];
        }

        preg_match_all('/^    ([a-z0-9_]+):/m', substr($source, $start, $end - $start), $matches);

        return $matches[1];
    }

    /** The schema major the JS runner declares, or null if unreadable. */
    public static function engineSchemaVersion(): ?int
    {
        $source = self::read('js/src/validate.ts');

        if ($source === null || preg_match('/export const SCHEMA_VERSION = (\d+);/', $source, $m) !== 1) {
            return null;
        }

        return (int) $m[1];
    }

    /** The package's own root, wherever Composer put it. */
    public static function packageRoot(): string
    {
        return dirname(__DIR__, 2);
    }

    private static function read(string $relative): ?string
    {
        $path = self::packageRoot().'/'.$relative;
        $contents = is_file($path) ? file_get_contents($path) : false;

        return $contents === false ? null : $contents;
    }
}
