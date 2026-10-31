import type { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public messageKey: string,
    public fields?: { path: string; messageKey: string }[],
    public choices?: { id: string; name: string }[],
  ) {
    super(code);
  }
}

export function zodFields(error: ZodError): { path: string; messageKey: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    messageKey: 'errors.validation',
  }));
}
