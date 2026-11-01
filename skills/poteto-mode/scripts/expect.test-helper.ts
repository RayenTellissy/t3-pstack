import { inspect, isDeepStrictEqual } from "node:util";

export { afterEach, describe, it, test } from "node:test";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    !(value instanceof Map) &&
    !(value instanceof Set)
  );
}

function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}

// Jest-style toEqual: recursive, ignores undefined properties and
// does not compare prototypes.
function equals(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((item, index) => equals(item, expected[index]))
    );
  }
  if (isPlainRecord(actual) && isPlainRecord(expected)) {
    const actualKeys = definedKeys(actual);
    const expectedKeys = definedKeys(expected);
    return (
      actualKeys.length === expectedKeys.length &&
      expectedKeys.every(
        (key) => actualKeys.includes(key) && equals(actual[key], expected[key])
      )
    );
  }
  return isDeepStrictEqual(actual, expected);
}

function matchesObject(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, index) => matchesObject(actual[index], item))
    );
  }
  if (isPlainRecord(expected)) {
    return (
      isPlainRecord(actual) &&
      Object.keys(expected).every(
        (key) => key in actual && matchesObject(actual[key], expected[key])
      )
    );
  }
  return equals(actual, expected);
}

type ErrorClass = abstract new (...args: never[]) => unknown;
type ThrowExpectation = string | RegExp | ErrorClass | undefined;

function errorMatches(error: unknown, expected: ThrowExpectation): boolean {
  if (expected === undefined) {
    return true;
  }
  if (typeof expected === "function") {
    return error instanceof expected;
  }
  const message = error instanceof Error ? error.message : String(error);
  return typeof expected === "string"
    ? message.includes(expected)
    : expected.test(message);
}

function show(value: unknown): string {
  return inspect(value, { depth: 8, breakLength: 100 });
}

function check(pass: boolean, negated: boolean, message: () => string): void {
  if (pass === negated) {
    throw new Error(negated ? `expected not: ${message()}` : message());
  }
}

export interface Matchers {
  readonly not: Matchers;
  readonly rejects: AsyncMatchers;
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toMatchObject(expected: unknown): void;
  toContain(expected: unknown): void;
  toHaveLength(expected: number): void;
  toBeInstanceOf(expected: ErrorClass): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toEndWith(expected: string): void;
  toThrow(expected?: ThrowExpectation): void;
}

export interface AsyncMatchers {
  toThrow(expected?: ThrowExpectation): Promise<void>;
  toBeInstanceOf(expected: ErrorClass): Promise<void>;
}

function matchers(actual: unknown, negated: boolean): Matchers {
  return {
    get not() {
      return matchers(actual, !negated);
    },
    get rejects() {
      return rejectMatchers(actual);
    },
    toBe(expected) {
      check(Object.is(actual, expected), negated, () =>
        `expected ${show(actual)} to be ${show(expected)}`
      );
    },
    toEqual(expected) {
      check(equals(actual, expected), negated, () =>
        `expected ${show(actual)} to equal ${show(expected)}`
      );
    },
    toMatchObject(expected) {
      check(matchesObject(actual, expected), negated, () =>
        `expected ${show(actual)} to match ${show(expected)}`
      );
    },
    toContain(expected) {
      const pass =
        typeof actual === "string"
          ? typeof expected === "string" && actual.includes(expected)
          : Array.from(actual as Iterable<unknown>).some((item) =>
              Object.is(item, expected)
            );
      check(pass, negated, () =>
        `expected ${show(actual)} to contain ${show(expected)}`
      );
    },
    toHaveLength(expected) {
      const length = (actual as { length?: unknown } | null)?.length;
      check(length === expected, negated, () =>
        `expected length ${show(length)} to be ${expected} in ${show(actual)}`
      );
    },
    toBeInstanceOf(expected) {
      check(actual instanceof expected, negated, () =>
        `expected ${show(actual)} to be an instance of ${expected.name}`
      );
    },
    toBeNull() {
      check(actual === null, negated, () => `expected ${show(actual)} to be null`);
    },
    toBeUndefined() {
      check(actual === undefined, negated, () => `expected ${show(actual)} to be undefined`);
    },
    toEndWith(expected) {
      check(
        typeof actual === "string" && actual.endsWith(expected),
        negated,
        () => `expected ${show(actual)} to end with ${show(expected)}`
      );
    },
    toThrow(expected) {
      let thrown = false;
      let error: unknown;
      try {
        (actual as () => unknown)();
      } catch (caught) {
        thrown = true;
        error = caught;
      }
      check(thrown && errorMatches(error, expected), negated, () =>
        thrown
          ? `expected thrown ${show(error)} to match ${show(expected)}`
          : `expected function to throw ${show(expected)}`
      );
    },
  };
}

function rejectMatchers(actual: unknown): AsyncMatchers {
  async function rejection(): Promise<unknown> {
    try {
      await (typeof actual === "function" ? actual() : actual);
    } catch (error) {
      return error;
    }
    throw new Error("expected promise to reject, but it resolved");
  }
  return {
    async toThrow(expected) {
      const error = await rejection();
      check(errorMatches(error, expected), false, () =>
        `expected rejection ${show(error)} to match ${show(expected)}`
      );
    },
    async toBeInstanceOf(expected) {
      const error = await rejection();
      check(error instanceof expected, false, () =>
        `expected rejection ${show(error)} to be an instance of ${expected.name}`
      );
    },
  };
}

export function expect(actual: unknown): Matchers {
  return matchers(actual, false);
}
