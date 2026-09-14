import { APP_URL, SITE_DESCRIPTION, SITE_URL } from "./site";

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const AUTHOR_PROFILE_URL = SITE_URL;

export const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "RxFit.ai",
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: `${SITE_URL}/logo.png`,
    width: 261,
    height: 243,
  },
  description: SITE_DESCRIPTION,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    url: `${SITE_URL}/contact`,
  },
  sameAs: [
    APP_URL,
    "https://twitter.com/rxfitai",
    "https://www.instagram.com/rxfitai",
    "https://www.linkedin.com/company/rxfitai",
  ],
};

export const WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: "RxFit.ai",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  publisher: { "@id": ORGANIZATION_ID },
};