import { describe, expect, it, expectTypeOf } from 'vitest';
import { z } from 'zod';
import { deserialize, serialize, serializable, validateWith, validateSetWith } from './index.js';

const AddressSchema = z.object({
  details: z.object({ city: z.string(), zipCode: z.string() })
});

class Address {
  public readonly SCHEMA = AddressSchema;

  @serializable('details')
  accessor details: { city: string; zipCode: string };

  constructor(parameters: z.infer<Address['SCHEMA']>) {
    this.details = parameters.details;
  }

  public get city() {
    return this.details.city;
  }

  public get zipCode() {
    return this.details.zipCode;
  }
}

const PersonSchema = z.object({
  address: z.instanceof(Address),
  name: z.string()
});

class Person {
  public readonly SCHEMA = PersonSchema;

  @serializable('address', Address)
  accessor address: Address;

  @serializable('name')
  accessor name: string;

  constructor(params: z.infer<Person['SCHEMA']>) {
    this.address = params.address;
    this.name = params.name;
  }
}

const CompanySchema = z.object({
  people: z.array(z.instanceof(Person))
});

class Company {
  public readonly SCHEMA = CompanySchema;

  @serializable('people', {
    doSerialize: (a) => a.map((i) => serialize(i)),
    doDeserialize: (a) => a.map((i) => deserialize(i, Person))
  })
  accessor people: Person[];

  constructor(params: z.infer<Company['SCHEMA']>) {
    this.people = params.people;
  }
}

const InternationalAddressSchema = AddressSchema.extend({
  country: z.string()
});

class InternationalAddress extends Address {
  public readonly SCHEMA = InternationalAddressSchema;
  @serializable('country')
  accessor country: string;

  constructor(parameters: z.infer<InternationalAddress['SCHEMA']>) {
    super(parameters);
    this.country = parameters.country;
  }
}

const baseDirectorySchema = z.object({
  name: z.string()
});

type DirectorySchema = z.infer<typeof baseDirectorySchema> & {
  subdirectories: Directory[];
};

class Directory {
  public readonly SCHEMA: z.ZodType<DirectorySchema> = baseDirectorySchema.extend({
    subdirectories: z.array(z.instanceof(Directory))
  });

  @serializable('subdirectories', {
    doSerialize: (a) => a.map((i) => serialize(i)),
    doDeserialize: (a) => a.map((i) => deserialize(i, Directory))
  })
  accessor subdirectories: Directory[];

  @serializable('name')
  accessor name: string;

  constructor(parameters: z.infer<Directory['SCHEMA']>) {
    this.subdirectories = parameters.subdirectories;
    this.name = parameters.name;
  }
}

describe('serializable', () => {
  const addressObj = { details: { city: 'City', zipCode: '12345' } };
  const personObj = {
    name: 'Joe Shmo',
    address: addressObj
  };
  const address = new Address(addressObj);
  const person = new Person({ address, name: 'Joe Shmo' });
  const company = new Company({ people: [person] });

  describe('serialize', () => {
    it('serializes a basic class', () => {
      const serialized = serialize(address);
      expect(serialized).toEqual({ details: { city: 'City', zipCode: '12345' } });
      expectTypeOf(serialized).toEqualTypeOf<{
        details: {
          city: string;
          zipCode: string;
        };
      }>();
    });

    it('recursively serializes', () => {
      const serialized = serialize(person);
      expect(serialized).toEqual(personObj);
      expectTypeOf(serialized).toEqualTypeOf<{
        address: {
          details: {
            city: string;
            zipCode: string;
          };
        };
        name: string;
      }>();
    });

    it('serializes collections', () => {
      const serialized = serialize(company);
      expect(serialized).toEqual({
        people: [personObj]
      });
      expectTypeOf(serialized).toEqualTypeOf<{
        people: {
          address: {
            details: {
              city: string;
              zipCode: string;
            };
          };
          name: string;
        }[];
      }>();
    });

    it('uses the key name defined in the schema, even when it diverges from the accessor name', () => {
      const ExampleSchema = z.object({
        foo: z.string()
      });
      class Example {
        public readonly SCHEMA = ExampleSchema;
        @serializable('foo')
        accessor bar: string = 'hello';
      }
      const instance = new Example();
      const serialized = serialize(instance);
      expect(serialized).toEqual({ foo: 'hello' });
    });

    it('serializes subclasses', () => {
      const instance = new InternationalAddress({
        details: { city: 'City', zipCode: '12345' },
        country: 'United States'
      });
      expect(serialize(instance)).toEqual({
        country: 'United States',
        ...addressObj
      });
    });

    it('allows subclasses to override serializables', () => {
      class Dep {
        public readonly SCHEMA = z.object({
          foo: z.string()
        });
        @serializable('foo')
        accessor foo: string = 'foo';
      }
      class DepChild extends Dep {
        accessor foo: string = 'bar';
      }
      class Example {
        public readonly SCHEMA = z.object({
          dep: z.instanceof(Dep)
        });
        protected accessor _dep: Dep;
        @serializable('dep', Dep)
        get dep() {
          return this._dep;
        }
        constructor(params: z.infer<Example['SCHEMA']>) {
          this._dep = params.dep;
        }
      }
      class ExampleChild extends Example {
        public readonly SCHEMA = z.object({
          dep: z.instanceof(DepChild)
        });
        @serializable('dep', DepChild)
        get dep() {
          return this._dep;
        }
      }
      const child = new ExampleChild({ dep: new DepChild() });
      const serialized = serialize(child);
      const deserialized = deserialize(serialized, ExampleChild);
      expect(deserialized.dep).toBeInstanceOf(DepChild);
      expect(deserialized.dep.foo).toEqual('bar');
    });

    it('serializes objects with recursive schemas', () => {
      const directory = new Directory({
        name: 'folder-a',
        subdirectories: [new Directory({ name: 'folder-b', subdirectories: [] })]
      });

      const serialized = serialize(directory);
      expect(serialized).toEqual({
        subdirectories: [{ subdirectories: [], name: 'folder-b' }],
        name: 'folder-a'
      });
    });

    describe('strict', () => {
      it('ensures all keys in the SCHEMA have been serialized', () => {
        class Example {
          public readonly SCHEMA = z.object({
            foo: z.string(),
            bar: z.string()
          });
          @serializable('foo')
          accessor foo: string = 'foo';
          accessor _bar: string = 'bar';
        }
        class ExampleFixed extends Example {
          @serializable('bar')
          get bar() {
            return super._bar;
          }
        }
        expect(() => {
          serialize(new Example(), { strict: true });
        }).toThrow('missing keys: bar');
        expect(() => {
          serialize(new ExampleFixed(), { strict: true });
        }).not.toThrow();
      });
    });
  });

  describe('deserialize', () => {
    it('deserializes a basic class', () => {
      const deserialized = deserialize(addressObj, Address);
      expect(deserialized.city).toEqual('City');
      expect(deserialized.zipCode).toEqual('12345');
    });

    it('recursively deserializes', () => {
      const deserialized = deserialize(personObj, Person);
      expect(deserialized.name).toEqual(person.name);
      expect(deserialized.address.city).toEqual(person.address.city);
      expect(deserialized.address.zipCode).toEqual(person.address.zipCode);
    });

    it('deserializes collections', () => {
      const deserialized = deserialize({ people: [personObj] }, Company);
      expect(deserialized.people).toEqual([person]);
    });

    it('uses the key name defined in the schema, even when it diverges from the accessor name', () => {
      const ExampleSchema = z.object({
        foo: z.string()
      });
      class Example {
        public readonly SCHEMA = ExampleSchema;
        @serializable('foo')
        accessor bar: string;
        constructor(params: z.infer<Example['SCHEMA']>) {
          this.bar = params.foo;
        }
      }
      const instance = new Example({ foo: 'hello' });
      const deserialized = deserialize(serialize(instance), Example);
      expect(instance.bar).toEqual(deserialized.bar);
    });

    it('deserializes subclasses', () => {
      const serialized = {
        country: 'United States',
        ...addressObj
      };
      const intlAddress = deserialize(serialized, InternationalAddress);
      expect(intlAddress.country).toEqual('United States');
      expect(intlAddress.city).toEqual('City');
      expect(intlAddress.zipCode).toEqual('12345');
    });

    it('deserializes objects with recursive schemas', () => {
      const serialized = {
        subdirectories: [{ subdirectories: [], name: 'folder-b' }],
        name: 'folder-a'
      };

      const directory = deserialize(serialized, Directory);

      expect(directory.name).toEqual('folder-a');
      expect(directory.subdirectories[0].name).toEqual('folder-b');
    });
  });

  describe('strict', () => {
    it('throws an error when it deserializes an incorrect shape', () => {
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deserialize({ ...personObj, name: undefined } as any, Person, { strict: true });
      }).toThrow('invalid_type');
    });
  });
});

describe('validateWith', () => {
  class Email {
    @validateWith(z.string().email())
    accessor address: string;
    #foo: string = '';
    @validateSetWith(z.string().min(4))
    set foo(s: string) {
      this.#foo = s;
    }

    constructor(address: string) {
      this.address = address;
    }
  }

  it('throws an error on invalid email address', () => {
    expect(() => {
      new Email('invalid');
    }).toThrow('Invalid email');
  });

  it('throws an error on setting foo with a string shorter than 4 characters', () => {
    const email = new Email('j@c.co');
    expect(() => {
      email.foo = 's';
    }).toThrow('too_small');
  });

  it('allows setting foo with a string of at least 4 characters', () => {
    const email = new Email('j@c.co');
    expect(() => {
      email.foo = 'asdjkj';
    }).not.toThrow();
  });
});
