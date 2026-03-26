import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from './errors.js';

type AsyncHandler = (request: Request, response: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function getRouteParam(value: string | string[] | undefined, fieldName: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new AppError(400, `${fieldName} is required.`, 'INVALID_ROUTE_PARAM');
}

export function requireTrimmedString(value: unknown, fieldName: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new AppError(400, `${fieldName} is required.`, 'INVALID_INPUT');
}

export function requireBoolean(value: unknown, fieldName: string) {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new AppError(400, `${fieldName} must be a boolean.`, 'INVALID_INPUT');
}

export function optionalTrimmedString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function requireStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new AppError(400, `${fieldName} must be an array of strings.`, 'INVALID_INPUT');
  }

  const items = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  if (items.length !== value.length) {
    throw new AppError(400, `${fieldName} must contain only non-empty strings.`, 'INVALID_INPUT');
  }

  return items;
}
