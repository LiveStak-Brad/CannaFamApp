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
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cannafamapp.com/favicon.png"
          alt="CF"
          width={180}
          height={180}
          style={{ borderRadius: 36 }}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
