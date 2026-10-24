import { ImageResponse } from "next/og";

export const alt = "Thread & Co. everyday clothing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#1f3d2b", color: "white" }}>
        <div style={{ fontSize: 28, opacity: 0.8, letterSpacing: 4 }}>THREAD &amp; CO.</div>
        <div style={{ fontSize: 84, fontWeight: 700, marginTop: 16 }}>Everyday clothing, made to last.</div>
      </div>
    ),
    size,
  );
}
