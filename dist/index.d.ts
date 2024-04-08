import type { z } from 'zod';
import type { SerializedProperties, UnwrapZodSchema } from './util.js';
type ClassWithSchema = {
    new (...args: any[]): {
        SCHEMA: z.ZodTypeAny;
    };
};
interface ClassConstructorWithSchema<S extends z.ZodTypeAny> {
    new (args: UnwrapZodSchema<z.infer<S>>, ...rest: any[]): {
        SCHEMA: z.ZodTypeAny;
    };
}
export declare function validateSetWith<S extends z.ZodTypeAny, T = z.infer<S>>(schema: S): (target: (val: T) => void | T, _context: ClassSetterDecoratorContext) => (val: T) => void | T;
export declare function validateWith<S extends z.ZodTypeAny, T = z.infer<S>>(schema: S): (target: ClassAccessorDecoratorTarget<unknown, T>, _context: ClassAccessorDecoratorContext) => {
    set(val: T): void;
};
type DecoratorTarget<Q, T> = ClassAccessorDecoratorTarget<{
    SCHEMA: Q;
}, T> | (() => T) | undefined;
type DecoratorContext<Q, T> = ClassAccessorDecoratorContext<{
    SCHEMA: Q;
}, T> | ClassGetterDecoratorContext<{
    SCHEMA: Q;
}, T> | ClassFieldDecoratorContext<{
    SCHEMA: Q;
}, T>;
export declare function serializable<K extends string, Q extends z.ZodObject<{
    [P in K]: any;
}>, T extends z.infer<Q['shape'][K]> & (z.Primitive | Record<string, unknown> | Date)>(key: K): (_target: DecoratorTarget<Q, T>, context: DecoratorContext<Q, T>) => void;
export declare function serializable<K extends string, Q extends z.ZodObject<{
    [P in K]: any;
}>, T extends z.infer<Q['shape'][K]>>(key: K, k: ClassConstructorWithSchema<Q['shape'][K]>): (_target: DecoratorTarget<Q, T>, context: DecoratorContext<Q, T>) => void;
export declare function serializable<K extends string, Q extends z.ZodObject<{
    [P in K]: any;
}>, T extends z.infer<Q['shape'][K]>, O>(key: K, k: {
    doSerialize: (i: T) => O;
    doDeserialize: (i: O) => T;
}): (_target: DecoratorTarget<Q, T>, context: DecoratorContext<Q, T>) => void;
export declare function serialize<K extends z.AnyZodObject>(instance: {
    SCHEMA: K;
}, opts?: {
    strict: boolean;
}): SerializedProperties<z.infer<K>>;
export declare function deserialize<T extends ClassWithSchema>(obj: SerializedProperties<z.infer<InstanceType<T>['SCHEMA']>>, klass: T, opts?: {
    strict: boolean;
}): InstanceType<T>;
export {};
