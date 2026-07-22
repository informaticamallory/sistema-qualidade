import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '../../../components/Sidebar/Sidebar';
import { registrosAPI, defeitosAPI, produtosAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { upperFields } from '../../../utils/text';
import './InspecaoMontagem.css';

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

const getProdutoModelo = (produto) => (
    produto?.modelo
    || produto?.cod_modelo
    || produto?.desc_modelo
    || produto?.modelo_material
    || produto?.desc_material
    || ''
);

export default function InspecaoMontagem() {
    const { user } = useAuth();
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [viewData, setViewData] = useState(null);
    const [defeitos, setDefeitos] = useState([]);
    const [activeTab, setActiveTab] = useState('dados-gerais');
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printData, setPrintData] = useState(null);
    const [sheetData, setSheetData] = useState(null);

    // Autocomplete de produtos (Código SAP)
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const searchTimeout = useRef(null);

    // Feedback da leitura do código de barras
    const [barcodeStatus, setBarcodeStatus] = useState(null); // { type: 'success' | 'error', message }

    // Checklist states
    const [checklist, setChecklist] = useState({
        corrente: { valor: '', conforme: null, obs: '' },
        potencia: { valor: '', conforme: null, obs: '' },
        hipot: { conforme: null, obs: '' },
        etiquetas: { conforme: null, obs: '' },
        plugue: { conforme: null, obs: '' },
        grafismos: { conforme: null, obs: '' },
        embalagens: { conforme: null, obs: '' },
        pecas_injetadas: { conforme: null, obs: '' },
        montagem: { conforme: null, obs: '' },
        visual: { conforme: null, obs: '' }
    });

    const [formData, setFormData] = useState({
        data_inspecao: todayISO(),
        semana: getWeekFromDate(),
        cod_sap: '',
        modelo: '',
        familia: '',
        linha: '',
        descricao_sap: '',
        codigo_barras: '',
        qtd_total: 0,
        qtd_inspecionada: 0,
        qtd_nc: 0,
        qtd_pallet: 0,
        rastreabilidade: '',
        po: '',
        turno: '',
        linha_montagem: '',
        inspetor: '',
        status: 'pendente',
        defeito: '',
        prioridade: '',
        documento: '',
        origem_problema: '',
        posto: '',
        operador: '',
        causa: '',
        correcao: '',
        responsavelCorrecao: '',
        observacao: ''
    });

    useEffect(() => {
        loadRegistros();
        loadDefeitos();
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

            const response = await registrosAPI.getAll(params);
            if (response.data.success) {
                setRegistros(response.data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar registros:', error);
        } finally {
            setLoading(false);
        }
    };

    const openMobileActions = (registro) => {
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
            setSheetData((current) => (
                current?.id === registro.id
                    ? null
                    : { id: registro.id, label: registro.cod_sap || registro.modelo || 'Registro selecionado' }
            ));
        }
    };

    const loadDefeitos = async () => {
        try {
            const response = await defeitosAPI.getAll();
            if (response.data.success) {
                setDefeitos(response.data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar defeitos:', error);
        }
    };

    const buscarProduto = async (codigo) => {
        if (!codigo || codigo.length < 3) return;

        try {
            const response = await produtosAPI.getByCode(codigo);
            if (response.data.success && response.data.data) {
                const produto = response.data.data;
                setFormData(prev => ({
                    ...prev,
                    modelo: getProdutoModelo(produto),
                    familia: produto.cod_familia || '',
                    linha: produto.cod_linha || '',
                    descricao_sap: produto.desc_material || ''
                }));
            }
        } catch {
            console.log('Produto não encontrado');
        }
    };

    // Busca incremental (debounce) enquanto digita o Código SAP
    const buscarSugestoes = (termo) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        if (!termo || termo.length < 2) {
            setProdutoSugestoes([]);
            setShowSugestoes(false);
            return;
        }

        searchTimeout.current = setTimeout(async () => {
            try {
                const response = await produtosAPI.search(termo);
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

    // Preenche os campos ao escolher um produto da lista
    const selecionarProduto = (produto) => {
        setFormData(prev => ({
            ...prev,
            cod_sap: produto.cod_material || '',
            modelo: getProdutoModelo(produto),
            familia: produto.cod_familia || '',
            linha: produto.cod_linha || '',
            descricao_sap: produto.desc_material || ''
        }));
        setShowSugestoes(false);
        setProdutoSugestoes([]);
    };

    // Leitura do código de barras: preenche os dados e/ou valida contra o Código SAP digitado
    const buscarPorCodigoBarras = async (barcode) => {
        const codigo = (barcode || '').trim();
        if (codigo.length < 3) return;

        try {
            const response = await produtosAPI.getByBarcode(codigo);
            if (response.data.success && response.data.data) {
                const produto = response.data.data;
                const codSapDigitado = (formData.cod_sap || '').trim().toUpperCase();
                const codSapProduto = (produto.cod_material || '').toUpperCase();

                // Se já havia um Código SAP digitado e ele diverge do produto lido, avisa e não sobrescreve
                if (codSapDigitado && codSapProduto && codSapDigitado !== codSapProduto) {
                    setBarcodeStatus({
                        type: 'error',
                        message: `Este código de barras pertence ao produto ${codSapProduto}, não ao ${codSapDigitado} informado.`
                    });
                    return;
                }

                // Preenche os dados do produto
                setFormData(prev => ({
                    ...prev,
                    cod_sap: produto.cod_material || prev.cod_sap,
                    modelo: getProdutoModelo(produto),
                    familia: produto.cod_familia || '',
                    linha: produto.cod_linha || '',
                    descricao_sap: produto.desc_material || ''
                }));
                setBarcodeStatus({
                    type: 'success',
                    message: `Produto confirmado: ${codSapProduto}${produto.desc_material ? ' — ' + produto.desc_material : ''}`
                });
            } else {
                setBarcodeStatus({
                    type: 'error',
                    message: 'Nenhum produto encontrado para este código de barras.'
                });
            }
        } catch {
            setBarcodeStatus({
                type: 'error',
                message: 'Nenhum produto encontrado para este código de barras.'
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const sanitizedFormData = formData.status === 'reprovado'
                ? formData
                : {
                    ...formData,
                    documento: '',
                    prioridade: '',
                    defeito: '',
                    origem_problema: '',
                    posto: '',
                    operador: '',
                    causa: '',
                    correcao: '',
                    responsavelCorrecao: ''
                };

            const dados = upperFields({
                ...sanitizedFormData,
                inspetor: user?.nome || formData.inspetor,
                checklist: checklist
            }, [
                'semana', 'cod_sap', 'modelo', 'familia', 'linha', 'descricao_sap',
                'codigo_barras', 'rastreabilidade', 'po', 'defeito', 'documento', 'origem_problema',
                'posto', 'operador', 'causa', 'correcao', 'responsavelCorrecao'
            ]);

            if (editingId) {
                await registrosAPI.update(editingId, dados);
            } else {
                await registrosAPI.create(dados);
            }
            setShowModal(false);
            loadRegistros();
            resetForm();
        } catch (error) {
            console.error('Erro ao salvar registro:', error);
            alert('Erro ao salvar registro');
        }
    };

    const handleEdit = (registro) => {
        const dataInspecao = registro.data_inspecao || todayISO();

        setFormData({
            data_inspecao: dataInspecao,
            semana: registro.semana || getWeekFromDate(dataInspecao),
            cod_sap: registro.cod_sap || '',
            modelo: registro.modelo || '',
            familia: registro.familia || '',
            linha: registro.linha || '',
            descricao_sap: registro.descricao_sap || '',
            codigo_barras: registro.codigo_barras || '',
            qtd_total: registro.qtd_total || 0,
            qtd_inspecionada: registro.qtd_inspecionada || 0,
            qtd_nc: registro.qtd_nc || 0,
            qtd_pallet: registro.qtd_pallet || 0,
            rastreabilidade: registro.rastreabilidade || '',
            po: registro.po || '',
            turno: registro.turno || '',
            linha_montagem: registro.linha_montagem || '',
            inspetor: registro.inspetor || '',
            status: registro.status || 'pendente',
            defeito: registro.defeito || '',
            prioridade: registro.prioridade || '',
            documento: registro.documento || '',
            origem_problema: registro.origem_problema || '',
            posto: registro.posto || '',
            operador: registro.operador || '',
            causa: registro.causa || '',
            correcao: registro.correcao || '',
            responsavelCorrecao: registro.responsavelCorrecao || '',
            observacao: registro.observacao || ''
        });

        const checklistSalvo = registro.checklist || {};
        setChecklist({
            corrente: { valor: '', conforme: null, obs: '', ...(checklistSalvo.corrente || {}) },
            potencia: { valor: '', conforme: null, obs: '', ...(checklistSalvo.potencia || {}) },
            hipot: { conforme: null, obs: '', ...(checklistSalvo.hipot || {}) },
            etiquetas: { conforme: null, obs: '', ...(checklistSalvo.etiquetas || {}) },
            plugue: { conforme: null, obs: '', ...(checklistSalvo.plugue || {}) },
            grafismos: { conforme: null, obs: '', ...(checklistSalvo.grafismos || {}) },
            embalagens: { conforme: null, obs: '', ...(checklistSalvo.embalagens || {}) },
            pecas_injetadas: { conforme: null, obs: '', ...(checklistSalvo.pecas_injetadas || {}) },
            montagem: { conforme: null, obs: '', ...(checklistSalvo.montagem || {}) },
            visual: { conforme: null, obs: '', ...(checklistSalvo.visual || {}) }
        });

        setEditingId(registro.id);
        setActiveTab('dados-gerais');
        setFormViewMode('tabs');
        setShowModal(true);
    };

    const handleView = (registro) => {
        setViewData(registro);
        setShowViewModal(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir este registro?')) {
            try {
                await registrosAPI.delete(id);
                loadRegistros();
            } catch (error) {
                console.error('Erro ao excluir registro:', error);
                alert('Erro ao excluir registro');
            }
        }
    };

    const handlePrintCard = (registro) => {
        // Prepara dados e abre modal de pré-visualização
        setPrintData(registro);
        setShowPrintModal(true);
    };

    const executePrint = () => {
        // Criar janela de impressão
        const printWindow = window.open('', '_blank', 'width=800,height=700');
        const dataFormatada = formatarData(printData.data_inspecao);
        const dataEmissao = new Date().toLocaleString('pt-BR');
        const statusClass = printData.status?.toLowerCase() || 'pendente';
        const qtdAprovada = printData.qtd_inspecionada - (printData.qtd_nc || 0);

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Cartão de Qualidade - ${printData.cod_sap}</title>
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
                    .paletes-info { background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 15px; border-radius: 10px; text-align: center; margin: 15px 0; }
                    .paletes-info span { font-size: 1.1rem; color: #2e7d32; }
                    .section { margin: 15px 0; padding: 12px; background: #f8f9fa; border-radius: 8px; }
                    .section-title { font-size: 0.85rem; color: #666; margin-bottom: 5px; }
                    .section-content { font-size: 1rem; color: #333; }
                    .footer { text-align: center; padding: 15px; color: #888; font-size: 0.85rem; border-top: 1px solid #eee; }
                    @media print { body { padding: 0; background: #fff; } }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="header">
                        <h1>CARTÃO DE QUALIDADE</h1>
                        <h2>${printData.cod_sap || '-'}</h2>
                    </div>
                    <div class="body-card">
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-label">📅 Data</span>
                                <span class="info-value">${dataFormatada}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">🕐 Turno</span>
                                <span class="info-value">${printData.turno || '-'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">🏭 Linha de Montagem</span>
                                <span class="info-value">${printData.linha_montagem || '-'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-label">👤 Inspetor</span>
                                <span class="info-value">${printData.inspetor || '-'}</span>
                            </div>
                        </div>
                        
                        <div class="status-badge ${statusClass}">
                            ${(printData.status || 'PENDENTE').toUpperCase()}
                        </div>
                        
                        <div class="paletes-info">
                            <span>📦 <strong>${printData.qtd_pallet || 0}</strong> Pallet(s) • <strong>${qtdAprovada}</strong> Aprovados • <strong>${printData.qtd_nc || 0}</strong> NC</span>
                        </div>
                        
                        <div class="section">
                            <div class="section-title">🔍 Rastreabilidade</div>
                            <div class="section-content">${printData.rastreabilidade || '-'}</div>
                        </div>
                        
                        <div class="section">
                            <div class="section-title">📋 P.O.</div>
                            <div class="section-content">${printData.po || '-'}</div>
                        </div>
                        
                        ${printData.observacao ? `
                        <div class="section">
                            <div class="section-title">💬 Observações</div>
                            <div class="section-content">${printData.observacao}</div>
                        </div>
                        ` : ''}
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
        const dataInspecao = todayISO();

        setFormData({
            data_inspecao: dataInspecao,
            semana: getWeekFromDate(dataInspecao),
            cod_sap: '',
            modelo: '',
            familia: '',
            linha: '',
            descricao_sap: '',
            codigo_barras: '',
            qtd_total: 0,
            qtd_inspecionada: 0,
            qtd_nc: 0,
            qtd_pallet: 0,
            rastreabilidade: '',
            po: '',
            turno: '',
            linha_montagem: '',
            inspetor: user?.nome || '',
            status: 'pendente',
            defeito: '',
            prioridade: '',
            documento: '',
            origem_problema: '',
            posto: '',
            operador: '',
            causa: '',
            correcao: '',
            responsavelCorrecao: '',
            observacao: ''
        });
        setChecklist({
            corrente: { valor: '', conforme: null, obs: '' },
            potencia: { valor: '', conforme: null, obs: '' },
            hipot: { conforme: null, obs: '' },
            etiquetas: { conforme: null, obs: '' },
            plugue: { conforme: null, obs: '' },
            grafismos: { conforme: null, obs: '' },
            embalagens: { conforme: null, obs: '' },
            pecas_injetadas: { conforme: null, obs: '' },
            montagem: { conforme: null, obs: '' },
            visual: { conforme: null, obs: '' }
        });
        setEditingId(null);
        setActiveTab('dados-gerais');
        setFormViewMode('tabs');
        setBarcodeStatus(null);
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

    const updateChecklist = (item, field, value) => {
        setChecklist(prev => ({
            ...prev,
            [item]: { ...prev[item], [field]: value }
        }));
    };

    const tabs = [
        { id: 'dados-gerais', icon: 'fa-info-circle', label: 'Dados Gerais' },
        { id: 'checklist-tab', icon: 'fa-tasks', label: 'Checklist' },
        { id: 'status-tab', icon: 'fa-clipboard-check', label: 'Status' }
    ];

    const checklistItems = [
        {
            section: 'Teste de Avaliação do Motor', icon: 'fa-bolt', color: 'var(--danger)', items: [
                { id: 'corrente', label: 'Corrente', unit: 'A', hasValue: true },
                { id: 'potencia', label: 'Potência', unit: 'W', hasValue: true }
            ]
        },
        {
            section: 'HI-POT e Componentes Elétricos', icon: 'fa-plug', color: 'var(--info)', items: [
                { id: 'hipot', label: 'HI-POT' },
                { id: 'etiquetas', label: 'Etiquetas' },
                { id: 'plugue', label: 'Plugue/Rede' }
            ]
        },
        {
            section: 'Inspeção Visual', icon: 'fa-eye', color: 'var(--purple)', items: [
                { id: 'grafismos', label: 'Grafismos' },
                { id: 'embalagens', label: 'Embalagens' },
                { id: 'pecas_injetadas', label: 'Peças Injetadas' },
                { id: 'montagem', label: 'Montagem' },
                { id: 'visual', label: 'Visual Geral' }
            ]
        }
    ];

    const sheetRegistro = sheetData ? registros.find((registro) => registro.id === sheetData.id) : null;

    return (
        <div className="app-container">
            <Sidebar />

            <main className="main-content">
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-list-check"></i> Inspeção de Montagem</h1>
                        <p>Visualize e gerencie todas as inspeções de montagem</p>
                    </div>
                    <div className="header-actions">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Buscar por código, modelo..."
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
                                    <th>Código SAP</th>
                                    <th>Descrição</th>
                                    <th>Linha</th>
                                    <th>Qtd Total</th>
                                    <th>Qtd Insp.</th>
                                    <th>Qtd NC</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                    <th className="actions-column" style={{ textAlign: 'center' }}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="9">
                                            <div className="loading">
                                                <div className="loading-spinner"></div>
                                                <p>Carregando...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : registros.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" className="text-center">Nenhum registro encontrado</td>
                                    </tr>
                                ) : (
                                    registros.map(reg => (
                                        <tr
                                            key={reg.id}
                                            className={`mobile-clickable-row ${sheetData?.id === reg.id ? 'mobile-row-active' : ''}`}
                                            onClick={() => openMobileActions(reg)}
                                        >
                                            <td>{formatarData(reg.data_inspecao)}</td>
                                            <td><strong>{reg.cod_sap}</strong></td>
                                            <td>{reg.modelo || reg.descricao_sap || 'N/A'}</td>
                                            <td>{reg.linha_montagem || '--'}</td>
                                            <td>{reg.qtd_total}</td>
                                            <td>{reg.qtd_inspecionada}</td>
                                            <td>{reg.qtd_nc}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className={`badge ${getStatusClass(reg.status)}`}>
                                                    {reg.status}
                                                </span>
                                            </td>
                                            <td className="actions-column">
                                                <div className="action-buttons">
                                                    <button className="btn-icon btn-view" onClick={(e) => { e.stopPropagation(); handleView(reg); }} title="Visualizar">
                                                        <i className="fas fa-eye"></i>
                                                    </button>
                                                    <button className="btn-icon btn-edit" onClick={(e) => { e.stopPropagation(); handleEdit(reg); }} title="Editar">
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button className="btn-icon btn-print" onClick={(e) => { e.stopPropagation(); handlePrintCard(reg); }} title="Imprimir Cartão">
                                                        <i className="fas fa-print"></i>
                                                    </button>
                                                    <button className="btn-icon btn-delete" onClick={(e) => { e.stopPropagation(); handleDelete(reg.id); }} title="Excluir">
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
                        <div className="modal-content modal-large inspection-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Editar Registro de Inspeção' : 'Novo Registro de Inspeção'}</h2>
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

                            {/* Tabs */}
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
                                    {/* Tab: Dados Gerais */}
                                    {(formViewMode === 'geral' || activeTab === 'dados-gerais') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Dados de Inspeção</h3>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Data Inspeção *</label>
                                                        <input
                                                            type="date"
                                                            className="form-control"
                                                            value={formData.data_inspecao}
                                                            onChange={(e) => {
                                                                const dataInspecao = e.target.value;
                                                                setFormData({
                                                                    ...formData,
                                                                    data_inspecao: dataInspecao,
                                                                    semana: getWeekFromDate(dataInspecao)
                                                                });
                                                            }}
                                                            required
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Semana</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.semana}
                                                            onChange={(e) => setFormData({ ...formData, semana: e.target.value })}
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label>Família</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.familia}
                                                            readOnly
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="sap-description-row">
                                                    <div className="form-group" style={{ position: 'relative' }}>
                                                        <label>Código SAP *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.cod_sap}
                                                            onChange={(e) => {
                                                                const valor = e.target.value.toUpperCase();
                                                                setFormData({ ...formData, cod_sap: valor });
                                                                buscarSugestoes(valor);
                                                            }}
                                                            onFocus={() => { if (produtoSugestoes.length > 0) setShowSugestoes(true); }}
                                                            onBlur={(e) => { setTimeout(() => setShowSugestoes(false), 150); buscarProduto(e.target.value); }}
                                                            placeholder="Digite para buscar..."
                                                            autoComplete="off"
                                                            required
                                                        />
                                                        {showSugestoes && produtoSugestoes.length > 0 && (
                                                            <ul className="autocomplete-list">
                                                                {produtoSugestoes.map((p) => (
                                                                    <li
                                                                        key={p.id}
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
                                                        <label>Descrição SAP</label>
                                                        <textarea
                                                            className="form-control field-upper"
                                                            value={formData.descricao_sap}
                                                            readOnly
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                            rows="2"
                                                        ></textarea>
                                                    </div>
                                                </div>

                                                <div className="form-group">
                                                    <label><i className="fas fa-barcode"></i> Código de Barras do Produto</label>
                                                    <input
                                                        type="text"
                                                        className="form-control field-upper"
                                                        value={formData.codigo_barras}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, codigo_barras: e.target.value });
                                                            if (barcodeStatus) setBarcodeStatus(null);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                buscarPorCodigoBarras(e.target.value);
                                                            }
                                                        }}
                                                        onBlur={(e) => buscarPorCodigoBarras(e.target.value)}
                                                        placeholder="Escaneie ou digite o código de barras"
                                                    />
                                                    {barcodeStatus && (
                                                        <span className={`barcode-status barcode-status-${barcodeStatus.type}`}>
                                                            <i className={`fas ${barcodeStatus.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                                                            {barcodeStatus.message}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="divider"></div>

                                            <div className="form-section">
                                                <h3 className="section-title">Quantidades</h3>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Qtd. Total</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.qtd_total}
                                                            onChange={(e) => setFormData({ ...formData, qtd_total: parseInt(e.target.value) || 0 })}
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Qtd. Inspecionada</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.qtd_inspecionada}
                                                            onChange={(e) => setFormData({ ...formData, qtd_inspecionada: parseInt(e.target.value) || 0 })}
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Qtd. NC</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.qtd_nc}
                                                            onChange={(e) => setFormData({ ...formData, qtd_nc: parseInt(e.target.value) || 0 })}
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Num. Pallet</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.qtd_pallet}
                                                            onChange={(e) => setFormData({ ...formData, qtd_pallet: parseInt(e.target.value) || 0 })}
                                                            min="0"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Rastreabilidade</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.rastreabilidade}
                                                            onChange={(e) => setFormData({ ...formData, rastreabilidade: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>P.O.</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.po}
                                                            onChange={(e) => setFormData({ ...formData, po: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="divider"></div>

                                            <div className="form-section">
                                                <h3 className="section-title">Operação</h3>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Turno</label>
                                                        <select
                                                            className="form-control"
                                                            value={formData.turno}
                                                            onChange={(e) => setFormData({ ...formData, turno: e.target.value })}
                                                        >
                                                            <option value="">Selecione</option>
                                                            <option value="A">Turno A</option>
                                                            <option value="B">Turno B</option>
                                                            <option value="C">Turno C</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Linha Montagem</label>
                                                        <select
                                                            className="form-control"
                                                            value={formData.linha_montagem}
                                                            onChange={(e) => setFormData({ ...formData, linha_montagem: e.target.value })}
                                                        >
                                                            <option value="">Selecione</option>
                                                            <option value="LM-01">Linha 01</option>
                                                            <option value="LM-02">Linha 02</option>
                                                            <option value="LM-03">Linha 03</option>
                                                            <option value="LM-04">Linha 04</option>
                                                            <option value="LM-05">Linha 05</option>
                                                            <option value="LM-06">Linha 06</option>
                                                            <option value="LM-07">Linha 07</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab: Checklist */}
                                    {(formViewMode === 'geral' || activeTab === 'checklist-tab') && (
                                        <div className="tab-content active">
                                            {checklistItems.map(section => (
                                                <div key={section.section} className="checklist-section">
                                                    <h4 className="checklist-title" style={{ color: section.color }}>
                                                        <i className={`fas ${section.icon}`}></i> {section.section}
                                                    </h4>
                                                    {section.items.map(item => (
                                                        <div key={item.id} className="checklist-item">
                                                            <div className="checklist-label">
                                                                <i className={`fas ${section.icon}`}></i>
                                                                <span>{item.label}</span>
                                                            </div>
                                                            <div className="checklist-options">
                                                                {item.hasValue && (
                                                                    <>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            className="value-input"
                                                                            placeholder="Valor"
                                                                            value={checklist[item.id].valor}
                                                                            onChange={(e) => updateChecklist(item.id, 'valor', e.target.value)}
                                                                        />
                                                                        <span className="unit">{item.unit}</span>
                                                                    </>
                                                                )}
                                                                <div className="radio-group">
                                                                    <label className={`radio-option ${checklist[item.id].conforme === true ? 'selected' : ''}`}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`${item.id}_conforme`}
                                                                            checked={checklist[item.id].conforme === true}
                                                                            onChange={() => updateChecklist(item.id, 'conforme', true)}
                                                                        />
                                                                        Conforme
                                                                    </label>
                                                                    <label className={`radio-option nc ${checklist[item.id].conforme === false ? 'selected' : ''}`}>
                                                                        <input
                                                                            type="radio"
                                                                            name={`${item.id}_conforme`}
                                                                            checked={checklist[item.id].conforme === false}
                                                                            onChange={() => updateChecklist(item.id, 'conforme', false)}
                                                                        />
                                                                        NC
                                                                    </label>
                                                                </div>
                                                            </div>
                                                            {checklist[item.id].conforme === false && (
                                                                <div className="checklist-obs">
                                                                    <label><i className="fas fa-exclamation-triangle"></i> Descreva o problema:</label>
                                                                    <textarea
                                                                        className="form-control"
                                                                        value={checklist[item.id].obs}
                                                                        onChange={(e) => updateChecklist(item.id, 'obs', e.target.value.toUpperCase())}
                                                                        placeholder="Descreva o problema encontrado..."
                                                                    ></textarea>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}

                                            
                                        </div>
                                    )}

                                    {/* Tab: Status */}
                                    {(formViewMode === 'geral' || activeTab === 'status-tab') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Status da Inspeção</h3>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Inspetor *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control"
                                                            value={formData.inspetor || user?.nome || ''}
                                                            readOnly
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                        <p className="info-text">Preenchido automaticamente com seu usuário</p>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Status *</label>
                                                        <select
                                                            className="form-control"
                                                            value={formData.status}
                                                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                            required
                                                        >
                                                            <option value="pendente">Pendente</option>
                                                            <option value="aprovado">Aprovado</option>
                                                            <option value="reprovado">Reprovado</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="form-group">
                                                    <label>Observação</label>
                                                    <textarea
                                                        className="form-control"
                                                        value={formData.observacao}
                                                        onChange={(e) => setFormData({ ...formData, observacao: e.target.value.toUpperCase() })}
                                                        rows="3"
                                                    ></textarea>
                                                </div>
                                            </div>

                                            {formData.status === 'reprovado' && (
                                                <>
                                                    <div className="divider"></div>
                                                    <div className="form-section nc-section">
                                                        <h3 className="section-title">Não Conformidade</h3>
                                                        <div className="form-row">
                                                            <div className="form-group">
                                                                <label>Documento</label>
                                                                <input
                                                                    type="text"
                                                                    className="form-control field-upper"
                                                                    value={formData.documento}
                                                                    onChange={(e) => setFormData({ ...formData, documento: e.target.value.toUpperCase() })}
                                                                />
                                                            </div>
                                                            <div className="form-group">
                                                                <label>Prioridade</label>
                                                                <select
                                                                    className="form-control"
                                                                    value={formData.prioridade}
                                                                    onChange={(e) => setFormData({ ...formData, prioridade: e.target.value })}
                                                                >
                                                                    <option value="">Selecione</option>
                                                                    <option value="critico">Crítico</option>
                                                                    <option value="primario">Primário</option>
                                                                    <option value="secundario">Secundário</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Defeito</label>
                                                            <select
                                                                className="form-control"
                                                                value={formData.defeito}
                                                                onChange={(e) => setFormData({ ...formData, defeito: e.target.value })}
                                                            >
                                                                <option value="">Selecione ou digite...</option>
                                                                {defeitos.map(d => (
                                                                    <option key={d.id} value={d.defeito}>{d.defeito}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div className="form-group">
                                                            <label>Origem do Problema</label>
                                                            <select
                                                                className="form-control"
                                                                value={formData.origem_problema}
                                                                onChange={(e) => setFormData({ ...formData, origem_problema: e.target.value })}
                                                            >
                                                                <option value="">Selecione</option>
                                                                <option value="Injeção">Injeção</option>
                                                                <option value="Montagem">Montagem</option>
                                                                <option value="Logística">Logística</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="form-section checklist-section">
                                                        <h3 className="checklist-section-title checklist-title">
                                                            <i className="fas fa-clipboard-list"></i>
                                                            Registro de Ocorrência
                                                        </h3>

                                                        <div className="checklist-ocorrencia-row">
                                                            <div className="form-group">
                                                                <label htmlFor="posto">Posto</label>
                                                                <input
                                                                    id="posto"
                                                                    type="text"
                                                                    className="form-control field-upper"
                                                                    placeholder="Ex: Posto 01"
                                                                    value={formData.posto}
                                                                    onChange={(e) => setFormData((prev) => ({ ...prev, posto: e.target.value }))}
                                                                />
                                                            </div>
                                                            <div className="form-group">
                                                                <label htmlFor="operador">Operador</label>
                                                                <input
                                                                    id="operador"
                                                                    type="text"
                                                                    className="form-control field-upper"
                                                                    placeholder="Nome do operador"
                                                                    value={formData.operador}
                                                                    onChange={(e) => setFormData((prev) => ({ ...prev, operador: e.target.value }))}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="form-group">
                                                            <label htmlFor="causa">Causa</label>
                                                            <textarea
                                                                id="causa"
                                                                className="form-control field-upper"
                                                                rows={3}
                                                                placeholder="Descreva a causa do problema encontrado..."
                                                                value={formData.causa}
                                                                onChange={(e) => setFormData((prev) => ({ ...prev, causa: e.target.value }))}
                                                            />
                                                        </div>

                                                        <div className="form-group">
                                                            <label htmlFor="correcao">Correção</label>
                                                            <textarea
                                                                id="correcao"
                                                                className="form-control field-upper"
                                                                rows={3}
                                                                placeholder="Descreva a correção aplicada..."
                                                                value={formData.correcao}
                                                                onChange={(e) => setFormData((prev) => ({ ...prev, correcao: e.target.value }))}
                                                            />
                                                        </div>

                                                        <div className="form-group">
                                                            <label htmlFor="responsavelCorrecao">Responsável pela Correção</label>
                                                            <input
                                                                id="responsavelCorrecao"
                                                                type="text"
                                                                className="form-control field-upper"
                                                                placeholder="Nome do responsável"
                                                                value={formData.responsavelCorrecao}
                                                                onChange={(e) => setFormData((prev) => ({ ...prev, responsavelCorrecao: e.target.value }))}
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-save"></i> Salvar Registro
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Modal de Visualização */}
                {showViewModal && viewData && (
                    <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Detalhes do Registro</h2>
                                <button className="modal-close" onClick={() => setShowViewModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="view-grid">
                                    <div className="view-item">
                                        <span className="view-label">Data Inspeção:</span>
                                        <span className="view-value">{formatarData(viewData.data_inspecao)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Código SAP:</span>
                                        <span className="view-value">{viewData.cod_sap}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Modelo:</span>
                                        <span className="view-value">{viewData.modelo || 'N/A'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Linha:</span>
                                        <span className="view-value">{viewData.linha_montagem || 'N/A'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Turno:</span>
                                        <span className="view-value">{viewData.turno || 'N/A'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Status:</span>
                                        <span className={`badge ${getStatusClass(viewData.status)}`}>{viewData.status}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Qtd. Total:</span>
                                        <span className="view-value">{viewData.qtd_total}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Qtd. Inspecionada:</span>
                                        <span className="view-value">{viewData.qtd_inspecionada}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Qtd. NC:</span>
                                        <span className="view-value">{viewData.qtd_nc}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Inspetor:</span>
                                        <span className="view-value">{viewData.inspetor || 'N/A'}</span>
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
                                <button className="btn btn-secondary" onClick={() => setShowViewModal(false)}>
                                    Fechar
                                </button>
                                <button className="btn btn-primary" onClick={() => { setShowViewModal(false); handleEdit(viewData); }}>
                                    <i className="fas fa-edit"></i> Editar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de Impressão */}
                {showPrintModal && printData && (
                    <div className="modal-overlay" onClick={() => setShowPrintModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                            <div className="modal-header" style={{ background: 'var(--gradient-primary)', color: '#1e293b' }}>
                                <h2><i className="fas fa-print"></i> Pré-visualização do Cartão</h2>
                                <button className="modal-close" onClick={() => setShowPrintModal(false)} style={{ color: '#fff' }}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body print-preview">
                                <div className="print-card-preview">
                                    <h3 style={{ textAlign: 'center', marginBottom: '15px', color: 'var(--primary)' }}>
                                        {printData.cod_sap}
                                    </h3>

                                    <div className="print-info-grid">
                                        <div className="print-info-item">
                                            <span className="print-label">📅 Data</span>
                                            <span className="print-value">{formatarData(printData.data_inspecao)}</span>
                                        </div>
                                        <div className="print-info-item">
                                            <span className="print-label">🕐 Turno</span>
                                            <span className="print-value">{printData.turno || '-'}</span>
                                        </div>
                                        <div className="print-info-item">
                                            <span className="print-label">🏭 Linha</span>
                                            <span className="print-value">{printData.linha_montagem || '-'}</span>
                                        </div>
                                        <div className="print-info-item">
                                            <span className="print-label">👤 Inspetor</span>
                                            <span className="print-value">{printData.inspetor || '-'}</span>
                                        </div>
                                    </div>

                                    <div className={`print-status-badge ${printData.status?.toLowerCase() || 'pendente'}`}>
                                        {(printData.status || 'PENDENTE').toUpperCase()}
                                    </div>

                                    <div className="print-paletes-info">
                                        <span>
                                            📦 <strong>{printData.qtd_pallet || 0}</strong> Pallet(s) •
                                            <strong style={{ color: 'var(--success)' }}> {(printData.qtd_inspecionada || 0) - (printData.qtd_nc || 0)}</strong> Aprovados •
                                            <strong style={{ color: 'var(--danger)' }}> {printData.qtd_nc || 0}</strong> NC
                                        </span>
                                    </div>

                                    <div className="print-section">
                                        <div className="print-section-title">🔍 Rastreabilidade</div>
                                        <div className="print-section-content">{printData.rastreabilidade || '-'}</div>
                                    </div>

                                    <div className="print-section">
                                        <div className="print-section-title">📋 P.O.</div>
                                        <div className="print-section-content">{printData.po || '-'}</div>
                                    </div>

                                    {printData.observacao && (
                                        <div className="print-section">
                                            <div className="print-section-title">💬 Observações</div>
                                            <div className="print-section-content">{printData.observacao}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setShowPrintModal(false)}>
                                    <i className="fas fa-times"></i> Fechar
                                </button>
                                <button className="btn btn-primary" onClick={executePrint}>
                                    <i className="fas fa-print"></i> Imprimir
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
                                    <button type="button" className="btn btn-print" onClick={() => { setSheetData(null); handlePrintCard(sheetRegistro); }}>
                                        <i className="fas fa-print"></i>
                                        <span>Imprimir</span>
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




