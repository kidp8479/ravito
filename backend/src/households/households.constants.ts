// Invite links are meant to be shared and used quickly (a household
// member sending a code to whoever they're inviting), not held onto -
// 7 days is generous for that without leaving stale codes valid for long.
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
