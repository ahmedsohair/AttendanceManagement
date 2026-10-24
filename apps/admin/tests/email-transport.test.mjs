import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import nodemailer from "nodemailer";
import ts from "typescript";

const appRoot = path.resolve(import.meta.dirname, "..");
const guideFixture = Buffer.from("%PDF-1.4\nHarmless email test guide\n%%EOF\n");
const smtpConfig = {
  EMAIL_FROM: "ExamPulse <noreply@example.test>",
  EMAIL_REPLY_TO: "support@example.test",
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "test-smtp-user",
  SMTP_PASS: "synthetic"
};

function loadEmailModule({ failure } = {}) {
  const sourcePath = new URL("../src/lib/invigilator-instruction-email.ts", import.meta.url);
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const captured = { settings: [], mailOptions: [], streamResults: [], guideReads: [] };
  const streamTransport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix"
  });
  const dependencies = {
    "node:fs/promises": {
      readFile: async (filePath) => {
        captured.guideReads.push(filePath);
        return guideFixture;
      }
    },
    "node:path": path,
    nodemailer: {
      createTransport(settings) {
        captured.settings.push(settings);
        return {
          async sendMail(mailOptions) {
            captured.mailOptions.push(mailOptions);
            const result = await streamTransport.sendMail(mailOptions);
            captured.streamResults.push(result);
            if (failure) throw failure;
            return result;
          }
        };
      }
    }
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    Buffer,
    exports,
    process: { cwd: () => appRoot, env: { ...smtpConfig } },
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  });

  return { email: exports, captured };
}

function assertSmtpSettings(settings) {
  assert.equal(settings.host, smtpConfig.SMTP_HOST);
  assert.equal(settings.port, 587);
  assert.equal(settings.secure, false);
  assert.equal(settings.auth.user, smtpConfig.SMTP_USER);
  assert.equal(settings.auth.pass, smtpConfig.SMTP_PASS);
}

function assertAccepted(result) {
  assert.equal(result.provider, "smtp");
  assert.ok(Number.isFinite(Date.parse(result.acceptedAt)));
  assert.equal(typeof result.providerMessageId, "string");
  assert.ok(result.providerMessageId.length > 0);
}

test("access-code email uses SMTP stream transport and renders its recipient and configured headers", async () => {
  const { email, captured } = loadEmailModule();
  assert.equal(email.isEmailConfigured(), true);

  const result = await email.sendInvigilatorAccessCodeEmail({
    accessCode: "CODE-4821",
    appBaseUrl: "https://attendance.example.test/",
    email: "invigilator@example.test",
    fullName: "Test Invigilator"
  });

  assertAccepted(result);
  assert.equal(captured.settings.length, 1);
  assertSmtpSettings(captured.settings[0]);
  assert.equal(captured.mailOptions.length, 1);
  const options = captured.mailOptions[0];
  assert.equal(options.from, smtpConfig.EMAIL_FROM);
  assert.equal(options.replyTo, smtpConfig.EMAIL_REPLY_TO);
  assert.equal(options.to, "invigilator@example.test");
  assert.equal(options.subject, "ExamPulse access code");
  assert.equal(options.attachments, undefined);

  const streamResult = captured.streamResults[0];
  assert.equal(streamResult.envelope.to[0], "invigilator@example.test");
  const mime = streamResult.message.toString("utf8");
  assert.match(mime, /^From: ExamPulse <noreply@example\.test>$/m);
  assert.match(mime, /^To: invigilator@example\.test$/m);
  assert.match(mime, /^Reply-To: support@example\.test$/m);
  assert.match(mime, /^Subject: ExamPulse access code$/m);
  assert.match(mime, /Your ExamPulse access code is:/);
  assert.match(mime, /CODE-4821/);
  assert.match(mime, /https:\/\/attendance\.example\.test\/scan/);
  assert.doesNotMatch(mime, /Content-Type: application\/pdf/i);
});

test("assignment email renders exam details and attaches the harmless guide fixture", async () => {
  const { email, captured } = loadEmailModule();
  const result = await email.sendInvigilatorInstructionEmail({
    appBaseUrl: "https://attendance.example.test",
    invigilator: { email: "staff@example.test", fullName: "Taylor Invigilator" },
    rooms: [
      { code: "R-101", displayName: "Room 101" },
      { code: "LAB-2", displayName: "LAB-2" }
    ],
    session: {
      name: "Algorithms Final",
      examDate: "2026-11-03",
      startTime: "09:30"
    }
  });

  assertAccepted(result);
  assert.equal(captured.settings.length, 1);
  assertSmtpSettings(captured.settings[0]);
  assert.equal(captured.mailOptions.length, 1);
  const options = captured.mailOptions[0];
  assert.equal(options.from, smtpConfig.EMAIL_FROM);
  assert.equal(options.replyTo, smtpConfig.EMAIL_REPLY_TO);
  assert.equal(options.to, "staff@example.test");
  assert.equal(options.subject, "ExamPulse invigilation assignment: Algorithms Final");
  assert.equal(options.attachments.length, 1);
  assert.equal(options.attachments[0].filename, "ExamPulse Invigilator Guide.pdf");
  assert.equal(options.attachments[0].contentType, "application/pdf");
  assert.deepEqual(options.attachments[0].content, guideFixture);
  assert.equal(captured.guideReads.length, 1);
  assert.equal(path.basename(captured.guideReads[0]), "exampulse-invigilator-guide.pdf");

  const streamResult = captured.streamResults[0];
  assert.equal(streamResult.envelope.to[0], "staff@example.test");
  const mime = streamResult.message.toString("utf8");
  assert.match(mime, /^From: ExamPulse <noreply@example\.test>$/m);
  assert.match(mime, /^Reply-To: support@example\.test$/m);
  assert.match(mime, /^Subject: ExamPulse invigilation assignment: Algorithms Final$/m);
  assert.match(mime, /Taylor Invigilator/);
  assert.match(mime, /Algorithms Final/);
  assert.match(mime, /2026-11-03/);
  assert.match(mime, /09:30/);
  assert.match(mime, /R-101/);
  assert.match(mime, /Room 101/);
  assert.match(mime, /LAB-2/);
  assert.match(mime, /https:\/\/attendance\.example\.test\/scan/);
  assert.match(mime, /Content-Type: application\/pdf/i);
  assert.match(mime, /ExamPulse Invigilator Guide\.pdf/);
  assert.ok(mime.includes(guideFixture.toString("base64")));
});

test("patched SMTP parser does not append comment-separated domains to a quoted recipient", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({
    from: "sender@example.test",
    to: '"user"@example.com(x)evil.com',
    text: "Synthetic parser regression"
  });
  assert.deepEqual(result.envelope.to, ["user@example.com"]);
});

test("patched SMTP parser keeps nested comments and quoted group text out of the envelope", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  for (const to of [
    "Staff (x(y) <other@attacker.test>) <staff@example.test>",
    "Group: (a; <other@attacker.test>) <staff@example.test>;",
    'Group: "a;" "<other@attacker.test>" <staff@example.test>;'
  ]) {
    const result = await transport.sendMail({ from: "sender@example.test", to, text: "Synthetic parser regression" });
    assert.deepEqual(result.envelope.to, ["staff@example.test"]);
  }
  const quoted = await transport.sendMail({ from: "sender@example.test", to: '<"a@attacker.test>"@example.test>', text: "Synthetic parser regression" });
  assert.equal(quoted.envelope.to.length, 1);
  assert.ok(quoted.envelope.to[0].endsWith("@example.test"));
});

test("SMTP failures are wrapped with transient and permanent provider semantics", async (t) => {
  const cases = [
    { name: "connection failure", error: Object.assign(new Error("connection failed"), { code: "ECONNECTION" }), transient: true },
    { name: "temporary SMTP rejection", error: Object.assign(new Error("try again later"), { responseCode: 450 }), transient: true },
    { name: "permanent SMTP rejection", error: Object.assign(new Error("recipient rejected"), { responseCode: 550 }), transient: false }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const { email, captured } = loadEmailModule({ failure: scenario.error });
      await assert.rejects(
        email.sendInvigilatorAccessCodeEmail({
          accessCode: "CODE-4821",
          appBaseUrl: "https://attendance.example.test",
          email: "invigilator@example.test"
        }),
        (error) => {
          assert.ok(error instanceof email.EmailProviderError);
          assert.equal(error.message, scenario.error.message);
          assert.equal(error.transient, scenario.transient);
          assert.equal(error.retryAfterSeconds, null);
          return true;
        }
      );

      assert.equal(captured.streamResults.length, 1);
      assert.match(captured.streamResults[0].message.toString("utf8"), /CODE-4821/);
    });
  }
});
