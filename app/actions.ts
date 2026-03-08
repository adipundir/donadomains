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
  if (!keyword || keyword.trim().length === 0) {
    return { success: false, keyword, results: [], error: "Please enter a keyword to search" };
  }

  const trimmedKeyword = keyword.trim();

  if (trimmedKeyword.length < 1 || trimmedKeyword.length > 63) {
    return { success: false, keyword: trimmedKeyword, results: [], error: "Keyword must be between 1 and 63 characters" };
  }

  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
  if (!validPattern.test(trimmedKeyword)) {
    return {
      success: false,
      keyword: trimmedKeyword,
      results: [],
      error: "Invalid keyword. Use only letters, numbers, hyphens, and dots. Cannot start or end with hyphen or dot.",
    };
  }

  try {
    const { results, sourceStatuses } = await searchDomainsMultiSource(trimmedKeyword);
    return { success: true, keyword: trimmedKeyword, results, sourceStatuses };
  } catch (error) {
    console.error("[Search] failed:", error);
    return {
      success: false,
      keyword: trimmedKeyword,
      results: [],
      error: error instanceof Error ? error.message : "Failed to search domains",
    };
  }
}
