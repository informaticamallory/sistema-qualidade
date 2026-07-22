import { useState, useEffect, Fragment } from 'react';
import Sidebar from '../../../components/Sidebar/Sidebar';
import { recebimentoAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { toUpper, upperFields } from '../../../utils/text';
import '../InspecaoMontagem/InspecaoMontagem.css';
import '../recebimento.css';

const hoje = () => new Date().toISOString().split('T')[0];
const NUM_AMOSTRAS = 12;

const linhaLoteVazia = () => ({
    lote: '', data_entrada: '', data_saida: '', num_nota_fiscal: '', quant_total: '',
    parecer_c: '', parecer_sc: '', parecer_nc: '', amostragem: '',
    lote_fornecedor: '', inspetor: '', concessao: ''
});
const linhaDimensaoVazia = () => ({ posicao: '', cota: '', instrumento: '', observacoes: '' });
const linhaResultadoVazia = () => ({
    linha: '',
    valores: Array.from({ length: NUM_AMOSTRAS }, () => ({ v: '', d: '' }))
});

const estadoInicial = () => ({
    codigo: '',
    aplicacao: '',
    componente: '',
    setor: '',
    fornecedor: '',
    revisao_desenho: '',
    data_inspecao: hoje(),
    status: 'pendente',
    observacao: '',
    lotes: [linhaLoteVazia()],
    dimensoes: [linhaDimensaoVazia()],
    resultados: [linhaResultadoVazia()]
});

export default function InspecaoRecebimento() {
    const { user } = useAuth();
    const [fichas, setFichas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(estadoInicial());
    const [activeTab, setActiveTab] = useState('identificacao');
    const [formViewMode, setFormViewMode] = useState('tabs');

    useEffect(() => {
        loadFichas();
    }, [search, statusFilter]);

    const loadFichas = async () => {
        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;
            if (statusFilter) params.status = statusFilter;
            const response = await recebimentoAPI.getAll(params);
            if (response.data.success) setFichas(response.data.data);
        } catch (error) {
            console.error('Erro ao carregar fichas de recebimento:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(estadoInicial());
        setEditingId(null);
        setActiveTab('identificacao');
        setFormViewMode('tabs');
    };

    const setCampo = (campo, valor) => setFormData((prev) => ({ ...prev, [campo]: valor }));

    // ---- Lotes ----
    const updateLote = (i, campo, valor) => setFormData((prev) => {
        const lotes = prev.lotes.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l);
        return { ...prev, lotes };
    });
    const addLote = () => setFormData((prev) => ({ ...prev, lotes: [...prev.lotes, linhaLoteVazia()] }));
    const removeLote = (i) => setFormData((prev) => ({ ...prev, lotes: prev.lotes.filter((_, idx) => idx !== i) }));

    // ---- Dimensões ----
    const updateDimensao = (i, campo, valor) => setFormData((prev) => {
        const dimensoes = prev.dimensoes.map((d, idx) => idx === i ? { ...d, [campo]: valor } : d);
        return { ...prev, dimensoes };
    });
    const addDimensao = () => setFormData((prev) => ({ ...prev, dimensoes: [...prev.dimensoes, linhaDimensaoVazia()] }));
    const removeDimensao = (i) => setFormData((prev) => ({ ...prev, dimensoes: prev.dimensoes.filter((_, idx) => idx !== i) }));

    // ---- Resultados (matriz) ----
    const updateResultadoLinha = (i, valor) => setFormData((prev) => {
        const resultados = prev.resultados.map((r, idx) => idx === i ? { ...r, linha: valor } : r);
        return { ...prev, resultados };
    });
    const updateResultadoValor = (rowIdx, colIdx, key, valor) => setFormData((prev) => {
        const resultados = prev.resultados.map((r, idx) => {
            if (idx !== rowIdx) return r;
            const valores = r.valores.map((c, ci) => ci === colIdx ? { ...c, [key]: valor } : c);
            return { ...r, valores };
        });
        return { ...prev, resultados };
    });
    const addResultado = () => setFormData((prev) => ({ ...prev, resultados: [...prev.resultados, linhaResultadoVazia()] }));
    const removeResultado = (i) => setFormData((prev) => ({ ...prev, resultados: prev.resultados.filter((_, idx) => idx !== i) }));

    const normalizarResultados = (resultados) => (resultados || []).map((r) => {
        const valores = Array.from({ length: NUM_AMOSTRAS }, (_, i) => ({
            v: r.valores?.[i]?.v ?? '',
            d: r.valores?.[i]?.d ?? ''
        }));
        return { linha: r.linha || '', valores };
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const dados = {
                ...upperFields(formData, [
                    'codigo', 'aplicacao', 'componente', 'setor', 'fornecedor', 'revisao_desenho'
                ]),
                lotes: (formData.lotes || []).map((lote) => upperFields(lote, [
                    'lote', 'num_nota_fiscal', 'amostragem', 'lote_fornecedor', 'inspetor', 'concessao'
                ])),
                dimensoes: (formData.dimensoes || []).map((dimensao) => upperFields(dimensao, [
                    'posicao', 'cota', 'instrumento'
                ])),
                resultados: normalizarResultados(formData.resultados).map((resultado) => ({
                    ...resultado,
                    linha: toUpper(resultado.linha)
                })),
                inspetor: user?.nome || formData.inspetor || 'Sistema'
            };
            if (editingId) {
                await recebimentoAPI.update(editingId, dados);
            } else {
                await recebimentoAPI.create(dados);
            }
            setShowModal(false);
            resetForm();
            loadFichas();
        } catch (error) {
            console.error('Erro ao salvar ficha de recebimento:', error);
            alert('Erro ao salvar ficha de recebimento');
        }
    };

    const handleEdit = (ficha) => {
        setFormData({
            codigo: ficha.codigo || '',
            aplicacao: ficha.aplicacao || '',
            componente: ficha.componente || '',
            setor: ficha.setor || '',
            fornecedor: ficha.fornecedor || '',
            revisao_desenho: ficha.revisao_desenho || '',
            data_inspecao: ficha.data_inspecao || hoje(),
            status: ficha.status || 'pendente',
            observacao: ficha.observacao || '',
            lotes: ficha.lotes?.length ? ficha.lotes : [linhaLoteVazia()],
            dimensoes: ficha.dimensoes?.length ? ficha.dimensoes : [linhaDimensaoVazia()],
            resultados: ficha.resultados?.length ? normalizarResultados(ficha.resultados) : [linhaResultadoVazia()]
        });
        setEditingId(ficha.id);
        setActiveTab('identificacao');
        setFormViewMode('tabs');
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir esta ficha?')) {
            try {
                await recebimentoAPI.delete(id);
                loadFichas();
            } catch (error) {
                console.error('Erro ao excluir ficha de recebimento:', error);
                alert('Erro ao excluir ficha de recebimento');
            }
        }
    };

    const formatarData = (d) => {
        if (!d) return '-';
        try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '-'; }
    };

    const getStatusClass = (status) => ({
        'aprovado': 'badge-success',
        'pendente': 'badge-warning',
        'reprovado': 'badge-danger'
    }[status?.toLowerCase()] || 'badge-warning');

    const colunasIdentificacao = [
        { id: 'codigo', label: 'Código', upper: true, required: true },
        { id: 'aplicacao', label: 'Aplicação' },
        { id: 'componente', label: 'Componente' },
        { id: 'setor', label: 'Setor' },
        { id: 'fornecedor', label: 'Fornecedor' },
        { id: 'revisao_desenho', label: 'Revisão do Desenho' }
    ];

    const tabs = [
        { id: 'identificacao', icon: 'fa-id-card', label: 'Identificação' },
        { id: 'lotes', icon: 'fa-boxes-stacked', label: 'Lotes' },
        { id: 'dimensoes', icon: 'fa-ruler-combined', label: 'Dimensões' },
        { id: 'resultados', icon: 'fa-table-list', label: 'Resultados' },
        { id: 'observacao', icon: 'fa-comment-dots', label: 'Observação' }
    ];

    return (
        <div className="app-container">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-clipboard-check"></i> Ficha de Inspeção de Recebimento</h1>
                        <p>Inspeção de recebimento de materiais — identificação, lotes, dimensões e resultados</p>
                    </div>
                    <div className="header-actions">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Buscar por código, componente, fornecedor..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">Todos os Status</option>
                            <option value="pendente">Pendente</option>
                            <option value="aprovado">Aprovado</option>
                            <option value="reprovado">Reprovado</option>
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowModal(true); }}>
                            <i className="fas fa-plus"></i> Nova Ficha
                        </button>
                    </div>
                </div>

                <div className="table-card">
                    <div className="table-container">
                        <table className="table tabela-recebimento">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Componente</th>
                                    <th>Fornecedor</th>
                                    <th>Setor</th>
                                    <th>Data Inspeção</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center' }}>Carregando...</td></tr>
                                ) : fichas.length === 0 ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center' }}>Nenhuma ficha encontrada</td></tr>
                                ) : (
                                    fichas.map((f) => (
                                        <tr key={f.id}>
                                            <td>{f.codigo || '-'}</td>
                                            <td>{f.componente || '-'}</td>
                                            <td>{f.fornecedor || '-'}</td>
                                            <td>{f.setor || '-'}</td>
                                            <td>{formatarData(f.data_inspecao)}</td>
                                            <td><span className={`badge ${getStatusClass(f.status)}`}>{f.status || 'pendente'}</span></td>
                                            <td>
                                                <div className="acoes" style={{ display: 'flex', gap: '6px' }}>
                                                    <button className="btn-icon btn-edit" title="Editar" onClick={() => handleEdit(f)}>
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button className="btn-icon btn-delete" title="Excluir" onClick={() => handleDelete(f.id)}>
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Editar' : 'Nova'} Ficha de Inspeção de Recebimento</h2>
                                <button className="modal-close" onClick={() => setShowModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="form-view-switcher">
                                <button
                                    type="button"
                                    className={`view-switch-option ${formViewMode === 'tabs' ? 'active' : ''}`}
                                    onClick={() => setFormViewMode('tabs')}
                                >
                                    <i className="fas fa-layer-group"></i> Abas
                                </button>
                                <button
                                    type="button"
                                    className={`view-switch-option ${formViewMode === 'geral' ? 'active' : ''}`}
                                    onClick={() => setFormViewMode('geral')}
                                >
                                    <i className="fas fa-list-check"></i> Visão geral
                                </button>
                            </div>

                            {formViewMode === 'tabs' && (
                                <div className="tabs-container">
                                    <div className="tabs">
                                        {tabs.map(tab => (
                                            <button
                                                type="button"
                                                key={tab.id}
                                                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                                                onClick={() => setActiveTab(tab.id)}
                                            >
                                                <i className={`fas ${tab.icon}`}></i> {tab.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    <div className="ficha-band">Ficha de Inspeção de Recebimento</div>

                                    {/* Identificação do material */}
                                    {(formViewMode === 'geral' || activeTab === 'identificacao') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                        <h3 className="section-title">Identificação do Material</h3>
                                        <div className="form-row">
                                            {colunasIdentificacao.map((c) => (
                                                <div className="form-group" key={c.id}>
                                                    <label>{c.label}{c.required ? ' *' : ''}</label>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        value={formData[c.id]}
                                                        onChange={(e) => setCampo(c.id, c.upper ? e.target.value.toUpperCase() : e.target.value)}
                                                        required={c.required}
                                                    />
                                                </div>
                                            ))}
                                            <div className="form-group">
                                                <label>Data Inspeção</label>
                                                <input type="date" className="form-control" value={formData.data_inspecao}
                                                    onChange={(e) => setCampo('data_inspecao', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Status</label>
                                                <select className="form-control" value={formData.status}
                                                    onChange={(e) => setCampo('status', e.target.value)}>
                                                    <option value="pendente">Pendente</option>
                                                    <option value="aprovado">Aprovado</option>
                                                    <option value="reprovado">Reprovado</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {/* Lotes / Entrada */}
                                    {(formViewMode === 'geral' || activeTab === 'lotes') && (
                                        <div className="tab-content active">
                                            <div className="form-section ficha-subsection">
                                        <div className="ficha-subsection-title">
                                            <h4>Lotes / Entrada</h4>
                                            <button type="button" className="btn-row-add" onClick={addLote}>
                                                <i className="fas fa-plus"></i> Adicionar lote
                                            </button>
                                        </div>
                                        <div className="ficha-scroll">
                                            <table className="ficha-table">
                                                <thead>
                                                    <tr>
                                                        <th>Lote</th>
                                                        <th>Data Entrada</th>
                                                        <th>Data Saída</th>
                                                        <th>N. Nota Fiscal</th>
                                                        <th>Quant. Total</th>
                                                        <th>C</th>
                                                        <th>SC</th>
                                                        <th>NC</th>
                                                        <th>Amostragem</th>
                                                        <th>Lote Fornecedor</th>
                                                        <th>Inspetor</th>
                                                        <th>Concessão</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {formData.lotes.map((l, i) => (
                                                        <tr key={i}>
                                                            <td><input type="text" className="field-upper" value={l.lote} onChange={(e) => updateLote(i, 'lote', e.target.value)} /></td>
                                                            <td><input type="date" value={l.data_entrada} onChange={(e) => updateLote(i, 'data_entrada', e.target.value)} /></td>
                                                            <td><input type="date" value={l.data_saida} onChange={(e) => updateLote(i, 'data_saida', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.num_nota_fiscal} onChange={(e) => updateLote(i, 'num_nota_fiscal', e.target.value)} /></td>
                                                            <td><input value={l.quant_total} onChange={(e) => updateLote(i, 'quant_total', e.target.value)} /></td>
                                                            <td className="col-num"><input value={l.parecer_c} onChange={(e) => updateLote(i, 'parecer_c', e.target.value)} /></td>
                                                            <td className="col-num"><input value={l.parecer_sc} onChange={(e) => updateLote(i, 'parecer_sc', e.target.value)} /></td>
                                                            <td className="col-num"><input value={l.parecer_nc} onChange={(e) => updateLote(i, 'parecer_nc', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.amostragem} onChange={(e) => updateLote(i, 'amostragem', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.lote_fornecedor} onChange={(e) => updateLote(i, 'lote_fornecedor', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.inspetor} onChange={(e) => updateLote(i, 'inspetor', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.concessao} onChange={(e) => updateLote(i, 'concessao', e.target.value)} /></td>
                                                            <td>
                                                                <button type="button" className="btn-row-del" title="Remover" onClick={() => removeLote(i)} disabled={formData.lotes.length === 1}>
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {/* Dimensões funcionais */}
                                    {(formViewMode === 'geral' || activeTab === 'dimensoes') && (
                                        <div className="tab-content active">
                                            <div className="form-section ficha-subsection">
                                        <div className="ficha-subsection-title">
                                            <h4>Dimensões Funcionais</h4>
                                            <button type="button" className="btn-row-add" onClick={addDimensao}>
                                                <i className="fas fa-plus"></i> Adicionar posição
                                            </button>
                                        </div>
                                        <div className="ficha-scroll">
                                            <table className="ficha-table">
                                                <thead>
                                                    <tr>
                                                        <th>Posição</th>
                                                        <th>Cota</th>
                                                        <th>Instrumento</th>
                                                        <th>Observações</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {formData.dimensoes.map((d, i) => (
                                                        <tr key={i}>
                                                            <td><input type="text" className="field-upper" value={d.posicao} onChange={(e) => updateDimensao(i, 'posicao', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={d.cota} onChange={(e) => updateDimensao(i, 'cota', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={d.instrumento} onChange={(e) => updateDimensao(i, 'instrumento', e.target.value)} /></td>
                                                            <td><input value={d.observacoes} onChange={(e) => updateDimensao(i, 'observacoes', e.target.value)} /></td>
                                                            <td>
                                                                <button type="button" className="btn-row-del" title="Remover" onClick={() => removeDimensao(i)} disabled={formData.dimensoes.length === 1}>
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {/* Resultados (matriz de amostras) */}
                                    {(formViewMode === 'geral' || activeTab === 'resultados') && (
                                        <div className="tab-content active">
                                            <div className="form-section ficha-subsection">
                                        <div className="ficha-subsection-title">
                                            <h4>Resultados</h4>
                                            <button type="button" className="btn-row-add" onClick={addResultado}>
                                                <i className="fas fa-plus"></i> Adicionar linha
                                            </button>
                                        </div>
                                        <div className="ficha-scroll">
                                            <table className="ficha-table">
                                                <thead>
                                                    <tr>
                                                        <th>Lote / Posição</th>
                                                        {Array.from({ length: NUM_AMOSTRAS }, (_, i) => (
                                                            <th key={i} colSpan="2" className="col-num">{i + 1}</th>
                                                        ))}
                                                        <th></th>
                                                    </tr>
                                                    <tr>
                                                        <th></th>
                                                        {Array.from({ length: NUM_AMOSTRAS }, (_, i) => (
                                                            <Fragment key={i}>
                                                                <th className="col-num">Val</th>
                                                                <th className="col-d">D</th>
                                                            </Fragment>
                                                        ))}
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {formData.resultados.map((r, rowIdx) => (
                                                        <tr key={rowIdx}>
                                                            <td><input type="text" className="field-upper" value={r.linha} onChange={(e) => updateResultadoLinha(rowIdx, e.target.value)} placeholder="Ex: Lote 1" /></td>
                                                            {r.valores.map((c, colIdx) => (
                                                                <Fragment key={colIdx}>
                                                                    <td className="col-num">
                                                                        <input value={c.v} onChange={(e) => updateResultadoValor(rowIdx, colIdx, 'v', e.target.value)} />
                                                                    </td>
                                                                    <td className="col-d">
                                                                        <input value={c.d} onChange={(e) => updateResultadoValor(rowIdx, colIdx, 'd', e.target.value)} />
                                                                    </td>
                                                                </Fragment>
                                                            ))}
                                                            <td>
                                                                <button type="button" className="btn-row-del" title="Remover" onClick={() => removeResultado(rowIdx)} disabled={formData.resultados.length === 1}>
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {/* Observação */}
                                    {(formViewMode === 'geral' || activeTab === 'observacao') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Observação</h3>
                                                <div className="form-group">
                                                    <label>Observação</label>
                                        <textarea className="form-control" rows="2" value={formData.observacao}
                                            onChange={(e) => setCampo('observacao', e.target.value)}></textarea>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-save"></i> {editingId ? 'Atualizar' : 'Salvar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
