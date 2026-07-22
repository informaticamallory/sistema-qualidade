import Card from './Card';
import EmptyState from './EmptyState';

export default function ChartCard({
    title,
    icon,
    loading = false,
    error = null,
    empty = false,
    emptyMessage = 'Sem dados para exibir',
    children
}) {
    return (
        <Card className="chart-card">
            <div className="chart-header">
                <h3 className="chart-title">{icon && <i className={`fas ${icon}`}></i>} {title}</h3>
            </div>
            <div className="chart-container">
                {loading && <EmptyState icon="fa-spinner" title="Carregando gráfico..." />}
                {!loading && error && <EmptyState icon="fa-plug-circle-xmark" title={error} />}
                {!loading && !error && empty && <EmptyState icon="fa-chart-pie" title={emptyMessage} />}
                {!loading && !error && !empty && children}
            </div>
        </Card>
    );
}
