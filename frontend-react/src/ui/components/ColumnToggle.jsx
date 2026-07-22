import { useEffect, useRef, useState } from 'react';
import './ColumnToggle.css';

/**
 * Botão "Colunas" + popover com checkboxes para escolher quais colunas da tabela aparecem.
 * Controlado: recebe a definição das colunas e o estado de visibilidade (use com useColumnVisibility).
 *
 * @param {Array<{key:string,label:string}>} columns
 * @param {Object} visible            mapa { [key]: boolean }
 * @param {Function} onToggle         (key) => void
 * @param {Function} onShowAll        () => void
 * @param {Function} onShowDefaults   () => void
 * @param {string} [label='Colunas']
 */
export default function ColumnToggle({
    columns,
    visible,
    onToggle,
    onShowAll,
    onShowDefaults,
    label = 'Colunas'
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const handleClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        const handleKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [open]);

    const visibleCount = columns.reduce((acc, c) => acc + (visible[c.key] ? 1 : 0), 0);

    return (
        <div className="column-toggle" ref={ref}>
            <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-haspopup="true"
                title="Escolher colunas visíveis"
            >
                <i className="fas fa-table-columns"></i> {label}
                <span className="column-toggle-count">{visibleCount}</span>
            </button>

            {open && (
                <div className="column-toggle-panel" role="menu">
                    <div className="column-toggle-header">
                        <span>Colunas visíveis</span>
                    </div>
                    <div className="column-toggle-actions">
                        <button type="button" className="column-toggle-link" onClick={onShowAll}>
                            <i className="fas fa-check-double"></i> Selecionar todas
                        </button>
                        <button type="button" className="column-toggle-link" onClick={onShowDefaults}>
                            <i className="fas fa-rotate-left"></i> Ocultar opcionais
                        </button>
                    </div>
                    <div className="column-toggle-list">
                        {columns.map((c) => {
                            const checked = !!visible[c.key];
                            const isLastVisible = checked && visibleCount === 1;
                            return (
                                <label
                                    key={c.key}
                                    className={`column-toggle-item ${isLastVisible ? 'is-locked' : ''}`}
                                    title={isLastVisible ? 'Pelo menos uma coluna precisa ficar visível' : undefined}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={isLastVisible}
                                        onChange={() => onToggle(c.key)}
                                    />
                                    <span>{c.label}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
