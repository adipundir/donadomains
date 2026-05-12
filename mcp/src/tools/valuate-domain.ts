import { donadomains } from "../client.js";
import type { Tool, ToolResult } from "./types.js";

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/;

interface Args {
  domain: string;
  registered?: boolean;
  isPremium?: boolean;
  registrationPrice?: number;
}

export const valuateDomain: Tool<Args> = {
  definition: {
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
  },

  async handler({ domain, registered, isPremium, registrationPrice }: Args): Promise<ToolResult> {
    const normalized = domain.toLowerCase().trim();
    if (!DOMAIN_RE.test(normalized)) {
      return errorResult(`"${domain}" is not a valid domain. Expected format: 'name.tld'.`);
    }

    let valuation;
    try {
      valuation = await donadomains.valuateDomain(normalized, { registered, isPremium, registrationPrice });
    } catch (err) {
      return errorResult(`Valuation failed for ${normalized}: ${(err as Error).message}`);
    }

    const summary = `${normalized}: ${valuation.tier.toUpperCase()} (score ${valuation.score}/100). Estimated value ${valuation.estimatedValue}. ${valuation.reasoning}`;

    return {
      content: [
        {
          type: "text",
          text: `${summary}\n\n\`\`\`json\n${JSON.stringify(valuation, null, 2)}\n\`\`\``,
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
