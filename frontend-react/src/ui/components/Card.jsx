export default function Card({ className = '', children, ...props }) {
    return <section className={['ui-card', className].filter(Boolean).join(' ')} {...props}>{children}</section>;
}

export function CardHeader({ className = '', children, ...props }) {
    return <div className={['ui-card-header', className].filter(Boolean).join(' ')} {...props}>{children}</div>;
}

export function CardBody({ className = '', children, ...props }) {
    return <div className={['ui-card-body', className].filter(Boolean).join(' ')} {...props}>{children}</div>;
}

export function CardFooter({ className = '', children, ...props }) {
    return <div className={['ui-card-footer', className].filter(Boolean).join(' ')} {...props}>{children}</div>;
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;
