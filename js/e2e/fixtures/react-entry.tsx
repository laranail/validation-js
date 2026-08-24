import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useValidation } from '../../src/adapters/react.ts';
import type { Schema, Values } from '../../src/types.ts';

/**
 * The SPA surface of the demo (§5.9): React owns every DOM node; the
 * library never touches one. Rendered under StrictMode deliberately — the
 * double-mount is the trap the adapter must survive.
 */
function SignupForm({ schema }: { schema: Schema }) {
    const v = useValidation(schema);
    const [submitted, setSubmitted] = useState<string | null>(null);

    return (
        <form
            onSubmit={v.handleSubmit((values: Values) => {
                setSubmitted(String(values.email));
            })}
        >
            <label htmlFor="email">Email</label>
            <input id="email" {...v.getFieldProps('email')} />
            {v.touched.email && v.errors.email !== undefined ? (
                <p data-error="email" role="alert">
                    {v.errors.email[0]}
                </p>
            ) : null}
            {v.validating ? <p data-validating>Checking…</p> : null}
            <button type="submit">Send</button>
            {submitted !== null ? <p data-submitted>{submitted}</p> : null}
        </form>
    );
}

declare global {
    interface Window {
        mountReactDemo: (schema: Schema) => void;
    }
}

window.mountReactDemo = (schema) => {
    const container = document.getElementById('root');
    if (container === null) throw new Error('no #root');

    createRoot(container).render(
        <StrictMode>
            <SignupForm schema={schema} />
        </StrictMode>,
    );
};
