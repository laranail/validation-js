import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';

/**
 * The §9 non-functional gate: Layer 0 (the verdict engine) stays small and
 * zero-dependency, and every runtime layer is separately importable so a
 * consumer who wants only the engine pays only for the engine. CI fails on
 * a regression past the budgets below.
 */
const BUDGETS = [
    { name: 'engine (Layer 0)', entry: 'js/src/validate.ts', limit: 8 * 1024 },
    { name: 'full runtime', entry: 'js/src/index.ts', limit: 16 * 1024 },
    { name: 'regex builder', entry: 'js/src/regex.ts', limit: 1536 },
];

let failed = false;

for (const { name, entry, limit } of BUDGETS) {
    const result = await build({
        entryPoints: [entry],
        bundle: true,
        minify: true,
        format: 'esm',
        write: false,
        logLevel: 'silent',
    });

    const bytes = gzipSync(result.outputFiles[0].contents).length;
    const ok = bytes <= limit;
    failed = failed || !ok;

    console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${name}: ${(bytes / 1024).toFixed(1)} KB min+gzip (budget ${limit / 1024} KB)`,
    );
}

process.exit(failed ? 1 : 0);
