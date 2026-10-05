/**
 * Signing in: Jivo Auth proves who the person is, OMS says what they may do.
 *
 * Two calls, in this order, and the order is the contract:
 *
 *   1. POST {AUTH}/auth/login/  → a Jivo Auth token pair
 *   2. GET  {API}/auth/profile/ → the OMS user that pair belongs to
 *
 * The tokens are stored BETWEEN the two, because (2) is an ordinary OMS call
 * and the `api` interceptor reads the Bearer from storage. A sign-in that gets
 * past (1) and not (2) has to undo that, and ends the Jivo Auth session too —
 * a pair nobody holds any more should not stay alive at auth.jivo.in.
 */
import { clearSession, saveTokens, type ApiUser } from "../auth/session";
import api, { isDisabledAccountResponse } from "./api";
import { jivoLogin, jivoLogout, signInErrorMessage } from "./jivoAuth";

/** How this browser's session appears in the person's Jivo Auth sessions. */
export const WEB_DEVICE_NAME = "OMS web";

export const getCurrentUser = async () => {
  const response = await api.get("/auth/profile/");
  return response.data.data;
};

/** A sign-in that did not happen, with the sentence to show for it. */
export class SignInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignInError";
  }
}

/** Why `/auth/profile/` refused a token Jivo Auth had just issued. */
function profileFailureMessage(error: unknown): string {
  const response = (error as { response?: { status?: unknown } } | null)?.response;
  if (!response) {
    // Our own "empty profile" is not a network failure; only a request that
    // got no answer at all is.
    return (error as { isAxiosError?: boolean } | null)?.isAxiosError
      ? "Can't reach OMS. Try again."
      : "OMS could not load your account. Try again.";
  }
  if (response.status === 403) {
    // Signed in to Jivo Auth fine; this person has no access to OMS.
    return "Your account doesn't have access to OMS. Ask your administrator.";
  }
  if (response.status === 401 && isDisabledAccountResponse(response)) {
    return "Your OMS account is disabled.";
  }
  return "OMS could not load your account. Try again.";
}

/**
 * Sign in with a Jivo Auth email and password and return the OMS user.
 *
 * On success the token pair is in storage and the caller adopts the user
 * through `signIn` — the same `sessionFromApi` path the startup refresh uses.
 * On failure NOTHING is left behind, and the thrown `SignInError` carries the
 * message for the form. Never logs: the failures it handles carry the password
 * in their request body.
 */
export async function signInWithJivo(email: string, password: string): Promise<ApiUser> {
  let tokens;
  try {
    tokens = await jivoLogin(email, password, WEB_DEVICE_NAME);
  } catch (error) {
    throw new SignInError(signInErrorMessage(error));
  }

  saveTokens(tokens.access, tokens.refresh);

  try {
    const user: unknown = await getCurrentUser();
    if (!user || typeof user !== "object") throw new Error("empty profile");
    return user as ApiUser;
  } catch (error) {
    // Read the refresh token back rather than using `tokens.refresh`: a 401
    // here may already have rotated the pair through the api interceptor.
    let refresh = tokens.refresh;
    try {
      refresh = localStorage.getItem("refresh") || refresh;
    } catch {
      /* storage unavailable — the pair from the sign-in is all there is */
    }
    clearSession();
    await jivoLogout(refresh);
    throw new SignInError(profileFailureMessage(error));
  }
}
