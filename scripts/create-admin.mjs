import { createClient } from "@supabase/supabase-js";

function readFlag(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] || "";
}

async function findAuthUserByEmail(supabase, email) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email
    );
    if (match) {
      return match;
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.");
  }

  const email = readFlag("--email").trim().toLowerCase();
  const password = readFlag("--password");
  const fullName = readFlag("--name").trim() || "Admin User";

  if (!email || !password) {
    throw new Error(
      "Usage: npm run create:admin -- --email admin@example.com --password <password> --name \"Admin User\""
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  let authUser = await findAuthUserByEmail(supabase, email);

  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "admin"
      }
    });

    if (error || !data.user) {
      throw new Error(error?.message || "Unable to create the admin auth user.");
    }

    authUser = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "admin"
      }
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  const { data: existingProfile, error: profileLookupError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profileLookupError) {
    throw new Error(profileLookupError.message);
  }

  if (existingProfile) {
    const { error } = await supabase
      .from("users")
      .update({
        id: authUser.id,
        full_name: fullName,
        role: "admin"
      })
      .eq("email", email);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase.from("users").insert({
      id: authUser.id,
      email,
      full_name: fullName,
      role: "admin"
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  console.log(`Admin account ready for ${email}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
