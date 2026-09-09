/** An error whose message is safe to show the user. */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new AppError(m, 400);
export const unauthorized = (m = 'Please sign in') => new AppError(m, 401);
export const notFound = (m = 'Not found') => new AppError(m, 404);
export const conflict = (m: string) => new AppError(m, 409);
