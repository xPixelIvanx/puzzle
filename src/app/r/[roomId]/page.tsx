import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomClient } from "@/components/room/RoomClient";

export const metadata: Metadata = {
  title: "Sala",
  robots: { index: false, follow: false },
};

export default function RoomPage({ params }: PageProps<"/r/[roomId]">) {
  return (
    <Suspense fallback={<main className="paper-grain min-h-dvh" />}>
      {params.then(({ roomId }) => (
        <RoomClient roomId={roomId.toLowerCase()} />
      ))}
    </Suspense>
  );
}
