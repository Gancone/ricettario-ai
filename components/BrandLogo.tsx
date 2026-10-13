import Image from "next/image";

export function BrandLogo({ variant = "mark", decorative = false }: {
  variant?: "mark" | "full";
  decorative?: boolean;
}) {
  const full = variant === "full";
  return <Image
    src={full ? "/branding/ricettario-ai-logo-login.webp" : "/branding/ricettario-ai-mark.webp"}
    alt={decorative ? "" : "Ricettario AI"}
    width={full ? 640 : 128}
    height={full ? 560 : 128}
    className={full ? "official-logo-full" : "official-logo-mark"}
    loading="eager"
    unoptimized
  />;
}
