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
    // Çıktıyı JSON.stringify ile string'e çevirmek iletişimin kopmasını engeller
    return JSON.stringify({
      status: "ok",
      gateway: "Universal AI Gateway",
      version: "0.1.0",
    });
  },
});

// Başlatma işleminin tamamlanmasını beklemek (await) sürecin erken kapanmasını önler
await server.start({
  transportType: "stdio",
});
