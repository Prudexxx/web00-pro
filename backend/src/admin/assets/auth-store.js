export const AUTH_STATES = Object.freeze({
  BOOTSTRAPPING: "BOOTSTRAPPING",
  AUTHENTICATED: "AUTHENTICATED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  REFRESHING: "REFRESHING",
  LOGGING_OUT: "LOGGING_OUT"
});

const validStates = new Set(Object.values(AUTH_STATES));

export function createAuthStore() {
  let accessToken = null;
  let state = AUTH_STATES.BOOTSTRAPPING;
  let user = null;
  const listeners = new Set();

  function getSnapshot() {
    return {
      state,
      user: cloneUser(user)
    };
  }

  function emit() {
    const snapshot = getSnapshot();

    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch {
        // Subscriber failures must not interrupt auth state transitions.
      }
    }
  }

  return {
    getAccessToken() {
      return accessToken;
    },
    getSnapshot,
    setState(nextState) {
      if (!validStates.has(nextState)) {
        throw new Error("Unknown auth state.");
      }

      state = nextState;
      emit();
    },
    setAuthenticated(input) {
      if (typeof input?.accessToken !== "string" || input.accessToken.length === 0) {
        throw new Error("Authenticated state requires an access token.");
      }

      accessToken = input.accessToken;
      state = AUTH_STATES.AUTHENTICATED;
      user = cloneUser(input.user);
      emit();
    },
    clear() {
      accessToken = null;
      state = AUTH_STATES.UNAUTHENTICATED;
      user = null;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }
  };
}

function cloneUser(input) {
  if (!isSafeUser(input)) {
    return null;
  }

  return {
    email: input.email,
    id: input.id,
    role: input.role
  };
}

function isSafeUser(input) {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof input.email === "string" &&
    typeof input.id === "string" &&
    (input.role === "admin" || input.role === "editor")
  );
}
