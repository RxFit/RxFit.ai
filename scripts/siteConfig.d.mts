/**
 * Type declarations for scripts/siteConfig.mjs so TypeScript tests can import
 * the SAME SITE_URL/APP_URL parser the validate-seo build gate uses — one
 * parser, no drift.
 */
export function parseSiteConstant(src: string, name: string): string | null;
export function parseSiteUrl(src: string): string | null;
export function originFromSource(src: string, name: string, origin?: string): string;
export function siteUrlFromSource(src: string, origin?: string): string;
export function loadSiteUrl(rootDir: string): string;
export function loadSiteOrigins(rootDir: string): { siteUrl: string; appUrl: string };
