// The fetch the Supabase clients use on the server. A read (GET or HEAD) is tried once more when the API gateway
// answers 502 or the connection drops: the gateway occasionally resets a pooled connection, and a failed read must
// not look like "no such row" (a profile read that fails would make an admin look like a user). Timeouts (504)
// aren't repeated, since the server has already waited, and writes never are.

export const resilientFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") return fetch(input, init);
  try {
    const response = await fetch(input, init);
    if (response.status !== 502) return response;
    await response.body?.cancel();
  } catch (error) {
    if (init?.signal?.aborted) throw error;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  return fetch(input, init);
};
