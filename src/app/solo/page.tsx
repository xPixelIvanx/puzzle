import type { Metadata } from "next";
import { SoloClient } from "./SoloClient";

export const metadata: Metadata = { title: "A solas" };

export default function SoloPage() {
  return <SoloClient />;
}
