import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Porkbun";

const SEARCH_URL = (q: string) =>
  `https://porkbun.com/checkout/search?q=${encodeURIComponent(q)}`;

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  // Porkbun's search page is JS-heavy and loads prices asynchronously — needs a longer wait
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 8000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}

const porkbun: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default porkbun;
