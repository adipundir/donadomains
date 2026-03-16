import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Namecheap";

const SEARCH_URL = (q: string) =>
  `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(q)}&currencyType=USD`;

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 8000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
}

const namecheap: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default namecheap;
