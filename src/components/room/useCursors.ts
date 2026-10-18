"use client";

import { useEffect, useRef } from "react";
import type { RoomSession, RoomState } from "@/lib/firebase/room";
import type { BoardApi } from "../game/GamePlay";

/** Pinta los cursores de los demás en el tablero (fuera de React: alta frecuencia). */
export function useCursors(session: RoomSession, state: RoomState, api: BoardApi | null) {
  const members = useRef(state.members);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  useEffect(() => {
    members.current = state.members;
  }, [state.members]);

  useEffect(() => {
    if (!api) return;
    const draw = (uid: string) => {
      const p = positions.current.get(uid);
      const m = members.current[uid];
      if (!p || !m) api.renderer.removeCursor(uid);
      else api.renderer.setCursor(uid, p.x, p.y, m.name, m.color);
    };
    for (const uid of positions.current.keys()) draw(uid);
    return session.onCursor(({ uid, pos }) => {
      if (pos) positions.current.set(uid, pos);
      else positions.current.delete(uid);
      draw(uid);
    });
  }, [api, session]);
}
