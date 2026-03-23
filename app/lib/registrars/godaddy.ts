import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "GoDaddy";

const SEARCH_URL = (q: string) =>
  `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(q)}`;

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 5000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${encodeURIComponent(domain)}`;
}

const godaddy: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default godaddy;
