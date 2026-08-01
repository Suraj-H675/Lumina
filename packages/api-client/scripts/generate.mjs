import { createClient } from "@hey-api/openapi-ts";
import process from "node:process";

const [input, output] = process.argv.slice(2);

if (input === undefined || output === undefined || process.argv.length !== 4) {
  throw new Error("usage: generate.mjs <openapi-json> <output-directory>");
}

await createClient({
  input,
  output: {
    entryFile: false,
    path: output,
  },
  plugins: [
    {
      name: "@hey-api/typescript",
    },
    {
      definitions: true,
      name: "zod",
      requests: false,
      responses: true,
    },
  ],
});
