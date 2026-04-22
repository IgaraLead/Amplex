import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Home, BarChart3, MessageSquare, Search, LayoutGrid } from 'lucide-react';
import { apiGet } from '@/shared/api';
import { HUB_NAME, AMPLEX_NAME, NEXUS_NAME, ENTITY_NAME } from '@/shared/branding';

interface Product {
  key: string;
  name: string;
  description: string;
  url: string;
  icon: ReactNode;
  color: string;
}

const PRODUCTS: Product[] = [
  {
    key: 'hub',
    name: HUB_NAME,
    description: 'Painel Central',
    url: '',
    icon: <Home size={16} />,
    color: '#0070ff',
  },
  {
    key: 'amplex',
    name: AMPLEX_NAME,
    description: 'CRM',
    url: '',
    icon: <BarChart3 size={16} />,
    color: '#10b981',
  },
  {
    key: 'nexus',
    name: NEXUS_NAME,
    description: 'Atendimento',
    url: '',
    icon: <MessageSquare size={16} />,
    color: '#8b5cf6',
  },
  {
    key: 'entity',
    name: ENTITY_NAME,
    description: 'Dados CNPJ',
    url: '',
    icon: <Search size={16} />,
    color: '#f59e0b',
  },
];

export default function ProductSwitcher() {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet('/crm/config')
      .then((raw: unknown) => {
        const data = raw as Record<string, string> | null;
        if (!data) return;
        const urls: Record<string, string> = {
          hub: data.hub_url || '',
          nexus: data.nexus_url || '',
          entity: data.entity_url || '',
          amplex: window.location.origin,
        };
        setProducts(PRODUCTS.map(p => ({ ...p, url: urls[p.key] || p.url })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const visible = products.filter(p => p.key === 'amplex' || p.key === 'hub' || p.url);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Alternar entre plataformas"
        className={[
          'flex h-9 w-9 items-center justify-center rounded-[10px] border text-base-content transition-colors',
          open
            ? 'border-primary/30 bg-primary/15'
            : 'border-base-300/80 bg-base-content/[0.06] hover:bg-base-content/10',
        ].join(' ')}
      >
        <LayoutGrid size={18} strokeWidth={1.8} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[1000] w-[260px] rounded-[14px] border border-base-300/80 bg-base-200/95 p-2 shadow-2xl backdrop-blur-xl">
          <p className="m-0 px-2.5 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-widest text-base-content/35">
            Plataformas
          </p>
          {visible.map(p => {
            const isCurrent = p.key === 'amplex';
            return (
              <a
                key={p.key}
                href={isCurrent ? undefined : p.url || '#'}
                onClick={e => {
                  if (isCurrent || !p.url) e.preventDefault();
                  else setOpen(false);
                }}
                className={[
                  'mb-0.5 flex items-center gap-2.5 rounded-[10px] border p-2.5 no-underline transition-colors last:mb-0',
                  isCurrent
                    ? 'cursor-default border-primary/20 bg-primary/10'
                    : 'border-transparent hover:bg-base-content/[0.06]',
                  !p.url && !isCurrent ? 'opacity-40' : '',
                ].join(' ')}
              >
                <span
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg"
                  style={{ background: `${p.color}18`, color: p.color }}
                >
                  {p.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-semibold text-base-content">{p.name}</p>
                  <p className="m-0 text-[0.7rem] text-base-content/45">{p.description}</p>
                </div>
                {isCurrent && (
                  <span className="ml-auto shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-[0.6rem] font-semibold text-primary">
                    ATUAL
                  </span>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
