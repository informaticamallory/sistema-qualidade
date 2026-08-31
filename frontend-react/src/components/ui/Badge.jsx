import './ui.css';

/* Badge do Mallory UI Kit.

   Usa as classes .badge/.badge-* de ui/theme/ui-kit.css, que já trazem os
   fundos -soft dos tokens semânticos. O componente acrescenta o ponto
   indicador opcional e a semântica de acessibilidade.

   tone: 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'default' */
const CLASSES_TOM = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    primary: 'badge-primary',
    default: 'badge-default'
};

export default function Badge({
    tone = 'default',
    dot = false,
    icon = null,
    className = '',
    children,
    ...rest
}) {
    const classes = [
        'badge',
        'ui-badge',
        CLASSES_TOM[tone] || CLASSES_TOM.default,
        className
    ].filter(Boolean).join(' ');

    return (
        <span className={classes} {...rest}>
            {/* aria-hidden: o ponto repete visualmente o que o texto já diz */}
            {dot && <span className="ui-badge-dot" aria-hidden="true" />}
            {icon}
            {children}
        </span>
    );
}
