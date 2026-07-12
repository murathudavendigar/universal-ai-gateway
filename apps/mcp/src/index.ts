import { FastMCP } from "fastmcp";
import { z } from "zod";

const server = new FastMCP({
  name: "Universal AI Gateway",
  version: "0.1.0",
});

server.addTool({
  name: "health",
  description: "Health check",
  parameters: z.object({}),
  execute: async () => {
    return {
      status: "ok",
      gateway: "Universal AI Gateway",
      version: "0.1.0",
    };
  },
});

server.start({
  transportType: "stdio",
});
