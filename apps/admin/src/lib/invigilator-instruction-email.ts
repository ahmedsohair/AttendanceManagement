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
    `Scanner link: ${scannerUrl(appBaseUrl)}`,
    `Your invigilator code: ${accessCode}`,
    "",
    "Open the scanner link, enter your code, allow camera access, and wait 20-40 seconds for OCR to load on first use.",
    "",
    "If this code does not work, contact the exam administrator."
  ].join("\n");
}

function buildInstructionHtml(input: InstructionEmailInput) {
  const text = buildInstructionText(input)
    .split("\n")
    .map((line) => line || "&nbsp;")
    .join("<br />");

  return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">${text}</div>`;
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
    `Scanner link: ${scannerUrl(appBaseUrl)}`,
    "",
    "Open the scanner link and enter this code to access your assigned active exam rooms.",
    "",
    "If this code does not work, contact the exam administrator."
  ].join("\n");
}

function buildAccessCodeHtml(input: AccessCodeEmailInput) {
  const text = buildAccessCodeText(input)
    .split("\n")
    .map((line) => line || "&nbsp;")
    .join("<br />");

  return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">${text}</div>`;
}

export async function sendInvigilatorAccessCodeEmail(input: AccessCodeEmailInput) {
  return sendEmail({
    to: input.email,
    subject: "ExamPulse access code",
    text: buildAccessCodeText(input),
    html: buildAccessCodeHtml(input)
  });
}
