"use server";

import { searchDomainsMultiSource, DomainResult, SourceStatus } from "@/app/lib/domain-scraper";

export interface SearchDomainsResult {
  success: boolean;
  keyword: string;
  results: DomainResult[];
  sourceStatuses?: SourceStatus[];
  error?: string;
}

export async function searchDomainsAction(
  keyword: string
): Promise<SearchDomainsResult> {
  const requestId = Math.random().toString(36).slice(2, 8);
  console.log(`\n[${requestId}] ========== SEARCH START ==========`);
  console.log(`[${requestId}] Keyword: "${keyword}"`);

  // Basic validation
  if (!keyword || keyword.trim().length === 0) {
    return {
      success: false,
      keyword,
      results: [],
      error: "Please enter a keyword to search",
    };
  }

  const trimmedKeyword = keyword.trim();

  if (trimmedKeyword.length < 1 || trimmedKeyword.length > 63) {
    return {
      success: false,
      keyword: trimmedKeyword,
      results: [],
      error: "Keyword must be between 1 and 63 characters",
    };
  }

  // Check for invalid characters (only allow alphanumeric, hyphens, and dots)
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
  if (!validPattern.test(trimmedKeyword)) {
    return {
      success: false,
      keyword: trimmedKeyword,
      results: [],
      error:
        "Invalid keyword. Use only letters, numbers, hyphens, and dots. Cannot start or end with hyphen or dot.",
    };
  }

  const startTime = Date.now();
  try {
    const { results, sourceStatuses } = await searchDomainsMultiSource(trimmedKeyword);
    const elapsed = Date.now() - startTime;
    const withPrices = results.filter((r) => r.buyLinks?.some((l) => l.price != null)).length;
    const availableCount = results.filter((r) => r.available).length;
    const takenCount = results.length - availableCount;
    console.log(`[${requestId}] ========== DONE ==========`);
    console.log(`[${requestId}] Time: ${elapsed}ms | Results: ${results.length} (${availableCount} avail, ${takenCount} taken) | With prices: ${withPrices}`);
    return {
      success: true,
      keyword: trimmedKeyword,
      results,
      sourceStatuses,
    };
  } catch (error) {
    console.error(`[${requestId}] Search failed:`, error);
    return {
      success: false,
      keyword: trimmedKeyword,
      results: [],
      error: error instanceof Error ? error.message : "Failed to search domains",
    };
  }
}
