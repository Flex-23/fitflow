export type ActionState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Optional payload the client can use after success (e.g. a new id). */
  data?: Record<string, unknown>;
};

export const emptyState: ActionState = {};

export const DAY_MS = 24 * 60 * 60 * 1000;
