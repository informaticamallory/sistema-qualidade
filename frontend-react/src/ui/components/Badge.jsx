const variantClass = {
    default: 'badge-default',
    primary: 'badge-primary',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    vencendo: 'badge-vencendo',
    yellow: 'badge-yellow'
};

export default function Badge({ variant = 'primary', tone, dot = false, className = '', children, ...props }) {
    const selectedVariant = tone || variant;
    const classes = ['badge', variantClass[selectedVariant] || variantClass.primary, dot && 'badge-dot', className].filter(Boolean).join(' ');
    return <span className={classes} {...props}>{children}</span>;
}
