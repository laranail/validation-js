import type { Check } from './rules.ts';

/**
 * The fluent regex builder — the JS half of the §6.9 pair, same method
 * vocabulary as PHP's `Simtabi\Laranail\Validation\Regex`, so a pattern
 * authored on either side reads identically on the other.
 *
 * Raw patterns stay first-class: `regex('^\\d{3}$')` compiles a raw
 * pattern (anchored semantics are JavaScript's own — `$` with no `m` flag
 * matches END OF STRING strictly, so the PCRE trailing-newline trap the
 * PHP builder adds `D` for does not exist here); `regex()` starts a
 * builder. Builder-built patterns are anchored by default, literals are
 * escaped, and nested unbounded quantifiers are refused without the
 * explicit `dangerouslyUnbounded()` opt-in — the catastrophic-backtracking
 * shape must not be expressible by accident in either language.
 */
export class RegexBuilder {
    private readonly fragments: string[] = [];
    private anchored = true;
    private caseFold = false;
    private allowUnbounded = false;
    private hasUnbounded = false;

    digits(count?: number): this {
        return this.push(count === undefined ? '\\d+' : `\\d{${count}}`, count === undefined);
    }

    letters(count?: number): this {
        return this.push(
            count === undefined ? '[A-Za-z]+' : `[A-Za-z]{${count}}`,
            count === undefined,
        );
    }

    literal(text: string): this {
        return this.push(escapeLiteral(text), false);
    }

    oneOf(...alternatives: string[]): this {
        return this.push(`(?:${alternatives.map(escapeLiteral).join('|')})`, false);
    }

    optional(build: (builder: RegexBuilder) => RegexBuilder): this {
        return this.push(`(?:${this.sub(build, false)})?`, false);
    }

    oneOrMore(build: (builder: RegexBuilder) => RegexBuilder): this {
        return this.push(`(?:${this.sub(build, true)})+`, true);
    }

    or(alternative: string | ((builder: RegexBuilder) => RegexBuilder)): this {
        const body = this.fragments.join('');
        const other =
            typeof alternative === 'string'
                ? escapeLiteral(alternative)
                : this.sub(alternative, false);
        this.fragments.length = 0;

        return this.push(`(?:${body}|${other})`, false);
    }

    group(build: (builder: RegexBuilder) => RegexBuilder): this {
        return this.push(`(?:${this.sub(build, false)})`, false);
    }

    /** Splice an un-audited fragment in — the one deliberate escape hatch. */
    raw(fragment: string): this {
        return this.push(fragment, looksUnbounded(fragment));
    }

    caseInsensitive(): this {
        this.caseFold = true;
        return this;
    }

    unanchored(): this {
        this.anchored = false;
        return this;
    }

    dangerouslyUnbounded(): this {
        this.allowUnbounded = true;
        return this;
    }

    compile(): RegExp {
        const body = this.fragments.join('');
        const pattern = this.anchored ? `^(?:${body})$` : body;

        return new RegExp(pattern, this.caseFold ? 'i' : '');
    }

    /** The compiled pattern as an engine Check, for `registerRule`. */
    rule(): Check {
        const expression = this.compile();

        return (value) => typeof value === 'string' && expression.test(value);
    }

    private push(fragment: string, unbounded: boolean): this {
        this.fragments.push(fragment);
        this.hasUnbounded = this.hasUnbounded || unbounded;

        return this;
    }

    private sub(build: (builder: RegexBuilder) => RegexBuilder, container: boolean): string {
        const builder = new RegexBuilder();
        builder.allowUnbounded = this.allowUnbounded;
        const built = build(builder);

        if (container && built.hasUnbounded && !this.allowUnbounded) {
            throw new Error(
                'An unbounded quantifier inside an unbounded group is the catastrophic-backtracking ' +
                    'shape. Bound the inner part, or opt in explicitly with dangerouslyUnbounded().',
            );
        }

        return built.fragments.join('');
    }
}

/**
 * `regex('^…$')` — a raw pattern compiled as written (your pattern, your
 * flags via a trailing RegExp when you need them); `regex()` — a builder.
 */
export function regex(raw?: string): RegexBuilder | { compile(): RegExp; rule(): Check } {
    if (raw === undefined) return new RegexBuilder();

    const expression = new RegExp(raw);

    return {
        compile: () => expression,
        rule: () => (value) => typeof value === 'string' && expression.test(value),
    };
}

function escapeLiteral(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function looksUnbounded(fragment: string): boolean {
    // No lookbehind (a parse-time SyntaxError on Safari < 16.4, §12.4):
    // an unescaped quantifier is one at the start or one whose preceding
    // character is not a backslash — the same heuristic, spelled forward.
    return /(?:^|[^\\])[+*]|\{\d+,\}/.test(fragment);
}
