# Donadomains MCP

Domain search, registration info, and AI valuation, available to your AI agent over the Model Context Protocol.

Free. No signup. No API key.

Live at [donadomains.xyz](https://donadomains.xyz). Docs at [donadomains.xyz/docs](https://www.donadomains.xyz/docs).

## Install

**Claude Code CLI:**

```bash
claude mcp add --transport http donadomains https://www.donadomains.xyz/api/mcp
```

**Any other MCP client** (Claude Desktop, Claude.ai Connectors, Cursor, Continue, Windsurf, Zed) add this to your MCP server config:

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

Config file locations:
- Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop (Windows): `%APPDATA%\Claude\claude_desktop_config.json`
- Cursor: Settings, MCP
- Claude.ai web: Settings, Connectors, Add custom

## Tools

| Tool | Purpose |
|---|---|
| `check_domain_availability` | Is a domain free? If yes, lowest price + buy link. If no, ownership info. |
| `search_domains` | Find available domains for a keyword with live pricing. |
| `get_domain_info` | Detailed registration info for a domain. |
| `valuate_domain` | AI-powered USD valuation with reasoning. |

## Rate limits

Free, per source IP.

| Bucket | Limit |
|---|---|
| Overall MCP calls | 200 / hour |
| `check_domain_availability` | 60 / hour |
| `get_domain_info` | 60 / hour |
| `search_domains` | 20 / hour |
| `valuate_domain` | 20 / hour |

Need higher limits? [Open an issue](https://github.com/adipundir/donadomains/issues).

## License

MIT
