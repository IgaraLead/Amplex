import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  description?: string;
  titleClass?: string;
  children: ReactNode;
}

export default function Section({ title, description, titleClass, children }: SectionProps) {
  return (
    <section className="mb-14">
      <div className="mb-5 flex items-start gap-3">
        <div className="bg-primary/60 mt-0.5 h-full min-h-[2.5rem] w-0.5 shrink-0 rounded-full" />
        <div>
          <h2
            className={`text-sm leading-snug font-semibold text-foreground/90${titleClass ? ` ${titleClass}` : ''}`}
          >
            {title}
          </h2>
          {description && (
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      <div className="bg-card border-border rounded-2xl border">
        <div className="p-7">{children}</div>
      </div>
    </section>
  );
}
