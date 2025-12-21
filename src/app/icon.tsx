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
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://www.cannafamapp.com/icon.png"
          alt="CF"
          width={32}
          height={32}
          style={{ borderRadius: 6 }}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
