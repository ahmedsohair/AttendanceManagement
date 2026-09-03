import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createInvigilatorRequestSchema } from "@algo-attendance/shared";
import { getUserById, requireApiUser } from "@/lib/auth";
import { createInvigilator } from "@/lib/repository";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const payload = createInvigilatorRequestSchema.parse(await request.json());
    const fullName = payload.fullName || payload.email.split("@")[0] || "Invigilator";

    const result = await createInvigilator({
      email: payload.email,
      fullName,
      assignedRoomIds: payload.assignedRoomIds
    });
    const user = await getUserById(result.userId);

    revalidatePath("/invigilators");
    revalidatePath("/sessions");
    revalidatePath("/sessions/new");

    return NextResponse.json({
      accessCode: result.accessCode,
      user
    });
  } catch (error) {
    return handleApiError(request, error, "Invigilator creation failed.");
  }
}
