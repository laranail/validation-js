import { readControl } from '../form/NameMapper.ts';
import type { InputResolver } from './InputResolver.ts';

/**
 * The six shipped resolvers — thin DETECTORS over the DOM shapes the
 * popular widgets leave behind, not integrations with their APIs. Each is
 * an optional import; none is registered unless the consumer passes it,
 * so their cost when absent is zero bytes at runtime and zero at bundle
 * time (tree-shaken).
 *
 * Detection reads the widget's OWN marks (the class it stamps, the
 * property it attaches); values still come from the underlying real
 * input, which every one of these widgets keeps in sync for exactly the
 * form-submission path this runtime piggybacks on.
 */

function fromInput(element: Element): unknown {
    return readControl(element);
}

export const select2Resolver: InputResolver = {
    name: 'select2',
    detect: (el) => el.classList.contains('select2-hidden-accessible'),
    getValue: fromInput,
    getWrapper: (el) => el.nextElementSibling?.closest('.select2') ?? el.parentElement,
    events: () => ['change'],
};

export const tomSelectResolver: InputResolver = {
    name: 'tom-select',
    detect: (el) => el.classList.contains('tomselected') || 'tomselect' in el,
    getValue: fromInput,
    getWrapper: (el) => el.parentElement?.querySelector('.ts-wrapper') ?? el.parentElement,
    events: () => ['change'],
};

export const choicesResolver: InputResolver = {
    name: 'choices',
    detect: (el) => el.closest('.choices') !== null,
    getValue: fromInput,
    getWrapper: (el) => el.closest('.choices'),
    events: () => ['change'],
};

export const flatpickrResolver: InputResolver = {
    name: 'flatpickr',
    detect: (el) => el.classList.contains('flatpickr-input') || '_flatpickr' in el,
    getValue: fromInput,
    getWrapper: (el) => el.parentElement,
    events: () => ['change'],
};

export const tagifyResolver: InputResolver = {
    name: 'tagify',
    detect: (el) => el.classList.contains('tagify--hidden') || 'tagify' in el,
    getValue: fromInput,
    getWrapper: (el) => el.parentElement?.querySelector('.tagify') ?? el.parentElement,
    events: () => ['change'],
};

/** Bootstrap-style `.input-group`: place errors after the WHOLE group. */
export const inputGroupResolver: InputResolver = {
    name: 'input-group',
    detect: (el) => el.closest('.input-group') !== null,
    getValue: fromInput,
    getWrapper: (el) => el.closest('.input-group')?.parentElement ?? null,
    events: (el) => (el instanceof HTMLSelectElement ? ['change'] : ['input', 'change']),
};
