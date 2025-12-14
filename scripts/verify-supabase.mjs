import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

async function main() {
  // Sanity check the service role key early (most failures cascade from this).
  {
    const { error } = await admin.from("cfm_members").select("id").limit(1);
    if (error && /invalid api key/i.test(error.message)) {
      fail(
        "Service role key rejected (Invalid API key). Re-copy SUPABASE_SERVICE_ROLE_KEY from Supabase Dashboard → Project Settings → API, ensure it is a single line, then rerun.",
      );
      return;
    }
  }

  const requiredTables = [
    "cfm_applications",
    "cfm_members",
    "cfm_checkins",
    "cfm_shares",
    "cfm_feed_posts",
    "cfm_feed_likes",
    "cfm_awards",
  ];

  // 1) Tables exist
  for (const t of requiredTables) {
    const { data, error } = await admin
      .from(t)
      .select("*")
      .limit(1);

    if (error) {
      fail(`Table check failed for ${t}: ${error.message}`);
    } else {
      ok(`Table exists & selectable via service role: ${t}`);
    }
  }

  // 2) Public roster view exists
  {
    const { data, error } = await anon.from("cfm_public_members").select("id").limit(1);
    if (error) fail(`Public roster view select failed: ${error.message}`);
    else ok("Public roster view selectable as anon (cfm_public_members)");
  }

  // 3) NOTE: RLS-denied SELECTs may return an empty set with no error.
  // We verify protection using write attempts below.

  // 3b) Anon inserts should be blocked on member-only/admin-only tables
  {
    const { error } = await anon.from("cfm_members").insert({
      favorited_username: `blocked_${crypto.randomUUID()}`,
    });
    if (!error) fail("Anon should NOT be able to insert into cfm_members");
    else ok("Anon insert blocked on cfm_members (expected)");
  }
  {
    const { error } = await anon.from("cfm_feed_posts").insert({
      title: "blocked",
      content: "blocked",
      post_type: "announcement",
    });
    if (!error) fail("Anon should NOT be able to insert into cfm_feed_posts");
    else ok("Anon insert blocked on cfm_feed_posts (expected)");
  }
  {
    const { error } = await anon.from("cfm_awards").insert({
      user_id: crypto.randomUUID(),
      award_type: "CFM MVP",
      week_start: "2025-01-01",
      week_end: "2025-01-07",
    });
    if (!error) fail("Anon should NOT be able to insert into cfm_awards");
    else ok("Anon insert blocked on cfm_awards (expected)");
  }

  // 4) Minimal write: insert + delete a pending application (anon insert allowed)
  const verifyUsername = `cfm_verify_${crypto.randomUUID()}`;
  let inserted = false;
  {
    const { error } = await anon
      .from("cfm_applications")
      // IMPORTANT: do NOT request a returning representation (SELECT is admin-only by RLS)
      .insert(
        { favorited_username: verifyUsername, status: "pending" },
        { returning: "minimal" },
      );

    if (error) {
      fail(
        `Anon insert into cfm_applications failed: ${error.message}\n` +
          "Hint: re-run supabase.sql in Supabase SQL Editor to ensure the policy 'applications_insert_anyone' exists (INSERT to anon/authenticated).",
      );
    } else {
      ok("Anon insert into cfm_applications succeeded");
      inserted = true;
    }
  }

  if (!inserted) {
    console.log("\nVerification completed with failures.");
    return;
  }

  // 5) Only admin can update application status (anon should fail)
  // We target by favorited_username since anon cannot read IDs.
  {
    const { error } = await anon
      .from("cfm_applications")
      .update({ status: "approved" })
      .eq("favorited_username", verifyUsername);

    if (error) {
      ok("Anon update blocked on cfm_applications (expected)");
    } else {
      const { data: check, error: checkErr } = await admin
        .from("cfm_applications")
        .select("status")
        .eq("favorited_username", verifyUsername)
        .limit(1)
        .maybeSingle();

      if (checkErr) {
        fail(`Admin check after anon update failed: ${checkErr.message}`);
      } else if (check?.status === "approved") {
        fail("Anon was able to change application status (unexpected)");
      } else {
        ok("Anon update did not change application status (expected)");
      }
    }
  }

  // Cleanup test row using service role
  {
    const { error } = await admin
      .from("cfm_applications")
      .delete()
      .eq("favorited_username", verifyUsername)
      .eq("status", "pending");
    if (error) fail(`Cleanup delete failed (cfm_applications): ${error.message}`);
    else ok("Cleanup: deleted verification application");
  }

  // 5b) Ensure anon cannot select applications (admin-only select)
  {
    const { data, error } = await anon
      .from("cfm_applications")
      .select("id")
      .eq("favorited_username", verifyUsername)
      .limit(1);
    if (error) {
      ok("Anon select on cfm_applications returned an error (acceptable under RLS)");
    } else if ((data ?? []).length > 0) {
      fail("Anon should NOT be able to read cfm_applications rows");
    } else {
      ok("Anon cannot read cfm_applications rows (expected)");
    }
  }

  // 6) Storage: upload small file to cfm-photos and verify public URL
  const bucket = "cfm-photos";
  const objectPath = `verify/${crypto.randomUUID()}.txt`;
  {
    const content = new TextEncoder().encode("cfm storage verify");
    const { error } = await admin.storage.from(bucket).upload(objectPath, content, {
      contentType: "text/plain",
      upsert: false,
    });

    if (error) {
      fail(`Storage upload failed: ${error.message}`);
    } else {
      ok("Storage upload succeeded");
    }

    const { data } = admin.storage.from(bucket).getPublicUrl(objectPath);
    if (!data?.publicUrl) {
      fail("Storage public URL missing");
    } else {
      ok(`Storage public URL generated: ${data.publicUrl}`);

      // Attempt a HEAD request to ensure it resolves
      const res = await fetch(data.publicUrl, { method: "HEAD" });
      if (!res.ok) fail(`Public URL did not resolve (HTTP ${res.status})`);
      else ok("Public URL resolves (HEAD) ");
    }

    const { error: rmErr } = await admin.storage.from(bucket).remove([objectPath]);
    if (rmErr) fail(`Storage cleanup remove failed: ${rmErr.message}`);
    else ok("Storage cleanup: removed verification object");
  }

  if (!process.exitCode) {
    console.log("\nAll verification checks passed.");
  } else {
    console.log("\nVerification completed with failures.");
  }
}

await main();
