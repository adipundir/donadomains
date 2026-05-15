# mcp/

This directory holds source for a future stdio-transport package. It is **not yet published to npm**. Do not advertise `npx donadomains-mcp` in public docs until it is.

## Today's integration

Donadomains MCP ships over Streamable HTTP. Connect by URL:

```json
{
  "mcpServers": {
    "donadomains": {
      "type": "http",
      "url": "https://www.donadomains.xyz/api/mcp"
    }
  }
}
```

Claude Code users can install with one command:

```bash
claude mcp add --transport http donadomains https://www.donadomains.xyz/api/mcp
```

Full docs: <https://www.donadomains.xyz/docs>

The canonical implementation lives at `app/api/mcp/route.ts` and `app/lib/mcp-tools/`. The code in `src/` here is a thin HTTP-client wrapper we will publish once stdio-only MCP clients become a meaningful audience.

## Build (for local development)

```bash
npm install
npm run build
npm run inspect
```

Or from the repo root: `make build-mcp` / `make test-mcp`.

When run, the binary makes HTTPS calls to `DONADOMAINS_BASE_URL` (default `https://www.donadomains.xyz`).

## Publish (when ready)

```bash
cd mcp
npm publish --access public
```

Before publishing: bump `version` in `package.json`, run `npm publish --dry-run`, and update the public docs to advertise the npx install path alongside the URL one.
