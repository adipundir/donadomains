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
  const requestId = Math.random().toString(36).substring(7);
  console.log(`[Action ${requestId}] searchDomainsAction called with keyword: "${keyword}"`);

  // Basic validation
  if (!keyword || keyword.trim().length === 0) {
    console.log(`[Action ${requestId}] Validation failed: empty keyword`);
    return {
      success: false,
      keyword,
      results: [],
      error: "Please enter a keyword to search",
    };
  }

  const trimmedKeyword = keyword.trim();

  if (trimmedKeyword.length < 1 || trimmedKeyword.length > 63) {
    console.log(`[Action ${requestId}] Validation failed: keyword length ${trimmedKeyword.length} out of range`);
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
    console.log(`[Action ${requestId}] Validation failed: invalid characters in "${trimmedKeyword}"`);
    return {
      success: false,
      keyword: trimmedKeyword,
      results: [],
      error:
        "Invalid keyword. Use only letters, numbers, hyphens, and dots. Cannot start or end with hyphen or dot.",
    };
  }

  console.log(`[Action ${requestId}] Validation passed. Running SERVER-SIDE fetch only (no client-side fetching).`);
  const startTime = Date.now();

  try {
    const { results, sourceStatuses } = await searchDomainsMultiSource(trimmedKeyword);
    const elapsed = Date.now() - startTime;
    const failed = sourceStatuses.filter((s) => s.status === "failed").length;
    console.log(`[Action ${requestId}] SERVER-SIDE fetch completed in ${elapsed}ms. Results: ${results.length}. Sources: ${sourceStatuses.filter((s) => s.status === "ok").length} ok, ${failed} failed.`);
    return {
      success: true,
      keyword: trimmedKeyword,
      results,
      sourceStatuses,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Action ${requestId}] Search failed after ${elapsed}ms:`, error);
    return {
      success: false,
      keyword: trimmedKeyword,
      results: [],
      error: error instanceof Error ? error.message : "Failed to search domains",
    };
  }
}
