export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 422,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
