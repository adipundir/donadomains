/**
 * Shared MCP tool definitions (name + description + JSON schema).
 *
 * These are read by the LLM when picking which tool to call, so descriptions
 * are intentionally verbose. Kept in sync with the npm-package version in
 * `mcp/src/tools/` — if you change one, change the other.
 */

import type { JsonSchema } from "./types";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Which rate-limit bucket this tool consumes (mirrors REST endpoints). */
  rateLimitKey: "search" | "domain" | "valuate";
}

export const CHECK_AVAILABILITY: ToolDefinition = {
  name: "check_domain_availability",
  description:
    "Check if a specific domain (e.g. 'example.com', 'cool.io', 'ad402.sh') is available for registration right now. " +
    "Returns availability status. If available, returns the lowest price and the registrar offering it with a direct " +
    "purchase URL. If taken, returns ownership info — registrar, creation and expiry dates, nameservers, status codes. " +
    "Works for all TLDs including RDAP-less ccTLDs (.sh, .io, .ac, .ws) via port-43 WHOIS fallback. Use this when the " +
    "user asks 'is X domain available' or 'who owns Y domain'.",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        description:
          "Fully qualified domain name to check, e.g. 'example.com' or 'cool.io'. Must include a TLD.",
      },
    },
    required: ["domain"],
    additionalProperties: false,
  },
  rateLimitKey: "domain",
};

export const SEARCH_DOMAINS: ToolDefinition = {
  name: "search_domains",
  description:
    "Search for available domain names matching a keyword across 6 registrars (GoDaddy, Namecheap, Dynadot, Hover, " +
    "Name.com, Porkbun). Returns available domains with prices, sorted by relevance, exact-match priority, " +
    "registrar coverage, popular TLDs (.com first), and price. Best for brand/startup/product naming, finding " +
    "TLD alternatives, or comparing prices across registrars. The keyword can be a bare word ('startup') or a " +
    "full domain ('startup.io'); when a TLD is included, that exact domain is prioritized.",
  inputSchema: {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description:
          "Search keyword like 'startup' or full domain like 'startup.io'. Lowercase alphanumeric and hyphens only.",
        minLength: 1,
        maxLength: 63,
      },
      limit: {
        type: "number",
        description: "Max results to return (default 20, max 50).",
        minimum: 1,
        maximum: 50,
        default: 20,
      },
      tldFilter: {
        type: "string",
        description:
          "Optional: only return domains with this exact TLD (e.g. '.com', '.io'). Include the leading dot.",
      },
      includeTaken: {
        type: "boolean",
        description:
          "Optional: include taken/unavailable domains in the result (default false — only available domains).",
        default: false,
      },
    },
    required: ["keyword"],
    additionalProperties: false,
  },
  rateLimitKey: "search",
};

export const GET_DOMAIN_INFO: ToolDefinition = {
  name: "get_domain_info",
  description:
    "Get deep WHOIS/RDAP/DNS intelligence for a registered domain — registrar, registration and expiry dates, " +
    "last-updated date, nameservers, registrant name (if not privacy-protected), organization, contact info, " +
    "DNSSEC status, and ICANN status codes (clientTransferProhibited, etc.). Works for all TLDs including " +
    "RDAP-less ccTLDs (.sh, .io, .ac, .ws, .nu, .to) via port-43 WHOIS fallback. Use when the user asks about " +
    "an existing domain's owner, expiry, hosting, or status.",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        description: "Fully qualified domain name, e.g. 'github.com' or 'ad402.sh'.",
      },
    },
    required: ["domain"],
    additionalProperties: false,
  },
  rateLimitKey: "domain",
};

export const VALUATE_DOMAIN: ToolDefinition = {
  name: "valuate_domain",
  description:
    "Estimate the market value of a domain using AI-powered valuation (Gemini under the hood). Returns a numeric " +
    "score (0-100), a tier (common/decent/premium/ultra), an estimated USD price range, plain-English reasoning, " +
    "and 3-6 per-factor analyses (TLD value, length, brandability, keyword strength, age, character composition, " +
    "etc.). Live registration intel is pulled into the model context. Results are cached server-side, so repeat " +
    "valuations of the same domain are free.",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        description: "Domain to value, e.g. 'crypto.com', 'startup.io'.",
      },
      registered: {
        type: "boolean",
        description: "Optional: if you already know whether the domain is registered, pass it to skip a lookup.",
      },
      isPremium: {
        type: "boolean",
        description: "Optional: pass true if a registrar has flagged this as a premium domain.",
      },
      registrationPrice: {
        type: "number",
        description: "Optional: current registration price in USD, if known. Helps anchor the valuation.",
      },
    },
    required: ["domain"],
    additionalProperties: false,
  },
  rateLimitKey: "valuate",
};

export const ALL_DEFINITIONS: ToolDefinition[] = [
  CHECK_AVAILABILITY,
  SEARCH_DOMAINS,
  GET_DOMAIN_INFO,
  VALUATE_DOMAIN,
];
