import { createElement } from 'react';

const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    outline: 'btn-outline',
    ghost: 'btn-ghost',
    success: 'btn-success',
    danger: 'btn-danger',
    dangerSoft: 'btn-danger-soft',
    'danger-soft': 'btn-danger-soft'
};

const sizeClass = {
    sm: 'btn-sm',
    md: '',
    lg: 'btn-lg',
    icon: 'btn-icon'
};

export default function Button({
    as: Component = 'button',
    variant = 'primary',
    size = 'md',
    loading = false,
    className = '',
    children,
    ...props
}) {
    const classes = ['btn', variantClass[variant] || variantClass.primary, sizeClass[size], loading && 'btn-loading', className].filter(Boolean).join(' ');
    const componentProps = {
        className: classes,
        'aria-busy': loading || undefined,
        ...props
    };

    return createElement(Component, componentProps, children);
}
