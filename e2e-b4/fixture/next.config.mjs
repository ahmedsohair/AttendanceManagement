import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(fixtureDirectory, "../..");
const adminSourceDirectory = path.join(repositoryDirectory, "apps/admin/src");
const sharedSourceFile = path.join(repositoryDirectory, "packages/shared/src/index.ts");
const mockDirectory = path.join(repositoryDirectory, "e2e-b4/mocks");

export default {
  poweredByHeader: false,
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/lib/auth": path.join(mockDirectory, "auth.ts"),
      "@/lib/admin-queries": path.join(mockDirectory, "admin-queries.ts"),
      "@": adminSourceDirectory,
      "@algo-attendance/shared": sharedSourceFile
    };
    return config;
  }
};
