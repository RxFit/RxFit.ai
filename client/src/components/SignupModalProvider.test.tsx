// @vitest-environment jsdom
/**
 * Guards the plan → priceId wiring ABOVE the signup modal:
 *  - useSignupModal().open("committed") opens the modal showing the committed
 *    plan and submits checkout with the committed price ID fetched from
 *    /api/stripe/products (metadata.tier → prices[0].id),
 *  - when /api/stripe/products fails (network error, non-OK status, or a
 *    wrong-shape/empty response), checkout is DISABLED with a visible pricing
 *    error — there is no hardcoded fallback price ID anymore, so buyers can
 *    never check out at a stale amount,
 *  - a partial products response only enables the tiers it actually contains;
 *    missing tiers get the disabled-with-error treatment.
 * A regression here would either send buyers to checkout for the wrong plan
 * or silently charge an outdated price.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignupModalProvider, useSignupModal } from "./SignupModalProvider";
import { PLAN_PRICING, type PlanTier } from "@shared/stripe-constants";

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
function routeFetch(products: { reject: true } | { body: unknown } | { status: number; body: unknown }) {
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/stripe/products") {
      if ("reject" in products) return Promise.reject(new Error("network down"));
      const status = "status" in products ? products.status : 200;
      return Promise.resolve(jsonResponse(status, products.body));
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

async function waitForProductsFetch() {
  await waitFor(() => {
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/stripe/products"),
    ).toBe(true);
  });
}

async function openModal(plan: PlanTier) {
  fireEvent.click(screen.getByTestId(`button-open-${plan}`));
  await waitFor(() => {
    expect(screen.getByTestId("input-email")).toBeTruthy();
  });
}

async function openModalAndSubmit(plan: PlanTier) {
  await openModal(plan);
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

/** The modal is open with a visible pricing error and a disabled submit button. */
async function expectCheckoutDisabledWithError(plan: PlanTier) {
  await openModal(plan);
  await waitFor(() => {
    expect(screen.getByTestId("text-pricing-error")).toBeTruthy();
  });
  expect(
    (screen.getByTestId("button-submit-signup") as HTMLButtonElement).disabled,
  ).toBe(true);
  // Belt and braces: even a programmatic submit must not reach the API.
  fireEvent.submit(screen.getByTestId("input-email").closest("form")!);
  await new Promise((r) => setTimeout(r, 50));
  expect(
    fetchMock.mock.calls.some(([url]) => url === "/api/stripe/checkout"),
  ).toBe(false);
}

describe("SignupModalProvider plan → priceId wiring", () => {
  it("fetched products drive checkout via metadata.tier → prices[0].id", async () => {
    routeFetch({
      body: {
        data: [
          {
            metadata: { tier: "committed" },
            prices: [{ id: "price_live_committed" }],
          },
        ],
      },
    });
    renderProvider("committed");
    await waitForProductsFetch();

    const body = await openModalAndSubmit("committed");

    // Modal shows the committed plan copy…
    expect(screen.getByText(new RegExp(PLAN_PRICING.committed.name)).textContent).toContain(
      "Annual Plan",
    );
    // …and checkout is submitted with the fetched committed price ID.
    expect(body.plan).toBe("committed");
    expect(body.priceId).toBe("price_live_committed");
  });

  it("failed products fetch disables checkout with a visible pricing error (no hardcoded fallback)", async () => {
    routeFetch({ reject: true });
    renderProvider("committed");
    await waitForProductsFetch();

    await expectCheckoutDisabledWithError("committed");
  });

  it("a non-OK products response disables checkout with a visible pricing error", async () => {
    routeFetch({ status: 500, body: { message: "Failed to list products." } });
    renderProvider("kickstart");
    await waitForProductsFetch();

    await expectCheckoutDisabledWithError("kickstart");
  });

  it("a partial products response only enables the tiers it contains; missing tiers are disabled", async () => {
    routeFetch({
      body: {
        data: [
          {
            metadata: { tier: "kickstart" },
            prices: [{ id: "price_live_kickstart" }],
          },
          // Malformed entries are ignored, not crashed on.
          { metadata: {}, prices: [{ id: "price_ignored" }] },
          { metadata: { tier: "transformation" }, prices: [] },
        ],
      },
    });
    renderProvider("committed");
    await waitForProductsFetch();

    // committed was not in the response → checkout for it is disabled.
    await expectCheckoutDisabledWithError("committed");
  });

  it("a partial products response still allows checkout for the tier it resolved", async () => {
    routeFetch({
      body: {
        data: [
          {
            metadata: { tier: "kickstart" },
            prices: [{ id: "price_live_kickstart" }],
          },
        ],
      },
    });
    renderProvider("kickstart");
    await waitForProductsFetch();

    const body = await openModalAndSubmit("kickstart");
    expect(body.plan).toBe("kickstart");
    expect(body.priceId).toBe("price_live_kickstart");
  });

  it("an unexpected products response shape disables checkout with a visible pricing error", async () => {
    routeFetch({ body: { products: "wrong-shape" } });
    renderProvider("kickstart");
    await waitForProductsFetch();

    await expectCheckoutDisabledWithError("kickstart");
  });
});
