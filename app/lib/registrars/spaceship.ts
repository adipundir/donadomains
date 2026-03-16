import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Spaceship";

const SEARCH_URL = (q: string) =>
  `https://www.spaceship.com/domains/?search=${encodeURIComponent(q)}`;

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = SEARCH_URL(query);
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 8000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://www.spaceship.com/domains/?search=${encodeURIComponent(domain)}`;
}

const spaceship: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default spaceship;
