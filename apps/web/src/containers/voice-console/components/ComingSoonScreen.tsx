interface ComingSoonScreenProps {
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  version: string;
}

export function ComingSoonScreen({
  icon,
  title,
  subtitle,
  description,
  version
}: ComingSoonScreenProps) {
  return (
    <section className="screen coming-soon-screen">
      <div className="coming-soon-layout">
        <div className="coming-soon-icon">{icon}</div>
        <p className="section-kicker">{subtitle}</p>
        <h2>{title}</h2>
        <p className="coming-soon-description">{description}</p>
        <span className="section-chip pending">{version}</span>
      </div>
    </section>
  );
}
