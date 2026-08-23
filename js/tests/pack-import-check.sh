#!/usr/bin/env bash
#
# The install-and-import check: pack the tarball exactly as `npm publish`
# would, install it into a clean throwaway project, and import it under
# plain Node. This is the only test that runs the PUBLISHED artifact —
# the unit suite runs the raw TypeScript sources and stayed green while
# the published package could not be imported at all (`main` pointed at
# a .ts file; Node refuses type-stripping under node_modules).
set -euo pipefail

package_dir="$(cd "$(dirname "$0")/../.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

tarball_name="$(cd "$package_dir" && npm pack --pack-destination "$work_dir" --silent | tail -1)"

cd "$work_dir"
npm init --yes > /dev/null 2>&1
npm install "./$tarball_name" --silent > /dev/null

cat > check.mjs <<'EOF'
import { validate } from '@laranail/validation-js';

const schema = {
    version: 1,
    fields: {
        email: { attribute: null, client: [{ rule: 'required', params: {} }, { rule: 'email', params: {} }], server: [] },
    },
    messages: { 'email.required': 'Required.', 'email.email': 'Not an email.' },
};

const good = validate({ email: 'a@b.co' }, schema);
const bad = validate({ email: 'nope' }, schema);

if (!good.valid || bad.valid || bad.failures[0].rule !== 'email') {
    console.error('imported package produced wrong verdicts', { good, bad });
    process.exit(1);
}

console.log('pack-import check passed: tarball installs and validates under plain Node');
EOF

node check.mjs
