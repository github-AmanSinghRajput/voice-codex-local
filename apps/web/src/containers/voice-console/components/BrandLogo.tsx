import wordmarkUrl from '../../../assets/branding/vocod-wordmark.svg';

interface BrandLogoProps {
  compact?: boolean;
  subtitle?: string;
}

export function BrandLogo({ compact = false, subtitle }: BrandLogoProps) {
  return (
    <div className={`brand-logo ${compact ? 'compact' : 'full'}`}>
      <div className="brand-logo-copy">
        <img alt="VOCOD" className="brand-logo-wordmark" src={wordmarkUrl} />
        {subtitle ? <span className="brand-logo-subtitle">{subtitle}</span> : null}
      </div>
    </div>
  );
}
