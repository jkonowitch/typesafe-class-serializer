import { Map, Set } from 'immutable';
if (!Symbol.metadata) {
    Symbol.metadata = Symbol('Symbol.metadata');
}
export function validateSetWith(schema) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return function (target, _context) {
        return function (val) {
            // @ts-expect-error `this` is any
            return target.call(this, schema.parse(val));
        };
    };
}
export function validateWith(schema) {
    return function (target, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context) {
        const { set } = target;
        return {
            set(val) {
                return set.call(this, schema.parse(val));
            }
        };
    };
}
const serializationRegistry = new WeakMap();
export function serializable(key, k) {
    return function (_target, context) {
        if (context.static || context.private) {
            throw new Error('Can only serialize public instance members.');
        }
        if (typeof context.name !== 'string') {
            throw new Error('Can only serialize string properties.');
        }
        if (typeof context.metadata === 'undefined') {
            throw new Error('Metadata missing!');
        }
        function setRegistry(strategies) {
            serializationRegistry.set(context.metadata, strategies);
        }
        function getRegistry() {
            return serializationRegistry.get(context.metadata) || Map();
        }
        if (typeof k === 'object') {
            setRegistry(getRegistry().set(context.name, {
                doDeserialize: k.doDeserialize,
                doSerialize: k.doSerialize,
                serializationKey: key
            }));
        }
        else if (typeof k === 'function') {
            setRegistry(getRegistry().set(context.name, {
                doDeserialize: (arg) => deserialize(arg, k),
                doSerialize: (arg) => serialize(arg),
                serializationKey: key
            }));
        }
        else {
            setRegistry(getRegistry().set(context.name, { serializationKey: key }));
        }
    };
}
export function serialize(instance, opts = { strict: false }) {
    const metadata = instance.constructor[Symbol.metadata];
    const serializables = collectAncestorSerializables(metadata, Object.getPrototypeOf(instance));
    if (opts.strict) {
        const schemaKeys = Set.fromKeys(instance.SCHEMA.shape);
        if (schemaKeys.size !== serializables.size) {
            const serializableKeys = serializables.map((v) => v.serializationKey).toSet();
            const difference = schemaKeys.subtract(serializableKeys);
            throw `missing keys: ${difference.toJSON()}`;
        }
    }
    const result = {};
    for (const [key, value] of serializables) {
        if (typeof value.doSerialize === 'function') {
            result[value.serializationKey] = value.doSerialize(instance[key]);
        }
        else {
            result[value.serializationKey] = instance[key];
        }
    }
    return result;
}
export function deserialize(obj, klass, opts = { strict: false }) {
    const metadata = klass[Symbol.metadata];
    const serializables = collectAncestorSerializables(metadata, klass.prototype);
    const result = {};
    for (const [, value] of serializables) {
        if (typeof value.doDeserialize === 'function') {
            result[value.serializationKey] = value.doDeserialize(obj[value.serializationKey]);
        }
        else {
            result[value.serializationKey] = obj[value.serializationKey];
        }
    }
    const instance = Reflect.construct(klass, [result]);
    if (opts.strict) {
        instance.SCHEMA.parse(result);
    }
    return instance;
}
function collectAncestorSerializables(metadata, prototype) {
    let propNames = metadata && serializationRegistry.get(metadata);
    if (!propNames) {
        throw new Error('No members marked with @serializable.');
    }
    let currentProto = prototype;
    while (currentProto !== null) {
        const protoMetadata = currentProto.constructor[Symbol.metadata];
        const ancestorNames = protoMetadata && serializationRegistry.get(protoMetadata);
        if (typeof ancestorNames !== 'undefined') {
            propNames = ancestorNames.merge(propNames);
        }
        currentProto = Object.getPrototypeOf(currentProto);
    }
    return propNames;
}
//# sourceMappingURL=index.js.map