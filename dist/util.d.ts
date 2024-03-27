import type { z } from 'zod';
import type { List, Map, Set as ImmutableSet } from 'immutable';
type HasZodSchema<T> = T extends {
    SCHEMA: z.ZodTypeAny;
} ? true : false;
export type UnwrapZodSchema<T> = T extends {
    SCHEMA: infer S;
} ? S extends z.ZodTypeAny ? z.infer<S> : never : T;
type DeepUnwrap<T> = T extends Array<infer U> ? Array<DeepUnwrap<U>> : T extends Set<infer U> ? Set<DeepUnwrap<U>> : T extends Map<infer K, infer V> ? Map<DeepUnwrap<K>, DeepUnwrap<V>> : T extends List<infer U> ? List<DeepUnwrap<U>> : T extends ImmutableSet<infer U> ? ImmutableSet<DeepUnwrap<U>> : T extends Map<infer K, infer V> ? Map<DeepUnwrap<K>, DeepUnwrap<V>> : T extends object ? HasZodSchema<T> extends true ? {
    [K in keyof UnwrapZodSchema<T>]: DeepUnwrap<UnwrapZodSchema<T>[K]>;
} : T : T;
export type SerializedProperties<T> = {
    [P in keyof T]: DeepUnwrap<T[P]>;
};
export {};
