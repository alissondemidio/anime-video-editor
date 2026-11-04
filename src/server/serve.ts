import { startServer } from "./index.js";
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
