import baseConfig from "./playwright.b5.config.mjs";

export default {
  ...baseConfig,
  testMatch: "account-visual.b5.spec.mjs"
};
