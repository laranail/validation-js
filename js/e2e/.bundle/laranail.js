'use strict';
var Laranail = (() => {
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
        for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
        if ((from && typeof from === 'object') || typeof from === 'function') {
            for (let key of __getOwnPropNames(from))
                if (!__hasOwnProp.call(to, key) && key !== except)
                    __defProp(to, key, {
                        get: () => from[key],
                        enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
                    });
        }
        return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, '__esModule', { value: true }), mod);

    // js/src/index.ts
    var index_exports = {};
    __export(index_exports, {
        ClassMapRenderer: () => ClassMapRenderer,
        Emitter: () => Emitter,
        FormController: () => FormController,
        ResolverRegistry: () => ResolverRegistry,
        SCHEMA_VERSION: () => SCHEMA_VERSION,
        Scheduler: () => Scheduler,
        capturedKeys: () => capturedKeys,
        checks: () => checks,
        createHeadless: () => createHeadless,
        createValidator: () => createValidator,
        expand: () => expand,
        get: () => get,
        has: () => has,
        headlessRenderer: () => headlessRenderer,
        interpolate: () => interpolate,
        isEmpty: () => isEmpty,
        messageId: () => messageId,
        pluralise: () => pluralise,
        presets: () => presets_exports,
        pristine: () => pristine,
        readControl: () => readControl,
        readForm: () => readForm,
        resolveMessage: () => resolveMessage,
        resolvers: () => resolvers_exports,
        sizeOf: () => sizeOf,
        substituteAsterisks: () => substituteAsterisks,
        toName: () => toName,
        toPath: () => toPath,
        toRegExp: () => toRegExp,
        validate: () => validate,
        validateAsync: () => validateAsync,
    });

    // js/src/paths.ts
    function get(values, path) {
        let current = values;
        for (const segment of path.split('.')) {
            if (current === null || current === void 0) return void 0;
            if (Array.isArray(current)) {
                const index = Number(segment);
                if (!Number.isInteger(index) || index < 0) return void 0;
                current = current[index];
                continue;
            }
            if (typeof current !== 'object') return void 0;
            current = Object.hasOwn(current, segment) ? current[segment] : void 0;
        }
        return current;
    }
    function has(values, path) {
        const segments = path.split('.');
        const last = segments.pop();
        if (last === void 0) return false;
        const parent = segments.length === 0 ? values : get(values, segments.join('.'));
        if (Array.isArray(parent)) {
            const index = Number(last);
            return Number.isInteger(index) && index >= 0 && index < parent.length;
        }
        return typeof parent === 'object' && parent !== null && Object.hasOwn(parent, last);
    }
    function expand(pattern, values) {
        if (!pattern.includes('*')) return [pattern];
        const [before = '', ...rest] = pattern.split('*');
        const prefix = before.replace(/\.$/, '');
        const suffix = rest.join('*').replace(/^\./, '');
        const collection = prefix === '' ? values : get(values, prefix);
        if (collection === null || collection === void 0) return [];
        const keys = Array.isArray(collection)
            ? collection.map((_, index) => String(index))
            : typeof collection === 'object'
              ? Object.keys(collection)
              : [];
        return keys.flatMap((key) => {
            const resolved = prefix === '' ? key : `${prefix}.${key}`;
            return suffix === '' ? [resolved] : expand(`${resolved}.${suffix}`, values);
        });
    }
    function capturedKeys(pattern, field) {
        if (!pattern.includes('*')) return [];
        const patternSegments = pattern.split('.');
        const fieldSegments = field.split('.');
        const keys = [];
        patternSegments.forEach((segment, index) => {
            const concrete = fieldSegments[index];
            if (segment === '*' && concrete !== void 0) keys.push(concrete);
        });
        return keys;
    }
    function substituteAsterisks(value, keys) {
        let next = 0;
        return value.replace(/\*/g, (literal) => keys[next++] ?? literal);
    }

    // js/src/dates.ts
    var ISO =
        /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|z|[+-]\d{2}:?\d{2})?)?$/;
    var SLASH_YMD = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
    var SLASH_MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    var DASH_DMY = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
    var COMPACT = /^(\d{4})(\d{2})(\d{2})$/;
    function checkdate(month, day, year) {
        return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysIn(month, year);
    }
    function daysIn(month, year) {
        return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
    }
    function isLeap(year) {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }
    function offsetMinutes(token) {
        if (token === void 0 || token === 'Z' || token === 'z') return 0;
        const match = /^([+-])(\d{2}):?(\d{2})$/.exec(token);
        if (!match) return 0;
        const minutes = Number(match[2]) * 60 + Number(match[3]);
        return match[1] === '-' ? -minutes : minutes;
    }
    function timestamp(year, month, day, hour = 0, minute = 0, second = 0, offset = 0) {
        if (!checkdate(month, day, year)) return null;
        if (hour > 23 || minute > 59 || second > 59) return null;
        return Date.UTC(year, month - 1, day, hour, minute, second) - offset * 6e4;
    }
    function parseDate(value) {
        if (typeof value !== 'string') return typeof value === 'number' ? 'unknown' : null;
        const iso = ISO.exec(value);
        if (iso) {
            return timestamp(
                Number(iso[1]),
                Number(iso[2]),
                Number(iso[3]),
                Number(iso[4] ?? 0),
                Number(iso[5] ?? 0),
                Number(iso[6] ?? 0),
                offsetMinutes(iso[7]),
            );
        }
        const ymd = SLASH_YMD.exec(value) ?? COMPACT.exec(value);
        if (ymd) return timestamp(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
        const mdy = SLASH_MDY.exec(value);
        if (mdy) return timestamp(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));
        const dmy = DASH_DMY.exec(value);
        if (dmy) return timestamp(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
        return 'unknown';
    }
    var TOKENS = {
        Y: '(\\d{4})',
        y: '(\\d{2})',
        m: '(\\d{2})',
        n: '(\\d{1,2})',
        d: '(\\d{2})',
        j: '(\\d{1,2})',
        H: '(\\d{2})',
        G: '(\\d{1,2})',
        h: '(\\d{2})',
        g: '(\\d{1,2})',
        i: '(\\d{2})',
        s: '(\\d{2})',
        v: '(\\d{3})',
        u: '(\\d{6})',
        A: '(AM|PM)',
        a: '(am|pm)',
        U: '(-?\\d+)',
    };
    var SEMANTIC = /* @__PURE__ */ new Set([
        'Y',
        'y',
        'm',
        'n',
        'd',
        'j',
        'H',
        'G',
        'h',
        'g',
        'i',
        's',
        'A',
        'a',
    ]);
    function matchesFormat(value, format) {
        let pattern = '';
        const semantics = [];
        for (let i = 0; i < format.length; i++) {
            const token = format[i];
            if (token === '\\') {
                pattern += escapeLiteral(format[++i] ?? '');
                continue;
            }
            const translated = TOKENS[token];
            if (translated !== void 0) {
                pattern += translated;
                if (SEMANTIC.has(token) || token === 'U') semantics.push(token);
                else semantics.push('');
                continue;
            }
            if (/[A-Za-z]/.test(token)) return 'unknown';
            pattern += escapeLiteral(token);
        }
        const match = new RegExp(`^${pattern}$`).exec(value);
        if (!match) return false;
        const parts = {};
        let meridiem;
        semantics.forEach((token, index) => {
            const captured = match[index + 1];
            if (token === '' || captured === void 0) return;
            if (token === 'A' || token === 'a') {
                meridiem = captured.toLowerCase();
                return;
            }
            parts[token] = Number(captured);
        });
        const month = parts.m ?? parts.n;
        const day = parts.d ?? parts.j;
        const year = parts.Y ?? (parts.y === void 0 ? void 0 : 2e3 + parts.y);
        if (month !== void 0 && (month < 1 || month > 12)) return false;
        if (month !== void 0 && day !== void 0) {
            if (!checkdate(month, day, year ?? 2e3)) return false;
        } else if (day !== void 0 && (day < 1 || day > 31)) {
            return false;
        }
        const hour24 = parts.H ?? parts.G;
        if (hour24 !== void 0 && hour24 > 23) return false;
        const hour12 = parts.h ?? parts.g;
        if (hour12 !== void 0 && (hour12 < 1 || hour12 > 12)) return false;
        if (hour12 !== void 0 && meridiem === void 0) {
        }
        if ((parts.i ?? 0) > 59 || (parts.s ?? 0) > 59) return false;
        return true;
    }
    function escapeLiteral(character) {
        return character.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    }

    // js/src/rules.ts
    function isFileList(value) {
        return typeof FileList !== 'undefined' && value instanceof FileList;
    }
    function isFile(value) {
        return typeof File !== 'undefined' && value instanceof File;
    }
    function isEmpty(value) {
        if (value === null || value === void 0) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (isFileList(value)) return value.length === 0;
        return false;
    }
    function sizeOf(value, isNumeric) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            return isNumeric && numeric(value) ? Number(value) : [...value].length;
        }
        if (Array.isArray(value)) return value.length;
        if (isFile(value)) return value.size / 1024;
        if (isFileList(value)) return value.length;
        if (typeof value === 'boolean') return value ? 1 : 0;
        return 0;
    }
    var EMAIL = /^[^\s@]+@[^\s@]+$/;
    var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var ULID = /^[0-7][0-9ABCDEFGHJKMNPQRSTVWXYZ]{25}$/i;
    var IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    var MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
    var HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
    function str(value) {
        return value === null || value === void 0 ? '' : String(value);
    }
    function num(value) {
        return Number(value ?? 0);
    }
    var PHP_NUMERIC = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/;
    function numeric(value) {
        if (typeof value === 'number') return Number.isFinite(value);
        if (typeof value !== 'string') return false;
        return PHP_NUMERIC.test(value);
    }
    function isFileValue(value) {
        return isFile(value) || isFileList(value);
    }
    var IMPLICIT = /* @__PURE__ */ new Set([
        'required',
        'filled',
        'present',
        'present_if',
        'present_unless',
        'present_with',
        'present_with_all',
        'accepted',
        'accepted_if',
        'declined',
        'declined_if',
        'missing',
        'missing_if',
        'missing_unless',
        'missing_with',
        'missing_with_all',
        'required_if',
        'required_if_accepted',
        'required_if_declined',
        'required_unless',
        'required_with',
        'required_with_all',
        'required_without',
        'required_without_all',
    ]);
    var REQUIRED_PARAMS = {
        max: ['max'],
        min: ['min'],
        size: ['size'],
        between: ['min', 'max'],
        digits: ['digits'],
        digits_between: ['min', 'max'],
        decimal: ['min'],
        multiple_of: ['value'],
        regex: ['pattern'],
        not_regex: ['pattern'],
        same: ['other'],
        different: ['other'],
        after: ['date'],
        after_or_equal: ['date'],
        before: ['date'],
        before_or_equal: ['date'],
        date_equals: ['date'],
        gt: ['value'],
        gte: ['value'],
        lt: ['value'],
        lte: ['value'],
        required_if: ['other'],
        required_unless: ['other'],
        required_if_accepted: ['other'],
        required_if_declined: ['other'],
        accepted_if: ['other'],
        declined_if: ['other'],
        prohibited_if: ['other'],
        prohibited_unless: ['other'],
        prohibited_if_accepted: ['other'],
        prohibited_if_declined: ['other'],
        missing_if: ['other'],
        missing_unless: ['other'],
        present_if: ['other'],
        present_unless: ['other'],
        max_digits: ['max'],
        min_digits: ['min'],
        in_array: ['other'],
    };
    var REQUIRES_ANY_PARAM = /* @__PURE__ */ new Set([
        'date_format',
        'in',
        'not_in',
        'starts_with',
        'ends_with',
        'doesnt_start_with',
        'doesnt_end_with',
        'contains',
        'doesnt_contain',
        'required_with',
        'required_with_all',
        'required_without',
        'required_without_all',
    ]);
    var NAMES_DEPENDENT_AT_ZERO = /* @__PURE__ */ new Set([
        'required_if',
        'required_unless',
        'required_if_accepted',
        'required_if_declined',
        'accepted_if',
        'declined_if',
        'prohibited_if',
        'prohibited_unless',
        'prohibited_if_accepted',
        'prohibited_if_declined',
        'missing_if',
        'missing_unless',
        'present_if',
        'present_unless',
    ]);
    function hasRequiredParams(rule, params) {
        const required = REQUIRED_PARAMS[rule];
        const satisfied = (name) =>
            params[name] !== void 0 ||
            (name === 'other' &&
                (NAMES_DEPENDENT_AT_ZERO.has(rule) || rule === 'in_array') &&
                params['0'] !== void 0);
        if (required !== void 0 && !required.every(satisfied)) {
            return false;
        }
        return !REQUIRES_ANY_PARAM.has(rule) || Object.values(params).length > 0;
    }
    var acceptedCheck = (v) => ['yes', 'on', '1', 1, true, 'true'].includes(v);
    var declinedCheck = (v) => ['no', 'off', '0', 0, false, 'false'].includes(v);
    var ipv4Check = (v) =>
        IPV4.test(str(v)) &&
        str(v)
            .split('.')
            .every((o) => Number(o) <= 255 && (o === '0' || !o.startsWith('0')));
    var ipv6Check = (v) => {
        try {
            return str(v).includes(':') && new URL(`http://[${str(v)}]`).hostname !== '';
        } catch {
            return false;
        }
    };
    var inCheck = (v, p, c) => {
        if (Array.isArray(v)) {
            return (
                c.arrayField &&
                v.every((el) => !Array.isArray(el) && Object.values(p).includes(str(el)))
            );
        }
        return Object.values(p).includes(str(v));
    };
    var checks = {
        required: (v) => !isEmpty(v),
        // `filled` is `required` only when the key is THERE. An absent attribute
        // passes it — the rule says "if you send it, send something", which is not
        // the same as requiring it, and treating the two alike rejected a payload
        // Laravel accepts.
        filled: (v, _p, c) => (has(c.values, c.field) ? !isEmpty(v) : true),
        // Laravel's `present` asks whether the KEY exists, not whether the value is
        // anything in particular: `{name: null}` is present and passes. Testing the
        // value instead failed a payload Laravel accepts.
        present: (_v, _p, c) => has(c.values, c.field),
        // Presence modifiers are structural: they change whether OTHER rules run,
        // and never fail on their own.
        nullable: () => true,
        sometimes: () => true,
        array: (v) => Array.isArray(v),
        // A JavaScript array IS a list; PHP's associative arrays arrive here as
        // objects and correctly fail both.
        list: (v) => Array.isArray(v),
        required_array_keys: (v, p) => {
            if (v === null || typeof v !== 'object') return false;
            return Object.values(p).every((key) =>
                Array.isArray(v)
                    ? Number(key) >= 0 && Number(key) < v.length
                    : Object.hasOwn(v, key),
            );
        },
        // Digit-count bounds on the STRING form — '-12' has a non-digit and
        // fails, exactly as the vendor's [^0-9] scan does.
        max_digits: (v, p) => digitCount(v) !== null && digitCount(v) <= num(p.max),
        min_digits: (v, p) => digitCount(v) !== null && digitCount(v) >= num(p.min),
        // The value must appear among another field's expanded values, loosely —
        // in_array:users.*.id is the canonical spelling.
        in_array: (v, p, c) => {
            const pattern = p.other ?? p['0'];
            if (pattern === void 0) return false;
            return expand(pattern, c.values)
                .map((f) => get(c.values, f))
                .some((el) => looselyEquals(el, v));
        },
        // Unique among the OTHER expansions of the same pattern. `strict` and
        // `ignore_case` ride as flags, as they do in Laravel.
        distinct: (v, p, c) => {
            const flags = Object.values(p);
            const siblings = expand(c.pattern, c.values)
                .filter((f) => f !== c.field)
                .map((f) => get(c.values, f));
            return !siblings.some((el) => {
                if (
                    flags.includes('ignore_case') &&
                    typeof v === 'string' &&
                    typeof el === 'string'
                ) {
                    return el.toLowerCase() === v.toLowerCase();
                }
                return flags.includes('strict') ? strictEquals(el, v) : looselyEquals(el, v);
            });
        },
        // `boolean:strict` narrows to the real booleans — Laravel honours the
        // parameter, and the fixture proved it (1 and '1' fail under it).
        boolean: (v, p) =>
            Object.values(p).includes('strict')
                ? v === true || v === false
                : [true, false, 1, 0, '1', '0'].includes(v),
        integer: (v, p) =>
            Object.values(p).includes('strict')
                ? typeof v === 'number' && Number.isInteger(v)
                : phpInteger(v),
        numeric: (v) => numeric(v),
        string: (v) => typeof v === 'string',
        json: (v) => {
            if (typeof v !== 'string') return false;
            try {
                JSON.parse(v);
                return true;
            } catch {
                return false;
            }
        },
        // `p.max`/`p.min`/`p.size` rather than a shared `p.value`, because the key
        // is also what the message interpolates — see RuleCatalogue::PARAMETER_NAMES.
        max: (v, p, c) => sizeOf(v, c.numericField) <= num(p.max),
        min: (v, p, c) => sizeOf(v, c.numericField) >= num(p.min),
        size: (v, p, c) => sizeOf(v, c.numericField) === num(p.size),
        between: (v, p, c) => {
            const size = sizeOf(v, c.numericField);
            return size >= num(p.min) && size <= num(p.max);
        },
        digits: (v, p) => /^\d+$/.test(str(v)) && str(v).length === num(p.digits),
        digits_between: (v, p) => {
            const s = str(v);
            return /^\d+$/.test(s) && s.length >= num(p.min) && s.length <= num(p.max);
        },
        alpha: (v) => /^[\p{L}\p{M}]+$/u.test(str(v)),
        alpha_dash: (v) => /^[\p{L}\p{M}\p{N}_-]+$/u.test(str(v)),
        alpha_num: (v) => /^[\p{L}\p{M}\p{N}]+$/u.test(str(v)),
        ascii: (v) => /^[\x00-\x7F]*$/.test(str(v)),
        email: (v) => EMAIL.test(str(v)),
        hex_color: (v) => HEX_COLOR.test(str(v)),
        ip: (v, p, c) => ipv4Check(v, p, c) || ipv6Check(v, p, c),
        ipv4: ipv4Check,
        ipv6: ipv6Check,
        lowercase: (v) => str(v) === str(v).toLowerCase(),
        uppercase: (v) => str(v) === str(v).toUpperCase(),
        mac_address: (v) => MAC.test(str(v)),
        ulid: (v) => ULID.test(str(v)),
        uuid: (v) => UUID.test(str(v)),
        url: (v, p) => {
            let protocol;
            try {
                protocol = new URL(str(v)).protocol;
            } catch {
                return false;
            }
            const declared = Object.values(p);
            if (declared.length > 0) {
                return declared.map((scheme) => `${scheme.toLowerCase()}:`).includes(protocol);
            }
            if (['http:', 'https:', 'ftp:', 'ftps:'].includes(protocol)) return true;
            return 'undetermined';
        },
        // The file pre-flight tier — ADVISORY by design. A browser knows a
        // file's name, declared type and byte size; only the server reads the
        // bytes. So these fail fast on the obviously-wrong pick (the UX win) and
        // answer 'undetermined' on a match, because a green tick from a
        // NAME-derived check is precisely the lie the server then exposes.
        file: (v) => (isFile(v) ? true : false),
        mimes: (v, p) => {
            if (!isFile(v)) return false;
            const name = v.name ?? '';
            const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
            return Object.values(p).some((allowed) => allowed.toLowerCase() === extension)
                ? 'undetermined'
                : false;
        },
        extensions: (v, p) => {
            if (!isFile(v)) return false;
            const name = v.name ?? '';
            const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
            return Object.values(p).some((allowed) => allowed.toLowerCase() === extension)
                ? 'undetermined'
                : false;
        },
        image: (v) => {
            if (!isFile(v)) return false;
            const type = v.type ?? '';
            return type.startsWith('image/') ? 'undetermined' : false;
        },
        // The first ASYNC rule: constraints on the decoded image. In a browser
        // the file is decoded (createImageBitmap) and the answer is a Promise;
        // where decoding is unavailable the rule is undetermined — never a
        // guess from the filename.
        dimensions: (v, p) => {
            if (!isFile(v)) return false;
            if (typeof createImageBitmap === 'undefined') return 'undetermined';
            return createImageBitmap(v).then(
                (bitmap) => {
                    const constraints = Object.values(p).map((entry) => entry.split('=', 2));
                    const { width, height } = bitmap;
                    bitmap.close();
                    return constraints.every(([name, raw]) => {
                        const bound = Number(raw);
                        switch (name) {
                            case 'width':
                                return width === bound;
                            case 'height':
                                return height === bound;
                            case 'min_width':
                                return width >= bound;
                            case 'min_height':
                                return height >= bound;
                            case 'max_width':
                                return width <= bound;
                            case 'max_height':
                                return height <= bound;
                            case 'ratio': {
                                const [num2, den] = (raw ?? '').split('/');
                                const ratio =
                                    den === void 0 ? Number(num2) : Number(num2) / Number(den);
                                return (
                                    Math.abs(ratio - width / height) < 1 / Math.min(width, height)
                                );
                            }
                            default:
                                return true;
                        }
                    });
                },
                // Undecodable is not an image with the wrong size — it fails.
                () => false,
            );
        },
        // The date family. `date` decides the documented shape set and answers
        // 'undetermined' outside it — a strtotime port would be a second
        // implementation that disagrees at exactly the edges nobody tests.
        date: (v) => {
            const parsed = parseDate(v);
            return parsed === 'unknown' ? 'undetermined' : parsed !== null;
        },
        date_format: (v, p) => {
            if (typeof v !== 'string') return false;
            let sawUnknown = false;
            for (const format of Object.values(p)) {
                const matched = matchesFormat(v, format);
                if (matched === true) return true;
                if (matched === 'unknown') sawUnknown = true;
            }
            return sawUnknown ? 'undetermined' : false;
        },
        after: (v, p, c) => dateCompares(v, p.date, c, (d) => d > 0),
        after_or_equal: (v, p, c) => dateCompares(v, p.date, c, (d) => d >= 0),
        before: (v, p, c) => dateCompares(v, p.date, c, (d) => d < 0),
        before_or_equal: (v, p, c) => dateCompares(v, p.date, c, (d) => d <= 0),
        // The FULL timestamp, not the calendar day — the same divergence the
        // PHP optimizer shipped as P3, mirrored here so neither half repeats it.
        date_equals: (v, p, c) => dateCompares(v, p.date, c, (d) => d === 0),
        timezone: (v, p) => {
            if (Object.values(p).length > 0) return 'undetermined';
            if (typeof v !== 'string') return false;
            let zones;
            try {
                zones = Intl.supportedValuesOf('timeZone');
            } catch {
                return 'undetermined';
            }
            if (v === 'UTC' || zones.includes(v)) return true;
            return /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(v) ? false : 'undetermined';
        },
        regex: (v, p) => toRegExp(p.pattern)?.test(str(v)) ?? true,
        not_regex: (v, p) => !(toRegExp(p.pattern)?.test(str(v)) ?? false),
        in: inCheck,
        not_in: (v, p, c) => !inCheck(v, p, c),
        // Conditional presence. Each decides from OTHER fields whether this one
        // is required, then defers to the same emptiness test `required` uses.
        // `required_if` alone starts with Laravel's Arr::has guard: an ABSENT
        // dependent means never required, while a PRESENT null one still goes
        // through value matching. `required_unless` has no such guard — absent
        // resolves to null and can match a declared 'null'.
        required_if: (v, p, c) =>
            !has(c.values, dependentField(p) ?? '') || !matchesCondition(p, c) ? true : !isEmpty(v),
        required_unless: (v, p, c) => (matchesCondition(p, c) ? true : !isEmpty(v)),
        required_if_accepted: (v, p, c) =>
            acceptedCheck(other(c, p.other), {}, c) ? !isEmpty(v) : true,
        required_if_declined: (v, p, c) =>
            declinedCheck(other(c, p.other), {}, c) ? !isEmpty(v) : true,
        // `required_with` asks whether ANY named field is present; `_all` whether
        // every one is. `_without` and `_without_all` are their negations, and the
        // asymmetry between the pairs is Laravel's, not a mistake here:
        // `required_without:a,b` fires when ANY is missing, `_without_all` only
        // when ALL are.
        required_with: (v, p, c) => (fields(p).some((f) => present(c, f)) ? !isEmpty(v) : true),
        required_with_all: (v, p, c) =>
            fields(p).every((f) => present(c, f)) ? !isEmpty(v) : true,
        required_without: (v, p, c) => (fields(p).some((f) => !present(c, f)) ? !isEmpty(v) : true),
        required_without_all: (v, p, c) =>
            fields(p).every((f) => !present(c, f)) ? !isEmpty(v) : true,
        accepted: acceptedCheck,
        accepted_if: (v, p, c) => (matchesCondition(p, c) ? acceptedCheck(v, {}, c) : true),
        declined: declinedCheck,
        declined_if: (v, p, c) => (matchesCondition(p, c) ? declinedCheck(v, {}, c) : true),
        // The prohibition family. `prohibited` reads oddly as `isEmpty` — it is
        // Laravel's `! validateRequired`: when the rule RUNS (present, non-blank
        // value) anything non-empty fails, and the engine's gating supplies the
        // pass for absent and blank values, exactly as isValidatable does.
        prohibited: (v) => isEmpty(v),
        prohibited_if: (v, p, c) => (matchesCondition(p, c) ? isEmpty(v) : true),
        prohibited_unless: (v, p, c) => (matchesCondition(p, c) ? true : isEmpty(v)),
        prohibited_if_accepted: (v, p, c) =>
            acceptedCheck(other(c, dependentField(p)), {}, c) ? isEmpty(v) : true,
        prohibited_if_declined: (v, p, c) =>
            declinedCheck(other(c, dependentField(p)), {}, c) ? isEmpty(v) : true,
        // `prohibits` points the other way: THIS field being filled forbids the
        // named ones from being filled.
        prohibits: (v, p, c) => isEmpty(v) || fields(p).every((f) => isEmpty(get(c.values, f))),
        // The missing family asks about the KEY, not the value — `{field: null}`
        // fails `missing`. All implicit: their whole job is judging absence.
        missing: (_v, _p, c) => !has(c.values, c.field),
        missing_if: (v, p, c) => (matchesCondition(p, c) ? !has(c.values, c.field) : true),
        missing_unless: (v, p, c) => (matchesCondition(p, c) ? true : !has(c.values, c.field)),
        // PRESENCE of the named fields triggers these — Arr::hasAny/has, not
        // filled-ness, which is where they differ from required_with's family.
        missing_with: (v, p, c) =>
            fields(p).some((f) => has(c.values, f)) ? !has(c.values, c.field) : true,
        missing_with_all: (v, p, c) =>
            fields(p).every((f) => has(c.values, f)) ? !has(c.values, c.field) : true,
        present_if: (v, p, c) => (matchesCondition(p, c) ? has(c.values, c.field) : true),
        present_unless: (v, p, c) => (matchesCondition(p, c) ? true : has(c.values, c.field)),
        present_with: (v, p, c) =>
            fields(p).some((f) => has(c.values, f)) ? has(c.values, c.field) : true,
        present_with_all: (v, p, c) =>
            fields(p).every((f) => has(c.values, f)) ? has(c.values, c.field) : true,
        // The default counterpart is the FULL concrete path plus `_confirmation`
        // — items.0.password looks for items.0.password_confirmation — which is
        // Laravel's own spelling: $attribute.'_confirmation', resolved from root.
        confirmed: (v, p, c) => strictEquals(v, other(c, p.other ?? `${c.field}_confirmation`)),
        // STRICT, like Laravel's === — an integer 1 is not '1', which matters
        // for JSON payloads where types survive the trip. Loose stringified
        // comparison green-ticked exactly those.
        same: (v, p, c) => strictEquals(v, other(c, p.other)),
        different: (v, p, c) => !strictEquals(v, other(c, p.other)),
        gt: (v, p, c) => comparesAs(v, p.value, c, (d) => d > 0),
        gte: (v, p, c) => comparesAs(v, p.value, c, (d) => d >= 0),
        lt: (v, p, c) => comparesAs(v, p.value, c, (d) => d < 0),
        lte: (v, p, c) => comparesAs(v, p.value, c, (d) => d <= 0),
        starts_with: (v, p) => Object.values(p).some((prefix) => str(v).startsWith(prefix)),
        ends_with: (v, p) => Object.values(p).some((suffix) => str(v).endsWith(suffix)),
        doesnt_start_with: (v, p) => !Object.values(p).some((prefix) => str(v).startsWith(prefix)),
        doesnt_end_with: (v, p) => !Object.values(p).some((suffix) => str(v).endsWith(suffix)),
        // Laravel's `contains` asks whether the ATTRIBUTE ARRAY contains the given
        // values. It is not a substring test — `contains:foo` fails for the string
        // 'a foo b', which is the opposite of what the name suggests.
        contains: (v, p) =>
            Array.isArray(v) && Object.values(p).every((n) => v.map(str).includes(n)),
        doesnt_contain: (v, p) =>
            Array.isArray(v) && !Object.values(p).some((n) => v.map(str).includes(n)),
        decimal: (v, p) => {
            const match = /^[+-]?(?=.*\d)\d*\.(\d*)$|^[+-]?\d+$/.exec(str(v));
            if (!match) return false;
            const places = match[1]?.length ?? 0;
            const min = num(p.min);
            const max = p.max === void 0 ? min : num(p.max);
            return places >= min && places <= max;
        },
        multiple_of: (v, p) => {
            const divisor = num(p.value);
            if (divisor === 0 || !numeric(v)) return false;
            const scale = 10 ** Math.max(decimals(String(v)), decimals(String(divisor)));
            return Math.round(Number(v) * scale) % Math.round(divisor * scale) === 0;
        },
    };
    function decimals(value) {
        return value.split('.')[1]?.length ?? 0;
    }
    function other(ctx, name) {
        return name === void 0 ? void 0 : get(ctx.values, name);
    }
    function fields(params) {
        return Object.values(params);
    }
    function present(ctx, name) {
        return !isEmpty(other(ctx, name));
    }
    function dependentField(params) {
        return params.other ?? Object.entries(params)[0]?.[1];
    }
    function matchesCondition(params, ctx) {
        const entries = Object.entries(params);
        const values = entries
            .filter(([key]) => key !== 'other' && key !== '0')
            .map(([, value]) => value);
        const actual = other(ctx, dependentField(params));
        return values.some((value) => {
            if (typeof actual === 'boolean') {
                return value === (actual ? 'true' : 'false');
            }
            if (actual === null || actual === void 0) {
                return value.toLowerCase() === 'null';
            }
            return str(actual) === value;
        });
    }
    function dateCompares(value, name, ctx, op) {
        const fieldValue = name === void 0 ? void 0 : get(ctx.values, name);
        const comparand = parseDate(fieldValue !== void 0 ? fieldValue : name);
        const own = parseDate(value);
        if (own === null) return false;
        if (own === 'unknown' || comparand === 'unknown' || comparand === null)
            return 'undetermined';
        return op(own - comparand);
    }
    function phpInteger(value) {
        if (typeof value === 'number') return Number.isInteger(value);
        if (typeof value !== 'string') return false;
        const trimmed = value.trim();
        if (!/^[+-]?(?:0|[1-9]\d*)$/.test(trimmed)) return false;
        try {
            const parsed = BigInt(trimmed);
            return parsed >= -9223372036854775808n && parsed <= 9223372036854775807n;
        } catch {
            return false;
        }
    }
    function digitCount(value) {
        if (typeof value !== 'string' && typeof value !== 'number') return null;
        const rendered = String(value);
        return /^[0-9]+$/.test(rendered) ? rendered.length : null;
    }
    function looselyEquals(a, b) {
        if (a === null || a === void 0 || b === null || b === void 0) {
            return (a === null || a === void 0) === (b === null || b === void 0);
        }
        if (typeof a === 'object' || typeof b === 'object') return strictEquals(a, b);
        if (numeric(a) && numeric(b)) return Number(a) === Number(b);
        return str(a) === str(b);
    }
    function strictEquals(a, b) {
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((el, i) => strictEquals(el, b[i]));
        }
        return a === b;
    }
    function sameType(a, b) {
        return (Array.isArray(a) ? 'array' : typeof a) === (Array.isArray(b) ? 'array' : typeof b);
    }
    function comparesAs(value, name, ctx, op) {
        const comparedTo = other(ctx, name);
        const numericAttribute = ctx.numericField || numeric(value);
        if (comparedTo === void 0 || comparedTo === null) {
            return numeric(value) && numeric(name)
                ? op(sizeOf(value, numericAttribute) - Number(name))
                : false;
        }
        if (numeric(name)) return false;
        if (numericAttribute && numeric(value) && numeric(comparedTo)) {
            return op(Number(value) - Number(comparedTo));
        }
        if (!sameType(value, comparedTo)) return false;
        return op(sizeOf(value, numericAttribute) - sizeOf(comparedTo, numericAttribute));
    }
    function toRegExp(pattern) {
        if (!pattern) return null;
        const match = /^([/#~%])(.*)\1([imsuxADSUXJn]*)$/s.exec(pattern);
        if (!match) return null;
        const body = match[2] ?? '';
        const modifiers = match[3] ?? '';
        try {
            return new RegExp(body, modifiers.replace(/[^gimsuy]/g, ''));
        } catch {
            return null;
        }
    }

    // js/src/validate.ts
    var SCHEMA_VERSION = 1;
    function validate(values, schema, options) {
        return run(values, withMessages(schema, options), void 0, options);
    }
    function withMessages(schema, options) {
        if (options?.messages === void 0) return schema;
        return { ...schema, messages: { ...options.messages, ...schema.messages } };
    }
    async function validateAsync(values, schema, options) {
        const pending = [];
        const effective = withMessages(schema, options);
        const result = run(values, effective, pending, options);
        for (const entry of pending) {
            const verdict = await entry.promise;
            if (verdict === 'undetermined') {
                if (!result.undetermined.includes(entry.field))
                    result.undetermined.push(entry.field);
                continue;
            }
            if (!verdict) {
                result.failures.push({
                    field: entry.field,
                    rule: entry.rule,
                    message: interpolate(
                        effective,
                        entry.pattern,
                        entry.rule,
                        entry.params,
                        entry.attribute,
                        entry.value,
                        entry.ctx,
                    ),
                });
            }
        }
        return { ...result, valid: result.failures.length === 0 };
    }
    function run(values, schema, pending, options) {
        const failures = [];
        const undetermined = [];
        if (schema.version !== SCHEMA_VERSION) {
            return {
                valid: true,
                failures: [],
                undetermined: Object.keys(schema.fields).flatMap((pattern) =>
                    expand(pattern, values),
                ),
            };
        }
        for (const [pattern, definition] of Object.entries(schema.fields)) {
            for (const field of expand(pattern, values)) {
                const value = get(values, field);
                const rules = definition.client;
                const keys = capturedKeys(pattern, field);
                const nullable = rules.some((r) => r.rule === 'nullable');
                const sometimes = rules.some((r) => r.rule === 'sometimes');
                if (sometimes && !has(values, field)) continue;
                if (definition.server.length > 0 && !undetermined.includes(field)) {
                    undetermined.push(field);
                }
                const ctx = {
                    values,
                    field,
                    pattern,
                    numericField: rules.some((r) =>
                        ['numeric', 'integer', 'decimal'].includes(r.rule),
                    ),
                    arrayField: rules.some((r) => ['array', 'list'].includes(r.rule)),
                };
                const blank = typeof value === 'string' && value.trim() === '';
                const runsEverything = !blank && has(values, field);
                const applicable = runsEverything
                    ? rules
                    : rules.filter((r) => IMPLICIT.has(r.rule));
                if (applicable.length === 0) continue;
                for (const { rule, params: rawParams } of applicable) {
                    let params = Array.isArray(rawParams)
                        ? Object.fromEntries(
                              rawParams.map((value2, index) => [String(index), value2]),
                          )
                        : rawParams;
                    if (keys.length > 0) {
                        params = Object.fromEntries(
                            Object.entries(params).map(([name, parameter]) => [
                                name,
                                substituteAsterisks(parameter, keys),
                            ]),
                        );
                    }
                    const check = options?.rules?.[rule] ?? checks[rule];
                    if (check === void 0) {
                        if (!undetermined.includes(field)) undetermined.push(field);
                        continue;
                    }
                    if (!hasRequiredParams(rule, params)) {
                        if (!undetermined.includes(field)) undetermined.push(field);
                        continue;
                    }
                    if (nullable && value === null && !IMPLICIT.has(rule)) continue;
                    const verdict = check(value, params, ctx);
                    if (verdict instanceof Promise) {
                        if (pending === void 0) {
                            if (!undetermined.includes(field)) undetermined.push(field);
                            continue;
                        }
                        pending.push({
                            promise: verdict,
                            field,
                            pattern,
                            rule,
                            params,
                            attribute: definition.attribute,
                            value,
                            ctx,
                        });
                        continue;
                    }
                    if (verdict === 'undetermined') {
                        if (!undetermined.includes(field)) undetermined.push(field);
                        continue;
                    }
                    if (!verdict) {
                        failures.push({
                            field,
                            rule,
                            message: interpolate(
                                schema,
                                pattern,
                                rule,
                                params,
                                definition.attribute,
                                value,
                                ctx,
                            ),
                        });
                        break;
                    }
                }
            }
        }
        return { valid: failures.length === 0, failures, undetermined };
    }
    var READS_DEPENDENT_VALUE = /* @__PURE__ */ new Set([
        'required_if',
        'required_if_accepted',
        'required_if_declined',
    ]);
    var LISTS_FIELDS = /* @__PURE__ */ new Set([
        'required_with',
        'required_with_all',
        'required_without',
        'required_without_all',
    ]);
    function interpolate(schema, pattern, rule, params, attribute, value, ctx) {
        const key =
            schema.messages[`${pattern}.${rule}`] !== void 0
                ? `${pattern}.${rule}`
                : `${ctx.field}.${rule}`;
        const template = select(schema, key, rule, value, ctx);
        const name = attribute ?? displayable(ctx.field);
        if (template === void 0) {
            return `The ${name} field is invalid.`;
        }
        let message = template.replaceAll(':attribute', name);
        if (params.min !== void 0) {
            message = message.replaceAll(
                ':decimal',
                params.max === void 0 ? params.min : `${params.min}-${params.max}`,
            );
        }
        const dependent =
            params.other ?? (NAMES_DEPENDENT_AT_ZERO.has(rule) ? params['0'] : void 0);
        if (dependent !== void 0) {
            message = message.replaceAll(':other', displayable(dependent));
        }
        if (READS_DEPENDENT_VALUE.has(rule) && dependent !== void 0) {
            return message.replaceAll(':value', displayValue(get(ctx.values, dependent)));
        }
        for (const [key2, param] of Object.entries(params)) {
            message = message.replaceAll(`:${key2}`, param);
        }
        const tail = Object.entries(params)
            .filter(
                ([key2]) =>
                    key2 !== 'other' && !(NAMES_DEPENDENT_AT_ZERO.has(rule) && key2 === '0'),
            )
            .map(([, param]) => (LISTS_FIELDS.has(rule) ? displayable(param) : param));
        const joined = tail.join(LISTS_FIELDS.has(rule) ? ' / ' : ', ');
        return message.replaceAll(':values', joined).replaceAll(':value', joined);
    }
    function select(schema, key, rule, value, ctx) {
        const plain = schema.messages[key];
        const variants = schema.messageVariants?.[key];
        if (variants === void 0) return plain;
        const comparison = ['gt', 'gte', 'lt', 'lte'].includes(rule);
        const type =
            ctx.numericField || (comparison && numeric(value))
                ? 'numeric'
                : ctx.arrayField
                  ? 'array'
                  : isFileValue(value)
                    ? 'file'
                    : 'string';
        return variants[type] ?? variants.string ?? plain ?? Object.values(variants)[0];
    }
    function displayable(field) {
        return field
            .replace(/(?<!^)([A-Z])/g, '_$1')
            .toLowerCase()
            .replaceAll('_', ' ');
    }
    function displayValue(value) {
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (value === null || value === void 0) return 'empty';
        return String(value);
    }

    // js/src/events/Emitter.ts
    var Emitter = class {
        target = new EventTarget();
        validatorId;
        root;
        constructor(validatorId, root) {
            this.validatorId = validatorId;
            this.root = root;
        }
        on(name, handler) {
            const listener = (event) => {
                const custom = event;
                handler(custom.detail, custom);
            };
            this.target.addEventListener(name, listener);
            return () => this.target.removeEventListener(name, listener);
        }
        /**
         * Fire on the instance channel and, when an element is in play, as a
         * bubbling `laranail:`-prefixed DOM event from that element (falling
         * back to the form). Returns false when a cancelable event was
         * preventDefault()ed on either channel.
         */
        emit(name, detail, options = {}) {
            const payload = { ...detail, validatorId: this.validatorId };
            const cancelable = options.cancelable ?? false;
            const instanceEvent = new CustomEvent(name, { detail: payload, cancelable });
            const instanceOk = this.target.dispatchEvent(instanceEvent);
            const anchor = options.element ?? this.root;
            let domOk = true;
            if (anchor !== null && typeof anchor.dispatchEvent === 'function') {
                domOk = anchor.dispatchEvent(
                    new CustomEvent(`laranail:${name}`, {
                        detail: payload,
                        bubbles: true,
                        cancelable,
                    }),
                );
            }
            return instanceOk && domOk;
        }
    };

    // js/src/events/hooks.ts
    function emptyHooks() {
        return { beforeValidate: [], afterValidate: [], beforeSubmit: [] };
    }
    function applyBeforeValidate(hooks, field, value) {
        return hooks.beforeValidate.reduce((current, hook) => hook(field, current), value);
    }
    function applyAfterValidate(hooks, field, errors) {
        return hooks.afterValidate.reduce((current, hook) => hook(field, current), errors);
    }
    function applyBeforeSubmit(hooks, payload) {
        let current = payload;
        for (const hook of hooks.beforeSubmit) {
            const result = hook(current);
            if (result === false) return false;
            current = result;
        }
        return current;
    }
    var silentNotifier = { notify: () => {} };

    // js/src/render/ClassMapRenderer.ts
    var MESSAGE_MARKER = 'data-laranail-message';
    var SUMMARY_MARKER = 'data-laranail-summary';
    var ClassMapRenderer = class {
        touchedInputs = /* @__PURE__ */ new Set();
        preset;
        constructor(preset = {}) {
            this.preset = preset;
        }
        showErrors(field, messages, ctx) {
            this.clearErrors(field, ctx);
            const container = this.placeInto(field, ctx);
            if (container === null) return;
            for (const text of messages) {
                const element = ctx.form.ownerDocument.createElement(
                    this.preset.message?.tag ?? 'div',
                );
                element.setAttribute(MESSAGE_MARKER, field);
                element.id = messageId(ctx.validatorId, field);
                applyClasses(element, this.preset.message?.classes);
                element.textContent = text;
                container.appendChild(element);
            }
        }
        clearErrors(field, ctx) {
            for (const stale of Array.from(
                ctx.form.querySelectorAll(`[${MESSAGE_MARKER}="${cssEscape(field)}"]`),
            )) {
                stale.remove();
            }
        }
        setFieldState(field, state, ctx) {
            if (ctx.input !== null) {
                this.touchedInputs.add(ctx.input);
                swapStateClasses(ctx.input, this.preset.input, state);
            }
            if (ctx.wrapper !== null) {
                this.touchedInputs.add(ctx.wrapper);
                swapStateClasses(ctx.wrapper, this.preset.wrapper, state);
            }
        }
        renderSummary(errors, form) {
            form.querySelector(`[${SUMMARY_MARKER}]`)?.remove();
            if (errors.length === 0) return;
            const summary = form.ownerDocument.createElement('div');
            summary.setAttribute(SUMMARY_MARKER, '');
            summary.setAttribute('role', 'alert');
            applyClasses(summary, this.preset.summary?.classes);
            const list = form.ownerDocument.createElement('ul');
            for (const { field, message } of errors) {
                const item = form.ownerDocument.createElement('li');
                applyClasses(item, this.preset.summary?.itemClasses);
                const link = form.ownerDocument.createElement('a');
                link.href = '#';
                link.textContent = message;
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    const target = form.querySelector(
                        `[name="${cssEscape(field)}"], [data-laranail-field="${cssEscape(field)}"]`,
                    );
                    target?.scrollIntoView({
                        behavior: prefersReducedMotion(form) ? 'auto' : 'smooth',
                    });
                    target?.focus({ preventScroll: true });
                });
                item.appendChild(link);
                list.appendChild(item);
            }
            summary.appendChild(list);
            form.prepend(summary);
        }
        destroy() {
            for (const element of this.touchedInputs) {
                for (const classes of Object.values({
                    ...this.preset.input,
                    ...this.preset.wrapper,
                })) {
                    removeClasses(element, classes);
                }
            }
            this.touchedInputs.clear();
        }
        /**
         * The legacy four-step placement chain, proven and carried forward:
         * explicit data-attribute target → resolver wrapper → configured
         * container → after the input itself.
         */
        placeInto(field, ctx) {
            const explicit = ctx.input?.getAttribute('data-laranail-errors');
            if (explicit !== null && explicit !== void 0 && explicit !== '') {
                const target = ctx.form.querySelector(explicit);
                if (target !== null) return target;
            }
            if (ctx.wrapper !== null) return ctx.wrapper;
            const configured = this.preset.container;
            if (typeof configured === 'function' && ctx.input !== null) {
                const target = configured(ctx.input, ctx);
                if (target !== null) return target;
            }
            if (typeof configured === 'string' && ctx.input !== null) {
                const target = ctx.input.closest(configured);
                if (target !== null) return target;
            }
            if (ctx.input?.parentElement) return ctx.input.parentElement;
            return ctx.form;
        }
    };
    function messageId(validatorId, field) {
        return `${validatorId}-error-${field.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    }
    function applyClasses(element, classes) {
        if (classes !== void 0 && classes !== '') element.classList.add(...classes.split(/\s+/));
    }
    function removeClasses(element, classes) {
        if (classes !== void 0 && classes !== '') element.classList.remove(...classes.split(/\s+/));
    }
    function swapStateClasses(element, map, state) {
        if (map === void 0) return;
        for (const classes of Object.values(map)) removeClasses(element, classes);
        applyClasses(element, map[state]);
    }
    function prefersReducedMotion(form) {
        const view = form.ownerDocument.defaultView;
        return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    }
    function cssEscape(value) {
        const scope = globalThis;
        return scope.CSS?.escape?.(value) ?? value.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);
    }

    // js/src/form/FieldState.ts
    function pristine() {
        return { status: 'pristine', touched: false, dirty: false, errors: [] };
    }

    // js/src/form/NameMapper.ts
    function toPath(name) {
        return name
            .replace(/\[\]$/, '')
            .replace(/\[([^\]]*)\]/g, '.$1')
            .replace(/\.$/, '');
    }
    function toName(path) {
        const [head, ...rest] = path.split('.');
        return rest.reduce((name, segment) => `${name}[${segment}]`, head ?? '');
    }
    function readControl(element) {
        if (element instanceof HTMLInputElement) {
            if (element.type === 'checkbox') return element.checked ? element.value : void 0;
            if (element.type === 'radio') return element.checked ? element.value : void 0;
            if (element.type === 'file') {
                const files = element.files;
                if (files === null || files.length === 0) return void 0;
                return element.multiple ? Array.from(files) : files[0];
            }
            return element.value;
        }
        if (element instanceof HTMLSelectElement) {
            if (element.multiple) {
                return Array.from(element.selectedOptions).map((option) => option.value);
            }
            return element.value;
        }
        if (element instanceof HTMLTextAreaElement) return element.value;
        return void 0;
    }
    function readForm(form) {
        const values = {};
        for (const element of Array.from(form.elements)) {
            const name = element.getAttribute('name');
            if (name === null || name === '') continue;
            const collects = name.endsWith('[]');
            const path = toPath(name);
            const value = readControl(element);
            if (value === void 0) continue;
            if (collects) {
                const existing = readAt(values, path);
                writeAt(values, path, Array.isArray(existing) ? [...existing, value] : [value]);
                continue;
            }
            writeAt(values, path, value);
        }
        return values;
    }
    function readAt(target, path) {
        let current = target;
        for (const segment of path.split('.')) {
            if (current === null || typeof current !== 'object') return void 0;
            current = current[segment];
        }
        return current;
    }
    function writeAt(target, path, value) {
        const segments = path.split('.');
        const last = segments.pop();
        let current = target;
        for (const segment of segments) {
            const next = current[segment];
            if (next === null || typeof next !== 'object') {
                const created = {};
                current[segment] = created;
                current = created;
                continue;
            }
            current = next;
        }
        current[last] = value;
    }

    // js/src/form/FormController.ts
    var FormController = class {
        states = /* @__PURE__ */ new Map();
        sequence = /* @__PURE__ */ new Map();
        listeners = [];
        describedByUs = /* @__PURE__ */ new Set();
        liveRegion = null;
        destroyed = false;
        form;
        deps;
        constructor(form, deps) {
            this.form = form;
            this.deps = deps;
        }
        attach() {
            this.listen('focusout', (event) => {
                const field = this.fieldFrom(event.target);
                if (field === null) return;
                this.touch(field);
                if (this.deps.scheduler.shouldValidateOnBlur()) void this.validateField(field);
            });
            const onInput = (event) => {
                const field = this.fieldFrom(event.target);
                if (field === null) return;
                this.markDirty(field);
                if (this.deps.scheduler.shouldValidateOnInput(field)) {
                    this.deps.scheduler.schedule(field, () => void this.validateField(field));
                }
            };
            this.listen('input', onInput);
            this.listen('change', onInput);
            this.listen('submit', (event) => {
                event.preventDefault();
                void this.submit(event);
            });
        }
        /** The engine's verdict for the whole form, through the hook pipeline. */
        async validate() {
            const values = this.collect();
            const result = await validateAsync(values, this.effectiveSchema(), {
                rules: this.deps.rules,
            });
            this.applyResult(result, null);
            this.deps.emitter.emit('form:validated', { valid: result.valid, result });
            return result;
        }
        async validateField(field) {
            const token = (this.sequence.get(field) ?? 0) + 1;
            this.sequence.set(field, token);
            this.transition(field, (state) => ({ ...state, status: 'validating' }));
            this.deps.emitter.emit(
                'field:validating',
                { field },
                { element: this.controlFor(field) },
            );
            const values = this.collect();
            const result = await validateAsync(values, this.effectiveSchema(), {
                rules: this.deps.rules,
            });
            if (this.sequence.get(field) !== token || this.destroyed) return;
            const scope = /* @__PURE__ */ new Set([field]);
            for (const [seen, state] of this.states) {
                if (state.status !== 'pristine' && state.status !== 'validating') scope.add(seen);
            }
            scope.add(field);
            this.applyResult(result, scope);
            this.deps.emitter.emit(
                'field:validated',
                { field, state: this.states.get(field) },
                { element: this.controlFor(field) },
            );
        }
        async submit(sourceEvent) {
            const result = await this.validate();
            const payload = applyBeforeSubmit(this.deps.hooks, this.collect());
            if (payload === false || !result.valid) {
                if (!result.valid) {
                    this.deps.renderer.renderSummary(
                        result.failures.map(({ field, message }) => ({ field, message })),
                        this.form,
                    );
                    this.focusFirstInvalid(result);
                    this.announce(result.failures[0]?.message ?? '');
                }
                this.deps.emitter.emit('form:error', { failures: result.failures });
                this.deps.notifier.notify('error', 'form:error', { failures: result.failures });
                return false;
            }
            const allowed = this.deps.emitter.emit(
                'form:submit',
                { values: payload },
                { cancelable: true },
            );
            if (allowed && sourceEvent !== void 0) {
                this.form.submit();
            }
            return allowed;
        }
        explain(field) {
            const definition = Object.entries(this.deps.schema.fields).find(
                ([pattern]) => pattern === field || matchesPattern(pattern, field),
            )?.[1];
            return {
                state: this.states.get(field) ?? pristine(),
                client: definition?.client.map((rule) => rule.rule) ?? [],
                server: definition?.server ?? [],
            };
        }
        state(field) {
            return this.states.get(field) ?? pristine();
        }
        destroy() {
            this.destroyed = true;
            for (const [name, listener] of this.listeners) {
                this.form.removeEventListener(name, listener);
            }
            this.listeners.length = 0;
            this.deps.scheduler.cancelAll();
            this.deps.renderer.destroy();
            for (const element of this.describedByUs) {
                element.removeAttribute('aria-invalid');
                this.stripOurDescribedBy(element);
            }
            this.describedByUs.clear();
            this.liveRegion?.remove();
            this.liveRegion = null;
            this.states.clear();
            this.sequence.clear();
        }
        /** How many listeners/timers are live — the leak assertion reads these. */
        get leakReport() {
            return { listeners: this.listeners.length, timers: this.deps.scheduler.pendingCount };
        }
        // ------------------------------------------------------------------
        collect() {
            const values = readForm(this.form);
            for (const field of Object.keys(values)) {
                values[field] = applyBeforeValidate(this.deps.hooks, field, values[field]);
            }
            return values;
        }
        /** `scope === null` applies everything (submit); a Set limits painting. */
        applyResult(result, scope) {
            const failuresByField = /* @__PURE__ */ new Map();
            for (const failure of result.failures) {
                const messages = failuresByField.get(failure.field) ?? [];
                messages.push(this.resolveMessage(failure.rule, failure.message, failure.field));
                failuresByField.set(failure.field, messages);
            }
            const seen = /* @__PURE__ */ new Set([
                ...failuresByField.keys(),
                ...result.undetermined,
                ...this.states.keys(),
            ]);
            for (const field of seen) {
                if (scope !== null && !scope.has(field)) continue;
                const control = this.controlFor(field);
                const ctx = {
                    form: this.form,
                    input: control,
                    wrapper:
                        control === null
                            ? null
                            : (this.deps.resolvers.resolve(control)?.getWrapper(control) ?? null),
                    validatorId: this.deps.validatorId,
                };
                const errors = applyAfterValidate(
                    this.deps.hooks,
                    field,
                    failuresByField.get(field) ?? [],
                );
                if (errors.length > 0) {
                    this.deps.scheduler.recordFailure(field);
                    this.transition(field, (state) => ({ ...state, status: 'invalid', errors }));
                    this.deps.renderer.showErrors(field, errors, ctx);
                    this.deps.renderer.setFieldState(field, 'invalid', ctx);
                    this.markInvalid(control, field);
                    this.announce(errors[0] ?? '');
                    continue;
                }
                this.deps.renderer.clearErrors(field, ctx);
                this.clearInvalid(control);
                if (result.undetermined.includes(field)) {
                    this.transition(field, (state) => ({
                        ...state,
                        status: 'undetermined',
                        errors: [],
                        reason: 'structural',
                    }));
                    this.deps.renderer.setFieldState(field, 'undetermined', ctx);
                    continue;
                }
                this.deps.scheduler.recordSuccess(field);
                this.transition(field, (state) => ({ ...state, status: 'valid', errors: [] }));
                this.deps.renderer.setFieldState(field, 'valid', ctx);
            }
        }
        /**
         * A client-registered rule has no server message; when the engine fell
         * back to its generic sentence and the rule registered one, the
         * registered one wins — interpolated for :attribute only, since a
         * client rule's params never crossed a wire.
         */
        resolveMessage(rule, engineMessage, field) {
            const registered = this.deps.ruleMessages[rule];
            if (registered === void 0 || !engineMessage.endsWith('field is invalid.')) {
                return engineMessage;
            }
            return registered.replaceAll(':attribute', field.replaceAll(/[._]/g, ' '));
        }
        effectiveSchema() {
            return this.deps.schema;
        }
        fieldFrom(target) {
            if (!(target instanceof Element)) return null;
            const name = target.getAttribute('name');
            if (name === null || name === '') return null;
            return toPath(name);
        }
        controlFor(field) {
            const byName =
                this.form.querySelector(`[name="${cssEscape2(toName(field))}"]`) ??
                this.form.querySelector(`[name="${cssEscape2(toName(field))}[]"]`) ??
                this.form.querySelector(`[name="${cssEscape2(field)}"]`);
            return byName;
        }
        touch(field) {
            this.transition(field, (state) => ({ ...state, touched: true }));
        }
        markDirty(field) {
            this.transition(field, (state) => ({ ...state, dirty: true }));
        }
        transition(field, mutate) {
            const next = mutate(this.states.get(field) ?? pristine());
            this.states.set(field, next);
            this.deps.emitter.emit('state:changed', { field, state: next });
        }
        markInvalid(control, field) {
            if (control === null) return;
            control.setAttribute('aria-invalid', 'true');
            this.describedByUs.add(control);
            const ours = messageId(this.deps.validatorId, field);
            const existing = (control.getAttribute('aria-describedby') ?? '')
                .split(/\s+/)
                .filter((id) => id !== '' && id !== ours);
            control.setAttribute('aria-describedby', [...existing, ours].join(' '));
        }
        clearInvalid(control) {
            if (control === null) return;
            control.removeAttribute('aria-invalid');
            this.stripOurDescribedBy(control);
        }
        stripOurDescribedBy(control) {
            const prefix = `${this.deps.validatorId}-error-`;
            const kept = (control.getAttribute('aria-describedby') ?? '')
                .split(/\s+/)
                .filter((id) => id !== '' && !id.startsWith(prefix));
            if (kept.length === 0) control.removeAttribute('aria-describedby');
            else control.setAttribute('aria-describedby', kept.join(' '));
        }
        focusFirstInvalid(result) {
            const first = result.failures[0];
            if (first === void 0) return;
            const control = this.controlFor(first.field);
            if (control instanceof HTMLElement) {
                control.scrollIntoView({ behavior: this.reducedMotion() ? 'auto' : 'smooth' });
                control.focus({ preventScroll: true });
            }
        }
        /**
         * One visually-hidden polite live region per form, owned by core:
         * renderer-independent announcements are what make the a11y bar a
         * guarantee instead of a preset's good intentions.
         */
        announce(message) {
            if (message === '') return;
            if (this.liveRegion === null) {
                const region = this.form.ownerDocument.createElement('div');
                region.setAttribute('aria-live', 'polite');
                region.setAttribute('data-laranail-live', '');
                region.style.cssText =
                    'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
                this.form.appendChild(region);
                this.liveRegion = region;
            }
            this.liveRegion.textContent = message;
        }
        reducedMotion() {
            const view = this.form.ownerDocument.defaultView;
            return view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        }
        listen(name, listener) {
            this.form.addEventListener(name, listener);
            this.listeners.push([name, listener]);
        }
    };
    function matchesPattern(pattern, field) {
        if (!pattern.includes('*')) return false;
        const expression = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('[^.]+')}$`);
        return expression.test(field);
    }
    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    function cssEscape2(value) {
        const scope = globalThis;
        return scope.CSS?.escape?.(value) ?? value.replace(/["\\]/g, '\\$&');
    }

    // js/src/form/Scheduler.ts
    var Scheduler = class {
        mode;
        delay;
        set;
        clear;
        timers = /* @__PURE__ */ new Map();
        failedOnce = /* @__PURE__ */ new Set();
        constructor(options = {}) {
            this.mode = options.mode ?? 'eager';
            this.delay = options.debounce ?? 300;
            this.set = options.setTimeout ?? ((handler, ms) => setTimeout(handler, ms));
            this.clear = options.clearTimeout ?? ((token) => clearTimeout(token));
        }
        /** Should a BLUR of this field validate it? Every mode but submit-only. */
        shouldValidateOnBlur() {
            return this.mode !== 'submit';
        }
        /** Should an INPUT event on this field schedule a validation? */
        shouldValidateOnInput(field) {
            if (this.mode === 'change') return true;
            if (this.mode === 'eager') return this.failedOnce.has(field);
            return false;
        }
        /** Record a failure so eager mode starts re-validating this field on input. */
        recordFailure(field) {
            this.failedOnce.add(field);
        }
        recordSuccess(field) {}
        /**
         * Debounce `run` for this field. A newer call cancels the older one —
         * per FIELD, so typing in one input never delays another's check.
         */
        schedule(field, run2) {
            this.cancel(field);
            this.timers.set(
                field,
                this.set(() => {
                    this.timers.delete(field);
                    run2();
                }, this.delay),
            );
        }
        cancel(field) {
            const token = this.timers.get(field);
            if (token !== void 0) {
                this.clear(token);
                this.timers.delete(field);
            }
        }
        /** Every timer down — destroy() calls this; a leak here is a §5.10 bug. */
        cancelAll() {
            for (const token of this.timers.values()) this.clear(token);
            this.timers.clear();
            this.failedOnce.clear();
        }
        /** How many timers are live — the leak assertion reads this. */
        get pendingCount() {
            return this.timers.size;
        }
    };

    // js/src/render/Renderer.ts
    var headlessRenderer = {
        showErrors: () => {},
        clearErrors: () => {},
        setFieldState: () => {},
        renderSummary: () => {},
        destroy: () => {},
    };

    // js/src/plugins/InputResolver.ts
    var ResolverRegistry = class {
        resolvers = [];
        constructor(initial = []) {
            this.resolvers.push(...initial);
        }
        register(resolver) {
            this.resolvers.push(resolver);
        }
        resolve(element) {
            return this.resolvers.find((resolver) => resolver.detect(element)) ?? null;
        }
    };

    // js/src/i18n/messages.ts
    function resolveMessage(message, locale) {
        if (message === void 0 || typeof message === 'string') return message;
        return message[locale] ?? message[locale.split('-')[0] ?? ''] ?? message.en;
    }
    function pluralise(message, count) {
        const parts = message.split('|');
        if (parts.length === 1) return message;
        for (const part of parts) {
            const exact = /^\{(\d+)\}\s*(.*)$/s.exec(part);
            if (exact && Number(exact[1]) === count) return exact[2] ?? '';
            const range = /^\[(\d+),(\d+|\*)\]\s*(.*)$/s.exec(part);
            if (range) {
                const from = Number(range[1]);
                const to = range[2] === '*' ? Number.POSITIVE_INFINITY : Number(range[2]);
                if (count >= from && count <= to) return range[3] ?? '';
            }
        }
        const plain = parts.filter((part) => !/^[{[]/.test(part));
        return (count === 1 ? plain[0] : (plain[1] ?? plain[0])) ?? message;
    }

    // js/src/createValidator.ts
    var attached = /* @__PURE__ */ new WeakMap();
    var counter = 0;
    function nextId() {
        const scope = globalThis;
        const unique = scope.crypto?.randomUUID?.() ?? String(++counter);
        return `laranail-${unique.slice(0, 8)}`;
    }
    function createValidator(form, schema, options = {}) {
        attached.get(form)?.destroy();
        const id = nextId();
        const locale = options.locale ?? 'en';
        const emitter = new Emitter(id, form);
        const scheduler = new Scheduler({
            ...(options.mode !== void 0 ? { mode: options.mode } : {}),
            ...(options.debounce !== void 0 ? { debounce: options.debounce } : {}),
        });
        const resolvers = new ResolverRegistry(options.resolvers ?? []);
        const hooks = emptyHooks();
        const rules = { ...options.rules };
        const ruleMessages = {};
        const controller = new FormController(form, {
            schema,
            emitter,
            scheduler,
            renderer: options.renderer ?? headlessRenderer,
            resolvers,
            hooks,
            notifier: options.notifier ?? silentNotifier,
            rules,
            ruleMessages,
            validatorId: id,
        });
        const registerRule = (name, check, ruleOptions = {}) => {
            rules[name] = check;
            const message = resolveMessage(ruleOptions.message, locale);
            if (message !== void 0) {
                ruleMessages[name] = message;
            } else if (ruleOptions.message === void 0) {
                console.warn(
                    `[laranail] client rule "${name}" registered without a message; failures will use the generic fallback.`,
                );
            }
        };
        if (options.messages !== void 0) {
            for (const [key, message] of Object.entries(options.messages)) {
                if (!key.includes('.')) ruleMessages[key] = message;
            }
        }
        controller.attach();
        const validator = {
            id,
            validate: () => controller.validate(),
            validateField: (field) => controller.validateField(field),
            submit: () => controller.submit(),
            state: (field) => controller.state(field),
            explain: (field) => controller.explain(field),
            on: (name, handler) => emitter.on(name, handler),
            use(plugin) {
                plugin.install({
                    registerRule,
                    registerResolver: (resolver) => resolvers.register(resolver),
                    on: (name, handler) => emitter.on(name, handler),
                });
                return validator;
            },
            registerRule,
            destroy() {
                controller.destroy();
                attached.delete(form);
            },
            leakReport: () => controller.leakReport,
        };
        attached.set(form, validator);
        return validator;
    }
    function createHeadless(schema, options = {}) {
        const rules = { ...options.rules };
        const engineOptions = () => ({
            rules,
            ...(options.messages !== void 0 ? { messages: options.messages } : {}),
        });
        return {
            validate: (values) => validate(values, schema, engineOptions()),
            validateAsync: (values) => validateAsync(values, schema, engineOptions()),
            registerRule: (name, check) => {
                rules[name] = check;
            },
        };
    }

    // js/src/render/presets.ts
    var presets_exports = {};
    __export(presets_exports, {
        bootstrap5: () => bootstrap5,
        bulma: () => bulma,
        tailwind: () => tailwind,
        vanilla: () => vanilla,
    });
    var vanilla = {
        input: {
            invalid: 'ln-invalid',
            valid: 'ln-valid',
            validating: 'ln-validating',
        },
        message: { tag: 'div', classes: 'ln-error' },
        summary: { classes: 'ln-summary' },
    };
    var bootstrap5 = {
        input: {
            invalid: 'is-invalid',
            valid: 'is-valid',
        },
        message: { tag: 'div', classes: 'invalid-feedback d-block' },
        summary: { classes: 'alert alert-danger' },
    };
    var tailwind = {
        input: {
            invalid: 'border-red-500 focus:ring-red-500',
            valid: 'border-green-500',
            validating: 'opacity-75',
        },
        message: { tag: 'p', classes: 'mt-1 text-sm text-red-600' },
        summary: { classes: 'rounded-md bg-red-50 p-4 text-sm text-red-700' },
    };
    var bulma = {
        input: {
            invalid: 'is-danger',
            valid: 'is-success',
        },
        message: { tag: 'p', classes: 'help is-danger' },
        summary: { classes: 'notification is-danger' },
    };

    // js/src/plugins/resolvers.ts
    var resolvers_exports = {};
    __export(resolvers_exports, {
        choicesResolver: () => choicesResolver,
        flatpickrResolver: () => flatpickrResolver,
        inputGroupResolver: () => inputGroupResolver,
        select2Resolver: () => select2Resolver,
        tagifyResolver: () => tagifyResolver,
        tomSelectResolver: () => tomSelectResolver,
    });
    function fromInput(element) {
        return readControl(element);
    }
    var select2Resolver = {
        name: 'select2',
        detect: (el) => el.classList.contains('select2-hidden-accessible'),
        getValue: fromInput,
        getWrapper: (el) => el.nextElementSibling?.closest('.select2') ?? el.parentElement,
        events: () => ['change'],
    };
    var tomSelectResolver = {
        name: 'tom-select',
        detect: (el) => el.classList.contains('tomselected') || 'tomselect' in el,
        getValue: fromInput,
        getWrapper: (el) => el.parentElement?.querySelector('.ts-wrapper') ?? el.parentElement,
        events: () => ['change'],
    };
    var choicesResolver = {
        name: 'choices',
        detect: (el) => el.closest('.choices') !== null,
        getValue: fromInput,
        getWrapper: (el) => el.closest('.choices'),
        events: () => ['change'],
    };
    var flatpickrResolver = {
        name: 'flatpickr',
        detect: (el) => el.classList.contains('flatpickr-input') || '_flatpickr' in el,
        getValue: fromInput,
        getWrapper: (el) => el.parentElement,
        events: () => ['change'],
    };
    var tagifyResolver = {
        name: 'tagify',
        detect: (el) => el.classList.contains('tagify--hidden') || 'tagify' in el,
        getValue: fromInput,
        getWrapper: (el) => el.parentElement?.querySelector('.tagify') ?? el.parentElement,
        events: () => ['change'],
    };
    var inputGroupResolver = {
        name: 'input-group',
        detect: (el) => el.closest('.input-group') !== null,
        getValue: fromInput,
        getWrapper: (el) => el.closest('.input-group')?.parentElement ?? null,
        events: (el) => (el instanceof HTMLSelectElement ? ['change'] : ['input', 'change']),
    };
    return __toCommonJS(index_exports);
})();
