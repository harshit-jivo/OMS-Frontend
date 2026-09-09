import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { messageFrom } from "./apiError";

function withBody(data: unknown, status = 400): AxiosError {
  const error = new AxiosError("Request failed");
  error.response = {
    status,
    statusText: "",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe("messageFrom", () => {
  it("prefers DRF's own detail", () => {
    expect(messageFrom(withBody({ detail: "Invoice already advanced." }))).toBe(
      "Invoice already advanced.",
    );
  });

  it("falls through the keys the codebase actually reads", () => {
    expect(messageFrom(withBody({ message: "Rate not approved" }))).toBe(
      "Rate not approved",
    );
    expect(messageFrom(withBody({ error: "Bad company" }))).toBe("Bad company");
    // Forwarded verbatim from the SAP Service Layer.
    expect(messageFrom(withBody({ sap_error: "Item no longer exists [OITM]" }))).toBe(
      "Item no longer exists [OITM]",
    );
  });

  it("names the field when the error is a field error", () => {
    // "This field must be unique." on its own does not say which field.
    expect(messageFrom(withBody({ code: ["This field must be unique."] }))).toBe(
      "code: This field must be unique.",
    );
  });

  it("does not name the field when the field IS detail", () => {
    expect(messageFrom(withBody({ errors: { detail: ["Nope."] } }))).toBe("Nope.");
  });

  it("reads a plain string body", () => {
    expect(messageFrom(withBody("Gateway timeout"))).toBe("Gateway timeout");
  });

  it("says something useful when the body is empty", () => {
    expect(messageFrom(withBody({}, 403))).toBe("You do not have permission to do this.");
    expect(messageFrom(withBody({}, 404))).toBe("Not found — it may have been deleted.");
    expect(messageFrom(withBody({}, 502))).toBe(
      "The server failed to handle that. Try again.",
    );
  });

  it("uses the caller's fallback for anything else", () => {
    expect(messageFrom(withBody({}, 400), "Payment save failed")).toBe(
      "Payment save failed",
    );
  });

  it("distinguishes a dead network from a server that answered", () => {
    // No `response` at all: DNS, offline, CORS, timeout.
    expect(messageFrom(new AxiosError("Network Error"))).toBe(
      "Network error — check your connection and try again.",
    );
  });

  it("never puts a developer error message on screen", () => {
    // A TypeError from our own mapping code is a bug, and "Cannot read
    // properties of null" is not something to show a billing clerk.
    expect(
      messageFrom(new TypeError("Cannot read properties of null"), "Action failed"),
    ).toBe("Action failed");
  });

  it("ignores a key whose value is not text", () => {
    expect(messageFrom(withBody({ detail: { nested: true }, message: "Use me" }))).toBe(
      "Use me",
    );
  });
});

describe("key order", () => {
  it("prefers the SAP message over the generic one", () => {
    // A Service Layer failure sends both: `error` says "Failed to post",
    // `sap_error` names the item. MartApproval had this right by hand.
    const body = { error: "Failed to post the order.", sap_error: "Item OITM-9 is inactive" };
    expect(messageFrom(withBody(body))).toBe("Item OITM-9 is inactive");
  });

  it("still prefers DRF's detail over everything", () => {
    expect(messageFrom(withBody({ detail: "Not allowed.", sap_error: "x", error: "y" }))).toBe(
      "Not allowed.",
    );
  });
});
