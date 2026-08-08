import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * QR rendered as inline SVG from a bundled encoder — no CDN, no network, no
 * image request. Booth wifi is never in the path.
 */
export function QrCode({
  value,
  size = 240,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const { path, count } = useMemo(() => {
    // Type 0 = pick the smallest version that fits. "M" survives a phone
    // camera at an angle in booth lighting better than "L".
    const build = (level: "M" | "L") => {
      const qr = qrcode(0, level);
      qr.addData(value);
      qr.make();
      return qr;
    };
    let qr;
    try {
      qr = build("M");
    } catch {
      // Payload too long for M at any version — drop a level rather than
      // rendering nothing on the stand.
      qr = build("L");
    }
    const moduleCount = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) d += `M${col},${row}h1v1h-1z`;
      }
    }
    return { path: d, count: moduleCount };
  }, [value]);

  return (
    <svg
      viewBox={`-1 -1 ${count + 2} ${count + 2}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Scan for the debate summary"
      shapeRendering="crispEdges"
    >
      <rect x="-1" y="-1" width={count + 2} height={count + 2} fill="#F4F8FC" />
      <path d={path} fill="#070C16" />
    </svg>
  );
}
