import { existsSync } from "node:fs";
import test from "node:test";
const contracts = new URL(
  "../dev/release-tools/tests/release-script.test.mjs",
  import.meta.url
);
if (existsSync(contracts)) await import(contracts);
else
  test(
    "private local release contracts",
    { skip: "Run npm run release:setup to obtain the pinned private toolkit." },
    () => {}
  );
