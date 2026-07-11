// Telegram Mini Apps don't have access to the special `window.storage` API
// that exists inside Claude's artifact preview. In a real deployment we use
// Telegram's own CloudStorage (persists per-user, tied to their Telegram
// account) and fall back to localStorage when the page is opened in a
// regular browser (useful for local testing outside Telegram).

function cloudStorage() {
  return window.Telegram?.WebApp?.CloudStorage || null;
}

export const storage = {
  async get(key) {
    const cs = cloudStorage();
    if (cs) {
      return new Promise((resolve) => {
        cs.getItem(key, (err, value) => {
          resolve(err || !value ? null : value);
        });
      });
    }
    return localStorage.getItem(key);
  },

  async set(key, value) {
    const cs = cloudStorage();
    if (cs) {
      return new Promise((resolve) => {
        cs.setItem(key, value, (err) => resolve(!err));
      });
    }
    localStorage.setItem(key, value);
    return true;
  },
};

// NOTE on the shared leaderboard feature:
// CloudStorage only stores data privately per-user — there is no built-in
// way for one user's app instance to read another user's CloudStorage.
// To show a real cross-member leaderboard you'll need a small backend
// (e.g. a Cloudflare Worker + KV, or a Supabase table) that each client
// writes to and reads from. The opt-in toggle in the app currently just
// saves the user's local preference as a placeholder for that future step.
