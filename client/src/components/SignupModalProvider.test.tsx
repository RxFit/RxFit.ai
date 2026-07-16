// @vitest-environment jsdom
/**
 * Guards the plan → priceId wiring ABOVE the signup modal:
 *  - useSignupModal().open("committed") opens the modal showing the committed
 *    plan and submits checkout with the committed price ID,
 *  - when /api/stripe/products fails, the LIVE_PRICE_IDS fallback is used,
 *  - when /api/stripe/products succeeds, fetched metadata.tier → prices[0].id
 *    overrides the fallback for that tier (and only that tier).
 * A regression here would send buyers to checkout for the wrong plan even
 * though SignupModal's own tests pass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignupModalProvider, useSignupModal } from "./SignupModalProvider";
import { LIVE_PRICE_IDS, PLAN_PRICING, type PlanTier } from "@shared/stripe-constants";

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

/**
 * fetch mock that routes by URL:
 *  - /api/stripe/products → the given products result (or a rejection),
 *  - /api/stripe/checkout → a successful checkout session.
 */
function routeFetch(products: { reject: true } | { body: unknown }) {
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/stripe/products") {
      if ("reject" in products) return Promise.reject(new Error("network down"));
      return Promise.resolve(jsonResponse(200, products.body));
    }
    if (url === "/api/stripe/checkout") {
      return Promise.resolve(
        jsonResponse(200, { url: "https://checkout.stripe.com/c/session_abc" }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function Opener({ plan }: { plan: PlanTier }) {
  const { open } = useSignupModal();
  return (
    <button data-testid={`button-open-${plan}`} onClick={() => open(plan)}>
      open {plan}
    </button>
  );
}

function renderProvider(plan: PlanTier) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SignupModalProvider>
        <Opener plan={plan} />
      </SignupModalProvider>
    </QueryClientProvider>,
  );
}

async function openModalAndSubmit(plan: PlanTier) {
  fireEvent.click(screen.getByTestId(`button-open-${plan}`));
  // Modal is open when its form fields are present.
  await waitFor(() => {
    expect(screen.getByTestId("input-email")).toBeTruthy();
  });
  fireEvent.change(screen.getByTestId("input-name"), { target: { value: "Ada L" } });
  fireEvent.change(screen.getByTestId("input-email"), {
    target: { value: "ada@example.com" },
  });
  fireEvent.click(screen.getByTestId("button-submit-signup"));
  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/stripe/checkout"),
    ).toBe(true);
  });
  const call = fetchMock.mock.calls.find(([url]) => url === "/api/stripe/checkout")!;
  return JSON.parse((call[1] as RequestInit).body as string) as {
    plan: string;
    priceId: string;
  };
}

describe("SignupModalProvider plan → priceId wiring", () => {
  it("open('committed') with failed products fetch uses the LIVE_PRICE_IDS fallback", async () => {
    routeFetch({ reject: true });
    renderProvider("committed");

    const body = await openModalAndSubmit("committed");

    // Modal shows the committed plan copy…
    expect(screen.getByText(new RegExp(PLAN_PRICING.committed.name)).textContent).toContain(
      "Annual Plan",
    );
    // …and checkout is submitted with the committed fallback price ID.
    expect(body.plan).toBe("committed");
    expect(body.priceId).toBe(LIVE_PRICE_IDS.committed);
  });

  it("fetched products override the fallback via metadata.tier → prices[0].id", async () => {
    routeFetch({
      body: {
        data: [
          {
            metadata: { tier: "committed" },
            prices: [{ id: "price_live_committed_override" }],
          },
        ],
      },
    });
    renderProvider("committed");

    // Wait until the products fetch has been consumed so the override is applied.
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => url === "/api/stripe/products"),
      ).toBe(true);
    });

    const body = await openModalAndSubmit("committed");
    expect(body.plan).toBe("committed");
    expect(body.priceId).toBe("price_live_committed_override");
  });

  it("a partial products response overrides only the tiers it contains", async () => {
    routeFetch({
      body: {
        data: [
          {
            metadata: { tier: "kickstart" },
            prices: [{ id: "price_live_kickstart_override" }],
          },
          // Malformed entries are ignored, not crashed on.
          { metadata: {}, prices: [{ id: "price_ignored" }] },
          { metadata: { tier: "transformation" }, prices: [] },
        ],
      },
    });
    renderProvider("committed");

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => url === "/api/stripe/products"),
      ).toBe(true);
    });

    // committed was not in the response → still the fallback price ID.
    const body = await openModalAndSubmit("committed");
    expect(body.priceId).toBe(LIVE_PRICE_IDS.committed);
  });

  it("an unexpected products response shape is ignored and the fallback survives", async () => {
    routeFetch({ body: { products: "wrong-shape" } });
    renderProvider("kickstart");

    const body = await openModalAndSubmit("kickstart");
    expect(body.plan).toBe("kickstart");
    expect(body.priceId).toBe(LIVE_PRICE_IDS.kickstart);
  });
});
