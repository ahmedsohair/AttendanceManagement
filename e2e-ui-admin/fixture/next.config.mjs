import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = process.env.UI_ADMIN_BASELINE === "1" ? "C:/dev/AlgoAttendance-ui-admin-baseline" : root;
const mocks = path.join(root, "e2e-ui-admin/mocks");

export default {
  poweredByHeader: false,
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/lib/auth": path.join(mocks, "auth.ts"),
      "@/lib/admin-queries": path.join(mocks, "admin-queries.ts"),
      "@/lib/supabase-browser": path.join(mocks, "supabase-browser.ts"),
      "@/surface/layout": path.join(source, "apps/admin/app/layout.tsx"),
      "@/surface/dashboard": path.join(source, "apps/admin/app/page.tsx"),
      "@/surface/sessions": path.join(source, "apps/admin/app/sessions/page.tsx"),
      "@": path.join(source, "apps/admin/src"),
      "@algo-attendance/shared": path.join(source, "packages/shared/src/index.ts")
    };
    return config;
  }
};
