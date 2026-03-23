import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Name.com";

const SEARCH_URL = (q: string) =>
  `https://www.name.com/domain/search/${encodeURIComponent(q)}`;

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 2000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://www.name.com/domain/search/${encodeURIComponent(domain)}`;
}

const namecom: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default namecom;
