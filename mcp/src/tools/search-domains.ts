import { donadomains } from "../client.js";
import type { Tool, ToolResult } from "./types.js";

interface Args {
  keyword: string;
  limit?: number;
  tldFilter?: string;
  includeTaken?: boolean;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const searchDomains: Tool<Args> = {
  definition: {
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
          maximum: MAX_LIMIT,
          default: DEFAULT_LIMIT,
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
  },

  async handler({ keyword, limit = DEFAULT_LIMIT, tldFilter, includeTaken = false }: Args): Promise<ToolResult> {
    if (!keyword || !keyword.trim()) {
      return errorResult("`keyword` is required and cannot be empty.");
    }
    const cappedLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
    const tld = tldFilter?.toLowerCase().trim();

    let response;
    try {
      response = await donadomains.search(keyword.trim());
    } catch (err) {
      return errorResult(`Search failed: ${(err as Error).message}`);
    }

    const filtered = response.results.filter((r) => {
      if (!includeTaken && !r.available) return false;
      if (tld && r.tld !== tld) return false;
      return true;
    });

    const projected = filtered.slice(0, cappedLimit).map((r) => {
      const cheapest = r.buyLinks?.find((l) => l.isCheapest) ?? r.buyLinks?.[0];
      return {
        domain: r.domain,
        available: r.available,
        tld: r.tld,
        matchType: r.matchType,
        bestPrice: cheapest?.price,
        bestPriceNumeric: cheapest?.priceNum,
        bestRegistrar: cheapest?.name,
        buyUrl: cheapest?.url ?? r.registerUrl,
        allOffers:
          r.buyLinks?.map((l) => ({
            registrar: l.name,
            price: l.price,
            priceNum: l.priceNum,
            url: l.url,
            isCheapest: l.isCheapest ?? false,
            premium: l.premium ?? false,
          })) ?? [],
      };
    });

    const summary =
      projected.length === 0
        ? `No${includeTaken ? "" : " available"} domains found for "${keyword}"${tld ? ` with TLD ${tld}` : ""}.`
        : `Found ${projected.length} ${includeTaken ? "" : "available "}domain${projected.length === 1 ? "" : "s"} for "${keyword}"${tld ? ` with TLD ${tld}` : ""}. Top: ${projected
            .slice(0, 3)
            .map((r) => `${r.domain} (${r.bestPrice ?? "?"} via ${r.bestRegistrar ?? "?"})`)
            .join(", ")}.`;

    return {
      content: [
        {
          type: "text",
          text: `${summary}\n\n\`\`\`json\n${JSON.stringify(
            {
              keyword: response.keyword,
              tld: response.tld,
              totalFound: filtered.length,
              returned: projected.length,
              results: projected,
              registrarStatus: response.sources,
            },
            null,
            2,
          )}\n\`\`\``,
        },
      ],
    };
  },
};

function errorResult(message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
