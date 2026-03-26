import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from './errors.js';
import {
  getRouteParam,
  optionalTrimmedString,
  requireBoolean,
  requireStringArray,
  requireTrimmedString
} from './http.js';

test('requireTrimmedString returns trimmed input', () => {
  assert.equal(requireTrimmedString('  hello  ', 'message'), 'hello');
});

test('requireTrimmedString throws AppError for empty input', () => {
  assert.throws(() => requireTrimmedString('   ', 'message'), AppError);
});

test('requireBoolean accepts boolean values only', () => {
  assert.equal(requireBoolean(true, 'enabled'), true);
  assert.throws(() => requireBoolean('true', 'enabled'), AppError);
});

test('requireStringArray validates trimmed string arrays', () => {
  assert.deepEqual(requireStringArray([' one ', 'two'], 'items'), ['one', 'two']);
  assert.throws(() => requireStringArray(['one', 2], 'items'), AppError);
});

test('optionalTrimmedString returns undefined for blank or non-string values', () => {
  assert.equal(optionalTrimmedString('   '), undefined);
  assert.equal(optionalTrimmedString(1), undefined);
  assert.equal(optionalTrimmedString('  source  '), 'source');
});

test('getRouteParam validates route params', () => {
  assert.equal(getRouteParam('abc', 'approvalId'), 'abc');
  assert.throws(() => getRouteParam(undefined, 'approvalId'), AppError);
});
