import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
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
          borderRadius: 40,
        }}
      >
        <div
          style={{
            width: 150,
            height: 150,
            borderRadius: 75,
            background: "#D11F2A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 92,
            fontWeight: 900,
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
