import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { advancePaymentService } from "../../services/advancePaymentService";

import { RequestFileName, RequestFilesProvider } from "./RequestFileLink";

const SAVED = { id: "file-2", name: "Re_ Required advance payment_.pdf", size: 128_295, serverId: 2 };

afterEach(() => vi.restoreAllMocks());

describe("RequestFileName", () => {
  it("opens a saved file even inside a read-only (disabled) fieldset", async () => {
    // The payout form is a `<fieldset disabled>` at Audit and Final — the
    // stages that read these files. A <button> there could not be clicked.
    const load = vi.spyOn(advancePaymentService, "requestFile").mockResolvedValue(new Blob(["%PDF-"]));
    const tab = { closed: false, close: vi.fn(), location: { href: "" } };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");

    render(
      <RequestFilesProvider value={1}>
        <fieldset disabled>
          <RequestFileName file={SAVED} />
        </fieldset>
      </RequestFilesProvider>,
    );
    fireEvent.click(screen.getByRole("link", { name: SAVED.name }));

    await waitFor(() => expect(tab.location.href).toBe("blob:file"));
    expect(load).toHaveBeenCalledWith(1, 2);
  });

  it("is plain text outside a request, or before it is uploaded", () => {
    render(<RequestFileName file={SAVED} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(SAVED.name)).toBeTruthy();
  });
});
