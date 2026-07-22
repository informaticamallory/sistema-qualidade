import { useCallback, useEffect, useState } from 'react';

/**
 * Controla a visibilidade de colunas de uma tabela, com persistência em localStorage.
 * Reutilizável em qualquer tabela larga (Relatório/Inspeção de Recebimento, Injeção, Montagem...).
 *
 * @param {string} storageKey  chave única no localStorage (ex.: 'cols:relatorio-recebimento')
 * @param {Array<{key:string,label:string,default?:boolean}>} columns  definição das colunas
 * @returns {{visible:Object, toggle:Function, showAll:Function, showDefaults:Function, isVisible:Function, visibleCount:number}}
 */
const buildDefaults = (columns) =>
    Object.fromEntries(columns.map((c) => [c.key, c.default === true]));

function loadInitial(storageKey, columns) {
    const defaults = buildDefaults(columns);
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return defaults;
        const saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object') return defaults;

        // Mescla com a definição atual: respeita o que foi salvo e usa o default
        // para colunas novas que ainda não estavam no localStorage.
        const merged = {};
        columns.forEach((c) => {
            merged[c.key] = typeof saved[c.key] === 'boolean' ? saved[c.key] : c.default === true;
        });

        // Nunca deixar a tabela sem nenhuma coluna visível
        if (!Object.values(merged).some(Boolean)) return defaults;
        return merged;
    } catch {
        return defaults;
    }
}

export default function useColumnVisibility(storageKey, columns) {
    const [visible, setVisible] = useState(() => loadInitial(storageKey, columns));

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(visible));
        } catch {
            /* localStorage indisponível — segue sem persistir */
        }
    }, [storageKey, visible]);

    const toggle = useCallback((key) => {
        setVisible((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            // Garante pelo menos uma coluna visível
            if (!Object.values(next).some(Boolean)) return prev;
            return next;
        });
    }, []);

    const showAll = useCallback(() => {
        setVisible(Object.fromEntries(columns.map((c) => [c.key, true])));
    }, [columns]);

    const showDefaults = useCallback(() => {
        setVisible(buildDefaults(columns));
    }, [columns]);

    const isVisible = useCallback((key) => !!visible[key], [visible]);

    const visibleCount = columns.reduce((acc, c) => acc + (visible[c.key] ? 1 : 0), 0);

    return { visible, toggle, showAll, showDefaults, isVisible, visibleCount };
}
