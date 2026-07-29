import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '../../components/Sidebar/Sidebar';
import { cartoesAPI, produtosAPI } from '../../services/api';
import { upperFields } from '../../utils/text';
import { useAuth } from '../../context/auth-context';
import './Cartoes.css';

export default function Cartoes() {
    const { user } = useAuth();
    const [cartoes, setCartoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [printData, setPrintData] = useState(null);
    const [sheetData, setSheetData] = useState(null);
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const [produtoStatus, setProdutoStatus] = useState(null);
    const searchTimeout = useRef(null);
    const [formData, setFormData] = useState({
        codigo_produto: '',
        nome_produto: '',
        origem: '',
        setor: '',
        turno: '',
        qtd_conforme: 0,
        qtd_nao_conforme: 0,
        status: '',
        documento_reprovacao: '',
        descricao: '',
        observacoes: '',
        responsavel: ''
    });

    useEffect(() => {
        loadCartoes();
    }, [search]);

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

    useEffect(() => () => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
    }, []);
    const loadCartoes = async () => {
        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;

            const response = await cartoesAPI.getAll(params);
            if (response.data.success) {
                setCartoes(response.data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar cartões:', error);
        } finally {
            setLoading(false);
        }
    };

    const normalizarCodigoProduto = (codigo) => (codigo || '').trim().toUpperCase();

    const aplicarProduto = (produto, codigoDigitado = '') => {
        const codigo = normalizarCodigoProduto(produto?.cod_material || codigoDigitado);
        const descricao = produto?.desc_material || '';

        setFormData(prev => ({
            ...prev,
            codigo_produto: codigo || prev.codigo_produto,
            descricao,
            nome_produto: descricao || codigo || prev.nome_produto
        }));
        setProdutoStatus({
            type: 'success',
            message: `Produto localizado${codigo ? `: ${codigo}` : ''}${descricao ? ` - ${descricao}` : ''}`
        });
    };

    const buscarProduto = async (codigo, { showFeedback = true } = {}) => {
        const codigoNormalizado = normalizarCodigoProduto(codigo);
        if (codigoNormalizado.length < 3) return null;

        if (showFeedback) {
            setProdutoStatus({ type: 'loading', message: 'Buscando produto...' });
        }

        try {
            const response = await produtosAPI.getByCode(codigoNormalizado);
            if (response.data.success && response.data.data) {
                aplicarProduto(response.data.data, codigoNormalizado);
                setProdutoSugestoes([]);
                setShowSugestoes(false);
                return response.data.data;
            }
        } catch {
            if (showFeedback) {
                setProdutoStatus({ type: 'error', message: 'Produto não encontrado para este código.' });
            }
        }

        return null;
    };

    const buscarSugestoes = (termo) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        const busca = normalizarCodigoProduto(termo);
        if (busca.length < 2) {
            setProdutoSugestoes([]);
            setShowSugestoes(false);
            setProdutoStatus(null);
            return;
        }

        setProdutoStatus({ type: 'loading', message: 'Buscando produto...' });
        searchTimeout.current = setTimeout(async () => {
            try {
                const produtoExato = await buscarProduto(busca, { showFeedback: false });
                if (produtoExato) return;

                const response = await produtosAPI.search(busca);
                const sugestoes = response.data.success ? (response.data.data || []) : [];
                const produtoIgual = sugestoes.find((produto) => normalizarCodigoProduto(produto.cod_material) === busca);

                if (produtoIgual) {
                    aplicarProduto(produtoIgual, busca);
                    setProdutoSugestoes([]);
                    setShowSugestoes(false);
                    return;
                }

                setProdutoSugestoes(sugestoes);
                setShowSugestoes(sugestoes.length > 0);
                setProdutoStatus(
                    sugestoes.length > 0
                        ? null
                        : { type: 'error', message: 'Nenhum produto encontrado para este código.' }
                );
            } catch {
                setProdutoSugestoes([]);
                setShowSugestoes(false);
                setProdutoStatus({ type: 'error', message: 'Produto não encontrado para este código.' });
            }
        }, 300);
    };

    const handleCodigoProdutoChange = (event) => {
        const codigo = normalizarCodigoProduto(event.target.value);
        setFormData(prev => ({
            ...prev,
            codigo_produto: codigo,
            nome_produto: codigo,
            descricao: ''
        }));
        buscarSugestoes(codigo);
    };

    const selecionarProduto = (produto) => {
        aplicarProduto(produto, produto?.cod_material);
        setProdutoSugestoes([]);
        setShowSugestoes(false);
    };
    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validações
        if ((formData.status || '').toUpperCase() === 'REPROVADO' && !formData.documento_reprovacao) {
            alert('Documento de reprovação é obrigatório para itens reprovados');
            return;
        }

        try {
            const dados = upperFields({
                ...formData,
                responsavel: user?.nome || 'Usuário'
            }, [
                'codigo_produto', 'nome_produto', 'origem', 'setor', 'status', 'descricao', 'documento_reprovacao', 'observacoes'
            ]);

            if (editingId) {
                await cartoesAPI.update(editingId, dados);
            } else {
                await cartoesAPI.create(dados);
            }
            setShowModal(false);
            loadCartoes();
            resetForm();
        } catch (error) {
            console.error('Erro ao salvar cartão:', error);
            alert('Erro ao salvar cartão');
        }
    };

    const handleEdit = async (id) => {
        try {
            const response = await cartoesAPI.getById(id);
            if (response.data.success) {
                const cartao = response.data.data;
                setFormData({
                    codigo_produto: cartao.codigo_produto || '',
                    nome_produto: cartao.nome_produto || '',
                    origem: (cartao.origem || '').toUpperCase(),
                    setor: (cartao.setor || '').toUpperCase(),
                    turno: cartao.turno || '',
                    qtd_conforme: cartao.qtd_conforme || 0,
                    qtd_nao_conforme: cartao.qtd_nao_conforme || 0,
                    status: (cartao.status || '').toUpperCase(),
                    documento_reprovacao: cartao.documento_reprovacao || '',
                    descricao: cartao.descricao || '',
                    observacoes: cartao.observacoes || '',
                    responsavel: cartao.responsavel || ''
                });
                setEditingId(id);
                setShowModal(true);
            }
        } catch (error) {
            console.error('Erro ao carregar cartão:', error);
        }
    };

    const handleView = async (id) => {
        try {
            const response = await cartoesAPI.getById(id);
            if (response.data.success) {
                setPrintData(response.data.data);
                setShowPrintModal(true);
            }
        } catch (error) {
            console.error('Erro ao carregar cartão:', error);
        }
    };
    const handlePrint = async (id) => {
        try {
            const response = await cartoesAPI.getById(id);
            if (response.data.success) {
                executePrint(response.data.data);
            }
        } catch (error) {
            console.error('Erro ao preparar impressão do cartão:', error);
            alert('Não foi possível preparar a impressão do cartão.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir este cartão?')) {
            try {
                await cartoesAPI.delete(id);
                loadCartoes();
            } catch (error) {
                console.error('Erro ao excluir cartão:', error);
                alert('Erro ao excluir cartão');
            }
        }
    };

    const openMobileActions = (cartao) => {
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
            setSheetData((current) => (
                current?.id === cartao.id
                    ? null
                    : { id: cartao.id, label: cartao.codigo_produto || cartao.nome_produto || 'Cartão selecionado' }
            ));
        }
    };

    const executePrint = (cartaoParaImprimir = printData) => {
        if (!cartaoParaImprimir) return;

        const printWindow = window.open('', '_blank', 'width=800,height=700');
        if (!printWindow) {
            alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.');
            return;
        }

        const dataFormatada = formatarData(cartaoParaImprimir.created_at);
        const dataEmissao = new Date().toLocaleString('pt-BR');
        const statusClass = cartaoParaImprimir.status?.toLowerCase() || 'pendente';
        const produto = cartaoParaImprimir.descricao || cartaoParaImprimir.nome_produto || '-';
        const isReprovado = cartaoParaImprimir.status?.toLowerCase() === 'reprovado';

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Cartão de Qualidade - ${cartaoParaImprimir.codigo_produto || ''}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                    .card { border: 3px solid #333; border-radius: 15px; max-width: 500px; margin: 0 auto; background: #fff; overflow: hidden; }
                    .header { text-align: center; background: linear-gradient(135deg, #fda619 0%, #ff8c00 100%); padding: 20px; color: #fff; }
                    .header h1 { font-size: 1.8rem; margin-bottom: 5px; }
                    .header h2 { font-size: 1.3rem; font-weight: normal; margin-top: 10px; }
                    .body-card { padding: 25px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
                    .info-item { text-align: center; padding: 12px; background: #f8f9fa; border-radius: 10px; }
                    .info-label { font-size: 0.75rem; color: #666; margin-bottom: 5px; display: block; }
                    .info-value { font-size: 1rem; font-weight: bold; color: #333; }
                    .status-badge { text-align: center; padding: 20px; border-radius: 12px; margin: 20px 0; font-size: 1.5rem; font-weight: bold; }
                    .status-badge.aprovado { background: #d4edda; color: #155724; }
                    .status-badge.reprovado { background: #f8d7da; color: #721c24; }
                    .status-badge.pendente { background: #fff3cd; color: #856404; }
                    .qtd-info { background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 15px; border-radius: 10px; text-align: center; margin: 15px 0; }
                    .qtd-info span { font-size: 1.1rem; color: #2e7d32; }
                    .section { margin: 15px 0; padding: 12px; background: #f8f9fa; border-radius: 8px; }
                    .section-title { font-size: 0.85rem; color: #666; margin-bottom: 5px; }
                    .section-content { font-size: 1rem; color: #333; }
                    .sticker-area { margin-top: 18px; padding: 22px 16px; border: 2px dashed #c7b8a5; border-radius: 10px; text-align: center; background: #fff; }
                    .sticker-text { font-size: 1rem; font-weight: bold; color: #6b7280; margin-bottom: 6px; }
                    .sticker-subtext { font-size: 0.8rem; color: #9ca3af; text-transform: uppercase; }
                    .footer { text-align: center; padding: 15px; color: #888; font-size: 0.85rem; border-top: 1px solid #eee; }
                    @media print { body { padding: 0; background: #fff; } }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="header">
                        <h1>CARTÃO DE QUALIDADE</h1>
                        <h2>${cartaoParaImprimir.codigo_produto || '-'}</h2>
                    </div>
                    <div class="body-card">
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">📅 Data</span>
                                <span class="info-value">${dataFormatada}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">🕐 Turno</span>
                                <span class="info-value">${cartaoParaImprimir.turno || '-'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">🏭 Setor</span>
                                <span class="info-value">${cartaoParaImprimir.setor || '-'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">👤 Responsável</span>
                                <span class="info-value">${cartaoParaImprimir.responsavel || '-'}</span>
                            </div>
                        </div>

                        <div class="status-badge ${statusClass}">
                            ${(cartaoParaImprimir.status || 'PENDENTE').toUpperCase()}
                        </div>

                        <div class="qtd-info">
                            <span>✅ <strong>${cartaoParaImprimir.qtd_conforme || 0}</strong> Conforme • ❌ <strong>${cartaoParaImprimir.qtd_nao_conforme || 0}</strong> Não Conforme</span>
                        </div>

                        <div class="section">
                            <div class="section-title">📦 Produto</div>
                            <div class="section-content">${produto}</div>
                        </div>

                        <div class="section">
                            <div class="section-title">🌎 Origem</div>
                            <div class="section-content">${cartaoParaImprimir.origem || '-'}</div>
                        </div>

                        ${isReprovado && cartaoParaImprimir.documento_reprovacao ? `
                        <div class="section">
                            <div class="section-title">📄 Documento de Reprovação</div>
                            <div class="section-content">${cartaoParaImprimir.documento_reprovacao}</div>
                        </div>
                        ` : ''}

                        ${cartaoParaImprimir.observacoes ? `
                        <div class="section">
                            <div class="section-title">💬 Observações</div>
                            <div class="section-content">${cartaoParaImprimir.observacoes}</div>
                        </div>
                        ` : ''}
                    

                        <div class="sticker-area">
                            <div class="sticker-text">ÁREA PARA ADESIVO</div>
                            <div class="sticker-subtext">COLAR ADESIVO AQUI</div>
                        </div>
                    </div>
                    <div class="footer">
                        Emitido em: ${dataEmissao}
                    </div>
                </div>
                <script>
                    setTimeout(() => { window.print(); window.close(); }, 500);
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
        setShowPrintModal(false);
    };

    const resetForm = () => {
        setFormData({
            codigo_produto: '',
            nome_produto: '',
            origem: '',
            setor: '',
            turno: '',
            qtd_conforme: 0,
            qtd_nao_conforme: 0,
            status: '',
            documento_reprovacao: '',
            descricao: '',
            observacoes: '',
            responsavel: ''
        });
        setEditingId(null);
        setProdutoSugestoes([]);
        setShowSugestoes(false);
        setProdutoStatus(null);
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
            aprovado: 'badge-success',
            pendente: 'badge-warning',
            reprovado: 'badge-danger'
        };
        return classes[status?.toLowerCase()] || 'badge-warning';
    };

    const sheetCartao = sheetData ? cartoes.find((cartao) => cartao.id === sheetData.id) : null;

    return (
        <div className="app-container">
            <Sidebar />

            <main className="main-content">
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-credit-card"></i> Cartões de Qualidade</h1>
                        <p>Crie, visualize e imprima cartões de qualidade</p>
                    </div>
                    <div className="header-actions">
                        <input
                            type="text"
                            className="form-control search-input"
                            placeholder="Buscar por código, nome ou descrição..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <button className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
                            <i className="fas fa-plus"></i> Novo Cartão
                        </button>
                    </div>
                </div>

                {/* Tabela */}
                <div className="table-card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Nome</th>
                                    <th>Origem</th>
                                    <th>Setor</th>
                                    <th>Turno</th>
                                    <th>Status</th>
                                    <th>Data</th>
                                    <th className="text-right actions-column">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="8">
                                            <div className="loading">
                                                <div className="loading-spinner"></div>
                                                <p>Carregando...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : cartoes.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="text-center">Nenhum cartão encontrado</td>
                                    </tr>
                                ) : (
                                    cartoes.map(cartao => (
                                        <tr
                                            key={cartao.id}
                                            className={`mobile-clickable-row ${sheetData?.id === cartao.id ? 'mobile-row-active' : ''}`}
                                            onClick={() => openMobileActions(cartao)}
                                        >
                                            <td><strong>{cartao.codigo_produto || 'N/A'}</strong></td>
                                            <td><strong>{cartao.nome_produto || 'N/A'}</strong></td>
                                            <td><strong>{cartao.origem || 'N/A'}</strong></td>
                                            <td><span className="badge badge-outline">{cartao.setor || 'N/A'}</span></td>
                                            <td>{cartao.turno || 'N/A'}</td>
                                            <td>
                                                <span className={`badge ${getStatusClass(cartao.status)}`}>
                                                    {cartao.status}
                                                </span>
                                            </td>
                                            <td>{formatarData(cartao.created_at)}</td>
                                            <td className="actions-column">
                                                <div className="action-buttons">
                                                    <button className="btn-icon btn-view" onClick={(e) => { e.stopPropagation(); handleView(cartao.id); }} title="Visualizar">
                                                        <i className="fas fa-eye"></i>
                                                    </button>                                                    <button className="btn-icon btn-print" onClick={(e) => { e.stopPropagation(); handlePrint(cartao.id); }} title="Imprimir cartão" aria-label="Imprimir cartão">
                                                        <i className="fas fa-print"></i>
                                                    </button>
                                                    <button className="btn-icon btn-edit" onClick={(e) => { e.stopPropagation(); handleEdit(cartao.id); }} title="Editar">
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button className="btn-icon btn-delete" onClick={(e) => { e.stopPropagation(); handleDelete(cartao.id); }} title="Excluir">
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

                {/* Modal de Criação/Edição */}
                {showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Editar Cartão' : 'Novo Cartão de Qualidade'}</h2>
                                <button className="modal-close" onClick={() => setShowModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    {/* Informações Básicas */}
                                    <div className="form-section">
                                        <h3 className="section-title">Informações Básicas</h3>
                                        <div className="form-row cartao-produto-row">
                                            <div className="form-group product-code-group cartao-codigo-sap">
                                                <label>Código do Produto (SAP) *</label>
                                                <input
                                                    type="text"
                                                    className="form-control field-upper"
                                                    value={formData.codigo_produto}
                                                    onChange={handleCodigoProdutoChange}
                                                    onBlur={(e) => buscarProduto(e.target.value)}
                                                    placeholder="Digite o código SAP"
                                                    autoComplete="off"
                                                    required
                                                />
                                                {showSugestoes && produtoSugestoes.length > 0 && (
                                                    <ul className="autocomplete-list">
                                                        {produtoSugestoes.map((produto) => (
                                                            <li
                                                                key={produto.id || produto.cod_material}
                                                                className="autocomplete-item"
                                                                onMouseDown={() => selecionarProduto(produto)}
                                                            >
                                                                <span className="autocomplete-cod">{produto.cod_material}</span>
                                                                <span className="autocomplete-desc">{produto.desc_material}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                                <p className={`info-text product-lookup-status ${produtoStatus ? `product-lookup-${produtoStatus.type}` : ''}`}>
                                                    {produtoStatus?.message || 'O sistema buscará automaticamente os dados do produto'}
                                                </p>
                                            </div>
                                            <div className="form-group cartao-descricao-produto">
                                                <label>Descrição (Nome do Produto)</label>
                                                <textarea
                                                    className="form-control field-upper"
                                                    value={formData.descricao}
                                                    readOnly
                                                    style={{ backgroundColor: 'var(--surface-3)' }}
                                                    placeholder="Será preenchido automaticamente ao digitar o código"
                                                ></textarea>
                                            </div>
                                        </div>

                                        <div className="form-row cartao-dados-row">
                                            <div className="form-group">
                                                <label>Origem *</label>
                                                <select
                                                    className="form-control"
                                                    value={formData.origem}
                                                    onChange={(e) => setFormData({ ...formData, origem: e.target.value })}
                                                    required
                                                >
                                                    <option value="">Selecione a origem</option>
                                                    <option value="NACIONAL">Nacional</option>
                                                    <option value="IMPORTADO">Importado</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Setor *</label>
                                                <select
                                                    className="form-control"
                                                    value={formData.setor}
                                                    onChange={(e) => setFormData({ ...formData, setor: e.target.value })}
                                                    required
                                                >
                                                    <option value="">Selecione o setor</option>
                                                    <option value="ALMOXARIFADO">Almoxarifado</option>
                                                    <option value="MONTAGEM">Montagem</option>
                                                    <option value="LOGÍSTICA">Logística</option>
                                                    <option value="INJEÇÃO">Injeção</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Turno *</label>
                                                <select
                                                    className="form-control"
                                                    value={formData.turno}
                                                    onChange={(e) => setFormData({ ...formData, turno: e.target.value })}
                                                    required
                                                >
                                                    <option value="">Selecione</option>
                                                    <option value="A">A</option>
                                                    <option value="B">B</option>
                                                    <option value="C">C</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="divider"></div>

                                    {/* Controle de Qualidade */}
                                    <div className="form-section">
                                        <h3 className="section-title">Controle de Qualidade</h3>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Quantidade Conforme *</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={formData.qtd_conforme}
                                                    onChange={(e) => setFormData({ ...formData, qtd_conforme: parseInt(e.target.value) || 0 })}
                                                    min="0"
                                                    required
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Quantidade Não Conforme *</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={formData.qtd_nao_conforme}
                                                    onChange={(e) => setFormData({ ...formData, qtd_nao_conforme: parseInt(e.target.value) || 0 })}
                                                    min="0"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>Status *</label>
                                                <select
                                                    className="form-control"
                                                    value={formData.status}
                                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                    required
                                                >
                                                    <option value="">Selecione</option>
                                                    <option value="APROVADO">Aprovado</option>
                                                    <option value="REPROVADO">Reprovado</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Inspetor</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={user?.nome || 'Usuário'}
                                                    readOnly
                                                    style={{ backgroundColor: 'var(--surface-3)' }}
                                                />
                                            </div>
                                        </div>

                                        {(formData.status || '').toUpperCase() === 'REPROVADO' && (
                                            <div className="form-group">
                                                <label>Documento de Reprovação *</label>
                                                <input
                                                    type="text"
                                                    className="form-control field-upper"
                                                    value={formData.documento_reprovacao}
                                                    onChange={(e) => setFormData({ ...formData, documento_reprovacao: e.target.value.toUpperCase() })}
                                                    placeholder="Nº do documento (obrigatório para reprovados)"
                                                    required
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="divider"></div>
                                    {/* Observações */}
                                    <div className="form-section">
                                        <div className="form-group">
                                            <label>Observações</label>
                                            <textarea
                                                className="form-control"
                                                value={formData.observacoes}
                                                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value.toUpperCase() })}
                                                placeholder="Observações adicionais"
                                            ></textarea>
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-save"></i> {editingId ? 'Salvar Alterações' : 'Criar Cartão'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Modal de Impressão */}
                {showPrintModal && printData && (
                    <div className="modal-overlay print-overlay" onClick={() => setShowPrintModal(false)}>
                        <div className="print-container" onClick={(e) => e.stopPropagation()}>
                            <div className="print-card">
                                <div className="print-header">
                                    <h1>MALLORY</h1>
                                    <h2>CARTÃO DE QUALIDADE</h2>
                                </div>

                                <div className="print-body">
                                    <div className="print-grid">
                                        <div className="print-item">
                                            <span className="print-label">Código SAP:</span>
                                            <span className="print-value">{printData.codigo_produto || 'N/A'}</span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Nome do Produto:</span>
                                            <span className="print-value">{printData.descricao || printData.nome_produto || 'N/A'}</span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Origem:</span>
                                            <span className="print-value">{printData.origem || 'N/A'}</span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Status:</span>
                                            <span className={`print-badge ${printData.status?.toLowerCase() === 'aprovado' ? 'approved' : 'rejected'}`}>
                                                {printData.status?.toUpperCase() || 'N/A'}
                                            </span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Setor:</span>
                                            <span className="print-value">{printData.setor || 'N/A'}</span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Turno:</span>
                                            <span className="print-value">{printData.turno || 'N/A'}</span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Qtd. Conforme:</span>
                                            <span className="print-value">{printData.qtd_conforme || '0'}</span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Qtd. Não Conforme:</span>
                                            <span className="print-value">{printData.qtd_nao_conforme || '0'}</span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Data:</span>
                                            <span className="print-value">{formatarData(printData.created_at)}</span>
                                        </div>
                                        <div className="print-item">
                                            <span className="print-label">Responsável:</span>
                                            <span className="print-value">{printData.responsavel || 'N/A'}</span>
                                        </div>
                                    </div>

                                    {printData.status?.toLowerCase() === 'reprovado' && printData.documento_reprovacao && (
                                        <div className="print-section">
                                            <h4>Documento de Reprovação</h4>
                                            <p>{printData.documento_reprovacao}</p>
                                        </div>
                                    )}

                                    {printData.observacoes && (
                                        <div className="print-section">
                                            <h4>Observações</h4>
                                            <p>{printData.observacoes}</p>
                                        </div>
                                    )}

                                    <div className="sticker-area">
                                        <div className="sticker-text">ÁREA PARA ADESIVO</div>
                                        <div className="sticker-subtext">COLAR ADESIVO AQUI</div>
                                    </div>
                                </div>

                                <div className="print-footer no-print">
                                    <button className="btn btn-secondary" onClick={() => setShowPrintModal(false)}>
                                        <i className="fas fa-times"></i> Fechar
                                    </button>
                                    <button className="btn btn-primary" onClick={executePrint}>
                                        <i className="fas fa-print"></i> Imprimir Cartão
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {typeof document !== 'undefined' && createPortal(
                    <div className={`mobile-action-sheet ${sheetCartao ? 'open' : ''}`}>
                        <div className="mobile-action-sheet-backdrop" onClick={() => setSheetData(null)} />
                        <div className="mobile-action-sheet-panel">
                            <div className="mobile-action-sheet-handle" />
                            <p className="mobile-action-sheet-title">{sheetData?.label || 'Cartão selecionado'}</p>
                            {sheetCartao && (
                                <div className="mobile-action-sheet-buttons">
                                    <button type="button" className="btn btn-view" onClick={() => { setSheetData(null); handleView(sheetCartao.id); }}>
                                        <i className="fas fa-eye"></i>
                                        <span>Ver</span>
                                    </button>
                                    <button type="button" className="btn btn-print" onClick={() => { setSheetData(null); handlePrint(sheetCartao.id); }}>
                                        <i className="fas fa-print"></i>
                                        <span>Imprimir</span>
                                    </button>                                    <button type="button" className="btn btn-edit" onClick={() => { setSheetData(null); handleEdit(sheetCartao.id); }}>
                                        <i className="fas fa-edit"></i>
                                        <span>Editar</span>
                                    </button>
                                    <button type="button" className="btn btn-delete" onClick={() => { setSheetData(null); handleDelete(sheetCartao.id); }}>
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


