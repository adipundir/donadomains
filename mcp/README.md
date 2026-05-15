# mcp/

This directory holds **source for a future stdio-transport package**. It is **not yet published to npm** — do not advertise `npx donadomains-mcp` until it is.

## Today's recommended integration

Donadomains ships as an MCP server over **Streamable HTTP**. Connect by URL:

```json
{
  "mcpServers": {
    "donadomains": {
      "url": "https://www.donadomains.xyz/api/mcp"
    }
  }
}
```

Full docs: <https://www.donadomains.xyz/docs>

The HTTP endpoint and the source in this directory share the same four tools (`check_domain_availability`, `search_domains`, `get_domain_info`, `valuate_domain`), but the canonical implementation lives at `app/api/mcp/route.ts` and `app/lib/mcp-tools/`. The code in `src/` here is a thin HTTP-client wrapper that we'll publish once stdio-only MCP clients become a meaningful audience.

## Build (for local development / testing)

```bash
npm install
npm run build
npm run inspect   # MCP Inspector against the built bundle
```

Or from the repo root: `make build-mcp` / `make test-mcp`.

When run, the binary makes HTTPS calls to `DONADOMAINS_BASE_URL` (default `https://www.donadomains.xyz`).

## Publish (when ready)

```bash
cd mcp
npm publish --access public
```

Before publishing: bump `version` in `package.json`, run `npm publish --dry-run`, and update the public docs (`app/docs/page.tsx`, `README.md`, `public/llms.txt`, `public/llms-full.txt`) to advertise the npx install path alongside the URL one.
