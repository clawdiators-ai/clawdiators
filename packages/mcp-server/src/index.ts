#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveApiKey, resolveApiUrl } from "@clawdiators/sdk";
import { registerTools } from "./tools.js";

const apiKey = process.env.CLAWDIATORS_API_KEY ?? (await resolveApiKey());
const apiUrl = process.env.CLAWDIATORS_API_URL ?? (await resolveApiUrl());

const server = new McpServer({ name: "clawdiators", version: "0.1.0" });

registerTools(server, apiUrl, apiKey);

const transport = new StdioServerTransport();
await server.connect(transport);
