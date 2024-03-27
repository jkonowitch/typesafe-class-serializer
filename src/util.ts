import type { z } from 'zod';
import type { List, Map, Set as ImmutableSet } from 'immutable';

// Helper type to check for Zod schema presence
type HasZodSchema<T> = T extends { SCHEMA: z.ZodTypeAny } ? true : false;

// Unwrap a Zod schema if present, otherwise leave the type unchanged
export type UnwrapZodSchema<T> = T extends { SCHEMA: infer S }
  ? S extends z.ZodTypeAny
    ? z.infer<S>
    : never
  : T;

// Refocused DeepUnwrap to rely on Zod schema presence and handle Sets, Maps, and Immutable.js collections
type DeepUnwrap<T> =
  T extends Array<infer U>
    ? Array<DeepUnwrap<U>>
    : T extends Set<infer U>
      ? Set<DeepUnwrap<U>>
      : T extends Map<infer K, infer V>
        ? Map<DeepUnwrap<K>, DeepUnwrap<V>>
        : T extends List<infer U>
          ? List<DeepUnwrap<U>>
          : T extends ImmutableSet<infer U>
            ? ImmutableSet<DeepUnwrap<U>>
            : T extends Map<infer K, infer V>
              ? Map<DeepUnwrap<K>, DeepUnwrap<V>>
              : T extends object
                ? HasZodSchema<T> extends true
                  ? { [K in keyof UnwrapZodSchema<T>]: DeepUnwrap<UnwrapZodSchema<T>[K]> }
                  : T
                : T;

export type SerializedProperties<T> = {
  [P in keyof T]: DeepUnwrap<T[P]>;
};
