import './ui.css';

/* KpiCard do Mallory UI Kit.

   Valor grande em Sora com tabular-nums, rótulo em caixa alta, e dois
   opcionais: delta (variação percentual com seta colorida) e sparkline.

   O sparkline é SVG inline em vez de biblioteca de gráfico: são poucos
   pontos, não precisa de eixo nem tooltip, e evita somar dependência e
   custo de render num card que costuma aparecer quatro vezes por tela. */

function Sparkline({ pontos = [], tom = 'primary' }) {
    if (!Array.isArray(pontos) || pontos.length < 2) return null;

    const min = Math.min(...pontos);
    const max = Math.max(...pontos);
    /* Série constante teria amplitude 0 e dividiria por zero; nesse caso a
       linha é desenhada no meio da caixa. */
    const amplitude = max - min || 1;
    const largura = 100;
    const altura = 28;

    const coords = pontos.map((valor, i) => {
        const x = (i / (pontos.length - 1)) * largura;
        const y = altura - ((valor - min) / amplitude) * (altura - 4) - 2;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    const cor = { primary: 'var(--primary)', success: 'var(--success)',
        danger: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)' }[tom] || 'var(--primary)';

    return (
        <svg className="ui-kpi-spark" viewBox={`0 0 ${largura} ${altura}`}
            preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <polyline points={coords.join(' ')} fill="none" stroke={cor}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

export default function KpiCard({
    label,
    value,
    icon = null,
    tone = 'primary',
    delta = null,          // número: positivo sobe, negativo desce, 0 estável
    deltaSuffix = '%',
    hint = '',
    sparkline = null,      // array de números
    active = false,
    onClick = null,
    className = '',
    ...rest
}) {
    const clicavel = typeof onClick === 'function';
    const direcao = delta === null || delta === undefined
        ? null
        : (delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat'));

    const classes = ['ui-kpi', clicavel ? 'is-clickable' : '', active ? 'is-active' : '', className]
        .filter(Boolean).join(' ');

    /* Card clicável vira botão de verdade para o teclado: sem role e
       onKeyDown ele seria inalcançável por Tab e Enter. */
    const propsInteracao = clicavel ? {
        role: 'button',
        tabIndex: 0,
        'aria-pressed': active,
        onClick,
        onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
        }
    } : {};

    return (
        <article className={classes} {...propsInteracao} {...rest}>
            <div className="ui-kpi-top">
                <span className="ui-kpi-label">{label}</span>
                {icon && <span className={`ui-kpi-icon ${tone}`}>{icon}</span>}
            </div>

            <span className="ui-kpi-value">{value}</span>

            {(direcao || hint) && (
                <div className="ui-kpi-foot">
                    {direcao && (
                        <span className={`ui-kpi-delta ${direcao}`}>
                            <i className={`fas fa-arrow-${direcao === 'up' ? 'up' : direcao === 'down' ? 'down' : 'right'}`}
                                aria-hidden="true"></i>
                            {/* Math.abs porque o sinal já é dado pela seta e pela cor */}
                            {Math.abs(delta)}{deltaSuffix}
                        </span>
                    )}
                    {hint && <span className="ui-kpi-hint">{hint}</span>}
                </div>
            )}

            {sparkline && <Sparkline pontos={sparkline} tom={tone} />}
        </article>
    );
}
