import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '../../../components/Sidebar/Sidebar';
import { injecaoAPI, produtosAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { formatarTurno, normalizarTurno } from '../../../utils/turnos';
import { upperFields } from '../../../utils/text';
// Reaproveita os estilos de modal/formulário/tabela da Inspeção de Montagem
import '../InspecaoMontagem/InspecaoMontagem.css';
import './InspecaoInjecao.css';

const conformeOpcoes = [
    { value: 'C', label: 'C — Conforme' },
    { value: 'NC', label: 'NC — Não Conforme' },
    { value: 'NA', label: 'N/A' }
];

const todayISO = () => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().split('T')[0];
};

const getWeekFromDate = (value = todayISO()) => {
    const [year, month, day] = String(value || '').split('-').map(Number);
    if (!year || !month || !day) return '';

    const date = new Date(Date.UTC(year, month - 1, day));
    const dayNumber = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNumber);

    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return String(Math.ceil((((date - yearStart) / 86400000) + 1) / 7));
};

const estadoInicial = {
    data: todayISO(),
    semana: getWeekFromDate(),
    turno_injecao: '',
    maquina: '',
    cod: '',
    peca: '',
    molde: '',
    amostra_insp: 0,
    amostra_nc: 0,
    qtde_lote: 0,
    status: 'pendente',
    defeito: '',
    cota1: '',
    cota2: '',
    cota3: '',
    cota4: '',
    peso: '',
    visual: 'C',
    cor_padrao: 'C',
    encaixe: 'C',
    contra_peca: 'C',
    rebarbas: 'C',
    funcional: 'C',
    observacao: ''
};

export default function InspecaoInjecao() {
    const { user } = useAuth();
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(estadoInicial);
    const [activeTab, setActiveTab] = useState('dados-injecao');
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [sheetData, setSheetData] = useState(null);

    // Autocomplete de produtos (campo Cód.)
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const [sugestaoAtivaIndex, setSugestaoAtivaIndex] = useState(-1);
    const searchTimeout = useRef(null);

    // Visualização (somente leitura)
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewData, setViewData] = useState(null);

    useEffect(() => {
        loadRegistros();
    }, [search, statusFilter]);

    useEffect(() => {
        if (!sheetData) return;

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setSheetData(null);
            }
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [sheetData]);

    const loadRegistros = async () => {
        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;
            if (statusFilter) params.status = statusFilter;

            const response = await injecaoAPI.getAll(params);
            if (response.data.success) {
                setRegistros(response.data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar inspeções de injeção:', error);
        } finally {
            setLoading(false);
        }
    };

    const openMobileActions = (registro) => {
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
            setSheetData((current) => (
                current?.id === registro.id
                    ? null
                    : { id: registro.id, label: registro.cod || registro.peca || 'Registro selecionado' }
            ));
        }
    };

    const resetForm = () => {
        const data = todayISO();
        setFormData({ ...estadoInicial, data, semana: getWeekFromDate(data), inspetor: user?.nome || '' });
        setEditingId(null);
        setActiveTab('dados-injecao');
        setFormViewMode('tabs');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const isReprovado = String(formData.status || '').toLowerCase() === 'reprovado';
            const payload = {
                ...formData,
                defeito: isReprovado ? formData.defeito : '',
                status: formData.status?.toUpperCase(),
                inspetor: user?.nome || formData.inspetor || 'Sistema'
            };
            const dados = upperFields(payload, [
                'semana', 'maquina', 'cod', 'peca', 'molde', 'cota1', 'cota2', 'cota3', 'cota4', 'defeito'
            ]);

            if (editingId) {
                await injecaoAPI.update(editingId, dados);
            } else {
                await injecaoAPI.create(dados);
            }
            setShowModal(false);
            resetForm();
            loadRegistros();
        } catch (error) {
            console.error('Erro ao salvar inspeção de injeção:', error);
            alert('Erro ao salvar inspeção de injeção');
        }
    };

    const handleEdit = (registro) => {
        const data = registro.data || todayISO();

        setFormData({
            data,
            semana: registro.semana || getWeekFromDate(data),
            turno_injecao: normalizarTurno(registro.turno_injecao),
            maquina: registro.maquina || '',
            cod: registro.cod || '',
            peca: registro.peca || '',
            molde: registro.molde || '',
            amostra_insp: registro.amostra_insp || 0,
            amostra_nc: registro.amostra_nc || 0,
            qtde_lote: registro.qtde_lote || 0,
            status: registro.status || 'pendente',
            defeito: registro.defeito || '',
            cota1: registro.cota1 || '',
            cota2: registro.cota2 || '',
            cota3: registro.cota3 || '',
            cota4: registro.cota4 || '',
            peso: registro.peso || '',
            visual: registro.visual || 'C',
            cor_padrao: registro.cor_padrao || 'C',
            encaixe: registro.encaixe || 'C',
            contra_peca: registro.contra_peca || 'C',
            rebarbas: registro.rebarbas || 'C',
            funcional: registro.funcional || 'C',
            observacao: registro.observacao || ''
        });
        setEditingId(registro.id);
        setActiveTab('dados-injecao');
        setFormViewMode('tabs');
        setShowModal(true);
    };

    const handleView = (reg) => {
        setViewData(reg);
        setShowViewModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir esta inspeção?')) {
            try {
                await injecaoAPI.delete(id);
                loadRegistros();
            } catch (error) {
                console.error('Erro ao excluir inspeção de injeção:', error);
                alert('Erro ao excluir inspeção de injeção');
            }
        }
    };

    const formatarData = (dataString) => {
        if (!dataString) return 'N/A';
        try {
            return new Date(dataString).toLocaleDateString('pt-BR');
        } catch {
            return 'N/A';
        }
    };

    const getStatusClass = (status) => {
        const classes = {
            'aprovado': 'badge-success',
            'pendente': 'badge-warning',
            'reprovado': 'badge-danger'
        };
        return classes[status?.toLowerCase()] || 'badge-warning';
    };

    const formatarStatus = (status) => String(status || 'pendente').toUpperCase();

    const setCampo = (campo, valor) => setFormData((prev) => {
        if (campo === 'status' && String(valor || '').toLowerCase() !== 'reprovado') {
            return { ...prev, status: valor, defeito: '' };
        }

        return { ...prev, [campo]: valor };
    });

    // Busca incremental (debounce) de produtos pelo código digitado
    const buscarSugestoes = (termo) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        if (!termo || termo.length < 2) {
            setProdutoSugestoes([]);
            setShowSugestoes(false);
            setSugestaoAtivaIndex(-1);
            return;
        }

        searchTimeout.current = setTimeout(async () => {
            try {
                const response = await produtosAPI.search(termo);
                if (response.data.success) {
                    const sugestoes = response.data.data || [];
                    setProdutoSugestoes(sugestoes);
                    setShowSugestoes(sugestoes.length > 0);
                    setSugestaoAtivaIndex(sugestoes.length > 0 ? 0 : -1);
                }
            } catch {
                setProdutoSugestoes([]);
                setShowSugestoes(false);
                setSugestaoAtivaIndex(-1);
            }
        }, 300);
    };

    // Preenche Cód. e Peça (descrição) ao escolher um produto da lista
    const selecionarProduto = (produto) => {
        setFormData((prev) => ({
            ...prev,
            cod: produto.cod_material || '',
            peca: produto.desc_material || ''
        }));
        setShowSugestoes(false);
        setProdutoSugestoes([]);
        setSugestaoAtivaIndex(-1);
    };

    const handleCodigoKeyDown = (event) => {
        if (event.key === 'Escape') {
            setShowSugestoes(false);
            setSugestaoAtivaIndex(-1);
            return;
        }

        if (produtoSugestoes.length === 0) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setShowSugestoes(true);
            setSugestaoAtivaIndex((prev) => (
                prev < 0 ? 0 : (prev + 1) % produtoSugestoes.length
            ));
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setShowSugestoes(true);
            setSugestaoAtivaIndex((prev) => (
                prev <= 0 ? produtoSugestoes.length - 1 : prev - 1
            ));
            return;
        }

        if (event.key === 'Enter' && showSugestoes && sugestaoAtivaIndex >= 0) {
            event.preventDefault();
            selecionarProduto(produtoSugestoes[sugestaoAtivaIndex]);
        }
    };

    // Busca por código exato ao sair do campo
    const buscarProdutoPorCodigo = async (codigo) => {
        if (!codigo || codigo.length < 3) return;
        try {
            const response = await produtosAPI.getByCode(codigo);
            if (response.data.success && response.data.data) {
                const produto = response.data.data;
                setFormData((prev) => ({
                    ...prev,
                    cod: produto.cod_material || prev.cod,
                    peca: produto.desc_material || prev.peca
                }));
            }
        } catch {
            console.log('Produto não encontrado');
        }
    };

    // Campos de avaliação Conforme/Não Conforme renderizados como select
    const camposAvaliacao = [
        { id: 'visual', label: 'Visual' },
        { id: 'cor_padrao', label: 'Cor Padrão' },
        { id: 'encaixe', label: 'Encaixe' },
        { id: 'contra_peca', label: 'Contra Peça' },
        { id: 'rebarbas', label: 'Rebarbas' },
        { id: 'funcional', label: 'Funcional' }
    ];

    const tabs = [
        { id: 'dados-injecao', icon: 'fa-industry', label: 'Dados' },
        { id: 'cotas', icon: 'fa-ruler-combined', label: 'Cotas' },
        { id: 'avaliacao', icon: 'fa-clipboard-check', label: 'Avaliação' }
    ];

    const sheetRegistro = sheetData ? registros.find((registro) => registro.id === sheetData.id) : null;

    return (
        <div className="app-container">
            <Sidebar />

            <main className="main-content">
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-cubes"></i> Inspeção de peças plasticas</h1>
                        <p>Acompanhamento de inspeção — Injeção</p>
                    </div>
                    <div className="header-actions">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Buscar por código, peça, máquina..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select
                            className="form-control"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="">Todos os Status</option>
                            <option value="pendente">Pendente</option>
                            <option value="aprovado">Aprovado</option>
                            <option value="reprovado">Reprovado</option>
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowModal(true); }}>
                            <i className="fas fa-plus"></i> Novo Registro
                        </button>
                    </div>
                </div>

                {/* Tabela */}
                <div className="table-card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th className="col-semana">Sem.</th>
                                    <th>Turno</th>
                                    <th>Máquina</th>
                                    <th>Cód.</th>
                                    <th>Peça</th>
                                    <th>Molde</th>
                                    <th className="col-hide">Amostra Insp.</th>
                                    <th className="col-hide">Amostra NC</th>
                                    <th className="col-quantidade">Qtde Lote</th>
                                    <th>STATUS</th>
                                    <th className="actions-column col-acoes">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="12" style={{ textAlign: 'center' }}>Carregando...</td></tr>
                                ) : registros.length === 0 ? (
                                    <tr><td colSpan="12" style={{ textAlign: 'center' }}>Nenhuma inspeção encontrada</td></tr>
                                ) : (
                                    registros.map((reg) => (
                                        <tr
                                            key={reg.id}
                                            className={`mobile-clickable-row ${sheetData?.id === reg.id ? 'mobile-row-active' : ''}`}
                                            onClick={() => openMobileActions(reg)}
                                        >
                                            <td>{formatarData(reg.data)}</td>
                                            <td className="col-semana">{reg.semana || '-'}</td>
                                            <td>{formatarTurno(reg.turno_injecao)}</td>
                                            <td>{reg.maquina || '-'}</td>
                                            <td>{reg.cod || '-'}</td>
                                            <td>{reg.peca || '-'}</td>
                                            <td>{reg.molde || '-'}</td>
                                            <td className="col-hide">{reg.amostra_insp ?? 0}</td>
                                            <td className="col-hide">{reg.amostra_nc ?? 0}</td>
                                            <td>{reg.qtde_lote ?? 0}</td>
                                            <td><span className={`badge ${getStatusClass(reg.status)}`}>{formatarStatus(reg.status)}</span></td>
                                            <td className="actions-column col-acoes">
                                                <div className="acoes">
                                                    <button className="btn-icon btn-view" title="Visualizar" onClick={(e) => { e.stopPropagation(); handleView(reg); }}>
                                                        <i className="fas fa-eye"></i>
                                                    </button>
                                                    <button className="btn-icon btn-edit" title="Editar" onClick={(e) => { e.stopPropagation(); handleEdit(reg); }}>
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button className="btn-icon btn-delete" title="Excluir" onClick={(e) => { e.stopPropagation(); handleDelete(reg.id); }}>
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

                {/* Modal de cadastro/edição */}
                {showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Editar' : 'Novo'} Registro de Injeção</h2>
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
                                    {/* Dados de Injeção */}
                                    {(formViewMode === 'geral' || activeTab === 'dados-injecao') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Dados de Injeção</h3>
                                                <div className="form-row-injecao-row1">
                                                    <div className="form-group form-group-date">
                                                        <label>Data *</label>
                                                        <input type="date" className="form-control" value={formData.data}
                                                            onChange={(e) => {
                                                                const data = e.target.value;
                                                                setFormData((prev) => ({ ...prev, data, semana: getWeekFromDate(data) }));
                                                            }} required />
                                                    </div>
                                                    <div className="form-group form-group-week">
                                                        <label>Semana</label>
                                                        <input type="text" className="form-control field-upper" value={formData.semana}
                                                            onChange={(e) => setCampo('semana', e.target.value)} />
                                                    </div>
                                                    <div className="form-group form-group-turno">
                                                        <label>Turno de Injeção</label>
                                                        <select className="form-control" value={formData.turno_injecao}
                                                            onChange={(e) => setCampo('turno_injecao', e.target.value)}>
                                                            <option value="">--</option>
                                                            <option value="A">Turno A</option>
                                                            <option value="B">Turno B</option>
                                                            <option value="C">Turno C</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group form-group-machine">
                                                        <label>Máquina</label>
                                                        <input type="text" className="form-control field-upper" value={formData.maquina}
                                                            onChange={(e) => setCampo('maquina', e.target.value)} placeholder="Ex: GD 05" />
                                                    </div>
                                                </div>

                                                <div className="form-row-injecao-row2">
                                                    <div className="form-group form-group-code" style={{ position: 'relative' }}>
                                                        <label>Cód. *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.cod}
                                                            onChange={(e) => {
                                                                const valor = e.target.value.toUpperCase();
                                                                setCampo('cod', valor);
                                                                buscarSugestoes(valor);
                                                            }}
                                                            onFocus={() => { if (produtoSugestoes.length > 0) { setShowSugestoes(true); setSugestaoAtivaIndex((prev) => (prev >= 0 ? prev : 0)); } }}
                                                            onBlur={(e) => { setTimeout(() => setShowSugestoes(false), 150); buscarProdutoPorCodigo(e.target.value); }}
                                                            onKeyDown={handleCodigoKeyDown}
                                                            placeholder="Digite para buscar..."
                                                            autoComplete="off"
                                                            required
                                                        />
                                                        {showSugestoes && produtoSugestoes.length > 0 && (
                                                            <ul className="autocomplete-list" role="listbox">
                                                                {produtoSugestoes.map((p, index) => (
                                                                    <li
                                                                        key={p.id}
                                                                        className={`autocomplete-item ${index === sugestaoAtivaIndex ? 'active' : ''}`}
                                                                        role="option"
                                                                        aria-selected={index === sugestaoAtivaIndex}
                                                                        onMouseEnter={() => setSugestaoAtivaIndex(index)}
                                                                        onMouseDown={() => selecionarProduto(p)}
                                                                    >
                                                                        <span className="autocomplete-cod">{p.cod_material}</span>
                                                                        <span className="autocomplete-desc">{p.desc_material}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                    <div className="form-group" style={{ flex: 2 }}>
                                                        <label>Peça</label>
                                                        <input type="text" className="form-control field-upper" value={formData.peca}
                                                            readOnly style={{ backgroundColor: 'var(--surface-3)' }} placeholder="Descrição da peça" />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Molde</label>
                                                        <input type="text" className="form-control field-upper" value={formData.molde}
                                                            onChange={(e) => setCampo('molde', e.target.value)} />
                                                    </div>
                                                </div>

                                                <div className="form-row form-row-compact form-row-numeric">
                                                    <div className="form-group form-group-number">
                                                        <label>Amostra Insp.</label>
                                                        <input type="number" className="form-control" value={formData.amostra_insp}
                                                            onChange={(e) => setCampo('amostra_insp', parseInt(e.target.value) || 0)} />
                                                    </div>
                                                    <div className="form-group form-group-number">
                                                        <label>Amostra NC</label>
                                                        <input type="number" className="form-control" value={formData.amostra_nc}
                                                            onChange={(e) => setCampo('amostra_nc', parseInt(e.target.value) || 0)} />
                                                    </div>
                                                    <div className="form-group form-group-number">
                                                        <label>Qtde Lote</label>
                                                        <input type="number" className="form-control" value={formData.qtde_lote}
                                                            onChange={(e) => setCampo('qtde_lote', parseInt(e.target.value) || 0)} />
                                                    </div>
                                                    <div className="form-group form-group-number">
                                                        <label>Peso (Kg)</label>
                                                        <input type="text" className="form-control" value={formData.peso}
                                                            onChange={(e) => setCampo('peso', e.target.value)} placeholder="Ex: 0,250" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Cotas Críticas */}
                                    {(formViewMode === 'geral' || activeTab === 'cotas') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Cotas Críticas</h3>
                                                <div className="form-row form-row-compact form-row-cotas">
                                                    {['cota1', 'cota2', 'cota3', 'cota4'].map((cota, i) => (
                                                        <div className="form-group form-group-cota" key={cota}>
                                                            <label>{`Cota ${i + 1}`}</label>
                                                            <input type="text" className="form-control field-upper" value={formData[cota]}
                                                                onChange={(e) => setCampo(cota, e.target.value)} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Avaliação */}
                                    {(formViewMode === 'geral' || activeTab === 'avaliacao') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                        <h3 className="section-title">Avaliação</h3>
                                        <div className="avaliacao-grid">
                                            {camposAvaliacao.map((campo) => (
                                                <div className="form-group" key={campo.id}>
                                                    <label>{campo.label}</label>
                                                    <select className="form-control" value={formData[campo.id]}
                                                        onChange={(e) => setCampo(campo.id, e.target.value)}>
                                                        {conformeOpcoes.map((op) => (
                                                            <option key={op.value} value={op.value}>{op.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Status</label>
                                                <select className="form-control" value={formData.status}
                                                    onChange={(e) => setCampo('status', e.target.value)}>
                                                    <option value="pendente">Pendente</option>
                                                    <option value="aprovado">Aprovado</option>
                                                    <option value="reprovado">Reprovado</option>
                                                </select>
                                            </div>
                                            {String(formData.status || '').toLowerCase() === 'reprovado' && (
                                                <div className="form-group" style={{ flex: 2 }}>
                                                    <label>Defeito</label>
                                                    <input type="text" className="form-control field-upper" value={formData.defeito}
                                                        onChange={(e) => setCampo('defeito', e.target.value)} placeholder="Descreva o defeito, se houver" />
                                                </div>
                                            )}
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
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-save"></i> {editingId ? 'Atualizar' : 'Salvar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Modal de visualização (somente leitura) */}
                {showViewModal && viewData && (
                    <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
                        <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Detalhes da Inspeção de Injeção</h2>
                                <button className="modal-close" onClick={() => setShowViewModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="view-grid">
                                    <div className="view-item"><span className="view-label">Data:</span><span className="view-value">{formatarData(viewData.data)}</span></div>
                                    <div className="view-item"><span className="view-label">Semana:</span><span className="view-value">{viewData.semana || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Turno de Injeção:</span><span className="view-value">{formatarTurno(viewData.turno_injecao, 'N/A')}</span></div>
                                    <div className="view-item"><span className="view-label">Máquina:</span><span className="view-value">{viewData.maquina || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Cód.:</span><span className="view-value">{viewData.cod || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Peça:</span><span className="view-value">{viewData.peca || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Molde:</span><span className="view-value">{viewData.molde || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Amostra Insp.:</span><span className="view-value">{viewData.amostra_insp ?? 0}</span></div>
                                    <div className="view-item"><span className="view-label">Amostra NC:</span><span className="view-value">{viewData.amostra_nc ?? 0}</span></div>
                                    <div className="view-item"><span className="view-label">Qtde Lote:</span><span className="view-value">{viewData.qtde_lote ?? 0}</span></div>
                                    <div className="view-item"><span className="view-label">Peso (Kg):</span><span className="view-value">{viewData.peso || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Status:</span><span className={`badge ${getStatusClass(viewData.status)}`}>{formatarStatus(viewData.status)}</span></div>
                                    {String(viewData.status || '').toLowerCase() === 'reprovado' && (
                                        <div className="view-item"><span className="view-label">Defeito:</span><span className="view-value">{viewData.defeito || 'N/A'}</span></div>
                                    )}
                                </div>

                                <div className="view-section">
                                    <h4>Cotas Críticas:</h4>
                                    <div className="view-grid">
                                        <div className="view-item"><span className="view-label">Cota 1:</span><span className="view-value">{viewData.cota1 || '-'}</span></div>
                                        <div className="view-item"><span className="view-label">Cota 2:</span><span className="view-value">{viewData.cota2 || '-'}</span></div>
                                        <div className="view-item"><span className="view-label">Cota 3:</span><span className="view-value">{viewData.cota3 || '-'}</span></div>
                                        <div className="view-item"><span className="view-label">Cota 4:</span><span className="view-value">{viewData.cota4 || '-'}</span></div>
                                    </div>
                                </div>

                                <div className="view-section">
                                    <h4>Avaliação:</h4>
                                    <div className="view-grid">
                                        {camposAvaliacao.map((c) => (
                                            <div className="view-item" key={c.id}>
                                                <span className="view-label">{c.label}:</span>
                                                <span className="view-value">{viewData[c.id] || '-'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {viewData.observacao && (
                                    <div className="view-section">
                                        <h4>Observação:</h4>
                                        <p>{viewData.observacao}</p>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowViewModal(false)}>Fechar</button>
                                <button className="btn btn-primary" onClick={() => { setShowViewModal(false); handleEdit(viewData); }}>
                                    <i className="fas fa-edit"></i> Editar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {typeof document !== 'undefined' && createPortal(
                    <div className={`mobile-action-sheet ${sheetRegistro ? 'open' : ''}`}>
                        <div className="mobile-action-sheet-backdrop" onClick={() => setSheetData(null)} />
                        <div className="mobile-action-sheet-panel">
                            <div className="mobile-action-sheet-handle" />
                            <p className="mobile-action-sheet-title">{sheetData?.label || 'Registro selecionado'}</p>
                            {sheetRegistro && (
                                <div className="mobile-action-sheet-buttons">
                                    <button type="button" className="btn btn-view" onClick={() => { setSheetData(null); handleView(sheetRegistro); }}>
                                        <i className="fas fa-eye"></i>
                                        <span>Ver</span>
                                    </button>
                                    <button type="button" className="btn btn-edit" onClick={() => { setSheetData(null); handleEdit(sheetRegistro); }}>
                                        <i className="fas fa-edit"></i>
                                        <span>Editar</span>
                                    </button>
                                    <button type="button" className="btn btn-delete" onClick={() => { setSheetData(null); handleDelete(sheetRegistro.id); }}>
                                        <i className="fas fa-trash"></i>
                                        <span>Excluir</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
            </main>
        </div>
    );
}
