import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "apps/admin/package.json"));
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(process.cwd(), ".env.local");

if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || url.includes("your-project-id") || key.includes("your-service-role-key")) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const checks = [
  ["users", "id, email"],
  ["exam_sessions", "id, name"],
  ["rooms", "id, code"],
  ["student_allocations", "id, student_id"],
  ["attendance_events", "id, student_id"],
  ["incidents", "id, incident_type"]
];

for (const [table, columns] of checks) {
  const { error } = await supabase.from(table).select(columns).limit(1);
  if (error) {
    console.error(`Failed table check for ${table}: ${error.message}`);
    process.exit(1);
  }
  console.log(`OK ${table}`);
}

console.log("Supabase connection and table access look good.");
