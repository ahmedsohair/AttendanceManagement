import { createClient } from "@supabase/supabase-js";

const expectedStagingUrl = "https://bjoguceapwquyczbhlyp.supabase.co";
const productionUrl = "https://mtoyhpyxqhfwhcrysqon.supabase.co";
const adminEmail = "admin.staging@example.com";

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeSupabaseUrl(value) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("STAGING_SUPABASE_URL must contain only the HTTPS project origin.");
  }
  return parsed.origin.toLowerCase();
}

async function findAdminUser(supabase) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(error.message);
    }

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === adminEmail
    );
    if (user) {
      return user;
    }
    if (data.users.length < 200) {
      return null;
    }
  }
}

async function main() {
  const stagingUrl = normalizeSupabaseUrl(requireEnvironment("STAGING_SUPABASE_URL"));
  const serviceRoleKey = requireEnvironment("STAGING_SUPABASE_SERVICE_ROLE_KEY");
  const newPassword = requireEnvironment("STAGING_ADMIN_PASSWORD");

  if (stagingUrl === productionUrl) {
    throw new Error("Password reset refused: STAGING_SUPABASE_URL points to production.");
  }
  if (stagingUrl !== expectedStagingUrl) {
    throw new Error(
      `Password reset refused: expected ${expectedStagingUrl}, received ${stagingUrl}.`
    );
  }
  if (newPassword.length < 12) {
    throw new Error("STAGING_ADMIN_PASSWORD must contain at least 12 characters.");
  }

  const supabase = createClient(stagingUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const admin = await findAdminUser(supabase);
  if (!admin) {
    throw new Error(`Staging administrator ${adminEmail} was not found.`);
  }

  const { error } = await supabase.auth.admin.updateUserById(admin.id, {
    password: newPassword
  });
  if (error) {
    throw new Error(error.message);
  }

  console.log(`Staging administrator password reset for ${adminEmail}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
