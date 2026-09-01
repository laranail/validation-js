<?php

declare(strict_types=1);

namespace Simtabi\Laranail\ValidationJs;

use Closure;
use Illuminate\Http\Request;

/**
 * The allow-list behind the thin validate endpoint (§5.7.2): applications
 * register a key, a rules factory and — NON-OPTIONALLY — an authorization
 * callback. `RuleSet`s have no `authorize()` the way FormRequests do, so
 * the endpoint's §10.2 gate is this signature: there is no way to register
 * a remotely-validatable rule set without saying who may probe it. Fail
 * closed by construction, not by convention.
 */
final class RemoteRegistry
{
    /** @var array<string, array{rules: Closure(): array<string, mixed>, authorize: Closure(Request): bool}> */
    private array $entries = [];

    /**
     * @param  Closure(): array<string, mixed>  $rules  Returns FormRequest-style
     *                                                  rules. A `RuleSet` user passes
     *                                                  `fn () => $ruleSet->toArray()` — the
     *                                                  endpoint stays decoupled from the
     *                                                  optional laranail/validation package.
     * @param  Closure(Request): bool  $authorize  Who may probe this rule set.
     */
    public function register(string $key, Closure $rules, Closure $authorize): void
    {
        $this->entries[$key] = ['rules' => $rules, 'authorize' => $authorize];
    }

    /** @return array{rules: Closure(): array<string, mixed>, authorize: Closure(Request): bool}|null */
    public function get(string $key): ?array
    {
        return $this->entries[$key] ?? null;
    }

    /** @return list<string> */
    public function keys(): array
    {
        return array_keys($this->entries);
    }
}
