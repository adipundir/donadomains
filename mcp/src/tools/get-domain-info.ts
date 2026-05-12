import { donadomains } from "../client.js";
import type { Tool, ToolResult } from "./types.js";

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/;

interface Args {
  domain: string;
}

export const getDomainInfo: Tool<Args> = {
  definition: {
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
  },

  async handler({ domain }: Args): Promise<ToolResult> {
    const normalized = domain.toLowerCase().trim();
    if (!DOMAIN_RE.test(normalized)) {
      return errorResult(`"${domain}" is not a valid domain. Expected format: 'name.tld'.`);
    }

    let intel;
    try {
      intel = await donadomains.getDomainInfo(normalized);
    } catch (err) {
      return errorResult(`Failed to fetch intel for ${normalized}: ${(err as Error).message}`);
    }

    if (!intel.registered) {
      return {
        content: [
          {
            type: "text",
            text:
              `${normalized} does NOT appear to be registered. Use search_domains or check_domain_availability for pricing.\n\n` +
              `\`\`\`json\n${JSON.stringify(intel, null, 2)}\n\`\`\``,
          },
        ],
      };
    }

    const parts: string[] = [`${normalized} is registered.`];
    if (intel.registrar) parts.push(`Registrar: ${intel.registrar}.`);
    if (intel.created) parts.push(`Created: ${intel.created.slice(0, 10)}.`);
    if (intel.expires) parts.push(`Expires: ${intel.expires.slice(0, 10)}.`);
    if (intel.nameservers?.length) parts.push(`Nameservers: ${intel.nameservers.slice(0, 4).join(", ")}.`);
    if (intel.status?.length) parts.push(`Status: ${intel.status.slice(0, 3).join(", ")}.`);
    if (intel.dnssec) parts.push(`DNSSEC: ${intel.dnssec}.`);
    if (intel.sources.length) parts.push(`(Sources: ${intel.sources.join(", ")}.)`);

    return {
      content: [
        {
          type: "text",
          text: `${parts.join(" ")}\n\n\`\`\`json\n${JSON.stringify(intel, null, 2)}\n\`\`\``,
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
