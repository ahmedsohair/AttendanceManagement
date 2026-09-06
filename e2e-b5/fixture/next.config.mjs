import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(fixtureDirectory, "../..");
const adminSourceDirectory = path.join(repositoryDirectory, "apps/admin/src");
const sharedSourceFile = path.join(repositoryDirectory, "packages/shared/src/index.ts");
const mockDirectory = path.join(fixtureDirectory, "mocks");

export default {
  poweredByHeader: false,
  experimental: {
    externalDir: true
  },
  webpack(config) {
    const absoluteBoundaryAliases = {
      [path.join(adminSourceDirectory, "lib/admin-queries.ts")]: path.join(mockDirectory, "admin-queries.js"),
      [path.join(adminSourceDirectory, "lib/auth.ts")]: path.join(mockDirectory, "auth.js"),
      [path.join(adminSourceDirectory, "lib/invigilator-instruction-email.ts")]: path.join(mockDirectory, "emails.js"),
      [path.join(adminSourceDirectory, "lib/repository.ts")]: path.join(mockDirectory, "repository.js"),
      [path.join(adminSourceDirectory, "lib/supabase.ts")]: path.join(mockDirectory, "supabase.js"),
      [path.join(adminSourceDirectory, "lib/supabase-browser.ts")]: path.join(mockDirectory, "supabase-browser.js"),
      [path.join(adminSourceDirectory, "lib/tracked-access-code-email.ts")]: path.join(mockDirectory, "emails.js")
    };
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      ...absoluteBoundaryAliases,
      "@": adminSourceDirectory,
      "@algo-attendance/shared": sharedSourceFile,
      "@/lib/admin-queries$": path.join(mockDirectory, "admin-queries.js"),
      "@/lib/auth$": path.join(mockDirectory, "auth.js"),
      "@/lib/invigilator-instruction-email$": path.join(mockDirectory, "emails.js"),
      "@/lib/repository$": path.join(mockDirectory, "repository.js"),
      "@/lib/supabase$": path.join(mockDirectory, "supabase.js"),
      "@/lib/supabase-browser$": path.join(mockDirectory, "supabase-browser.js"),
      "@/lib/tracked-access-code-email$": path.join(mockDirectory, "emails.js")
    };
    return config;
  }
};
