import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { createInvigilator } from "@/lib/repository";
import { readStore } from "@/lib/store";

type CreateInvigilatorPayload = {
  assignedRoomIds?: string[];
  email?: string;
  fullName?: string;
};

export async function POST(request: Request) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const payload = (await request.json()) as CreateInvigilatorPayload;
    const email = String(payload.email || "").trim().toLowerCase();
    const fullName =
      String(payload.fullName || "").trim() || email.split("@")[0] || "Invigilator";
    const assignedRoomIds = (payload.assignedRoomIds || [])
      .map((roomId) => String(roomId).trim())
      .filter(Boolean);

    if (!email) {
      throw new Error("Email is required.");
    }

    const result = await createInvigilator({
      email,
      fullName,
      assignedRoomIds
    });
    const store = await readStore();
    const user = store.users.find(
      (candidate) => candidate.email.toLowerCase() === email
    );

    revalidatePath("/invigilators");
    revalidatePath("/sessions");
    revalidatePath("/sessions/new");

    return NextResponse.json({
      accessCode: result.accessCode,
      user
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create invigilator.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
