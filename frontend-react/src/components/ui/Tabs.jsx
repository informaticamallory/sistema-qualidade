import './ui.css';

/* Tabs estilo pill do Mallory UI Kit, com contador opcional.

   Único componente do conjunto sem base no ui-kit — não havia tabs pill.

   Segue o padrão ARIA de tablist: as setas do teclado navegam entre as abas
   e só a ativa fica no fluxo de Tab (roving tabindex). Sem isso, uma barra
   com muitas abas obriga o usuário de teclado a percorrer todas para chegar
   ao conteúdo.

   items: [{ id, label, count? }] */
export default function Tabs({
    items = [],
    activeId,
    onChange,
    className = '',
    ariaLabel = 'Seções'
}) {
    if (!items.length) return null;

    const irPara = (indice) => {
        const alvo = items[(indice + items.length) % items.length];
        if (alvo && typeof onChange === 'function') onChange(alvo.id);
    };

    const aoTeclar = (evento, indice) => {
        if (evento.key === 'ArrowRight') { evento.preventDefault(); irPara(indice + 1); }
        if (evento.key === 'ArrowLeft') { evento.preventDefault(); irPara(indice - 1); }
        if (evento.key === 'Home') { evento.preventDefault(); irPara(0); }
        if (evento.key === 'End') { evento.preventDefault(); irPara(items.length - 1); }
    };

    return (
        <div className={['ui-tabs', className].filter(Boolean).join(' ')}
            role="tablist" aria-label={ariaLabel}>
            {items.map((item, indice) => {
                const ativa = item.id === activeId;
                return (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={ativa}
                        tabIndex={ativa ? 0 : -1}
                        className={`ui-tab ${ativa ? 'is-active' : ''}`}
                        onClick={() => onChange?.(item.id)}
                        onKeyDown={(e) => aoTeclar(e, indice)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                        {/* 0 é contagem legítima, então o teste é por null/undefined */}
                        {item.count !== undefined && item.count !== null && (
                            <span className="ui-tab-count">{item.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
