import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-tools.mjs";
export { toolDefinitions } from "./mcp-tools.mjs";
export async function handleMcp(req, res, store) {
  const server = createMcpServer(store);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
