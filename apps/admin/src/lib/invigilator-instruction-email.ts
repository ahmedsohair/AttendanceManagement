import nodemailer from "nodemailer";
import type { ExamSession, Room, User } from "@algo-attendance/shared";

type InstructionEmailInput = {
  accessCode: string;
  appBaseUrl: string;
  invigilator: User;
  rooms: Room[];
  session: ExamSession;
};

type AccessCodeEmailInput = {
  accessCode: string;
  appBaseUrl: string;
  email: string;
  fullName?: string;
};

const scannerPath = "/scan";
const supportEmail = "ahmed.sohair.khan@rmit.edu.au";

export function isEmailConfigured() {
  return Boolean(process.env.EMAIL_FROM && (process.env.RESEND_API_KEY || isSmtpConfigured()));
}

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function scannerUrl(appBaseUrl: string) {
  return `${appBaseUrl.replace(/\/$/, "")}${scannerPath}`;
}

function buildRoomList(rooms: Room[]) {
  return rooms.map((room) => `- ${room.code}${room.displayName !== room.code ? ` (${room.displayName})` : ""}`).join("\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function queryLine() {
  return `For any queries, reply to this email or contact Ahmed at ${supportEmail}.`;
}

function buildInstructionText({
  accessCode,
  appBaseUrl,
  invigilator,
  rooms,
  session
}: InstructionEmailInput) {
  return [
    `Hello ${invigilator.fullName || "Invigilator"},`,
    "",
    `You have been assigned to ${session.name}.`,
    `Date: ${session.examDate}`,
    `Time: ${session.startTime}`,
    "",
    "Assigned room(s):",
    buildRoomList(rooms),
    "",
    `Your invigilator code: ${accessCode}`,
    "",
    `Open the scanner: ${scannerUrl(appBaseUrl)}`,
    "",
    "Before the exam:",
    "- Open the scanner link on your phone.",
    "- Enter your access code.",
    "- Allow camera access.",
    "- Wait 20-40 seconds for the OCR scanner to load the first time.",
    "- Keep the student number inside the red scan box.",
    "",
    "If the scanner cannot read the ID, use Manual Mode and type the student number.",
    "",
    "If a student is in the wrong room, the system will show the correct room. Only use the override option if you are intentionally marking them present in your room.",
    "",
    queryLine()
  ].join("\n");
}

function buildInstructionHtml(input: InstructionEmailInput) {
  const scanner = scannerUrl(input.appBaseUrl);
  const rooms = input.rooms
    .map(
      (room) =>
        `<li><strong>${escapeHtml(room.code)}</strong>${room.displayName !== room.code ? ` <span style="color:#64748b">(${escapeHtml(room.displayName)})</span>` : ""}</li>`
    )
    .join("");

  return `
    <div style="margin:0;background:#f8fafc;padding:24px;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">
        <div style="background:#e4002b;color:#ffffff;padding:22px 28px">
          <div style="font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">ExamPulse</div>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25">Invigilator assignment</h1>
        </div>
        <div style="padding:28px">
          <p style="margin:0 0 18px;font-size:16px">Hi ${escapeHtml(input.invigilator.fullName || "Invigilator")},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55">You have been assigned as an invigilator for:</p>
          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-bottom:18px">
            <h2 style="margin:0 0 10px;font-size:21px">${escapeHtml(input.session.name)}</h2>
            <div style="color:#475569;font-size:15px">Date: ${escapeHtml(input.session.examDate)}</div>
            <div style="color:#475569;font-size:15px">Time: ${escapeHtml(input.session.startTime)}</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-bottom:18px">
            <div style="font-weight:700;margin-bottom:8px">Assigned room(s)</div>
            <ul style="margin:0;padding-left:20px;line-height:1.7">${rooms}</ul>
          </div>
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;padding:18px;text-align:center;margin-bottom:22px">
            <div style="font-size:13px;font-weight:700;color:#be123c;letter-spacing:.12em;text-transform:uppercase">Your access code</div>
            <div style="font-size:28px;font-weight:800;letter-spacing:.08em;margin-top:8px">${escapeHtml(input.accessCode)}</div>
          </div>
          <p style="text-align:center;margin:0 0 24px">
            <a href="${escapeHtml(scanner)}" style="display:inline-block;background:#e4002b;color:#ffffff;text-decoration:none;font-weight:700;border-radius:999px;padding:14px 24px">Open ExamPulse Scanner</a>
          </p>
          <div style="border-top:1px solid #e2e8f0;padding-top:18px">
            <div style="font-weight:700;margin-bottom:8px">Before the exam</div>
            <ul style="margin:0;padding-left:20px;line-height:1.7;color:#334155">
              <li>Open the scanner link on your phone.</li>
              <li>Enter your access code.</li>
              <li>Allow camera access.</li>
              <li>Wait 20-40 seconds for the OCR scanner to load the first time.</li>
              <li>Keep the student number inside the red scan box.</li>
            </ul>
            <p style="margin:16px 0 0;color:#334155;line-height:1.55">If the scanner cannot read the ID, use Manual Mode and type the student number.</p>
            <p style="margin:12px 0 0;color:#334155;line-height:1.55">If a student is in the wrong room, the system will show the correct room. Only use the override option if you are intentionally marking them present in your room.</p>
          </div>
          <p style="margin:22px 0 0;color:#475569;line-height:1.55">${escapeHtml(queryLine())}</p>
        </div>
      </div>
    </div>
  `;
}

function createSmtpTransporter() {
  if (!isSmtpConfigured() || !process.env.EMAIL_FROM) {
    throw new Error(
      "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM, or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM."
    );
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendEmail({
  html,
  subject,
  text,
  to
}: {
  html: string;
  subject: string;
  text: string;
  to: string;
}) {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        reply_to: process.env.EMAIL_REPLY_TO || supportEmail,
        to: [to],
        subject,
        text,
        html
      }),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        name?: string;
      };

      throw new Error(payload.message || payload.name || "Resend email delivery failed.");
    }

    return response.json();
  }

  const transporter = createSmtpTransporter();

  return transporter.sendMail({
    from: process.env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO || supportEmail,
    to,
    subject,
    text,
    html
  });
}

export async function sendInvigilatorInstructionEmail(input: InstructionEmailInput) {
  const subject = `ExamPulse assignment: ${input.session.name}`;

  return sendEmail({
    to: input.invigilator.email,
    subject,
    text: buildInstructionText(input),
    html: buildInstructionHtml(input)
  });
}

function buildAccessCodeText({ accessCode, appBaseUrl, fullName }: AccessCodeEmailInput) {
  return [
    `Hello ${fullName || "Invigilator"},`,
    "",
    "Your ExamPulse invigilator access code is:",
    "",
    accessCode,
    "",
    `Open the scanner: ${scannerUrl(appBaseUrl)}`,
    "",
    "Open the scanner link and enter this code to access your assigned active exam rooms.",
    "The OCR scanner may take 20-40 seconds to load the first time.",
    "If scanning fails, use Manual Mode to enter the student number.",
    "",
    queryLine()
  ].join("\n");
}

function buildAccessCodeHtml(input: AccessCodeEmailInput) {
  const scanner = scannerUrl(input.appBaseUrl);

  return `
    <div style="margin:0;background:#f8fafc;padding:24px;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden">
        <div style="background:#e4002b;color:#ffffff;padding:22px 28px">
          <div style="font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">ExamPulse</div>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25">Invigilator access code</h1>
        </div>
        <div style="padding:28px">
          <p style="margin:0 0 18px;font-size:16px">Hi ${escapeHtml(input.fullName || "Invigilator")},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55">Your ExamPulse access code is:</p>
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;padding:20px;text-align:center;margin-bottom:22px">
            <div style="font-size:30px;font-weight:800;letter-spacing:.08em">${escapeHtml(input.accessCode)}</div>
          </div>
          <p style="text-align:center;margin:0 0 24px">
            <a href="${escapeHtml(scanner)}" style="display:inline-block;background:#e4002b;color:#ffffff;text-decoration:none;font-weight:700;border-radius:999px;padding:14px 24px">Open ExamPulse Scanner</a>
          </p>
          <ul style="margin:0;padding-left:20px;line-height:1.7;color:#334155">
            <li>The OCR scanner may take 20-40 seconds to load the first time.</li>
            <li>Allow camera access when prompted.</li>
            <li>If scanning fails, use Manual Mode to enter the student number.</li>
          </ul>
          <p style="margin:22px 0 0;color:#475569;line-height:1.55">${escapeHtml(queryLine())}</p>
        </div>
      </div>
    </div>
  `;
}

export async function sendInvigilatorAccessCodeEmail(input: AccessCodeEmailInput) {
  return sendEmail({
    to: input.email,
    subject: "ExamPulse access code",
    text: buildAccessCodeText(input),
    html: buildAccessCodeHtml(input)
  });
}
