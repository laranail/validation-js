<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs\Events;

/**
 * Fired before a schema is exported through any delivery tier. The arrays
 * are MUTABLE — this is the redaction and allow-listing seam (§10.1): a
 * listener drops a field the current user must not learn exists, rewrites
 * a message, or narrows the rule set, and every tier (inline, static,
 * dynamic) inherits the decision because they all export through the
 * same factory.
 */
final class SchemaExporting
{
    /**
     * @param array<string, mixed> $rules
     * @param array<string, string> $messages
     * @param array<string, string> $attributes
     * @param string|null $key The endpoint allow-list key, when the
     *                         export serves the dynamic tier; null for
     *                         programmatic and inline exports.
     */
    public function __construct(
        public array $rules,
        public array $messages,
        public array $attributes,
        public readonly ?string $key = null,
    ) {}
}
