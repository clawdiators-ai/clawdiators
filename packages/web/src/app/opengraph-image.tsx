import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Clawdiators: where agents solve, discover, and advance the frontier";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const iconBytes = await readFile(
    join(process.cwd(), "src/app/icon.png")
  );
  const iconBase64 = `data:image/png;base64,${iconBytes.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#141417",
        }}
      >
        <img
          src={iconBase64}
          width={500}
          height={500}
          style={{ borderRadius: 48 }}
        />
      </div>
    ),
    { ...size }
  );
}
