import { z } from "zod";

const asciiControlCharacterPattern = /[\u0000-\u001f\u007f]/;
const examDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const examStartTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRealCalendarDate(value: string) {
  if (!examDatePattern.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(0, 0, 0, 0);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function requiredText(maxLength: number, label: string) {
  return z
    .string()
    .max(maxLength, `${label} must be ${maxLength} characters or fewer.`)
    .refine((value) => !asciiControlCharacterPattern.test(value), {
      message: `${label} contains invalid control characters.`
    })
    .transform((value) => value.trim())
    .pipe(z.string().min(1, `${label} is required.`));
}

function optionalText(maxLength: number, label: string) {
  return z
    .string()
    .max(maxLength, `${label} must be ${maxLength} characters or fewer.`)
    .refine((value) => !asciiControlCharacterPattern.test(value), {
      message: `${label} contains invalid control characters.`
    })
    .transform((value) => value.trim());
}

export function normalizeRoomCode(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export const uuidSchema = z.string().uuid("A valid identifier is required.");

export const emailAddressSchema = z
  .string()
  .max(254, "Email address must be 254 characters or fewer.")
  .refine((value) => !asciiControlCharacterPattern.test(value), {
    message: "Email address contains invalid control characters."
  })
  .transform((value) => value.trim())
  .pipe(z.string().email("Enter a valid email address."))
  .transform((value) => value.toLowerCase());

export const examDateSchema = z
  .string()
  .trim()
  .refine(isRealCalendarDate, {
    message: "Exam date must be a real date in YYYY-MM-DD format."
  });

export const examStartTimeSchema = z
  .string()
  .trim()
  .regex(examStartTimePattern, "Exam start time must use 24-hour HH:MM format.");

export const roomCodeSchema = requiredText(100, "Room code").transform(normalizeRoomCode);
export const personNameSchema = optionalText(200, "Name");
export const accessCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^AMS-[A-Z0-9]{4}-[A-Z0-9]{4}$/, "A valid access code is required.");
export const idempotencyKeySchema = requiredText(200, "Request identifier");
export const deleteExamConfirmationSchema = requiredText(200, "Exam name confirmation");

export const sessionImportRowSchema = z
  .object({
    student_id: requiredText(64, "Student ID"),
    student_name: requiredText(200, "Student name"),
    room: roomCodeSchema,
    zone: requiredText(100, "Zone"),
    course_code: requiredText(100, "Course code").optional(),
    program: requiredText(200, "Program").optional()
  })
  .strict();

export const sessionImportPayloadSchema = z
  .object({
    name: requiredText(200, "Exam name"),
    examDate: examDateSchema,
    startTime: examStartTimeSchema,
    rows: z.array(sessionImportRowSchema).min(1).max(2500)
  })
  .strict();

export const lookupRequestSchema = z
  .object({
    examSessionId: uuidSchema,
    roomId: uuidSchema,
    studentId: requiredText(64, "Student ID")
  })
  .strict();

export const markAttendanceRequestSchema = z
  .object({
    requestId: uuidSchema.optional(),
    examSessionId: uuidSchema,
    roomId: uuidSchema,
    studentId: requiredText(64, "Student ID"),
    source: z.enum(["ocr", "manual"]),
    userId: uuidSchema,
    deviceId: requiredText(200, "Device ID"),
    action: z.enum(["mark_present", "redirect_only"]),
    overrideWrongRoom: z.boolean().optional(),
    comment: z.string().trim().max(280).optional()
  })
  .strict();

const roomAssignmentSchema = z
  .object({
    roomId: uuidSchema,
    invigilatorIds: z.array(uuidSchema).max(100)
  })
  .strict();

export const roomAssignmentRequestSchema = z
  .object({
    expectedRoomAssignments: z.array(roomAssignmentSchema).max(500).optional(),
    roomAssignments: z.array(roomAssignmentSchema).max(500)
  })
  .strict();

export const createInvigilatorRequestSchema = z
  .object({
    assignedRoomIds: z.array(uuidSchema).max(500).optional().default([]),
    email: emailAddressSchema,
    fullName: personNameSchema.optional().default("")
  })
  .strict();

export const updateInvigilatorRequestSchema = z
  .object({
    userId: uuidSchema,
    email: emailAddressSchema,
    fullName: personNameSchema
  })
  .strict();

export const emailAccessCodeRequestSchema = z
  .object({
    accessCode: accessCodeSchema,
    email: emailAddressSchema,
    fullName: personNameSchema.optional().default(""),
    userId: uuidSchema
  })
  .strict();

export const activateAccessCodeRequestSchema = z
  .object({ accessCode: accessCodeSchema })
  .strict();

export const retryEmailDeliveriesRequestSchema = z
  .object({ deliveryIds: z.array(uuidSchema).min(1).max(100) })
  .strict();

export const adminLoginRequestSchema = z
  .object({
    email: emailAddressSchema,
    password: z.string().min(1, "Password is required.").max(1024)
  })
  .strict();

export const fallbackLoginRequestSchema = z
  .object({
    email: emailAddressSchema,
    fullName: personNameSchema.optional()
  })
  .strict();

export const accessCodeLoginRequestSchema = z
  .object({ accessCode: requiredText(32, "Access code") })
  .strict();
