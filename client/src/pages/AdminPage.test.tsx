// @vitest-environment jsdom
/**
 * Guards the /admin dashboard's auth handling contract:
 *  - a 401 from either admin API clears the stored key (sessionStorage) and
 *    shows the rejection message on the re-locked key form, and
 *  - a successful load renders the per-service credential health cards and
 *    the recent-leads table from the fetched data, sending the key as the
 *    x-admin-key header (auth stays server-side).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import AdminPage from "./AdminPage";

const KEY_STORAGE = "rxfit_admin_key";

type MockResponse = { status: number; ok: boolean; json: () => Promise<unknown> };

function jsonResponse(status: number, body: unknown): MockResponse {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const HEALTH_BODY = {
  services: {
    stripe: { healthy: true, lastCheckedAt: "2026-07-16T10:00:00.000Z", lastError: null },
    gmail: { healthy: false, lastCheckedAt: "2026-07-16T10:00:00.000Z", lastError: "token refresh failed" },
    sheets: { healthy: null, lastCheckedAt: null, lastError: null },
  },
  checkedAt: "2026-07-16T10:00:00.000Z",
};

const LEADS_BODY = [
  { id: "lead-1", email: "ada@example.com", name: "Ada L", plan: "Kickstart", createdAt: "2026-07-15T09:00:00.000Z" },
  { id: "lead-2", email: "grace@example.com", name: null, plan: null, createdAt: "2026-07-14T09:00:00.000Z" },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function unlockWith(key: string) {
  fireEvent.change(screen.getByTestId("input-admin-key"), { target: { value: key } });
  fireEvent.click(screen.getByTestId("button-unlock"));
}

describe("AdminPage auth handling", () => {
  it("on 401: clears the stored key and shows the rejection error on the key form", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));

    render(<AdminPage />);
    unlockWith("wrong-key");

    // Key is stored immediately on submit...
    expect(sessionStorage.getItem(KEY_STORAGE)).toBe("wrong-key");

    // ...then the 401 logs out: key cleared, form re-shown with the error.
    await waitFor(() => {
      expect(screen.getByTestId("text-auth-error")).toBeTruthy();
    });
    expect(screen.getByTestId("text-auth-error").textContent).toContain("That key was rejected");
    expect(sessionStorage.getItem(KEY_STORAGE)).toBeNull();
    expect(screen.getByTestId("input-admin-key")).toBeTruthy();
    expect(screen.queryByTestId("card-service-stripe")).toBeNull();
  });

  it("on success: renders health cards and the leads table, sending x-admin-key", async () => {
    fetchMock.mockImplementation(async (path: string) => {
      if (path === "/api/internal/credential-health") return jsonResponse(200, HEALTH_BODY);
      if (path === "/api/leads") return jsonResponse(200, LEADS_BODY);
      throw new Error(`unexpected fetch: ${path}`);
    });

    render(<AdminPage />);
    unlockWith("good-key");

    await waitFor(() => {
      expect(screen.getByTestId("card-service-stripe")).toBeTruthy();
    });

    // Every request carried the key header (server-side auth contract).
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit;
      expect((init.headers as Record<string, string>)["x-admin-key"]).toBe("good-key");
    }

    // Health cards: one per service, with the right status badge per state.
    const stripeCard = screen.getByTestId("card-service-stripe");
    expect(stripeCard.querySelector('[data-testid="status-healthy"]')).toBeTruthy();
    const gmailCard = screen.getByTestId("card-service-gmail");
    expect(gmailCard.querySelector('[data-testid="status-broken"]')).toBeTruthy();
    expect(screen.getByTestId("text-error-gmail").textContent).toContain("token refresh failed");
    const sheetsCard = screen.getByTestId("card-service-sheets");
    expect(sheetsCard.querySelector('[data-testid="status-unknown"]')).toBeTruthy();

    // Leads table rows from the mocked /api/leads response.
    expect(screen.getByTestId("row-lead-lead-1").textContent).toContain("ada@example.com");
    expect(screen.getByTestId("row-lead-lead-2").textContent).toContain("grace@example.com");
    expect(screen.getByText(/Recent leads \(2\)/)).toBeTruthy();

    // No auth error and the key form is gone.
    expect(screen.queryByTestId("text-auth-error")).toBeNull();
    expect(screen.queryByTestId("input-admin-key")).toBeNull();
  });
});
