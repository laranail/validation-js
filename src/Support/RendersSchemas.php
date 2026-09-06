<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Support;

use Illuminate\Foundation\Http\FormRequest;
use Simtabi\Laranail\ValidationJs\SchemaFactory;

/**
 * The rendering behind the Blade directive and component: one inert JSON
 * data island (`type="application/json"` never executes, so the schema
 * rides inside a strict CSP without a script-src exemption), encoded with
 * the exporter's `JSON_HEX_*` flags so a `</script>` in a translated
 * message cannot terminate the block (§10.5). The optional nonce covers
 * policies that gate every script element regardless of type.
 */
final class RendersSchemas
{
    /**
     * @param array<string, mixed>|class-string<FormRequest> $source Rules, or a FormRequest class.
     */
    public static function directive(
        array|string $source,
        string $id = 'default',
        ?string $nonce = null,
    ): string {
        $factory = resolve(SchemaFactory::class);

        $schema = is_string($source)
            ? $factory->forRequest($source)
            : $factory->forRules($source);

        return self::island($schema, $id, $nonce);
    }

    /** @param  array<string, mixed>  $schema */
    public static function island(array $schema, string $id, ?string $nonce): string
    {
        $json = json_encode(
            $schema,
            JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP,
        );

        $escapedId = htmlspecialchars($id, ENT_QUOTES);
        $nonceAttribute = $nonce === null ? '' : ' nonce="' . htmlspecialchars($nonce, ENT_QUOTES) . '"';

        return '<script type="application/json" data-laranail-schema="' . $escapedId . '"'
            . $nonceAttribute . '>' . $json . '</script>';
    }
}
