import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description: string;
  tag?: string;
  className?: string;
}

export default function PageHeader({ title, description, tag, className }: PageHeaderProps) {
  return (
    <div className={cn('border-border/70 mb-12 border-b pb-8', className)}>
      {tag && (
        <p className="text-primary mb-3 text-xs font-medium tracking-[0.14em] uppercase opacity-70">
          {tag}
        </p>
      )}
      <h1 className="text-foreground mb-3 text-[2rem] leading-tight font-bold">{title}</h1>
      <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">{description}</p>
    </div>
  );
}
