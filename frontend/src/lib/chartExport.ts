/** Save a rendered Recharts chart (an <svg>) as a PNG.
 *
 * The chart's colours are CSS custom properties (`stroke="var(--accent)"`),
 * which mean nothing once the SVG is serialised into a standalone image —
 * so each `var(--x)` is replaced with the value it currently resolves to,
 * which also makes the PNG match the active light/dark theme. */
export function resolveCssVars(markup: string, lookup: (name: string) => string): string {
  return markup.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, name: string, fallback?: string) => lookup(name).trim() || fallback || "currentColor");
}

export async function downloadChartPng(svg: SVGSVGElement, filename: string, title?: string) {
  const rootStyle = getComputedStyle(document.documentElement);
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.style.fontFamily = getComputedStyle(document.body).fontFamily;
  const markup = resolveCssVars(new XMLSerializer().serializeToString(clone), (n) => rootStyle.getPropertyValue(n));

  const image = new Image();
  const svgUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Couldn't render the chart image"));
      image.src = svgUrl;
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  const scale = 2; // crisp on high-density screens and in documents
  const pad = 20;
  const header = title ? 36 : 0;
  const canvas = document.createElement("canvas");
  canvas.width = (width + pad * 2) * scale;
  canvas.height = (height + pad * 2 + header) * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.scale(scale, scale);
  ctx.fillStyle = rootStyle.getPropertyValue("--panel").trim() || "#ffffff";
  ctx.fillRect(0, 0, width + pad * 2, height + pad * 2 + header);
  if (title) {
    ctx.fillStyle = rootStyle.getPropertyValue("--text").trim() || "#111111";
    ctx.font = `600 15px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillText(title, pad, pad + 14);
  }
  ctx.drawImage(image, pad, pad + header, width, height);

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
