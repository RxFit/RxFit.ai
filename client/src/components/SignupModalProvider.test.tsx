// @vitest-environment jsdom
/**
 * Guards the plan → priceId wiring ABOVE the signup modal:
 *  - useSignupModal().open(tier) opens the modal showing that plan and submits
 *    checkout with that tier's pinned LIVE_PRICE_IDS entry,
 *  - NOTHING can move that price: the provider issues no catalog fetch, so no
 *    Stripe response can override it (and the server re-derives the price from
 *    `plan` anyway — see server/checkoutSession.test.ts).
 * A regression here would send buyers to checkout for the wrong plan even
 * though SignupModal's own tests pass.
 *
 * The deleted cases asserted a `metadata.tier → prices[0].id` override. That
 * mapping assumed one Stripe product per tier while the live catalog puts all
 * three tiers on ONE product, so the override could only ever collapse every
 * tier onto a single arbitrary price. The test encoded the bug as the contract.
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
 * fetch mock that routes by URL. Only /api/stripe/checkout is expected —
 * any other request (notably a resurrected /api/stripe/products catalog
 * fetch) rejects loudly rather than being quietly tolerated.
 */
function routeFetch() {
  fetchMock.mockImplementation((url: string) => {
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
  it("submits the pinned price ID for each tier", async () => {
    for (const tier of ["kickstart", "committed", "transformation"] as PlanTier[]) {
      routeFetch();
      renderProvider(tier);

      const body = await openModalAndSubmit(tier);
      expect(body.plan).toBe(tier);
      expect(body.priceId).toBe(LIVE_PRICE_IDS[tier]);

      cleanup();
      fetchMock.mockReset();
    }
  });

  it("open('committed') shows the committed plan copy", async () => {
    routeFetch();
    renderProvider("committed");

    await openModalAndSubmit("committed");
    expect(screen.getByText(new RegExp(PLAN_PRICING.committed.name)).textContent).toContain(
      "Annual Plan",
    );
  });

  it("issues no catalog fetch — nothing can change the submitted price ID", async () => {
    // The regression that matters. The provider previously fetched
    // /api/stripe/products and let the response override the price. Any
    // resurrection of that path fails here.
    routeFetch();
    renderProvider("kickstart");

    const body = await openModalAndSubmit("kickstart");
    expect(body.priceId).toBe(LIVE_PRICE_IDS.kickstart);
    expect(
      fetchMock.mock.calls.every(([url]) => url === "/api/stripe/checkout"),
    ).toBe(true);
  });
});
