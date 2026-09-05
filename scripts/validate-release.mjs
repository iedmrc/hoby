#!/usr/bin/env node

import { validateSourceRelease } from "./release-utils.mjs";

validateSourceRelease()
  .then(({ packageJson }) => {
    console.log(`Release metadata is consistent for Hoby ${packageJson.version}.`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
