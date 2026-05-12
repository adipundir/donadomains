# donadomains-mcp

> MCP server for [Donadomains](https://donadomains.xyz) — gives your AI agent real-time domain availability, multi-registrar price comparison, WHOIS/RDAP intelligence, and AI valuation.

Use it from Claude Desktop, Cursor, Continue, Windsurf, Zed, or anywhere that speaks [Model Context Protocol](https://modelcontextprotocol.io).

```text
You: "is ad402.sh available?"
AI:  (calls check_domain_availability)
     ad402.sh is TAKEN — registered with Spaceship, Inc., expires 2027-03-18.
```

## Install

No download, no API key, no setup. Add the server block below to your MCP client config and it'll install on first use via `npx`.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "donadomains": {
      "command": "npx",
      "args": ["-y", "donadomains-mcp"]
    }
  }
}
```

Restart Claude. The four tools should appear in the tools menu.

### Cursor

Settings → MCP → "Add new MCP server":

```json
{
  "donadomains": {
    "command": "npx",
    "args": ["-y", "donadomains-mcp"]
  }
}
```

### Continue (VS Code / JetBrains)

In `~/.continue/config.json` under `experimental.modelContextProtocolServers`:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "donadomains-mcp"]
        }
      }
    ]
  }
}
```

### Windsurf

Settings → Cascade → Model Context Protocol → "Add MCP Server":

```json
{
  "donadomains": {
    "command": "npx",
    "args": ["-y", "donadomains-mcp"]
  }
}
```

### Zed

In `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "donadomains": {
      "command": {
        "path": "npx",
        "args": ["-y", "donadomains-mcp"]
      }
    }
  }
}
```

### Any other MCP client

Same idea — the binary is `npx -y donadomains-mcp` and the transport is `stdio`.

## Tools

### `check_domain_availability`

Check if a specific domain is available right now. Returns availability + best price + buy URL if available, or full ownership info (registrar, expiry, nameservers) if taken. Works for every TLD including RDAP-less ones like `.sh`, `.io`, `.ac` via port-43 WHOIS fallback.

```json
{ "domain": "example.com" }
```

### `search_domains`

Search a keyword across 6 registrars (GoDaddy, Namecheap, Dynadot, Hover, Name.com, Porkbun). Returns available domains with prices, sorted by relevance and price.

```json
{ "keyword": "myproject", "limit": 20, "tldFilter": ".com" }
```

### `get_domain_info`

Deep WHOIS/RDAP intel for a registered domain — registrar, dates, nameservers, status codes, DNSSEC, registrant if not privacy-protected.

```json
{ "domain": "github.com" }
```

### `valuate_domain`

Gemini-powered domain valuation. Returns score, tier (common/decent/premium/ultra), estimated USD range, reasoning, and per-factor breakdown. Cached server-side, so repeat valuations are free.

```json
{ "domain": "crypto.com" }
```

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DONADOMAINS_BASE_URL` | `https://donadomains.xyz` | Override the API host (useful for staging or local dev against `http://localhost:3000`). |

## Rate limits

The MCP server hits the public Donadomains API which is rate-limited per source IP:

| Endpoint | Limit |
|---|---|
| `/api/search` | 20 req/hr |
| `/api/domain/{domain}` | 60 req/hr |
| `/api/valuate/{domain}` | 20 req/hr |

These are generous for interactive AI use. If you hit them, the tool returns a `429 Rate limit exceeded` error.

## Development

```bash
git clone https://github.com/adipundir/donadomains
cd donadomains/mcp
npm install
npm run build
npm run inspect   # opens the MCP Inspector for live testing
```

Or from the repo root:

```bash
make install
make build-mcp
make dev-mcp
```

To point the MCP at a local Next.js dev server (`npm run dev` in the repo root, listening on `:3000`):

```bash
DONADOMAINS_BASE_URL=http://localhost:3000 node mcp/dist/index.js
```

## License

MIT
