// @ts-nocheck

function fail(message = "Assertion failed") {
  throw new Error(message);
}

function assert(value, message) {
  if (!value) fail(message);
}

export const ok = assert;
export const equal = (actual, expected, message) => assert(actual == expected, message);
export const notEqual = (actual, expected, message) => assert(actual != expected, message);
export const strictEqual = (actual, expected, message) => assert(actual === expected, message);
export const notStrictEqual = (actual, expected, message) => assert(actual !== expected, message);
export { fail };
export default Object.assign(assert, {
  equal,
  fail,
  notEqual,
  notStrictEqual,
  ok,
  strictEqual,
});
