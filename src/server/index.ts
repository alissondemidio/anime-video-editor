import { createApp, type AppOptions } from "./app.js";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
export async function startServer(
  options: AppOptions & { port?: number } = {},
): Promise<Server> {
  const app = createApp(options);
  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(
      options.port ?? Number(process.env.PORT || 4310),
      "127.0.0.1",
      () => resolve(instance),
    );
    instance.once("error", reject);
  });
  server.on("close", () => app.locals.shutdown());
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer()
    .then((server) => {
      const address = server.address();
      console.log(
        `Kuro Studio running at http://127.0.0.1:${typeof address === "object" && address ? address.port : 4310}`,
      );
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.once(signal, () => server.close(() => process.exit(0)));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
