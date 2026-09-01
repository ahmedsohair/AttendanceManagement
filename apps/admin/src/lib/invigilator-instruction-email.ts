import { readFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import type { ExamSession, Room, User } from "@algo-attendance/shared";

type InstructionEmailInput = {
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

type EmailAttachment = {
  content: Buffer;
  contentType: string;
  filename: string;
};

const scannerPath = "/scan";
const supportEmail = "ahmed.sohair.khan@rmit.edu.au";
const invigilatorGuidePath = path.join(
  process.cwd(),
  "src",
  "lib",
  "assets",
  "exampulse-invigilator-guide.pdf"
);

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

function closingText() {
  return [
    "Best regards,",
    "ExamPulse"
  ].join("\n");
}

function closingHtml() {
  return `
    <p style="margin:18px 0 0;color:#334155;line-height:1.55">Best regards,<br /><strong>ExamPulse</strong></p>
  `;
}

async function buildInvigilatorGuideAttachment(): Promise<EmailAttachment> {
  return {
    content: await readFile(invigilatorGuidePath),
    contentType: "application/pdf",
    filename: "ExamPulse Invigilator Guide.pdf"
  };
}

function buildInstructionText({
  appBaseUrl,
  invigilator,
  rooms,
  session
}: InstructionEmailInput) {
  return [
    `Hi ${invigilator.fullName || "Invigilator"},`,
    "",
    "You have been assigned as an invigilator for the following exam:",
    "",
    `Exam: ${session.name}`,
    `Date: ${session.examDate}`,
    `Exam start time: ${session.startTime}`,
    "",
    "Assigned room(s):",
    buildRoomList(rooms),
    "",
    "Access code:",
    "Use your existing ExamPulse access code. If you no longer have it, contact the exam administrator before the exam.",
    "",
    `Open the scanner here: ${scannerUrl(appBaseUrl)}`,
    "",
    "Please read the attached ExamPulse Invigilator Guide before the exam. It contains detailed instructions on how to use the app, including troubleshooting steps for common scanning or access issues.",
    "",
    "Quick reminder:",
    "- Open the scanner link on your phone.",
    "- Wait 20-40 seconds for the OCR scanner to load the first time.",
    "- Keep only the printed student number inside the red scan box.",
    "",
    queryLine(),
    "",
    "Thank you for your support during the exam.",
    "",
    closingText()
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
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25">Invigilation assignment</h1>
        </div>
        <div style="padding:28px">
          <p style="margin:0 0 18px;font-size:16px">Hi ${escapeHtml(input.invigilator.fullName || "Invigilator")},</p>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55">You have been assigned as an invigilator for the following exam:</p>
          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-bottom:18px">
            <h2 style="margin:0 0 10px;font-size:21px">${escapeHtml(input.session.name)}</h2>
            <div style="color:#475569;font-size:15px">Date: ${escapeHtml(input.session.examDate)}</div>
            <div style="color:#475569;font-size:15px">Exam start time: ${escapeHtml(input.session.startTime)}</div>
          </div>
          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-bottom:18px">
            <div style="font-weight:700;margin-bottom:8px">Assigned room(s)</div>
            <ul style="margin:0;padding-left:20px;line-height:1.7">${rooms}</ul>
          </div>
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;padding:18px;margin-bottom:22px">
            <div style="font-size:13px;font-weight:700;color:#be123c;letter-spacing:.12em;text-transform:uppercase">Access code</div>
            <div style="font-size:15px;line-height:1.55;margin-top:8px">Use your existing ExamPulse access code. If you no longer have it, contact the exam administrator before the exam.</div>
          </div>
          <p style="text-align:center;margin:0 0 24px">
            <a href="${escapeHtml(scanner)}" style="display:inline-block;background:#e4002b;color:#ffffff;text-decoration:none;font-weight:700;border-radius:999px;padding:14px 24px">Open ExamPulse Scanner</a>
          </p>
          <div style="border-top:1px solid #e2e8f0;padding-top:18px">
            <p style="margin:0 0 16px;color:#334155;line-height:1.55">Please read the attached ExamPulse Invigilator Guide before the exam. It contains detailed instructions on how to use the app, including troubleshooting steps for common scanning or access issues.</p>
            <div style="font-weight:700;margin-bottom:8px">Quick reminder</div>
            <ul style="margin:0;padding-left:20px;line-height:1.7;color:#334155">
              <li>Open the scanner link on your phone.</li>
              <li>Wait 20-40 seconds for the OCR scanner to load the first time.</li>
              <li>Keep only the printed student number inside the red scan box.</li>
            </ul>
          </div>
          <p style="margin:22px 0 0;color:#475569;line-height:1.55">${escapeHtml(queryLine())}</p>
          <p style="margin:18px 0 0;color:#334155;line-height:1.55">Thank you for your support during the exam.</p>
          ${closingHtml()}
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
  attachments,
  html,
  subject,
  text,
  to
}: {
  attachments?: EmailAttachment[];
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
        html,
        attachments: attachments?.map((attachment) => ({
          content: attachment.content.toString("base64"),
          filename: attachment.filename
        }))
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
    html,
    attachments: attachments?.map((attachment) => ({
      content: attachment.content,
      contentType: attachment.contentType,
      filename: attachment.filename
    }))
  });
}

export async function sendInvigilatorInstructionEmail(input: InstructionEmailInput) {
  const subject = `ExamPulse invigilation assignment: ${input.session.name}`;

  return sendEmail({
    to: input.invigilator.email,
    subject,
    text: buildInstructionText(input),
    html: buildInstructionHtml(input),
    attachments: [await buildInvigilatorGuideAttachment()]
  });
}

function buildAccessCodeText({ accessCode, appBaseUrl, fullName }: AccessCodeEmailInput) {
  return [
    `Hi ${fullName || "Invigilator"},`,
    "",
    "Your ExamPulse access code is:",
    "",
    accessCode,
    "",
    `Open the scanner here: ${scannerUrl(appBaseUrl)}`,
    "",
    "Use this code to access any active exam rooms assigned to you.",
    "",
    "Please keep this code secure. If a new code is generated later, this code will stop working.",
    "",
    queryLine(),
    "",
    closingText()
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
          <p style="margin:0;color:#334155;line-height:1.55">Use this code to access any active exam rooms assigned to you.</p>
          <p style="margin:12px 0 0;color:#334155;line-height:1.55">Please keep this code secure. If a new code is generated later, this code will stop working.</p>
          <p style="margin:22px 0 0;color:#475569;line-height:1.55">${escapeHtml(queryLine())}</p>
          ${closingHtml()}
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
