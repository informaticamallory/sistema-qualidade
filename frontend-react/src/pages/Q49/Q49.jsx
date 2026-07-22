import { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../../components/Sidebar/Sidebar';
import { produtosAPI, q49API } from '../../services/api';
import './Q49.css';

const MONTHS = [
    'JANEIRO',
    'FEVEREIRO',
    'MARÇO',
    'ABRIL',
    'MAIO',
    'JUNHO',
    'JULHO',
    'AGOSTO',
    'SETEMBRO',
    'OUTUBRO',
    'NOVEMBRO',
    'DEZEMBRO'
];

const MODAL_TABS = [
    { id: 'china', label: '🇨🇳 China' },
    { id: 'decisaoBrasil', label: '⚖️ Decisão Brasil' },
    { id: 'brasil', label: '🇧🇷 Brasil' }
];

const RESULTADO_OPTIONS = [
    { value: 'aprovado', label: 'Aprovado' },
    { value: 'reprovado', label: 'Reprovado' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'concessao', label: 'Concessão' }
];

const DECISAO_BRASIL_OPTIONS = [
    { value: 'liberado', label: 'Liberado' },
    { value: 'bloqueado', label: 'Bloqueado' },
    { value: 'pendente', label: 'Pendente' },
    { value: 'concessao', label: 'Concessão' }
];

const TIPO_ITEM_OPTIONS = [
    { value: '', label: 'Selecione' },
    { value: 'MateriaPrima', label: 'Matéria Prima' },
    { value: 'ProdutoAcabado', label: 'Produto Acabado' },
    // { value: 'Reinspeção', label: 'Reinspeção' }
];

const NACIONALIZACAO_OPTIONS = [
    // { value: 'Nacional', label: 'Nacional' },
    { value: 'Importado', label: 'Importado' }
];


const todayISO = () => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().split('T')[0];
};

const dateParts = (value) => {
    if (!value) return { ano: '', mes: '' };
    const [ano, mes] = value.split('-');
    return {
        ano: ano || '',
        mes: MONTHS[Number(mes) - 1] || ''
    };
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

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyChina = () => {
    const datachina = todayISO();
    return {
        datachina,
        ...dateParts(datachina),
        po: '',
        emani: '',
        semana: getWeekFromDate(datachina),
        tipoItem: '',
        nInsp: '',
        nacionalizacao: 'Importado',
        codigoSAP: '',
        descricaoSAP: '',
        linha: '',
        modelo: '',
        fornecedor: '',
        qtdTotal: '',
        qtdInspecionada: '',
        rastreabilidade: '',
        inspetorChina: '',
        resultado: 'pendente',
        rejeicoes: '',
        resumoProblemas: ''
    };
};

const emptyDecisaoBrasil = () => ({
    decisaoMallory: '',
    acao: '',
    prazo: '',
    status: 'pendente',
    tipoReprovacao: '',
    dataAceiteQ49: '',
    respReprovacao: '',
    observacoes: ''
});

const emptyBrasil = () => {
    const dataEntrada = todayISO();
    return {
        dataEntrada,
        ...dateParts(dataEntrada),
        dataInspecao: '',
        qtdInspecionada: '',
        qtdNCInspecionada: '',
        qtdLiberados: '',
        qtdBloqueados: '',
        inspetor: '',
        decisaoBrasil: 'pendente',
        reporteDocushare: '',
        disposicaoDecisao: '',
        defeitos: '',
        nRNA: ''
    };
};

const emptyRecordForm = () => ({
    china: emptyChina(),
    decisaoBrasil: emptyDecisaoBrasil(),
    brasil: emptyBrasil()
});

const UPPER_FIELDS = {
    china: ['codigoSAP', 'descricaoSAP', 'modelo', 'fornecedor'],
    decisaoBrasil: ['decisaoMallory', 'respReprovacao'],
    brasil: ['inspetor', 'reporteDocushare', 'nRNA']
};

const CHINA_FIELDS = [
    { name: 'datachina', label: 'Data China', type: 'date' },
    { name: 'ano', label: 'Ano', readOnly: true },
    { name: 'mes', label: 'Mês', readOnly: true },
    { name: 'po', label: 'P.O', type: 'text' },
    { name: 'semana', label: 'Semana', type: 'text' },
    { name: 'tipoItem', label: 'Tipo de Item', type: 'select', options: TIPO_ITEM_OPTIONS },
    { name: 'nInsp', label: 'N° Insp.', type: 'text' },
    { name: 'nacionalizacao', label: 'Nacionalização', type: 'select', options: NACIONALIZACAO_OPTIONS },
    { name: 'codigoSAP', label: 'Código SAP', type: 'text', upper: true },
    { name: 'descricaoSAP', label: 'Descrição SAP', type: 'text', upper: true },
    { name: 'linha', label: 'Linha', type: 'text' },
    { name: 'modelo', label: 'Modelo', type: 'text', upper: true },
    { name: 'fornecedor', label: 'Fornecedor', type: 'text', upper: true },
    { name: 'qtdTotal', label: 'Qtd. Total', type: 'number' },
    { name: 'qtdInspecionada', label: 'Qtd. Inspecionada', type: 'number' },
    { name: 'rastreabilidade', label: 'Rastreabilidade', type: 'text' },
    { name: 'inspetorChina', label: 'Inspetor China', type: 'text' },
    { name: 'resultado', label: 'Resultado', type: 'select', options: RESULTADO_OPTIONS },
    { name: 'rejeicoes', label: 'Rejeições / Informações', type: 'textarea' },
    { name: 'resumoProblemas', label: 'Resumo dos Problemas', type: 'textarea' }
];

const DECISAO_BRASIL_FIELDS = [
    { name: 'decisaoMallory', label: 'Decisão Mallory', type: 'text', upper: true },
    { name: 'acao', label: 'Ação', type: 'textarea' },
    { name: 'prazo', label: 'Prazo', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', options: RESULTADO_OPTIONS },
    { name: 'tipoReprovacao', label: 'Tipo de Reprovação', type: 'text' },
    { name: 'dataAceiteQ49', label: 'Data do Aceite Q49', type: 'date' },
    { name: 'respReprovacao', label: 'Resp. pela Reprovação', type: 'text', upper: true },
    { name: 'observacoes', label: 'Observações', type: 'textarea' }
];

const BRASIL_FIELDS = [
    { name: 'dataEntrada', label: 'Data Entrada', type: 'date' },
    { name: 'ano', label: 'Ano', readOnly: true },
    { name: 'mes', label: 'Mês', readOnly: true },
    { name: 'dataInspecao', label: 'Data Inspeção', type: 'date' },
    { name: 'qtdInspecionada', label: 'Qtd. Inspecionada', type: 'number' },
    { name: 'qtdNCInspecionada', label: 'Qtd. NC Inspecionada', type: 'number' },
    { name: 'qtdLiberados', label: 'Qtd. Total de Produtos Liberados', type: 'number' },
    { name: 'qtdBloqueados', label: 'Qtd. Total de Produtos Bloqueados', type: 'number' },
    { name: 'inspetor', label: 'Inspetor', type: 'text', upper: true },
    { name: 'decisaoBrasil', label: 'Decisão Brasil', type: 'select', options: DECISAO_BRASIL_OPTIONS },
    { name: 'reporteDocushare', label: 'Reporte Docushare', type: 'text', upper: true },
    { name: 'disposicaoDecisao', label: 'Disposição / Decisão', type: 'textarea' },
    { name: 'defeitos', label: 'Defeitos', type: 'textarea' },
    { name: 'nRNA', label: 'Nº RNA', type: 'text', upper: true }
];

const FIELDS_BY_TAB = {
    china: CHINA_FIELDS,
    decisaoBrasil: DECISAO_BRASIL_FIELDS,
    brasil: BRASIL_FIELDS
};

function formatDate(value) {
    if (!value) return '-';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
}

function normalizeSearch(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function displayValue(value) {
    if (value === 0) return 0;
    return value || '-';
}

const resultadoBadge = (value) => {
    const map = {
        aprovado: { label: 'Aprovado', className: 'badge-success' },
        reprovado: { label: 'Reprovado', className: 'badge-danger' },
        pendente: { label: 'Pendente', className: 'badge-warning' },
        liberado: { label: 'Liberado', className: 'badge-success' },
        bloqueado: { label: 'Bloqueado', className: 'badge-danger' },
        concessao: { label: 'Concessão', className: 'badge-concessao' }
    };
    const entry = map[normalizeSearch(value)] ?? { label: value || '-', className: '' };
    return <span className={`badge ${entry.className}`}>{entry.label}</span>;
};

export default function Q49() {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [modalTab, setModalTab] = useState('china');
    const [formData, setFormData] = useState(emptyRecordForm);
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const searchTimeout = useRef(null);

    useEffect(() => {
        loadRecords();
    }, []);

    const loadRecords = async () => {
        try {
            setLoading(true);
            const response = await q49API.getAll();
            if (response.data.success) {
                setRecords(response.data.data || []);
            }
        } catch (error) {
            console.error('Erro ao carregar registros Q49:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredRecords = useMemo(() => {
        const term = normalizeSearch(search).trim();
        if (!term) return records;

        return records.filter((record) => {
            const china = record.china || {};
            const decisaoBrasil = record.decisaoBrasil || {};
            const brasil = record.brasil || {};
            return [
                china.codigoSAP,
                china.descricaoSAP,
                china.fornecedor,
                china.nInsp,
                china.resultado,
                decisaoBrasil.status,
                brasil.decisaoBrasil,
                brasil.inspetor
            ].some((value) => normalizeSearch(value).includes(term));
        });
    }, [records, search]);

    const clearProdutoSugestoes = () => {
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
            searchTimeout.current = null;
        }

        setProdutoSugestoes([]);
        setShowSugestoes(false);
    };

    const buscarSugestoes = (termo) => {
        if (searchTimeout.current) {
            clearTimeout(searchTimeout.current);
        }

        const busca = String(termo || '').trim();
        if (busca.length < 2) {
            setProdutoSugestoes([]);
            setShowSugestoes(false);
            return;
        }

        searchTimeout.current = setTimeout(async () => {
            try {
                const response = await produtosAPI.search(busca);
                const data = response.data?.success ? response.data.data : response.data?.data;
                const sugestoes = Array.isArray(data) ? data : [];

                setProdutoSugestoes(sugestoes);
                setShowSugestoes(sugestoes.length > 0);
            } catch (error) {
                setProdutoSugestoes([]);
                setShowSugestoes(false);
            }
        }, 300);
    };

    const selecionarProduto = (produto) => {
        const codigo = produto.cod_material || produto.codigo || produto.codigoSAP || '';
        const descricao = produto.desc_material || produto.descricao || produto.descricaoSAP || '';
        const linha = produto.cod_linha || produto.linha || '';
        const modelo = getProdutoModelo(produto);
        const fornecedor = produto.fornecedor || produto.nome_fornecedor || produto.desc_fornecedor || '';

        setFormData((current) => ({
            ...current,
            china: {
                ...current.china,
                codigoSAP: String(codigo || current.china.codigoSAP || '').toUpperCase(),
                descricaoSAP: String(descricao || current.china.descricaoSAP || '').toUpperCase(),
                linha: linha || current.china.linha || '',
                modelo: String(modelo || '').toUpperCase(),
                fornecedor: String(fornecedor || current.china.fornecedor || '').toUpperCase()
            }
        }));

        clearProdutoSugestoes();
    };

    const openNewModal = () => {
        clearProdutoSugestoes();
        setFormData(emptyRecordForm());
        setEditingId(null);
        setModalTab('china');
        setShowModal(true);
    };

    const openEditModal = (record) => {
        clearProdutoSugestoes();
        const blank = emptyRecordForm();
        setFormData({
            china: { ...blank.china, ...(record.china || {}) },
            decisaoBrasil: { ...blank.decisaoBrasil, ...(record.decisaoBrasil || {}) },
            brasil: { ...blank.brasil, ...(record.brasil || {}) }
        });
        setEditingId(record.id);
        setModalTab('china');
        setShowModal(true);
    };

    const closeModal = () => {
        clearProdutoSugestoes();
        setShowModal(false);
        setEditingId(null);
        setModalTab('china');
        setFormData(emptyRecordForm());
    };

    const setNestedField = (section, field, value) => {
        const nextValue = UPPER_FIELDS[section]?.includes(field) ? value.toUpperCase() : value;

        setFormData((current) => {
            const sectionData = { ...current[section], [field]: nextValue };

            if (section === 'china' && field === 'datachina') {
                Object.assign(sectionData, dateParts(nextValue), { semana: getWeekFromDate(nextValue) });
            }

            if (section === 'brasil' && field === 'dataEntrada') {
                Object.assign(sectionData, dateParts(nextValue));
            }

            return { ...current, [section]: sectionData };
        });
    };

    const saveRecord = async (event) => {
        event.preventDefault();

        const payload = {
            china: { ...formData.china },
            decisaoBrasil: { ...formData.decisaoBrasil },
            brasil: { ...formData.brasil }
        };

        try {
            const response = editingId
                ? await q49API.update(editingId, payload)
                : await q49API.create(payload);

            if (!response.data.success) {
                alert(response.data.message || 'Erro ao salvar registro Q49.');
                return;
            }

            const savedRecord = response.data.data;
            setRecords((current) => (
                editingId
                    ? current.map((item) => (item.id === editingId ? savedRecord : item))
                    : [savedRecord, ...current]
            ));
            closeModal();
        } catch (error) {
            console.error('Erro ao salvar registro Q49:', error);
            alert('Erro ao salvar registro Q49.');
        }
    };

    const deleteRecord = async (id) => {
        if (!window.confirm('Tem certeza que deseja excluir este registro?')) return;

        try {
            await q49API.delete(id);
            setRecords((current) => current.filter((record) => record.id !== id));
        } catch (error) {
            console.error('Erro ao excluir registro Q49:', error);
            alert('Erro ao excluir registro Q49.');
        }
    };

    const exportRecords = () => {
        if (filteredRecords.length === 0) {
            alert('Nenhum registro para exportar.');
            return;
        }

        const columns = [
            'N° INSP.',
            'CÓDIGO SAP',
            'DESCRIÇÃO SAP',
            'FORNECEDOR',
            'DATA CHINA',
            'RESULTADO',
            'STATUS BRASIL'
        ];
        const csvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const lines = [
            columns.map(csvValue).join(';'),
            ...filteredRecords.map((record) => {
                const china = record.china || {};
                const decisaoBrasil = record.decisaoBrasil || {};
                return [
                    china.nInsp,
                    china.codigoSAP,
                    china.descricaoSAP,
                    china.fornecedor,
                    formatDate(china.datachina),
                    china.resultado,
                    decisaoBrasil.status
                ].map(csvValue).join(';');
            })
        ];
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'q49-produto-importado.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const getCurrentTabIndex = () => MODAL_TABS.findIndex((tab) => tab.id === modalTab);

    const goToPrevTab = () => {
        const index = getCurrentTabIndex();
        if (index > 0) setModalTab(MODAL_TABS[index - 1].id);
    };

    const goToNextTab = () => {
        const index = getCurrentTabIndex();
        if (index < MODAL_TABS.length - 1) setModalTab(MODAL_TABS[index + 1].id);
    };

    const renderField = (section, field) => {
        const value = formData[section]?.[field.name] ?? '';
        const className = `form-control ${field.upper ? 'field-upper' : ''}`.trim();

        if (section === 'china' && field.name === 'codigoSAP') {
            return (
                <div className="form-group produto-autocomplete" key={`${section}-${field.name}`}>
                    <label htmlFor={`q49-${section}-${field.name}`}>{field.label}</label>
                    <input
                        id={`q49-${section}-${field.name}`}
                        type="text"
                        className={className}
                        value={value}
                        autoComplete="off"
                        onChange={(event) => {
                            const nextValue = event.target.value.toUpperCase();
                            setNestedField(section, field.name, nextValue);
                            buscarSugestoes(nextValue);
                        }}
                        onFocus={() => {
                            if (produtoSugestoes.length > 0) {
                                setShowSugestoes(true);
                            } else {
                                buscarSugestoes(value);
                            }
                        }}
                        onBlur={() => {
                            setTimeout(() => setShowSugestoes(false), 150);
                        }}
                    />
                    {showSugestoes && produtoSugestoes.length > 0 && (
                        <ul className="autocomplete-list" role="listbox">
                            {produtoSugestoes.map((produto, index) => {
                                const codigo = produto.cod_material || produto.codigo || produto.codigoSAP || '';
                                const descricao = produto.desc_material || produto.descricao || produto.descricaoSAP || '';

                                return (
                                    <li
                                        key={`${codigo || 'produto'}-${index}`}
                                        className="autocomplete-item"
                                        role="option"
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            selecionarProduto(produto);
                                        }}
                                    >
                                        <span className="autocomplete-cod">{codigo}</span>
                                        <span className="autocomplete-desc">{descricao || 'Sem descrição cadastrada'}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            );
        }

        return (
            <div className={`form-group ${field.type === 'textarea' ? 'q49-field-wide' : ''}`} key={`${section}-${field.name}`}>
                <label htmlFor={`q49-${section}-${field.name}`}>{field.label}</label>
                {field.type === 'select' ? (
                    <select
                        id={`q49-${section}-${field.name}`}
                        className={className}
                        value={value}
                        onChange={(event) => setNestedField(section, field.name, event.target.value)}
                    >
                        {field.options.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                ) : field.type === 'textarea' ? (
                    <textarea
                        id={`q49-${section}-${field.name}`}
                        className={className}
                        rows="3"
                        value={value}
                        onChange={(event) => setNestedField(section, field.name, event.target.value)}
                    ></textarea>
                ) : (
                    <input
                        id={`q49-${section}-${field.name}`}
                        type={field.type || 'text'}
                        min={field.type === 'number' ? '0' : undefined}
                        className={className}
                        value={value}
                        readOnly={field.readOnly}
                        onChange={(event) => setNestedField(section, field.name, event.target.value)}
                    />
                )}
            </div>
        );
    };

    const renderModalTab = () => (
        <div className="tab-content active">
            <div className="q49-form-grid">
                {FIELDS_BY_TAB[modalTab].map((field) => renderField(modalTab, field))}
            </div>
        </div>
    );

    const renderModal = () => {
        if (!showModal) return null;
        const editingCode = formData.china.codigoSAP || 'Registro';
        const title = editingId
            ? `Editar Registro — ${editingCode}`
            : 'Novo Registro — Inspeção de Produto Importado';
        const currentIndex = getCurrentTabIndex();

        return (
            <div className="modal-overlay q49-modal" onClick={closeModal}>
                <div className="modal-content modal-xl" onClick={(event) => event.stopPropagation()}>
                    <form onSubmit={saveRecord}>
                        <div className="modal-header">
                            <h2><i className="fas fa-ship"></i> {title}</h2>
                            <button type="button" className="modal-close" onClick={closeModal} aria-label="Fechar modal">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="tabs-container q49-modal-tabs">
                            <div className="tabs" role="tablist" aria-label="Seções do registro Q49">
                                {MODAL_TABS.map((tab) => (
                                    <button
                                        type="button"
                                        key={tab.id}
                                        className={`tab ${modalTab === tab.id ? 'active' : ''}`}
                                        onClick={() => setModalTab(tab.id)}
                                        role="tab"
                                        aria-selected={modalTab === tab.id}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="modal-body">
                            {renderModalTab()}
                        </div>

                        <div className="modal-footer q49-modal-footer">
                            <div className="nav-buttons">
                                <button type="button" className="btn btn-nav" onClick={goToPrevTab} disabled={currentIndex === 0}>
                                    <i className="fas fa-arrow-left"></i> Anterior
                                </button>
                                <button type="button" className="btn btn-nav" onClick={goToNextTab} disabled={currentIndex === MODAL_TABS.length - 1}>
                                    Próximo <i className="fas fa-arrow-right"></i>
                                </button>
                            </div>
                            <div className="action-buttons-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                                    <i className="fas fa-times"></i> Fechar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    <i className="fas fa-save"></i> Salvar
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    return (
        <div className="app-container q49-page">
            <Sidebar />

            <main className="main-content">
                <div className="page-header q49-page-header">
                    <div className="page-title">
                        <h1>
                            <i className="fas fa-ship"></i>
                            Inspeção de Produto Importado
                        </h1>
                        <p>Acompanhamento e Controle de Q49 · RQ-048 · REV.08</p>
                    </div>
                </div>

                <div className="table-card">
                    <div className="q49-table-toolbar">
                        <input
                            type="text"
                            className="form-control q49-search"
                            placeholder="Buscar..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <div className="q49-toolbar-actions">
                            <button type="button" className="btn btn-primary" onClick={openNewModal}>
                                + Novo Registro
                            </button>
                            <button type="button" className="btn btn-outline" onClick={exportRecords}>
                                <i className="fas fa-file-excel"></i>
                                Exportar
                            </button>
                        </div>
                    </div>

                    <div className="table-container q49-table-container">
                        <table className="table q49-table q49-summary-table">
                            <thead>
                                <tr className="q49-header-china">
                                    <th>N° INSP.</th>
                                    <th>CÓDIGO SAP</th>
                                    <th>DESCRIÇÃO SAP</th>
                                    <th>FORNECEDOR</th>
                                    <th>DATA CHINA</th>
                                    <th>RESULTADO</th>
                                    <th>STATUS BRASIL</th>
                                    <th className="actions-column">AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="8" className="q49-loading-cell">Carregando...</td>
                                    </tr>
                                ) : filteredRecords.map((record) => {
                                    const china = record.china || {};
                                    const decisaoBrasil = record.decisaoBrasil || {};
                                    return (
                                        <tr key={record.id}>
                                            <td>{displayValue(china.nInsp)}</td>
                                            <td>{displayValue(china.codigoSAP)}</td>
                                            <td>{displayValue(china.descricaoSAP)}</td>
                                            <td>{displayValue(china.fornecedor)}</td>
                                            <td>{formatDate(china.datachina)}</td>
                                            <td>{resultadoBadge(china.resultado)}</td>
                                            <td>{resultadoBadge(decisaoBrasil.status)}</td>
                                            <td className="actions-column q49-actions-cell">
                                                <div className="q49-row-actions">
                                                    <button
                                                        type="button"
                                                        className="icon-button q49-action-view"
                                                        title="Ver"
                                                        aria-label="Ver registro"
                                                        onClick={() => openEditModal(record)}
                                                    >
                                                        <i className="fas fa-eye"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="icon-button q49-action-edit"
                                                        title="Editar"
                                                        aria-label="Editar registro"
                                                        onClick={() => openEditModal(record)}
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="icon-button q49-action-delete"
                                                        title="Excluir"
                                                        aria-label="Excluir registro"
                                                        onClick={() => deleteRecord(record.id)}
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {!loading && filteredRecords.length === 0 && (
                        <div className="table-empty">
                            <i className="fas fa-inbox"></i>
                            <p>Nenhum registro encontrado.</p>
                        </div>
                    )}
                </div>

                {renderModal()}
            </main>
        </div>
    );
}
