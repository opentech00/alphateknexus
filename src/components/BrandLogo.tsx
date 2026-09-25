type BrandLogoProps = {
  src: string;
  alt: string;
  className?: string;
};

/** App mark with theme-aware contrast (see `.brand-logo` in index.css). */
export function BrandLogo({ src, alt, className = '' }: BrandLogoProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={`brand-logo object-contain ${className}`.trim()}
      decoding="async"
    />
  );
}
