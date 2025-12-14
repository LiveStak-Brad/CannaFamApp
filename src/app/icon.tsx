import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070A08",
          borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            background: "#D11F2A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 16,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          C
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
