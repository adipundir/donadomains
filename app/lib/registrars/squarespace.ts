import type {
  RegistrarModule,
  RegistrarSearchResult,
} from "./types";
import { searchRegistrarPage } from "./parse-utils";

const NAME = "Squarespace";

async function searchDomains(query: string): Promise<RegistrarSearchResult> {
  const url = `https://domains.squarespace.com/#/${encodeURIComponent(query)}`;
  const { hits, fetchTimeMs, error } = await searchRegistrarPage(NAME, url, buildBuyUrl, 10000);
  return { registrar: NAME, hits, fetchTimeMs, error };
}

function buildBuyUrl(domain: string): string {
  return `https://domains.squarespace.com/#/${encodeURIComponent(domain)}`;
}

const squarespace: RegistrarModule = { name: NAME, buildBuyUrl, searchDomains };
export default squarespace;
