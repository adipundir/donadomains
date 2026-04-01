import { type NextRequest } from "next/server";
import { paymentMiddleware, TOKENS } from "starknet-x402";

const SEARCH_CONFIG = {
  price: "10000", // 0.01 USDC per search
  tokenAddress: TOKENS.USDC_SEPOLIA,
  network: "sepolia" as const,
  config: {
    description: "Domain name search across 6+ registrars with price comparison",
  },
};

const DOMAIN_CONFIG = {
  price: "5000", // 0.005 USDC per domain lookup
  tokenAddress: TOKENS.USDC_SEPOLIA,
  network: "sepolia" as const,
  config: {
    description: "Domain intelligence — RDAP, DNS, registrar info",
  },
};

/**
 * Build the route map dynamically so that `/api/paid/domain/<anything>`
 * resolves to the domain config. The starknet-x402 middleware does exact
 * pathname matching, so we inject the actual requested path at runtime.
 */
function buildRoutes(pathname: string) {
  const routes: Record<string, typeof SEARCH_CONFIG> = {
    "/api/paid/search": SEARCH_CONFIG,
  };

  if (pathname.startsWith("/api/paid/domain/")) {
    routes[pathname] = DOMAIN_CONFIG;
  }

  return routes;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const routes = buildRoutes(pathname);

  const handler = paymentMiddleware(
    process.env.RECIPIENT_ADDRESS!,
    routes,
    { url: process.env.FACILITATOR_URL! },
  );

  return handler(request);
}

export const config = {
  matcher: "/api/paid/:path*",
};
