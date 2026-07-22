export default function EmptyState({ icon = 'fa-inbox', title, description, action }) {
    return (
        <div className="empty-state">
            <div className="empty-state-icon">
                <i className={`fas ${icon}`}></i>
            </div>
            {title && <h3 className="empty-state-title">{title}</h3>}
            {description && <p className="empty-state-description">{description}</p>}
            {action}
        </div>
    );
}
