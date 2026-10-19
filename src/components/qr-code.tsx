import QRCode from "qrcode";

/**
 * Server-rendered QR code. Generating it on the server keeps the join
 * URL out of any third-party image service and avoids a client-only
 * flash on the projector.
 */
export async function QrCode({ value, size = 260 }: { value: string; size?: number }) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#04070dff", light: "#e8f1ffff" },
  });

  return (
    <div
      className="rounded-2xl bg-ink p-3 shadow-[0_0_40px_-10px_rgba(34,211,238,0.6)]"
      // SVG is generated locally by `qrcode` from a controlled input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}