import './ui.css';

/* Tabela do Mallory UI Kit.

   Reaproveita .table/.table-card/.table-container do ui-kit (que já traz o
   scroll horizontal) e acrescenta o cabeçalho em caixa alta, o indicador de
   prioridade na lateral e o estado vazio centralizado.

   Chama-se DataTable e não Table para não competir com a classe .table nem
   com as tabelas já escritas à mão nas páginas — as duas coexistem.

   columns: [{ key, header, align?, width?, mono?, render? }]
   rows:    array de objetos
   priority: (row) => 'alta' | 'media' | 'baixa' | 'info' | null */
export default function DataTable({
    columns = [],
    rows = [],
    loading = false,
    emptyMessage = 'Nenhum registro encontrado',
    rowKey = (row, i) => row.id ?? i,
    priority = null,
    onRowClick = null,
    className = '',
    wrapped = true
}) {
    const clicavel = typeof onRowClick === 'function';

    const tabela = (
        <table className={['table', className].filter(Boolean).join(' ')}>
            <thead>
                <tr>
                    {columns.map((col) => (
                        <th key={col.key}
                            className="ui-table-head-cell"
                            style={{ textAlign: col.align || 'left', width: col.width }}>
                            {col.header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {loading ? (
                    <tr>
                        <td colSpan={columns.length}>
                            <div className="loading">
                                <div className="loading-spinner"></div>
                                <p>Carregando...</p>
                            </div>
                        </td>
                    </tr>
                ) : rows.length === 0 ? (
                    <tr>
                        <td colSpan={columns.length} className="ui-table-empty">{emptyMessage}</td>
                    </tr>
                ) : (
                    rows.map((row, i) => (
                        <tr
                            key={rowKey(row, i)}
                            className="ui-table-row"
                            /* data-priority pinta a faixa lateral via CSS; sem
                               prioridade o atributo nem entra no DOM */
                            data-priority={priority ? (priority(row) || undefined) : undefined}
                            onClick={clicavel ? () => onRowClick(row) : undefined}
                            style={clicavel ? { cursor: 'pointer' } : undefined}
                        >
                            {columns.map((col) => (
                                <td key={col.key}
                                    className={col.mono ? 'tnum' : undefined}
                                    style={{
                                        textAlign: col.align || 'left',
                                        fontFamily: col.mono ? 'var(--font-mono)' : undefined
                                    }}>
                                    {col.render ? col.render(row) : row[col.key]}
                                </td>
                            ))}
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    );

    if (!wrapped) return tabela;

    return (
        <div className="table-card">
            <div className="table-container">{tabela}</div>
        </div>
    );
}
