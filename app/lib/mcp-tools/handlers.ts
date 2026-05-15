/**
 * In-app MCP tool handlers — call internal libs directly (no HTTP self-hop).
 *
 * Differs from the npm package's handlers (`mcp/src/tools/*`) which call
 * https://donadomains.xyz over HTTPS — that version is for users running
 * the server locally via `npx donadomains-mcp`. This in-app version powers
 * `/api/mcp` and benefits from zero network overhead between the route
 * handler and the data pipeline.
 */

import { fetchDomainIntel, fetchDomainIntelWithMeta } from "../domain-intel";
import { searchDomainsMultiSource } from "../domain-scraper";
import { valuateDomain as valuateDomainLib } from "../domain-valuation";
import type { DomainResult } from "../domain-scraper";
import type { ToolHandler, ToolResult } from "./types";

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*[a-z0-9]\.[a-z]{2,}$/;

const errorResult = (message: string): ToolResult => ({
  isError: true,
  content: [{ type: "text", text: message }],
});

const successResult = (summary: string, data: unknown): ToolResult => ({
  content: [
    { type: "text", text: `${summary}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` },
  ],
});

// ─── check_domain_availability ──────────────────────────────────────────────

export const checkAvailability: ToolHandler = async (args) => {
  const domain = String(args.domain ?? "").toLowerCase().trim();
  if (!DOMAIN_RE.test(domain)) {
    return errorResult(`"${args.domain}" is not a valid domain. Expected format: 'name.tld'.`);
  }

  const [searchSettled, intelSettled] = await Promise.allSettled([
    searchDomainsMultiSource(domain),
    fetchDomainIntelWithMeta(domain),
  ]);

  const search = searchSettled.status === "fulfilled" ? searchSettled.value : null;
  const intel = intelSettled.status === "fulfilled" ? intelSettled.value.intel : null;

  const exact: DomainResult | undefined = search?.results.find((r) => r.domain === domain);
  const buyLinks = exact?.buyLinks ?? [];
  const cheapest = buyLinks.find((l) => l.isCheapest) ?? buyLinks[0];

  const registered = intel?.registered ?? (exact ? !exact.available : false);
  const available = !registered;

  if (available) {
    const result = {
      domain,
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
      ? `${domain} is AVAILABLE — cheapest at ${cheapest.name} for ${cheapest.price}.`
      : `${domain} is AVAILABLE (no live pricing returned — try search_domains).`;
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
    ? `${domain} is TAKEN — registered with ${intel.registrar}${
        intel.expires ? `, expires ${intel.expires.slice(0, 10)}` : ""
      }.`
    : `${domain} appears to be TAKEN.`;

  return successResult(summary, { domain, available: false, owner });
};

// ─── search_domains ──────────────────────────────────────────────────────────

export const searchDomains: ToolHandler = async (args) => {
  const keyword = String(args.keyword ?? "").trim();
  if (!keyword) return errorResult("`keyword` is required and cannot be empty.");

  const rawLimit = Number(args.limit ?? 20);
  const limit = Math.min(Math.max(1, Math.floor(rawLimit || 20)), 50);
  const tld = typeof args.tldFilter === "string" ? args.tldFilter.toLowerCase() : undefined;
  const includeTaken = args.includeTaken === true;

  let response;
  try {
    response = await searchDomainsMultiSource(keyword);
  } catch (err) {
    return errorResult(`Search failed: ${(err as Error).message}`);
  }

  const filtered = response.results.filter((r) => {
    if (!includeTaken && !r.available) return false;
    if (tld && r.tld !== tld) return false;
    return true;
  });

  const projected = filtered.slice(0, limit).map((r) => {
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
      : `Found ${projected.length} ${includeTaken ? "" : "available "}domain${projected.length === 1 ? "" : "s"} for "${keyword}"${
          tld ? ` with TLD ${tld}` : ""
        }. Top: ${projected
          .slice(0, 3)
          .map((r) => `${r.domain} (${r.bestPrice ?? "?"} via ${r.bestRegistrar ?? "?"})`)
          .join(", ")}.`;

  return successResult(summary, {
    keyword,
    totalFound: filtered.length,
    returned: projected.length,
    results: projected,
    registrarStatus: response.sourceStatuses,
  });
};

// ─── get_domain_info ─────────────────────────────────────────────────────────

export const getDomainInfo: ToolHandler = async (args) => {
  const domain = String(args.domain ?? "").toLowerCase().trim();
  if (!DOMAIN_RE.test(domain)) {
    return errorResult(`"${args.domain}" is not a valid domain. Expected format: 'name.tld'.`);
  }

  let meta;
  try {
    meta = await fetchDomainIntelWithMeta(domain);
  } catch (err) {
    return errorResult(`Failed to fetch intel for ${domain}: ${(err as Error).message}`);
  }
  const intel = meta.intel;

  if (!intel.registered) {
    return {
      content: [
        {
          type: "text",
          text:
            `${domain} does NOT appear to be registered. Use search_domains or check_domain_availability for pricing.\n\n` +
            `\`\`\`json\n${JSON.stringify(intel, null, 2)}\n\`\`\``,
        },
      ],
    };
  }

  const parts: string[] = [`${domain} is registered.`];
  if (intel.registrar) parts.push(`Registrar: ${intel.registrar}.`);
  if (intel.created) parts.push(`Created: ${intel.created.slice(0, 10)}.`);
  if (intel.expires) parts.push(`Expires: ${intel.expires.slice(0, 10)}.`);
  if (intel.nameservers?.length) parts.push(`Nameservers: ${intel.nameservers.slice(0, 4).join(", ")}.`);
  if (intel.status?.length) parts.push(`Status: ${intel.status.slice(0, 3).join(", ")}.`);
  if (intel.dnssec) parts.push(`DNSSEC: ${intel.dnssec}.`);
  if (intel.sources.length) parts.push(`(Sources: ${intel.sources.join(", ")}.)`);

  return successResult(parts.join(" "), intel);
};

// ─── valuate_domain ──────────────────────────────────────────────────────────

export const valuateDomain: ToolHandler = async (args) => {
  const domain = String(args.domain ?? "").toLowerCase().trim();
  if (!DOMAIN_RE.test(domain)) {
    return errorResult(`"${args.domain}" is not a valid domain. Expected format: 'name.tld'.`);
  }

  const registeredHint = typeof args.registered === "boolean" ? args.registered : undefined;
  const isPremium = typeof args.isPremium === "boolean" ? args.isPremium : undefined;
  const registrationPrice = typeof args.registrationPrice === "number" ? args.registrationPrice : undefined;

  // Enrich the valuation prompt with live intel — cheap because we cache.
  let intelFields: Partial<{
    registered: boolean;
    created: string;
    expires: string;
    registrar: string;
    nameservers: string[];
  }> = {};
  try {
    const intel = await fetchDomainIntel(domain);
    intelFields = {
      registered: intel.registered,
      created: intel.created,
      expires: intel.expires,
      registrar: intel.registrar,
      nameservers: intel.nameservers,
    };
  } catch {
    /* intel failure non-fatal */
  }

  try {
    const valuation = await valuateDomainLib({
      domain,
      registered: registeredHint ?? intelFields.registered ?? false,
      isPremium,
      registrationPrice,
      created: intelFields.created,
      expires: intelFields.expires,
      registrar: intelFields.registrar,
      nameservers: intelFields.nameservers,
      dnsResolves: intelFields.registered,
    });

    const summary = `${domain}: ${valuation.tier.toUpperCase()} (score ${valuation.score}/100). Estimated value ${valuation.estimatedValue}. ${valuation.reasoning}`;

    return successResult(summary, { domain, ...valuation });
  } catch (err) {
    return errorResult(`Valuation failed for ${domain}: ${(err as Error).message}`);
  }
};
