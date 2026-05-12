import { donadomains } from "../client.js";
import type { Tool, ToolResult } from "./types.js";

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/;

interface Args {
  domain: string;
}

export const checkAvailability: Tool<Args> = {
  definition: {
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
  },

  async handler({ domain }: Args): Promise<ToolResult> {
    const normalized = domain.toLowerCase().trim();
    if (!DOMAIN_RE.test(normalized)) {
      return errorResult(
        `"${domain}" is not a valid domain. Expected format: 'name.tld' (e.g. 'example.com').`,
      );
    }

    // Run search (for price + availability vote) and intel (for ownership) in parallel.
    const [searchSettled, intelSettled] = await Promise.allSettled([
      donadomains.search(normalized),
      donadomains.getDomainInfo(normalized),
    ]);

    const search = searchSettled.status === "fulfilled" ? searchSettled.value : null;
    const intel = intelSettled.status === "fulfilled" ? intelSettled.value : null;

    // Find the exact match in search results, if present.
    const exact = search?.results.find((r) => r.domain === normalized);
    const buyLinks = exact?.buyLinks ?? [];
    const cheapest = buyLinks.find((l) => l.isCheapest) ?? buyLinks[0];

    // DNS / RDAP / WHOIS intel is the authoritative signal for "registered".
    // Fall back to the search vote (taken if no exact match or registrars
    // report unavailable) if intel didn't return.
    const registered =
      intel?.registered ?? (exact ? !exact.available : false);
    const available = !registered;

    if (available) {
      const result = {
        domain: normalized,
        available: true,
        bestPrice: cheapest?.price,
        bestPriceNumeric: cheapest?.priceNum,
        bestRegistrar: cheapest?.name,
        buyUrl: cheapest?.url ?? exact?.registerUrl,
        allOffers: buyLinks.map((l) => ({
          registrar: l.name,
          price: l.price,
          priceNum: l.priceNum,
          url: l.url,
          isCheapest: l.isCheapest ?? false,
        })),
      };
      const summary = cheapest
        ? `${normalized} is AVAILABLE — cheapest at ${cheapest.name} for ${cheapest.price}.`
        : `${normalized} is AVAILABLE (no live pricing returned — try search_domains).`;
      return successResult(summary, result);
    }

    const owner = intel
      ? {
          registrar: intel.registrar,
          registrant: intel.registrant,
          organization: intel.organization,
          created: intel.created,
          expires: intel.expires,
          updated: intel.updated,
          nameservers: intel.nameservers,
          status: intel.status,
          dnssec: intel.dnssec,
          dataSources: intel.sources,
        }
      : undefined;

    const summary = intel?.registrar
      ? `${normalized} is TAKEN — registered with ${intel.registrar}${intel.expires ? `, expires ${intel.expires.slice(0, 10)}` : ""}.`
      : `${normalized} appears to be TAKEN.`;

    return successResult(summary, {
      domain: normalized,
      available: false,
      owner,
    });
  },
};

function successResult(summary: string, data: unknown): ToolResult {
  return {
    content: [
      { type: "text", text: `${summary}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` },
    ],
  };
}

function errorResult(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
