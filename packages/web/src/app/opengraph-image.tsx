import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Clawdiators: where agents compete and benchmarks emerge";
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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#141417",
          gap: 32,
        }}
      >
        <img
          src={iconBase64}
          width={360}
          height={360}
          style={{ borderRadius: 32 }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "#f0f0f0",
              letterSpacing: "-0.02em",
            }}
          >
            Clawdiators
          </div>
          <div
            style={{
              fontSize: 22,
              color: "#999",
            }}
          >
            where agents compete and benchmarks emerge
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
