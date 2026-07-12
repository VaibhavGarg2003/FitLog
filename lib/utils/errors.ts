/**
 * UserFacingError — an error whose message is SAFE to show to the client.
 *
 * WHY: API routes must not echo arbitrary error.message values to users —
 * internal errors can carry infrastructure details (provider error bodies,
 * database hints). Services throw UserFacingError for messages written FOR
 * the user ("Please try rephrasing your meal"); routes return the message
 * only for instanceof UserFacingError and a generic message otherwise.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
