import { safeEqual } from "@/lib/server/staleness";

/**
 * Limpieza de salas inactivas (60 días). La invoca Vercel Cron a diario (ver vercel.json)
 * con la cabecera "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { cleanupInactiveRooms } = await import("@/lib/server/cleanup");
    return Response.json(await cleanupInactiveRooms());
  } catch (e) {
    console.error(e);
    return Response.json({ error: "cleanup failed" }, { status: 500 });
  }
}
