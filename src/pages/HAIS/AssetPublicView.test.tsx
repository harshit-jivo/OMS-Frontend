/**
 * The page behind a scanned QR sticker.
 *
 * The behaviour worth guarding is which endpoint it asks. A sticker is read by
 * whatever phone is to hand — usually somebody with no OMS account — so an
 * anonymous scan must go to the PUBLIC endpoint and render, rather than
 * calling the authenticated one and telling the reader to log in. Calling the
 * wrong one fails silently for exactly the people the sticker exists for.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssetPublicView from "./AssetPublicView";
import { haisService } from "../../services/haisService";
import { loadSession } from "@/auth";

vi.mock("@/auth", () => ({ loadSession: vi.fn() }));

/** What the PUBLIC endpoint returns, once mapped: no history, no IDs. */
const publicAsset = {
  asset_id: "JIVO-LAP-0001",
  serial_num: "5CD1234XYZ",
  asset_type: "Laptop",
  company: "Dell",
  model_num: "Latitude 5420",
  working_status: "Working",
  current_user_name: "Priya Sharma",
  department: "IT",
  email_id: "priya.sharma@jivo.in",
  history: [],
} as never;

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={["/hais/device/5CD1234XYZ"]}>
      <Routes>
        <Route path="/hais/device/:code" element={<AssetPublicView />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());

describe("AssetPublicView", () => {
  it("asks the PUBLIC endpoint when nobody is signed in", async () => {
    vi.mocked(loadSession).mockReturnValue(null);
    const pub = vi.spyOn(haisService, "getPublicBySerial").mockResolvedValue(publicAsset);
    const auth = vi.spyOn(haisService, "getBySerial").mockResolvedValue(publicAsset);

    renderAt();
    expect(await screen.findByText("JIVO-LAP-0001")).toBeInTheDocument();

    expect(pub).toHaveBeenCalledWith("5CD1234XYZ");
    // The authenticated one would 401 and send the reader to a login screen
    // they have no account for.
    expect(auth).not.toHaveBeenCalled();
  });

  it("asks the FULL endpoint when there is a session", async () => {
    // The same URL, scanned by an IT admin doing an audit, shows everything.
    vi.mocked(loadSession).mockReturnValue({ userId: "1" } as never);
    const pub = vi.spyOn(haisService, "getPublicBySerial").mockResolvedValue(publicAsset);
    const auth = vi.spyOn(haisService, "getBySerial").mockResolvedValue(publicAsset);

    renderAt();
    expect(await screen.findByText("JIVO-LAP-0001")).toBeInTheDocument();

    expect(auth).toHaveBeenCalledWith("5CD1234XYZ");
    expect(pub).not.toHaveBeenCalled();
  });

  it("shows the holder and how to reach them", async () => {
    vi.mocked(loadSession).mockReturnValue(null);
    vi.spyOn(haisService, "getPublicBySerial").mockResolvedValue(publicAsset);

    renderAt();

    expect(await screen.findByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText("priya.sharma@jivo.in")).toBeInTheDocument();
    expect(screen.getByText("Latitude 5420")).toBeInTheDocument();
  });

  it("does not tell an anonymous scanner to go and log in when it fails", async () => {
    // It used to. An anonymous scan is expected to work now, so a failure
    // means the code did not match — not that the reader lacks an account.
    vi.mocked(loadSession).mockReturnValue(null);
    vi.spyOn(haisService, "getPublicBySerial").mockRejectedValue(new Error("nope"));

    renderAt();

    expect(await screen.findByText(/Check that the whole code was scanned/)).toBeInTheDocument();
    expect(screen.queryByText(/log in to OMS/)).toBeNull();
  });
});
