export function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export function notFound(message: string): Error & { statusCode: number } {
  return httpError(message, 404);
}
