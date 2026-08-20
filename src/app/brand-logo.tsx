import Image from "next/image";

type BrandLogoProps = {
  compact?: boolean;
};

export function BrandLogo({ compact = false }: BrandLogoProps) {
  return (
    <Image
      alt="PharmaStock — Track, Sell, Grow"
      className={compact ? "h-10 w-auto max-w-[13rem] object-contain object-left" : "h-12 w-auto max-w-full object-contain object-left sm:h-16"}
      height={378}
      priority
      src="/pharmastock-logo.png"
      width={1200}
    />
  );
}
