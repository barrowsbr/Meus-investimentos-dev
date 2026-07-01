import { buildDigest } from "@/lib/digest";
import { renderDigestImage } from "@/lib/digest-image";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Preview no navegador (e fonte da imagem para o Telegram): GET → PNG.
export async function GET() {
  const data = await buildDigest();
  return renderDigestImage(data);
}
