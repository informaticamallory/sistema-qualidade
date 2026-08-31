import './ui.css';

/* Button do Mallory UI Kit.

   Encapsula as classes .btn/.btn-* que já existem em ui/theme/ui-kit.css em
   vez de recriar o visual — assim um botão do kit e um botão legado da mesma
   variante continuam idênticos. A classe .ui-btn entra só para corrigir o
   estado disabled, que no ui-kit usa opacity .5 e derruba o contraste.

   Sem props de cor ou tamanho em px: variante e tamanho resolvem para
   classes, que leem os tokens. Densidade e tema vêm por CSS.

   variant: 'primary' | 'ghost' | 'danger-soft'
   size:    'md' | 'sm' */
const CLASSES_VARIANTE = {
    primary: 'btn-primary',
    ghost: 'btn-ghost',
    'danger-soft': 'btn-danger-soft'
};

export default function Button({
    variant = 'primary',
    size = 'md',
    type = 'button',
    icon = null,
    iconRight = null,
    disabled = false,
    loading = false,
    className = '',
    children,
    ...rest
}) {
    const classes = [
        'btn',
        'ui-btn',
        CLASSES_VARIANTE[variant] || CLASSES_VARIANTE.primary,
        size === 'sm' ? 'btn-sm' : '',
        loading ? 'btn-loading' : '',
        className
    ].filter(Boolean).join(' ');

    return (
        <button
            type={type}
            className={classes}
            /* aria-disabled além de disabled: leitores de tela anunciam o
               estado mesmo quando o botão continua no fluxo de foco */
            disabled={disabled || loading}
            aria-disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...rest}
        >
            {icon}
            {children}
            {iconRight}
        </button>
    );
}
