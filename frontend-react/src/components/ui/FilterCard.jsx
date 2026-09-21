import './ui.css';

/* Faixa de indicadores das listagens, onde cada card também filtra a tabela.

   Saiu de dentro da Inspeção de Injeção, onde os quatro cards eram quatro
   blocos de JSX quase iguais. As classes vieram junto, renomeadas de
   `.injecao-summary-*` para `.kpi-*`: passaram a ser do UI Kit, e o prefixo
   da página deixou de descrever onde as regras vivem.

   Não é o `KpiCard` do kit nem o `.summary-card` do ui-kit.css: são três
   desenhos diferentes, em uso em telas diferentes. Este reproduz o da
   Inspeção de Injeção — rótulo com ícone em cima, número grande, legenda
   fina e barra colorida embaixo.

   O card serve a dois usos. Com `onClick`, vira filtro e recebe o destaque de
   selecionado; sem, é só número.

   tom: 'total' | 'approved' | 'rejected' | 'pending' — cor do ícone e da
   barra de baixo. */

export function FilterCardStrip({ children, rotulo = 'Resumo e filtros' }) {
    return (
        <section className="kpi-strip" aria-label={rotulo}>
            {children}
        </section>
    );
}

export default function FilterCard({
    icone,
    rotulo,
    valor,
    legenda,
    tom = 'total',
    ativo = false,
    onClick
}) {
    const clicavel = typeof onClick === 'function';

    /* Enter e espaço agem como o clique: o card é um <article> com
       `role="button"`, e sem isto o teclado chega nele sem poder acioná-lo. */
    const aoTeclar = (evento) => {
        if (!clicavel) return;
        if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            onClick();
        }
    };

    return (
        <article
            className={['kpi-card', tom, clicavel ? 'is-clickable' : '', ativo ? 'is-active' : '']
                .filter(Boolean).join(' ')}
            role={clicavel ? 'button' : undefined}
            tabIndex={clicavel ? 0 : undefined}
            aria-pressed={clicavel ? ativo : undefined}
            onClick={clicavel ? onClick : undefined}
            onKeyDown={aoTeclar}
        >
            <div className="kpi-card-heading">
                <i className={`fas ${icone}`} aria-hidden="true"></i>
                <span>{rotulo}</span>
            </div>
            <strong>{valor}</strong>
            {legenda && <small>{legenda}</small>}
            <span className="kpi-card-line" aria-hidden="true"></span>
        </article>
    );
}
