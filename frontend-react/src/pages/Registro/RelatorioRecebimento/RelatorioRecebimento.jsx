import { useState, useEffect, useRef } from 'react';
import Sidebar from '../../../components/Sidebar/Sidebar';
import { relatorioRecebimentoAPI, produtosAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { ColumnToggle } from '../../../ui';
import { upperFields } from '../../../utils/text';
import useColumnVisibility from '../../../hooks/useColumnVisibility';
import '../InspecaoMontagem/InspecaoMontagem.css';
import '../recebimento.css';

const hoje = () => new Date().toISOString().split('T')[0];

const formatarData = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '-'; }
};

const normalizarStatus = (status) => (status || 'pendente').toLowerCase();
const getStatusClass = (status) => ({
    aprovado: 'badge-success',
    pendente: 'badge-warning',
    reprovado: 'badge-danger'
}[normalizarStatus(status)] || 'badge-warning');
const getStatusLabel = (status) => ({
    aprovado: 'Aprovado',
    pendente: 'Pendente',
    reprovado: 'Reprovado'
}[normalizarStatus(status)] || 'Pendente');

// Definição das colunas da tabela. `default: true` => visível por padrão.
// `render(reg)` monta a célula — cabeçalho e corpo saem desta mesma fonte.
const COLUNAS = [
    { key: 'data_entrada', label: 'Data Entrada', default: true, render: (r) => formatarData(r.data_entrada) },
    { key: 'data_inspecao', label: 'Data Inspeção', default: true, render: (r) => formatarData(r.data_inspecao) },
    { key: 'cod_sap', label: 'Código SAP', default: true, render: (r) => r.cod_sap || '-' },
    { key: 'descricao_sap', label: 'Descrição SAP', default: true, render: (r) => r.descricao_sap || '-' },
    { key: 'fornecedor', label: 'Fornecedor', default: true, render: (r) => r.fornecedor || '-' },
    { key: 'qtd_total', label: 'Qtd. Total', default: true, render: (r) => r.qtd_total ?? 0 },
    { key: 'qtd_inspecionada', label: 'Qtd. Insp.', default: false, render: (r) => r.qtd_inspecionada ?? 0 },
    { key: 'qtd_nc', label: 'Qtd. NC', default: false, render: (r) => r.qtd_nc ?? 0 },
    {
        key: 'status_material', label: 'Status Material', default: true,
        render: (r) => (
            <span className={`badge ${getStatusClass(r.status_material)}`}>
                {getStatusLabel(r.status_material)}
            </span>
        )
    },
    { key: 'rastreabilidade', label: 'Rastreabilidade', default: false, render: (r) => r.rastreabilidade || '-' },
    { key: 'documento', label: 'Documento', default: false, render: (r) => r.documento || '-' },
    { key: 'defeito', label: 'Defeito', default: false, render: (r) => r.defeito || '-' },
    { key: 'inspetor', label: 'Inspetor', default: true, render: (r) => r.inspetor || '-' },
    { key: 'nota_fiscal', label: 'Nota Fiscal', default: false, render: (r) => r.nota_fiscal || '-' },
    { key: 'mpn', label: 'MPN', default: false, render: (r) => r.mpn || '-' },
    { key: 'rel', label: 'REL', default: false, render: (r) => r.rel || '-' },
    { key: 'sei', label: 'SEI', default: false, render: (r) => r.sei || '-' },
    { key: 'dev', label: 'DEV', default: false, render: (r) => r.dev || '-' },
    { key: 'lp', label: 'LP', default: false, render: (r) => r.lp || '-' },
    { key: 'liberado_sap', label: 'Liberado no SAP', default: false, render: (r) => r.liberado_sap || '-' },
    { key: 'observacao', label: 'Observação', default: false, render: (r) => r.observacao || '-' }
];

const estadoInicial = () => ({
    data_entrada: hoje(),
    data_inspecao: hoje(),
    cod_sap: '',
    descricao_sap: '',
    fornecedor: '',
    qtd_total: 0,
    qtd_inspecionada: 0,
    qtd_nc: 0,
    status_material: 'pendente',
    rastreabilidade: '',
    documento: '',
    defeito: '',
    inspetor: '',
    nota_fiscal: '',
    mpn: '',
    rel: '',
    sei: '',
    dev: '',
    lp: '',
    liberado_sap: '',
    observacao: ''
});

export default function RelatorioRecebimento() {
    const { user } = useAuth();
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(estadoInicial());
    const [activeTab, setActiveTab] = useState('entrada');
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const searchTimeout = useRef(null);

    useEffect(() => {
        loadRegistros();
    }, [search, statusFilter]);

    const loadRegistros = async () => {
        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;
            if (statusFilter) params.status = statusFilter;
            const response = await relatorioRecebimentoAPI.getAll(params);
            if (response.data.success) setRegistros(response.data.data);
        } catch (error) {
            console.error('Erro ao carregar relatórios de recebimento:', error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({ ...estadoInicial(), inspetor: user?.nome || '' });
        setEditingId(null);
        setActiveTab('entrada');
        setFormViewMode('tabs');
        setProdutoSugestoes([]);
        setShowSugestoes(false);
    };

    const setCampo = (campo, valor) => setFormData((prev) => ({ ...prev, [campo]: valor }));

    const preencherProduto = (produto) => {
        setFormData((prev) => ({
            ...prev,
            cod_sap: produto.cod_material || prev.cod_sap,
            descricao_sap: produto.desc_material || ''
        }));
    };

    const buscarProduto = async (codigo) => {
        const termo = (codigo || '').trim().toUpperCase();
        if (termo.length < 3) return;

        try {
            const response = await produtosAPI.getByCode(termo);
            if (response.data.success && response.data.data) {
                preencherProduto(response.data.data);
            }
        } catch {
            console.log('Produto não encontrado');
        }
    };

    const buscarSugestoes = (termo) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        const busca = (termo || '').trim().toUpperCase();
        if (busca.length < 2) {
            setProdutoSugestoes([]);
            setShowSugestoes(false);
            return;
        }

        searchTimeout.current = setTimeout(async () => {
            try {
                const response = await produtosAPI.search(busca);
                if (response.data.success) {
                    setProdutoSugestoes(response.data.data);
                    setShowSugestoes(true);
                }
            } catch {
                setProdutoSugestoes([]);
                setShowSugestoes(false);
            }
        }, 300);
    };

    const selecionarProduto = (produto) => {
        preencherProduto(produto);
        setProdutoSugestoes([]);
        setShowSugestoes(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const dados = upperFields({
                ...formData,
                inspetor: user?.nome || formData.inspetor || 'Sistema'
            }, [
                'cod_sap', 'descricao_sap', 'fornecedor', 'nota_fiscal', 'rastreabilidade',
                'documento', 'defeito', 'mpn', 'rel', 'sei', 'dev', 'lp'
            ]);
            if (editingId) {
                await relatorioRecebimentoAPI.update(editingId, dados);
            } else {
                await relatorioRecebimentoAPI.create(dados);
            }
            setShowModal(false);
            resetForm();
            loadRegistros();
        } catch (error) {
            console.error('Erro ao salvar relatório de recebimento:', error);
            alert('Erro ao salvar relatório de recebimento');
        }
    };

    const handleEdit = (reg) => {
        setFormData({ ...estadoInicial(), ...reg, data_entrada: reg.data_entrada || hoje(), data_inspecao: reg.data_inspecao || hoje() });
        setEditingId(reg.id);
        setActiveTab('entrada');
        setFormViewMode('tabs');
        setProdutoSugestoes([]);
        setShowSugestoes(false);
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir este relatório?')) {
            try {
                await relatorioRecebimentoAPI.delete(id);
                loadRegistros();
            } catch (error) {
                console.error('Erro ao excluir relatório de recebimento:', error);
                alert('Erro ao excluir relatório de recebimento');
            }
        }
    };

    const tabs = [
        { id: 'entrada', icon: 'fa-truck-ramp-box', label: 'Entrada' },
        { id: 'quantidades', icon: 'fa-boxes-stacked', label: 'Quantidades' },
        { id: 'indicadores', icon: 'fa-chart-simple', label: 'Indicadores' }
    ];

    const { visible, toggle, showAll, showDefaults } = useColumnVisibility('cols:relatorio-recebimento', COLUNAS);
    const colunasVisiveis = COLUNAS.filter((c) => visible[c.key]);

    return (
        <div className="app-container">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-truck-ramp-box"></i> Relatório de Entrada de Matéria-Prima Nacional</h1>
                        <p>Registro de entradas e inspeção de recebimento de matéria-prima</p>
                    </div>
                    <div className="header-actions">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Buscar por SAP, fornecedor, descrição..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select className="form-control" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="">Todos os Status</option>
                            <option value="pendente">Pendente</option>
                            <option value="aprovado">Aprovado</option>
                            <option value="reprovado">Reprovado</option>
                        </select>
                        <ColumnToggle
                            columns={COLUNAS}
                            visible={visible}
                            onToggle={toggle}
                            onShowAll={showAll}
                            onShowDefaults={showDefaults}
                        />
                        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowModal(true); }}>
                            <i className="fas fa-plus"></i> Nova Entrada
                        </button>
                    </div>
                </div>

                <div className="table-card">
                    <div className="table-container ficha-scroll">
                        <table className="table tabela-recebimento">
                            <thead>
                                <tr>
                                    {colunasVisiveis.map((c) => (
                                        <th key={c.key}>{c.label}</th>
                                    ))}
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={colunasVisiveis.length + 1} style={{ textAlign: 'center' }}>Carregando...</td></tr>
                                ) : registros.length === 0 ? (
                                    <tr><td colSpan={colunasVisiveis.length + 1} style={{ textAlign: 'center' }}>Nenhum relatório encontrado</td></tr>
                                ) : (
                                    registros.map((reg) => (
                                        <tr key={reg.id}>
                                            {colunasVisiveis.map((c) => (
                                                <td key={c.key}>{c.render(reg)}</td>
                                            ))}
                                            <td>
                                                <div className="acoes" style={{ display: 'flex', gap: '6px' }}>
                                                    <button className="btn-icon btn-edit" title="Editar" onClick={() => handleEdit(reg)}>
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button className="btn-icon btn-delete" title="Excluir" onClick={() => handleDelete(reg.id)}>
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
                                <h2>{editingId ? 'Editar' : 'Nova'} Entrada de Matéria-Prima</h2>
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
                                    {(formViewMode === 'geral' || activeTab === 'entrada') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Entrada / Inspeção</h3>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Data da Entrada</label>
                                                <input type="date" className="form-control" value={formData.data_entrada}
                                                    onChange={(e) => setCampo('data_entrada', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Data da Inspeção</label>
                                                <input type="date" className="form-control" value={formData.data_inspecao}
                                                    onChange={(e) => setCampo('data_inspecao', e.target.value)} />
                                            </div>
                                            <div className="form-group" style={{ position: 'relative' }}>
                                                <label>Código SAP</label>
                                                <input type="text" className="form-control field-upper" value={formData.cod_sap}
                                                    onChange={(e) => {
                                                        const valor = e.target.value.toUpperCase();
                                                        setCampo('cod_sap', valor);
                                                        buscarSugestoes(valor);
                                                    }}
                                                    onFocus={() => { if (produtoSugestoes.length > 0) setShowSugestoes(true); }}
                                                    onBlur={(e) => { setTimeout(() => setShowSugestoes(false), 150); buscarProduto(e.target.value); }}
                                                    placeholder="Digite para buscar..."
                                                    autoComplete="off" />
                                                {showSugestoes && produtoSugestoes.length > 0 && (
                                                    <ul className="autocomplete-list">
                                                        {produtoSugestoes.map((p) => (
                                                            <li
                                                                key={p.id || p.cod_material}
                                                                className="autocomplete-item"
                                                                onMouseDown={() => selecionarProduto(p)}
                                                            >
                                                                <span className="autocomplete-cod">{p.cod_material}</span>
                                                                <span className="autocomplete-desc">{p.desc_material}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label>Nota Fiscal</label>
                                                <input type="text" className="form-control field-upper" value={formData.nota_fiscal}
                                                    onChange={(e) => setCampo('nota_fiscal', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group" style={{ flex: 2 }}>
                                                <label>Descrição SAP</label>
                                                <input type="text" className="form-control field-upper" value={formData.descricao_sap}
                                                    onChange={(e) => setCampo('descricao_sap', e.target.value)}
                                                    readOnly
                                                    style={{ backgroundColor: 'var(--surface-3)' }} />
                                            </div>
                                            <div className="form-group" style={{ flex: 2 }}>
                                                <label>Fornecedor</label>
                                                <input type="text" className="form-control field-upper" value={formData.fornecedor}
                                                    onChange={(e) => setCampo('fornecedor', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {(formViewMode === 'geral' || activeTab === 'quantidades') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Quantidades e Status</h3>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Qtd. Total</label>
                                                <input type="number" className="form-control" value={formData.qtd_total}
                                                    onChange={(e) => setCampo('qtd_total', parseInt(e.target.value) || 0)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Qtd. Inspecionada</label>
                                                <input type="number" className="form-control" value={formData.qtd_inspecionada}
                                                    onChange={(e) => setCampo('qtd_inspecionada', parseInt(e.target.value) || 0)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Qtd. NC</label>
                                                <input type="number" className="form-control" value={formData.qtd_nc}
                                                    onChange={(e) => setCampo('qtd_nc', parseInt(e.target.value) || 0)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Status Material</label>
                                                <select className="form-control" value={formData.status_material}
                                                    onChange={(e) => setCampo('status_material', e.target.value)}>
                                                    <option value="pendente">Pendente</option>
                                                    <option value="aprovado">Aprovado</option>
                                                    <option value="reprovado">Reprovado</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Rastreabilidade</label>
                                                <input type="text" className="form-control field-upper" value={formData.rastreabilidade}
                                                    onChange={(e) => setCampo('rastreabilidade', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Documento</label>
                                                <input type="text" className="form-control field-upper" value={formData.documento}
                                                    onChange={(e) => setCampo('documento', e.target.value)} />
                                            </div>
                                            <div className="form-group" style={{ flex: 2 }}>
                                                <label>Defeito</label>
                                                <input type="text" className="form-control field-upper" value={formData.defeito}
                                                    onChange={(e) => setCampo('defeito', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {(formViewMode === 'geral' || activeTab === 'indicadores') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Indicadores</h3>
                                        <div className="form-row">
                                            {['mpn', 'rel', 'sei', 'dev', 'lp'].map((campo) => (
                                                <div className="form-group" key={campo}>
                                                    <label>{campo.toUpperCase()}</label>
                                                    <input type="text" className="form-control field-upper" value={formData[campo]}
                                                        onChange={(e) => setCampo(campo, e.target.value)} />
                                                </div>
                                            ))}
                                            <div className="form-group">
                                                <label>Liberado no SAP</label>
                                                <select className="form-control" value={formData.liberado_sap}
                                                    onChange={(e) => setCampo('liberado_sap', e.target.value)}>
                                                    <option value="">--</option>
                                                    <option value="Sim">Sim</option>
                                                    <option value="Não">Não</option>
                                                </select>
                                            </div>
                                        </div>
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

