/* eslint-disable @typescript-eslint/no-explicit-any */
import type { z } from 'zod';
import { Map, Set } from 'immutable';
import type { SerializedProperties, UnwrapZodSchema } from './util.js';

if (!(Symbol as any).metadata) {
  (Symbol as any).metadata = Symbol('Symbol.metadata');
}

type SerializationStrategy = {
  doSerialize?: (...args: any[]) => any;
  doDeserialize?: (...args: any[]) => any;
  serializationKey: string;
};

type ClassWithSchema = {
  new (...args: any[]): { SCHEMA: z.ZodTypeAny };
};

interface ClassConstructorWithSchema<S extends z.ZodTypeAny> {
  new (args: UnwrapZodSchema<z.infer<S>>, ...rest: any[]): { SCHEMA: z.ZodTypeAny };
}

export function validateSetWith<S extends z.ZodTypeAny, T = z.infer<S>>(schema: S) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return function (target: (val: T) => void | T, _context: ClassSetterDecoratorContext) {
    return function (val: T) {
      // @ts-expect-error `this` is any
      return (target as (val: T) => void | T).call(this, schema.parse(val));
    };
  };
}

export function validateWith<S extends z.ZodTypeAny, T = z.infer<S>>(schema: S) {
  return function (
    target: ClassAccessorDecoratorTarget<unknown, T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ClassAccessorDecoratorContext
  ) {
    const { set } = target;
    return {
      set(val: T) {
        return set.call(this, schema.parse(val));
      }
    };
  };
}

const serializationRegistry = new WeakMap<object, Map<string, SerializationStrategy>>();

type DecoratorTarget<Q, T> = ClassAccessorDecoratorTarget<{ SCHEMA: Q }, T> | (() => T) | undefined;

type DecoratorContext<Q, T> =
  | ClassAccessorDecoratorContext<{ SCHEMA: Q }, T>
  | ClassGetterDecoratorContext<{ SCHEMA: Q }, T>
  | ClassFieldDecoratorContext<{ SCHEMA: Q }, T>;

export function serializable<
  K extends string,
  Q extends z.ZodObject<{ [P in K]: any }>,
  // when providing _just_ a key - this must be a primitive or a simple object
  T extends z.infer<Q['shape'][K]> & (z.Primitive | Record<string, unknown> | Date)
>(key: K): (_target: DecoratorTarget<Q, T>, context: DecoratorContext<Q, T>) => void;
export function serializable<
  K extends string,
  Q extends z.ZodObject<{ [P in K]: any }>,
  T extends z.infer<Q['shape'][K]>
>(
  key: K,
  k: ClassConstructorWithSchema<Q['shape'][K]>
): (_target: DecoratorTarget<Q, T>, context: DecoratorContext<Q, T>) => void;
export function serializable<
  K extends string,
  Q extends z.ZodObject<{ [P in K]: any }>,
  T extends z.infer<Q['shape'][K]>,
  O
>(
  key: K,
  k: { doSerialize: (i: T) => O; doDeserialize: (i: O) => T }
): (_target: DecoratorTarget<Q, T>, context: DecoratorContext<Q, T>) => void;
export function serializable<
  K extends string,
  Q extends z.ZodObject<{ [P in K]: any }>,
  T extends z.infer<Q['shape'][K]>,
  O
>(
  key: K,
  k?:
    | { doSerialize: (i: T) => O; doDeserialize: (i: O) => T }
    | ClassConstructorWithSchema<Q['shape'][K]>
): (_target: DecoratorTarget<Q, T>, context: DecoratorContext<Q, T>) => void {
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

    function setRegistry(strategies: Map<string, SerializationStrategy>): void {
      serializationRegistry.set(context.metadata, strategies);
    }

    function getRegistry(): Map<string, SerializationStrategy> {
      return serializationRegistry.get(context.metadata) || Map();
    }

    if (typeof k === 'object') {
      setRegistry(
        getRegistry().set(context.name, {
          doDeserialize: k.doDeserialize,
          doSerialize: k.doSerialize,
          serializationKey: key
        })
      );
    } else if (typeof k === 'function') {
      setRegistry(
        getRegistry().set(context.name, {
          doDeserialize: (arg) => deserialize(arg, k),
          doSerialize: (arg) => serialize(arg),
          serializationKey: key
        })
      );
    } else {
      setRegistry(getRegistry().set(context.name, { serializationKey: key }));
    }
  };
}

export function serialize<K extends z.AnyZodObject>(
  instance: {
    SCHEMA: K;
  },
  opts = { strict: false }
): SerializedProperties<z.infer<K>> {
  const metadata = instance.constructor[Symbol.metadata] as object | undefined;

  const serializables = collectAncestorSerializables(metadata, Object.getPrototypeOf(instance));

  if (opts.strict) {
    const schemaKeys = Set.fromKeys<string>(instance.SCHEMA.shape);

    if (schemaKeys.size !== serializables.size) {
      const serializableKeys = serializables.map((v) => v.serializationKey).toSet();
      const difference = schemaKeys.subtract(serializableKeys);
      throw `missing keys: ${difference.toJSON()}`;
    }
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of serializables) {
    if (typeof value.doSerialize === 'function') {
      result[value.serializationKey] = value.doSerialize(
        (instance as Record<string, unknown>)[key]
      );
    } else {
      result[value.serializationKey] = (instance as Record<string, unknown>)[key];
    }
  }
  return result as SerializedProperties<z.infer<K>>;
}

export function deserialize<T extends ClassWithSchema>(
  obj: SerializedProperties<z.infer<InstanceType<T>['SCHEMA']>>,
  klass: T,
  opts = { strict: false }
): InstanceType<T> {
  const metadata = klass[Symbol.metadata] as object | undefined;
  const serializables = collectAncestorSerializables(metadata, klass.prototype);
  const result: Record<string, unknown> = {};

  for (const [, value] of serializables) {
    if (typeof value.doDeserialize === 'function') {
      result[value.serializationKey] = value.doDeserialize(obj[value.serializationKey]);
    } else {
      result[value.serializationKey] = obj[value.serializationKey];
    }
  }
  const instance = Reflect.construct(klass, [result]) as InstanceType<T>;
  if (opts.strict) {
    instance.SCHEMA.parse(result);
  }
  return instance;
}

function collectAncestorSerializables(metadata: object | undefined, prototype: any) {
  let propNames = metadata && serializationRegistry.get(metadata);

  if (!propNames) {
    throw new Error('No members marked with @serializable.');
  }

  let currentProto = prototype;

  while (currentProto !== null) {
    const protoMetadata = currentProto.constructor[Symbol.metadata] as object | undefined;
    const ancestorNames = protoMetadata && serializationRegistry.get(protoMetadata);
    if (typeof ancestorNames !== 'undefined') {
      propNames = ancestorNames.merge(propNames);
    }
    currentProto = Object.getPrototypeOf(currentProto);
  }

  return propNames;
}
