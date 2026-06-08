export const LIVE_PRICE_IDS = {
  kickstart: "price_1T7lQpFrMqe8QyNbg0YZhqdH",
  committed: "price_1T7lWpFrMqe8QyNb3RPDirxj",
  transformation: "price_1T7lZ0FrMqe8QyNbUyIUTH0C",
} as const;

export type PlanTier = keyof typeof LIVE_PRICE_IDS;
