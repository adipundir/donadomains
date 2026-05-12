# Donadomains — unified build/test/publish entrypoint.
#
# Run `make` or `make help` to see all targets.

# ──────────────────────────────────────────────────────────────────────────────
# Configuration

SHELL    := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
MAKEFLAGS  += --no-print-directory

ROOT_DIR := $(shell pwd)
MCP_DIR  := $(ROOT_DIR)/mcp

# Pretty colours when stdout is a TTY.
ifdef NO_COLOR
  CYAN  :=
  BOLD  :=
  RESET :=
else
  CYAN  := \033[36m
  BOLD  := \033[1m
  RESET := \033[0m
endif

# ──────────────────────────────────────────────────────────────────────────────
# Default goal

.DEFAULT_GOAL := help

.PHONY: help
help: ## List all targets
	@printf '$(BOLD)Donadomains$(RESET) — make targets:\n\n'
	@awk 'BEGIN { FS = ":.*##" } /^[a-zA-Z0-9_-]+:.*##/ { printf "  $(CYAN)%-14s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\n  Env: $(CYAN)DONADOMAINS_BASE_URL$(RESET)  Override the MCP server target host (default: https://donadomains.xyz)\n'

# ──────────────────────────────────────────────────────────────────────────────
# Install

.PHONY: install
install: install-web install-mcp ## Install deps for both web and mcp

.PHONY: install-web
install-web: ## npm install in repo root (Next.js app)
	npm install

.PHONY: install-mcp
install-mcp: ## npm install in mcp/ (MCP server)
	cd $(MCP_DIR) && npm install

# ──────────────────────────────────────────────────────────────────────────────
# Build

.PHONY: build
build: build-web build-mcp ## Build both web and mcp

.PHONY: build-web
build-web: ## next build (production Next.js bundle)
	npm run build

.PHONY: build-mcp
build-mcp: ## Compile mcp/src → mcp/dist with TypeScript
	cd $(MCP_DIR) && npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Dev

.PHONY: dev
dev: ## Run the Next.js dev server (http://localhost:3000)
	npm run dev

.PHONY: dev-mcp
dev-mcp: build-mcp ## Run the MCP server locally under the MCP Inspector
	cd $(MCP_DIR) && npm run inspect

# ──────────────────────────────────────────────────────────────────────────────
# Test

.PHONY: test
test: test-whois test-intel test-mcp ## Run all repo smoke tests

.PHONY: test-whois
test-whois: ## Smoke test the port-43 WHOIS layer
	npx tsx scripts/test-whois-tcp.ts

.PHONY: test-intel
test-intel: ## Smoke test the cached intel pipeline (.sh / .com / .io)
	npx tsx scripts/test-intel-cached.ts

.PHONY: test-mcp
test-mcp: build-mcp ## Smoke test the MCP server (initialize + tools/list + sample call)
	@./scripts/test-mcp.sh

# ──────────────────────────────────────────────────────────────────────────────
# Publish

.PHONY: publish-mcp
publish-mcp: build-mcp ## Dry-run publish the MCP package, then prompt for real publish
	@cd $(MCP_DIR) && npm publish --dry-run
	@printf '\n$(BOLD)Dry-run OK.$(RESET) Run $(CYAN)cd mcp && npm publish --access public$(RESET) to ship.\n'

# ──────────────────────────────────────────────────────────────────────────────
# Clean

.PHONY: clean
clean: ## Remove build artifacts and node_modules
	rm -rf .next
	rm -rf $(MCP_DIR)/dist
	rm -rf $(MCP_DIR)/node_modules

.PHONY: clean-build
clean-build: ## Remove build artifacts only (keep node_modules)
	rm -rf .next
	rm -rf $(MCP_DIR)/dist
