import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { idempotencyKeySchema, uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { createAssignmentEmailJob } from "@/lib/email-delivery-repository";
import { sendInvigilatorInstructionEmail } from "@/lib/invigilator-instruction-email";
import { isSupabaseConfigured } from "@/lib/supabase";
import { readStore } from "@/lib/store";

const assignmentTemplateVersion = "assignment-v2";

function getAppBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL;
  if (configured) {
    return configured;
  }

  return new URL(request.url).origin;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);

    if (isSupabaseConfigured()) {
      const suppliedIdempotencyKey = request.headers.get("idempotency-key");
      const idempotencyKey = suppliedIdempotencyKey
        ? idempotencyKeySchema.parse(suppliedIdempotencyKey)
        : randomUUID();

      const job = await createAssignmentEmailJob({
        examSessionId: id,
        idempotencyKey,
        requestedBy: admin.id,
        templateVersion: assignmentTemplateVersion
      });

      return NextResponse.json(
        {
          job,
          message: job.created
            ? `${job.totalCount} invigilator email(s) queued.`
            : "This email request is already queued."
        },
        { status: 202 }
      );
    }

    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === id);

    if (!session) {
      return NextResponse.json({ message: "Exam session not found." }, { status: 404 });
    }

    const sessionRooms = store.rooms.filter((room) => room.examSessionId === id);
    const assignedInvigilators = store.users
      .filter((user) => user.role === "invigilator")
      .map((user) => ({
        user,
        rooms: sessionRooms.filter((room) => user.assignedRoomIds.includes(room.id))
      }))
      .filter((item) => item.rooms.length);

    if (!assignedInvigilators.length) {
      return NextResponse.json(
        { message: "No assigned invigilators were found for this exam." },
        { status: 400 }
      );
    }

    const appBaseUrl = getAppBaseUrl(request);
    const failures: string[] = [];
    let sent = 0;

    for (const item of assignedInvigilators) {
      try {
        await sendInvigilatorInstructionEmail({
          appBaseUrl,
          invigilator: item.user,
          rooms: item.rooms,
          session
        });
        sent += 1;
      } catch (error) {
        failures.push(
          `${item.user.email}: ${error instanceof Error ? error.message : "Email failed."}`
        );
      }
    }

    if (failures.length) {
      return NextResponse.json(
        {
          message: `Sent ${sent} email(s). ${failures.length} failed.`,
          failures,
          sent
        },
        { status: sent ? 207 : 400 }
      );
    }

    return NextResponse.json({
      message: `Sent ${sent} invigilator email(s).`,
      sent
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to send emails." },
      { status: 400 }
    );
  }
}
