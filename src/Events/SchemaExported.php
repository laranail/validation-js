<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Events;

/**
 * Fired after export, with the finished wire document — the audit hook: a
 * listener records who received which schema without being able to change
 * it (redaction happened in {@see SchemaExporting}).
 */
final readonly class SchemaExported
{
    /** @param  array<string, mixed>  $schema */
    public function __construct(
        public array $schema,
        public ?string $key = null,
    ) {}
}
