import { useEffect, useRef, useState } from 'react';

/* Seletor de período: mês atual, mês anterior, outro mês ou intervalo.

   Saiu de dentro da Inspeção de Injeção, onde eram ~70 linhas de JSX no meio
   da barra de filtros. As mesmas linhas estão repetidas em Montagem, Cartões,
   Q49, Recebimento, Relatório de Recebimento e Calibração — aqui ficam Injeção
   e Fichas NC, e as outras migram quando forem mexidas.

   As classes `.period-filter-*` continuam vindo do CSS das páginas, que o Vite
   junta num arquivo só: elas já valem para o sistema inteiro, e mover as
   regras para cá só trocaria quem vence a disputa entre seis telas.

   props:
     label        texto do período escolhido, montado por quem usa
     onMes        (mesISO) => void — 'YYYY-MM'
     onIntervalo  (inicioISO, fimISO) => void
     mesAtual     'YYYY-MM' do mês corrente
     mesAnterior  'YYYY-MM' do mês passado
     mes          'YYYY-MM' selecionado, para o campo "Outro mês"
     onLimpar     opcional; sem ela, o botão de limpar não aparece */

export default function PeriodFilter({
    label,
    onMes,
    onIntervalo,
    mesAtual,
    mesAnterior,
    mes = '',
    onLimpar
}) {
    const [aberto, setAberto] = useState(false);
    /* Os rascunhos ficam aqui: só viram filtro quando "Aplicar intervalo" é
       clicado, e quem usa o componente não precisa carregar esse estado. */
    const [inicio, setInicio] = useState('');
    const [fim, setFim] = useState('');
    const raizRef = useRef(null);

    useEffect(() => {
        if (!aberto) return undefined;
        const fechar = (evento) => {
            if (raizRef.current && !raizRef.current.contains(evento.target)) {
                setAberto(false);
            }
        };
        document.addEventListener('mousedown', fechar);
        /* `touchstart` além de `mousedown`: no celular o mousedown sintético só
           chega depois que o toque termina, e às vezes nem chega. */
        document.addEventListener('touchstart', fechar);
        return () => {
            document.removeEventListener('mousedown', fechar);
            document.removeEventListener('touchstart', fechar);
        };
    }, [aberto]);

    const escolherMes = (valor) => {
        setInicio('');
        setFim('');
        setAberto(false);
        onMes?.(valor);
    };

    /* Uma data que passa da outra arrasta a companheira, em vez de deixar o
       intervalo inválido esperando o clique em Aplicar. */
    const definirInicio = (valor) => {
        setInicio(valor);
        if (valor && fim && valor > fim) setFim(valor);
    };

    const definirFim = (valor) => {
        setFim(valor);
        if (valor && inicio && valor < inicio) setInicio(valor);
    };

    const aplicar = () => {
        if (!inicio || !fim) {
            alert('Selecione a data inicial e a data final.');
            return;
        }
        setAberto(false);
        onIntervalo?.(inicio, fim);
    };

    return (
        <div className="period-filter-wrapper" ref={raizRef}>
            <button
                type="button"
                className={aberto ? 'period-filter-button active' : 'period-filter-button'}
                onClick={() => setAberto((atual) => !atual)}
                aria-expanded={aberto}
                aria-haspopup="dialog"
                title={'Período: ' + label}
            >
                <i className="fas fa-calendar-alt" aria-hidden="true"></i>
                <span className="filter-label">
                    <span className="period-filter-title">Período</span>
                    <span className="period-filter-value">{label}</span>
                </span>
                <i className="fas fa-chevron-down period-filter-chevron" aria-hidden="true"></i>
            </button>

            {aberto && (
                <div className="period-filter-menu" role="dialog" aria-label="Selecionar período">
                    <div className="period-filter-quick-actions">
                        <button type="button" onClick={() => escolherMes(mesAtual)}>Mês atual</button>
                        <button type="button" onClick={() => escolherMes(mesAnterior)}>Mês anterior</button>
                    </div>

                    <label>
                        <span>Outro mês</span>
                        <input type="month" value={mes}
                            onChange={(e) => escolherMes(e.target.value)} />
                    </label>

                    <div className="period-range-fields">
                        <label>
                            <span>Data inicial</span>
                            <input type="date" value={inicio} max={fim || undefined}
                                onChange={(e) => definirInicio(e.target.value)} />
                        </label>
                        <label>
                            <span>Data final</span>
                            <input type="date" value={fim} min={inicio || undefined}
                                onChange={(e) => definirFim(e.target.value)} />
                        </label>
                    </div>

                    <button type="button" className="period-range-apply" onClick={aplicar}>
                        Aplicar intervalo
                    </button>

                    {onLimpar && (
                        <button type="button" className="period-limpar"
                            onClick={() => { setAberto(false); setInicio(''); setFim(''); onLimpar(); }}>
                            Mostrar todo período
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
