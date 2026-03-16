import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Hostinger";

const SEARCH_URL = (q: string) =>
  `https://www.hostinger.com/domain-name-search?search=${encodeURIComponent(q)}`;

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 8000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://www.hostinger.com/domain-name-search?search=${encodeURIComponent(domain)}`;
}

const hostinger: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default hostinger;
