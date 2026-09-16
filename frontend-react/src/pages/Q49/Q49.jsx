import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import AppLayout from '../../components/Layout/AppLayout';
import { MobileActionSheet } from '../../components/ui';
import { produtosAPI, q49API } from '../../services/api';
import {
    currentMonthISO, formatDateBR, formatMonthLabel, monthRangeISO,
    normalizeISODate, previousMonthISO, todayISO
} from '../../utils/date';
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
    { id: 'china', label: '🌐 Internacional' },
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



const dateParts = (value) => {
    const date = normalizeISODate(value, '');
    if (!date) return { ano: '', mes: '' };
    const [ano, mes] = date.split('-');
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
    { name: 'datachina', label: 'Data Internacional', type: 'date' },
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
    { name: 'inspetorChina', label: 'Inspetor Internacional', type: 'text' },
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
    return formatDateBR(value, '-');
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

/* Um card por valor que `resultado` aceita, mais o total. Sem o de Concessao
   um registro nesse estado nao apareceria em card nenhum -- o campo tem
   quatro valores, nao tres. */
const CARDS_RESUMO = [
    { chave: 'todos', rotulo: 'Total de inspeções', icone: 'fa-clipboard-list', tom: 'total' },
    { chave: 'aprovado', rotulo: 'Aprovadas', icone: 'fa-circle-check', tom: 'approved' },
    { chave: 'reprovado', rotulo: 'Reprovadas', icone: 'fa-circle-xmark', tom: 'rejected' },
    { chave: 'pendente', rotulo: 'Pendentes', icone: 'fa-clock', tom: 'pending' },
    { chave: 'concessao', rotulo: 'Concessão', icone: 'fa-handshake', tom: 'concessao' }
];

/* Rotulo textual do resultado, sem o badge -- serve a planilha e ao modo
   leitura, que nao mostram o chip colorido. */
const ROTULOS_RESULTADO = {
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
    pendente: 'Pendente',
    concessao: 'Concessão',
    liberado: 'Liberado',
    bloqueado: 'Bloqueado'
};

const rotuloResultado = (value) => ROTULOS_RESULTADO[normalizeSearch(value)] || value || '';

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

    /* ── Filtros ──
       Periodo pela data da inspecao internacional (`datachina` no payload da
       API -- o nome do campo fica, so o rotulo muda). Tudo no cliente, sobre
       a lista ja carregada, como a busca que ja existia. */
    const [filtroResultado, setFiltroResultado] = useState('todos');
    const [monthFilter, setMonthFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [dateEndFilter, setDateEndFilter] = useState('');
    const [rangeStartDraft, setRangeStartDraft] = useState('');
    const [rangeEndDraft, setRangeEndDraft] = useState('');
    const [showPeriodMenu, setShowPeriodMenu] = useState(false);
    const periodMenuRef = useRef(null);
    const [exportando, setExportando] = useState(false);

    /* Linha tocada no celular e registro aberto em leitura. */
    const [sheetItem, setSheetItem] = useState(null);
    const [viewRecord, setViewRecord] = useState(null);

    useEffect(() => {
        if (!showPeriodMenu) return;
        const fechar = (evento) => {
            if (periodMenuRef.current && !periodMenuRef.current.contains(evento.target)) {
                setShowPeriodMenu(false);
            }
        };
        document.addEventListener('mousedown', fechar);
        /* `touchstart` alem de `mousedown`: no celular o mousedown sintetico
           so chega depois do toque terminar, e as vezes nem chega. */
        document.addEventListener('touchstart', fechar);
        return () => {
            document.removeEventListener('mousedown', fechar);
            document.removeEventListener('touchstart', fechar);
        };
    }, [showPeriodMenu]);

    const selecionarMes = (mes) => {
        const alvo = mes || currentMonthISO();
        const { start, end } = monthRangeISO(alvo);
        setMonthFilter(alvo);
        setDateFilter(start);
        setDateEndFilter(end);
        setRangeStartDraft('');
        setRangeEndDraft('');
        setShowPeriodMenu(false);
    };

    const aplicarIntervalo = () => {
        if (!rangeStartDraft || !rangeEndDraft) {
            alert('Selecione a data inicial e a data final.');
            return;
        }
        setMonthFilter('');
        setDateFilter(rangeStartDraft);
        setDateEndFilter(rangeEndDraft);
        setShowPeriodMenu(false);
    };

    const limparPeriodo = () => {
        setMonthFilter('');
        setDateFilter('');
        setDateEndFilter('');
        setRangeStartDraft('');
        setRangeEndDraft('');
        setShowPeriodMenu(false);
    };

    const periodoLabel = !dateFilter && !dateEndFilter
        ? 'Todo período'
        : (monthFilter
            ? formatMonthLabel(monthFilter)
            : `${formatDateBR(dateFilter, '—')} a ${formatDateBR(dateEndFilter, '—')}`);

    /* Periodo e o primeiro corte, e os cards contam sobre ele: senao
       "Aprovadas" mostraria o total historico com a tabela num mes so. */
    const noPeriodo = useMemo(() => {
        if (!dateFilter && !dateEndFilter) return records;
        return records.filter((record) => {
            const data = normalizeISODate(record.china?.datachina, '');
            if (!data) return false;
            if (dateFilter && data < dateFilter) return false;
            if (dateEndFilter && data > dateEndFilter) return false;
            return true;
        });
    }, [records, dateFilter, dateEndFilter]);

    const contarResultado = (chave) => (chave === 'todos'
        ? noPeriodo.length
        : noPeriodo.filter((r) => normalizeSearch(r.china?.resultado) === chave).length);

    const alternarResultado = (chave) => {
        setFiltroResultado((atual) => (atual === chave ? 'todos' : chave));
    };

    const filteredRecords = useMemo(() => {
        const term = normalizeSearch(search).trim();
        const porResultado = filtroResultado === 'todos'
            ? noPeriodo
            : noPeriodo.filter((r) => normalizeSearch(r.china?.resultado) === filtroResultado);

        if (!term) return porResultado;

        return porResultado.filter((record) => {
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
    }, [noPeriodo, filtroResultado, search]);

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

    /* Exporta o que esta na tabela -- periodo, resultado e busca aplicados --
       em xlsx, como as telas de Injecao e Montagem. Antes saia um CSV com
       separador ponto e virgula, que o Excel abre mas nao formata. */
    const exportRecords = async () => {
        if (filteredRecords.length === 0) {
            alert('Nenhum registro para exportar.');
            return;
        }
        setExportando(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const planilha = workbook.addWorksheet('Produto Importado');
            planilha.columns = [
                { header: 'N° Insp.', key: 'nInsp', width: 14 },
                { header: 'Código SAP', key: 'codigoSAP', width: 16 },
                { header: 'Descrição SAP', key: 'descricaoSAP', width: 38 },
                { header: 'Fornecedor', key: 'fornecedor', width: 26 },
                { header: 'Data Internacional', key: 'datachina', width: 18 },
                { header: 'Resultado', key: 'resultado', width: 14 },
                { header: 'Status Brasil', key: 'status', width: 14 }
            ];

            filteredRecords.forEach((record) => {
                const china = record.china || {};
                const decisaoBrasil = record.decisaoBrasil || {};
                planilha.addRow({
                    nInsp: china.nInsp || '',
                    codigoSAP: china.codigoSAP || '',
                    descricaoSAP: china.descricaoSAP || '',
                    fornecedor: china.fornecedor || '',
                    datachina: formatDateBR(china.datachina, ''),
                    resultado: rotuloResultado(china.resultado),
                    status: rotuloResultado(decisaoBrasil.status)
                });
            });

            const cabecalho = planilha.getRow(1);
            cabecalho.font = { bold: true };
            cabecalho.alignment = { vertical: 'middle', horizontal: 'center' };
            planilha.autoFilter = { from: 'A1', to: `G${planilha.rowCount}` };

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `produto-importado-${todayISO()}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setExportando(false);
        }
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
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Registro' }, { label: 'Produto Importado (Q49)' }]}
            containerClassName="q49-page"
        >
            <div>
                <div className="page-header q49-page-header">
                    <div className="page-title">
                        <h1>
                            <i className="fas fa-ship"></i>
                            Inspeção de Produto Importado
                        </h1>
                        <p>Acompanhamento e Controle de Q49 · RQ-048 · REV.08</p>
                    </div>
                </div>

                {/* Cards de resumo, no padrao das telas de Injecao e
                    Recebimento. Contam sobre o periodo escolhido e filtram a
                    tabela ao serem clicados. */}
                <div className="summary-grid q49-summary-grid">
                    {CARDS_RESUMO.map((card) => (
                        <button
                            key={card.chave}
                            type="button"
                            className={`summary-card is-clickable ${card.tom} ${filtroResultado === card.chave ? 'is-active' : ''}`}
                            onClick={() => (card.chave === 'todos'
                                ? setFiltroResultado('todos')
                                : alternarResultado(card.chave))}
                            aria-pressed={filtroResultado === card.chave}
                        >
                            <div className="summary-heading">
                                <i className={`fas ${card.icone}`} aria-hidden="true"></i>
                                <span>{card.rotulo}</span>
                            </div>
                            <strong>{loading ? '—' : contarResultado(card.chave)}</strong>
                            <span className="summary-line" aria-hidden="true"></span>
                        </button>
                    ))}
                </div>

                {/* Busca, periodo, resultado, exportacao e acao numa linha so,
                    como nas telas de referencia. Os rotulos ficam em
                    `.filter-label`, que some no celular deixando so icones. */}
                <div className="header-actions q49-filtros">
                    <div className="q49-busca">
                        <i className="fas fa-search" aria-hidden="true"></i>
                        <input
                            type="search"
                            className="form-control"
                            placeholder="Buscar por código SAP, descrição, fornecedor..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            aria-label="Buscar registro"
                        />
                    </div>

                    <div className="period-filter-wrapper" ref={periodMenuRef}>
                        <button
                            type="button"
                            className={showPeriodMenu ? 'period-filter-button active' : 'period-filter-button'}
                            onClick={() => setShowPeriodMenu((c) => !c)}
                            aria-expanded={showPeriodMenu}
                            aria-haspopup="dialog"
                            title={'Período: ' + periodoLabel}
                        >
                            <i className="fas fa-calendar-alt" aria-hidden="true"></i>
                            <span className="filter-label">
                                <span className="period-filter-title">Período</span>
                                <span className="period-filter-value">{periodoLabel}</span>
                            </span>
                            <i className="fas fa-chevron-down period-filter-chevron" aria-hidden="true"></i>
                        </button>

                        {showPeriodMenu && (
                            <div className="period-filter-menu" role="dialog" aria-label="Selecionar período">
                                <div className="period-filter-quick-actions">
                                    <button type="button" onClick={() => selecionarMes(currentMonthISO())}>Mês atual</button>
                                    <button type="button" onClick={() => selecionarMes(previousMonthISO())}>Mês anterior</button>
                                </div>

                                <label>
                                    <span>Outro mês</span>
                                    <input type="month" value={monthFilter}
                                        onChange={(event) => selecionarMes(event.target.value)} />
                                </label>

                                <div className="period-range-fields">
                                    <label>
                                        <span>Data inicial</span>
                                        <input type="date" value={rangeStartDraft}
                                            max={rangeEndDraft || undefined}
                                            onChange={(event) => setRangeStartDraft(event.target.value)} />
                                    </label>
                                    <label>
                                        <span>Data final</span>
                                        <input type="date" value={rangeEndDraft}
                                            min={rangeStartDraft || undefined}
                                            onChange={(event) => setRangeEndDraft(event.target.value)} />
                                    </label>
                                </div>

                                <button type="button" className="period-range-apply"
                                    onClick={aplicarIntervalo}>Aplicar intervalo</button>

                                {(dateFilter || dateEndFilter) && (
                                    <button type="button" className="period-limpar"
                                        onClick={limparPeriodo}>Mostrar todo período</button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Equivalente ao filtro de turno das telas de inspecao:
                        aqui o recorte util e o resultado da inspecao. */}
                    <select
                        className="form-control q49-filtro-resultado"
                        value={filtroResultado}
                        onChange={(event) => setFiltroResultado(event.target.value)}
                        aria-label="Filtrar por resultado"
                    >
                        <option value="todos">Todos os resultados</option>
                        {RESULTADO_OPTIONS.map((opcao) => (
                            <option key={opcao.value} value={opcao.value}>{opcao.label}</option>
                        ))}
                    </select>

                    <button type="button" className="btn btn-success" onClick={exportRecords}
                        disabled={exportando || filteredRecords.length === 0}
                        title="Exportar Excel">
                        <i className={`fas ${exportando ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
                        <span className="filter-label"> Exportar Excel</span>
                    </button>

                    <button type="button" className="btn btn-primary" onClick={openNewModal}
                        title="Novo registro">
                        <i className="fas fa-plus"></i>
                        <span className="filter-label"> Novo Registro</span>
                    </button>
                </div>

                <div className="table-card">
                    <div className="table-container q49-table-container">
                        <table className="table q49-table q49-summary-table">
                            <thead>
                                <tr className="q49-header-china">
                                    <th>N° INSP.</th>
                                    <th>CÓDIGO SAP</th>
                                    <th>DESCRIÇÃO SAP</th>
                                    <th>FORNECEDOR</th>
                                    <th>DATA INTERNACIONAL</th>
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
                                ) : filteredRecords.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="q49-loading-cell">
                                            {records.length
                                                ? 'Nenhum registro corresponde aos filtros.'
                                                : 'Nenhum registro cadastrado ainda.'}
                                        </td>
                                    </tr>
                                ) : filteredRecords.map((record) => {
                                    const china = record.china || {};
                                    const decisaoBrasil = record.decisaoBrasil || {};
                                    return (
                                        <tr key={record.id}
                                            className={`mobile-clickable-row ${sheetItem?.id === record.id ? 'mobile-row-active' : ''}`}
                                            onClick={() => {
                                                if (typeof window === 'undefined') return;
                                                if (!window.matchMedia('(max-width: 1024px)').matches) return;
                                                setSheetItem(record);
                                            }}>
                                            <td>{displayValue(china.nInsp)}</td>
                                            <td>{displayValue(china.codigoSAP)}</td>
                                            <td>{displayValue(china.descricaoSAP)}</td>
                                            <td>{displayValue(china.fornecedor)}</td>
                                            <td>{formatDate(china.datachina)}</td>
                                            <td>{resultadoBadge(china.resultado)}</td>
                                            <td>{resultadoBadge(decisaoBrasil.status)}</td>
                                            <td className="actions-column q49-actions-cell">
                                                <div className="acoes">
                                                    {/* "Ver" abria o mesmo modal de edicao do lapis --
                                                        nao era modo leitura. Agora abre o modal
                                                        somente leitura. */}
                                                    <button
                                                        type="button"
                                                        className="btn-icon btn-view"
                                                        title="Ver"
                                                        aria-label="Ver registro"
                                                        onClick={(e) => { e.stopPropagation(); setViewRecord(record); }}
                                                    >
                                                        <i className="fas fa-eye"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-icon btn-edit"
                                                        title="Editar"
                                                        aria-label="Editar registro"
                                                        onClick={(e) => { e.stopPropagation(); openEditModal(record); }}
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-icon btn-delete"
                                                        title="Excluir"
                                                        aria-label="Excluir registro"
                                                        onClick={(e) => { e.stopPropagation(); deleteRecord(record.id); }}
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

                    {/* O aviso de lista vazia ficava aqui, fora da tabela. Foi
                        para dentro, numa linha com colSpan, como nas telas de
                        Injecao e Recebimento -- assim o cabecalho da tabela
                        continua visivel quando nao ha registros. */}
                </div>

                {/* Somente leitura: o botao do olho abria o formulario de
                    edicao, o mesmo do lapis. Aqui os dados sao texto, sem
                    campo nenhum para alterar sem querer. */}
                {viewRecord && (
                    <div className="modal-overlay q49-view-modal" onClick={() => setViewRecord(null)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2><i className="fas fa-eye"></i> Registro de Produto Importado</h2>
                                <button className="modal-close" onClick={() => setViewRecord(null)}
                                    aria-label="Fechar">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            <div className="modal-body">
                                <h3 className="section-title">Identificação</h3>
                                <div className="view-grid">
                                    <div className="view-item">
                                        <span className="view-label">N° Insp.</span>
                                        <span className="view-value">{displayValue(viewRecord.china?.nInsp)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Código SAP</span>
                                        <span className="view-value">{displayValue(viewRecord.china?.codigoSAP)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Data Internacional</span>
                                        <span className="view-value">{formatDate(viewRecord.china?.datachina)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Descrição SAP</span>
                                        <span className="view-value">{displayValue(viewRecord.china?.descricaoSAP)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Fornecedor</span>
                                        <span className="view-value">{displayValue(viewRecord.china?.fornecedor)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Inspetor</span>
                                        <span className="view-value">{displayValue(viewRecord.china?.inspetorChina)}</span>
                                    </div>
                                </div>

                                <h3 className="section-title">Resultado da Inspeção</h3>
                                <div className="view-grid">
                                    <div className="view-item">
                                        <span className="view-label">Resultado</span>
                                        <span className="view-value">{resultadoBadge(viewRecord.china?.resultado)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Qtd. total</span>
                                        <span className="view-value">{displayValue(viewRecord.china?.qtdTotal)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Qtd. inspecionada</span>
                                        <span className="view-value">{displayValue(viewRecord.china?.qtdInspecionada)}</span>
                                    </div>
                                </div>

                                {viewRecord.china?.resumoProblemas && (
                                    <div className="view-section">
                                        <h4>Resumo dos problemas</h4>
                                        <p>{viewRecord.china.resumoProblemas}</p>
                                    </div>
                                )}

                                <h3 className="section-title">Decisão Brasil</h3>
                                <div className="view-grid">
                                    <div className="view-item">
                                        <span className="view-label">Status Brasil</span>
                                        <span className="view-value">{resultadoBadge(viewRecord.decisaoBrasil?.status)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Decisão Mallory</span>
                                        <span className="view-value">{displayValue(viewRecord.decisaoBrasil?.decisaoMallory)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Tipo de reprovação</span>
                                        <span className="view-value">{displayValue(viewRecord.decisaoBrasil?.tipoReprovacao)}</span>
                                    </div>
                                </div>

                                {viewRecord.decisaoBrasil?.observacoes && (
                                    <div className="view-section">
                                        <h4>Observações</h4>
                                        <p>{viewRecord.decisaoBrasil.observacoes}</p>
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setViewRecord(null)}>
                                    Fechar
                                </button>
                                <button className="btn btn-primary"
                                    onClick={() => {
                                        const alvo = viewRecord;
                                        setViewRecord(null);
                                        openEditModal(alvo);
                                    }}>
                                    <i className="fas fa-pen" aria-hidden="true"></i> Editar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mesmas tres acoes da coluna, em tamanho de toque. */}
                <MobileActionSheet
                    item={sheetItem}
                    titulo={sheetItem ? (sheetItem.china?.nInsp || sheetItem.china?.codigoSAP || 'Registro') : ''}
                    onFechar={() => setSheetItem(null)}
                    acoes={[
                        { id: 'ver', rotulo: 'Ver', icone: 'fa-eye', className: 'btn-view', onClick: setViewRecord },
                        { id: 'editar', rotulo: 'Editar', icone: 'fa-edit', className: 'btn-edit', onClick: openEditModal },
                        { id: 'excluir', rotulo: 'Excluir', icone: 'fa-trash', className: 'btn-delete', onClick: (r) => deleteRecord(r.id) }
                    ]}
                />

                {typeof document !== 'undefined' && createPortal(renderModal(), document.body)}
            </div>
        </AppLayout>
    );
}
