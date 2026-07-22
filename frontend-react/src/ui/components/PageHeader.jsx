export default function PageHeader({ icon, title, description, actions }) {
    return (
        <div className="page-header">
            <div className="page-title">
                <h1>
                    {icon && <i className={`fas ${icon}`}></i>}
                    {title}
                </h1>
                {description && <p>{description}</p>}
            </div>
            {actions && (
                <div className="page-actions">
                    {actions}
                </div>
            )}
        </div>
    );
}
