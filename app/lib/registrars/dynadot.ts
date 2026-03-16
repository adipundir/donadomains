import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Dynadot";

const SEARCH_URL = (q: string) =>
  `https://www.dynadot.com/domain/search?domain=${encodeURIComponent(q)}`;

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 8000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://www.dynadot.com/domain/search?domain=${encodeURIComponent(domain)}`;
}

const dynadot: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default dynadot;
