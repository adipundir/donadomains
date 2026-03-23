import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Hover";

const SEARCH_URL = (q: string) =>
  `https://www.hover.com/domains/results?q=${encodeURIComponent(q)}`;

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 5000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://www.hover.com/domains/results?q=${encodeURIComponent(domain)}`;
}

const hover: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default hover;
