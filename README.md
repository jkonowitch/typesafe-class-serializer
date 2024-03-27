# `typesafe-class-serializer`

[![coverage](https://coveralls.io/repos/github/jkonowitch/typesafe-class-serializer/badge)](https://coveralls.io/github/jkonowitch/typesafe-class-serializer)
[![npm](https://img.shields.io/npm/v/typesafe-class-serializer)](https://www.npmjs.com/package/typesafe-class-serializer)

Typesafe serialization and deserialization library for JavaScript classes. Define your schema declaratively with ES6 decorators and `zod`.

## Features

- **Serialization and Deserialization**: Facilitates the conversion between class instances and plain objects, supporting deep serialization of nested objects and collections.
- **Type Safety**: Ensures type safety during serialization and deserialization processes, supporting full type inference on serialization return types.
- **Schema Definition with `zod`**: Allows for defining strict schemas for data validation and type inference.
- **Validation**: Provides mechanisms for validating class properties both at instantiation and during property updates.

## ES6 Decorators

This library uses ES6 decorators, which are currently at the [stage 3 proposal status](https://github.com/tc39/proposal-decorators) and are fully implemented in Typescript 5.

Note that this library does _not_ require the use of `experimentalDecorators`.

## Why would I use this?

**Domain-Driven Design (DDD)**: When using domain driven design, you often want to separate your core domain logic from the persistence mechanism (e.g., databases, APIs). This library allows you to define your domain models as serializable classes, abstracting away the persistence details and enabling you to work with plain JavaScript objects for storage or transmission.

Even if you're not following a strict DDD approach, this library can be beneficial in any application where you want to decouple your core logic from the persistence layer.

## Getting Started

### Installation

You can install the library using npm (or your package manager of choice). You must also have `zod` installed as a peer dependency.

```bash
npm install typesafe-class-serializer zod
```

### Defining Schemas and Creating Classes

To ensure runtime safety and correct type inference, <u>(1)</u> **classes must define a public readonly SCHEMA property**, referencing the corresponding zod schema, and <u>(2)</u> classes [**must use this SCHEMA as the constructor argument for instantiation**](#note-constructors). This is all enforced via types, so your IDE and `tsc` will error if you do not.

```typescript
import { z } from 'zod';

const AddressSchema = z.object({
  details: z.object({ city: z.string(), zipCode: z.string() })
});

class Address {
  public readonly SCHEMA = AddressSchema;

  @serializable('details')
  protected accessor details: { city: string; zipCode: string };

  constructor(parameters: z.infer<typeof AddressSchema>) {
    this.details = parameters.details;
  }
}
```

### Serialization

The `serialize` function converts class instances into plain objects, using schemas for type inference and structure validation.

```typescript
const address = new Address({ details: { city: 'City', zipCode: '12345' } });
const serializedAddress = serialize(address);
```

### Deserialization

The `deserialize` function converts plain objects back into class instances, ensuring the data matches the defined schemas.

```typescript
const deserializedAddress = deserialize(serializedAddress, Address);
```

### Note: Constructors

This library makes the (opinionated) assumption that the serializable properties of a class fully constitute its constructor parameters. This does not preclude you from creating `static` methods (perhaps using the "ubiqitous language" of your domain) that will define its API (see below).

```typescript
class Address {
  public readonly SCHEMA = AddressSchema;

  @serializable('details')
  protected accessor details: { city: string; zipCode: string };

  // this would never really be called directly by clients
  protected constructor(parameters: z.infer<typeof AddressSchema>) {
    this.details = parameters.details;
  }

  // Public API - can take different arguments, supply defaults, etc.
  public static create(city: string, zipCode: string) {
    new this({ city, zipCode });
  }
}
```

For those who really object to this, I would be open to discussion / PRs / design proposals that make this configurable.

## Advanced Serialization

### Serializable Properties

When dealing with properties that are instances of classes marked as serializable, the library seamlessly handles their serialization. This is particularly useful for composing complex data models where some properties are objects with their own serialization logic.

Consider the following simplified `Person` class implementation:

```typescript
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

  constructor(params: z.infer<typeof PersonSchema>) {
    this.address = params.address;
    this.name = params.name;
  }
}
```

In this example, the `Person` class has an `address` property which is an instance of the `Address` class, itself a serializable entity. The library correctly handles the serialization of this nested object according to its defined schema and serialization rules.

### Collection Serialization

When serializing collections, such as arrays of objects, the library allows for the definition of custom serialization and deserialization logic for each item in the collection. This is particularly useful for managing lists of serializable entities.

Here's how you can define a `Company` class that contains a list of `Person` instances:

```typescript
const CompanySchema = z.object({
  people: z.array(z.instanceof(Person))
});

class Company {
  public readonly SCHEMA = CompanySchema;

  @serializable('people', {
    doSerialize: (people) => people.map(serialize),
    doDeserialize: (people) => people.map((person) => deserialize(person, Person))
  })
  accessor people: Person[];

  constructor(params: z.infer<typeof CompanySchema>) {
    this.people = params.people;
  }
}
```

In this `Company` class example, the `people` property is an array of `Person` instances. The library uses the provided custom serialization (`doSerialize`) and deserialization (`doDeserialize`) functions to process each `Person` object in the array, ensuring they are correctly serialized and deserialized according to their own schemas.

### Usage Example

Here's how you might use these classes together:

```typescript
const address = new Address({ details: { city: 'CityName', zipCode: 'PostalCode' } });
const person = new Person({ name: 'John Doe', address });
const company = new Company({ people: [person] });

// Serialize the company object, including nested Person and Address objects
const serializedCompany = serialize(company);

// The type of 'serializedCompany' is fully inferred from the serialization process.
// We infer the structure of the serialized object based on the schemas
// used in the class definitions. In this case, 'typeof serializedCompany'
// would be inferred as follows:
// typeof serializedCompany === {
//   people: {
//     name: string;
//     address: {
//       details: {
//         city: string;
//         zipCode: string;
//       };
//     };
//   }[];
// }

// Deserialize back into a Company object from the serialized data
const deserializedCompany = deserialize(serializedCompany, Company);
```

In this example, serializing the `company` object automatically handles the serialization of the nested `Person` and `Address` objects. Similarly, deserializing from `serializedCompany` reconstructs the full `Company` instance, along with all nested objects, preserving the structure and types as defined by their schemas.

### Subclassing and Overrides

Subclasses can extend base classes, overriding serialization behavior and adapting to more specific schemas.

```typescript
class InternationalAddress extends Address {
  public readonly SCHEMA = InternationalAddressSchema;
  @serializable('country')
  accessor country: string;
}
```

### Validation

Properties can be validated using `zod` schemas with the `@validateWith` and `@validateSetWith` decorators. This allows for [self-encapsulation](https://martinfowler.com/bliki/SelfEncapsulation.html) without a lot of boilerplate. Note there are two separate decorators, one for `accessors` and the other for `setters`. This can be combined with serialization (or not - it is technically a standalone feature).

```typescript
const EmailSchema = z.object({
  address: z.string().email(),
  foo: z.string().min(4)
});

class Email {
  public readonly SCHEMA = EmailSchema;

  @validateWith(EmailSchema.shape.address)
  @serializable('address')
  accessor address: string;

  #foo: string;

  @serializable('foo')
  get foo() {
    return this.#foo;
  }

  @validateSetWith(EmailSchema.shape.foo)
  set foo(s: string) {
    this.#foo = s;
  }

  constructor(parameters: z.infer<Email['SCHEMA']>) {
    this.foo = parameters.foo;
    this.address = parameters.address;
  }
}
```

## Testing

The library's functionality is thoroughly tested using unit tests. Please review them [here](./src/index.test.ts) to see all of this functionality in action.
