// @vitest-environment jsdom
/**
 * Guards the revenue-critical signup → Stripe Checkout path:
 *  - a valid submit POSTs /api/stripe/checkout with the selected plan's
 *    priceId and the UTM-based clientReferenceId, and redirects the browser
 *    to the returned checkout URL,
 *  - a failed checkout response surfaces a visible error (no silent failure,
 *    no redirect), and
 *  - an empty/invalid email never fires the API call (native validation).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SignupModal from "./SignupModal";

let fetchMock: ReturnType<typeof vi.fn>;
const originalLocation = window.location;
let locationMock: { href: string; pathname: string; search: string; origin: string };

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  locationMock = {
    href: "https://rxfit.ai/",
    pathname: "/",
    search: "",
    origin: "https://rxfit.ai",
  };
  Object.defineProperty(window, "location", {
    value: locationMock,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function renderModal(props: Partial<React.ComponentProps<typeof SignupModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SignupModal
        isOpen={true}
        onClose={() => {}}
        plan="kickstart"
        priceId="price_test_kickstart"
        {...props}
      />
    </QueryClientProvider>,
  );
}

function fillAndSubmit(email: string, name = "Ada L") {
  fireEvent.change(screen.getByTestId("input-name"), { target: { value: name } });
  fireEvent.change(screen.getByTestId("input-email"), { target: { value: email } });
  fireEvent.click(screen.getByTestId("button-submit-signup"));
}

describe("SignupModal checkout path", () => {
  it("valid submit calls /api/stripe/checkout with the plan's priceId + UTM clientReferenceId and redirects", async () => {
    // Simulate a visit attributed via UTM params (persisted the way utm.ts does).
    sessionStorage.setItem(
      "rxfit_utm",
      JSON.stringify({ utm_source: "newsletter", utm_medium: "email", utm_campaign: "july" }),
    );
    locationMock.pathname = "/blog/some-post";

    fetchMock.mockResolvedValue(
      jsonResponse(200, { url: "https://checkout.stripe.com/c/session_123" }),
    );

    renderModal();
    fillAndSubmit("ada@example.com");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/stripe/checkout");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      email: "ada@example.com",
      name: "Ada L",
      plan: "kickstart",
      priceId: "price_test_kickstart",
      clientReferenceId: "some-post|newsletter|email|july",
    });

    // Browser is sent to the returned Stripe Checkout URL.
    await waitFor(() => {
      expect(locationMock.href).toBe("https://checkout.stripe.com/c/session_123");
    });
  });

  it("failed checkout response shows a visible error instead of silently doing nothing", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: "Stripe is unavailable" }));

    renderModal();
    fillAndSubmit("ada@example.com");

    await waitFor(() => {
      expect(screen.getByTestId("text-error")).toBeTruthy();
    });
    expect(screen.getByTestId("text-error").textContent).toContain("Stripe is unavailable");

    // No redirect happened and the button is usable again for a retry.
    expect(locationMock.href).toBe("https://rxfit.ai/");
    await waitFor(() => {
      expect(
        (screen.getByTestId("button-submit-signup") as HTMLButtonElement).disabled,
      ).toBe(false);
    });
  });

  it("failed checkout with no message body still shows a generic visible error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));

    renderModal();
    fillAndSubmit("ada@example.com");

    await waitFor(() => {
      expect(screen.getByTestId("text-error")).toBeTruthy();
    });
    expect(screen.getByTestId("text-error").textContent).toContain("Something went wrong");
    expect(locationMock.href).toBe("https://rxfit.ai/");
  });

  it("empty email does not fire the API call", async () => {
    renderModal();
    fillAndSubmit("");

    // Native `required` validation blocks form submission entirely.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(locationMock.href).toBe("https://rxfit.ai/");
  });

  it("invalid email does not fire the API call", async () => {
    renderModal();
    fillAndSubmit("not-an-email");

    // Native type="email" validation blocks form submission entirely.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(locationMock.href).toBe("https://rxfit.ai/");
  });

  it("missing priceId shows an error and never calls the API", async () => {
    renderModal({ priceId: null });
    fillAndSubmit("ada@example.com");

    await waitFor(() => {
      expect(screen.getByTestId("text-error")).toBeTruthy();
    });
    expect(screen.getByTestId("text-error").textContent).toContain("Pricing not loaded yet");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
