import { useState, useEffect, useMemo, useRef } from 'react';
import ExcelJS from 'exceljs';
import AppLayout from '../../../components/Layout/AppLayout';
import { relatorioRecebimentoAPI, produtosAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { ColumnToggle } from '../../../ui';
import { MobileActionSheet } from '../../../components/ui';
import { upperFields } from '../../../utils/text';
import {
    currentMonthISO, formatDateBR, formatMonthLabel, monthRangeISO,
    normalizeISODate, previousMonthISO, todayISO
} from '../../../utils/date';
import useColumnVisibility from '../../../hooks/useColumnVisibility';
import '../InspecaoMontagem/InspecaoMontagem.css';
import '../recebimento.css';
import './RelatorioRecebimento.css';

const hoje = todayISO;

/* Era uma copia local que fazia `split('-')` e tomava o terceiro pedaco como
   dia. O utilitario compartilhado extrai a data por regex e aguenta valor com
   hora junto, que e o formato de `created_at`. */
const formatarData = (d) => formatDateBR(d, '-');

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
        /* `render` devolve o badge, que nao serve para a planilha; `texto` e a
           versao em palavra. Exportacao usa `texto` quando existe. */
        texto: (r) => getStatusLabel(r.status_material),
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
    /* As quatro colunas REL, SEI, DEV e LP viraram esta. Registro antigo
       continua aparecendo: o backend deduz a disposição do campo antigo que
       estiver preenchido. */
    { key: 'disposicao', label: 'Disposição', default: false, render: (r) => r.disposicao || '-' },
    { key: 'liberado_sap', label: 'Liberado no SAP', default: false, render: (r) => r.liberado_sap || '-' },
    { key: 'observacao', label: 'Observação', default: false, render: (r) => r.observacao || '-' }
];

/* As tres situacoes do filtro de Status mais o total, para card e select
   nunca discordarem, e um quinto recorte: lote com destino declarado. */
const CARDS_RESUMO = [
    { chave: 'todos', rotulo: 'Total de entradas', icone: 'fa-truck-ramp-box', tom: 'total' },
    { chave: 'aprovado', rotulo: 'Aprovadas', icone: 'fa-circle-check', tom: 'approved' },
    { chave: 'reprovado', rotulo: 'Reprovadas', icone: 'fa-circle-xmark', tom: 'rejected' },
    { chave: 'pendente', rotulo: 'Pendentes', icone: 'fa-clock', tom: 'pending' },
    { chave: 'disposicao', rotulo: 'Em disposição', icone: 'fa-arrows-split-up-and-left', tom: 'disposicao' }
];

const STATUS_DO_FILTRO = ['aprovado', 'reprovado', 'pendente'];

const temDisposicao = (registro) => !!String(registro.disposicao || '').trim();

/* Destinos possíveis de um lote com problema. Substituíram REL, SEI, DEV e LP,
   que eram quatro campos de texto para registrar um destino só. O rótulo é o
   valor gravado, como já acontece em "Liberado no SAP". */
const DISPOSICOES = ['Retrabalho', 'Seleção', 'Devolução', 'Lote Piloto'];

/* Lote sem não conformidade não tem disposição a declarar: entra, é aprovado e
   segue. Com NC, o destino é a informação que falta no relatório. */
const exigeDisposicao = (dados) => (
    Number(dados.qtd_nc || 0) > 0
    || String(dados.status_material || '').toLowerCase() === 'reprovado'
);

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
    disposicao: '',
    liberado_sap: '',
    observacao: ''
});

export default function RelatorioRecebimento() {
    const { user } = useAuth();
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    /* ── Filtros ──
       O card ativo e o filtro de Status sao a mesma coisa: o select mostra o
       card escolhido e o card acende com o select. Um estado so, para os dois
       nao discordarem. 'disposicao' e o quinto card, que e outro recorte. */
    const [filtroCard, setFiltroCard] = useState('todos');
    const statusSelecionado = STATUS_DO_FILTRO.includes(filtroCard) ? filtroCard : '';

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
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(estadoInicial());
    const [activeTab, setActiveTab] = useState('entrada');
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const searchTimeout = useRef(null);

    /* Só a busca continua indo ao servidor. O Status saiu de lá: com a lista
       já recortada por status, os cards contariam sempre o próprio filtro —
       "Aprovadas" mostraria o total e os outros três, zero. */
    useEffect(() => {
        loadRegistros();
    }, [search]);

    const loadRegistros = async () => {
        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;
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

    useEffect(() => {
        if (!showPeriodMenu) return;
        const fechar = (evento) => {
            if (periodMenuRef.current && !periodMenuRef.current.contains(evento.target)) {
                setShowPeriodMenu(false);
            }
        };
        document.addEventListener('mousedown', fechar);
        /* `touchstart` além de `mousedown`: no celular o mousedown sintético só
           chega depois do toque terminar, e às vezes nem chega. */
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

    /* Pela data de entrada, que é o que a tela registra: a data de inspeção
       pode estar em branco num lote que ainda não foi inspecionado, e ele
       sumiria de qualquer período escolhido.

       O período é o primeiro corte, e os cards contam sobre ele — senão
       "Aprovadas" mostraria o total histórico com a tabela num mês só. */
    const noPeriodo = useMemo(() => {
        if (!dateFilter && !dateEndFilter) return registros;
        return registros.filter((registro) => {
            const data = normalizeISODate(registro.data_entrada, '');
            if (!data) return false;
            if (dateFilter && data < dateFilter) return false;
            if (dateEndFilter && data > dateEndFilter) return false;
            return true;
        });
    }, [registros, dateFilter, dateEndFilter]);

    const contar = (chave) => {
        if (chave === 'todos') return noPeriodo.length;
        if (chave === 'disposicao') return noPeriodo.filter(temDisposicao).length;
        return noPeriodo.filter((r) => normalizarStatus(r.status_material) === chave).length;
    };

    const registrosFiltrados = useMemo(() => {
        if (filtroCard === 'todos') return noPeriodo;
        if (filtroCard === 'disposicao') return noPeriodo.filter(temDisposicao);
        return noPeriodo.filter((r) => normalizarStatus(r.status_material) === filtroCard);
    }, [noPeriodo, filtroCard]);

    /* Clicar de novo no card aceso volta para "todos" — é como se desfaz o
       filtro sem procurar o select. */
    const alternarCard = (chave) => {
        setFiltroCard((atual) => (atual === chave ? 'todos' : chave));
    };

    const setCampo = (campo, valor) => setFormData((prev) => ({ ...prev, [campo]: valor }));

    const disposicaoObrigatoria = exigeDisposicao(formData);

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

        /* A aba entra em cena junto com o aviso: no modo Abas o campo pode
           estar fora da tela, e uma mensagem sobre um campo que o inspetor não
           está vendo não diz onde corrigir. */
        if (disposicaoObrigatoria && !formData.disposicao) {
            if (formViewMode === 'tabs') setActiveTab('indicadores');
            alert('Informe a Disposição: o lote tem quantidade não conforme ou está reprovado.');
            return;
        }

        try {
            const dados = upperFields({
                ...formData,
                inspetor: user?.nome || formData.inspetor || 'Sistema'
            }, [
                /* `disposicao` fica de fora: o valor vem de uma lista fechada,
                   e passá-lo por maiúsculas mudaria "Lote Piloto" para
                   "LOTE PILOTO", que não é nenhuma das opções. */
                'cod_sap', 'descricao_sap', 'fornecedor', 'nota_fiscal', 'rastreabilidade',
                'documento', 'defeito', 'mpn'
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
        setFormData({
            ...estadoInicial(),
            ...reg,
            data_entrada: normalizeISODate(reg.data_entrada || hoje()),
            data_inspecao: normalizeISODate(reg.data_inspecao || hoje())
        });
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

    /* Exporta o que está na tabela: período, card e busca aplicados, e as
       colunas que o usuário deixou visíveis no seletor de Colunas — exportar
       as escondidas devolveria uma planilha diferente do que ele vê. */
    const exportarExcel = async () => {
        if (registrosFiltrados.length === 0) {
            alert('Nenhum registro para exportar.');
            return;
        }
        setExportando(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const planilha = workbook.addWorksheet('Entrada de Matéria-Prima');
            planilha.columns = colunasVisiveis.map((coluna) => ({
                header: coluna.label,
                key: coluna.key,
                width: Math.min(Math.max(coluna.label.length + 6, 14), 40)
            }));

            registrosFiltrados.forEach((registro) => {
                const linha = {};
                colunasVisiveis.forEach((coluna) => {
                    const valor = coluna.texto ? coluna.texto(registro) : coluna.render(registro);
                    linha[coluna.key] = valor === '-' ? '' : valor;
                });
                planilha.addRow(linha);
            });

            const cabecalho = planilha.getRow(1);
            cabecalho.font = { bold: true };
            cabecalho.alignment = { vertical: 'middle', horizontal: 'center' };

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `entrada-materia-prima-${todayISO()}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setExportando(false);
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
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Registro' }, { label: 'Relatório de Recebimento' }]}
            containerClassName="relatorio-recebimento-page"
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-truck-ramp-box"></i> Relatório de Entrada de Matéria-Prima Nacional</h1>
                        <p>Registro de entradas e inspeção de recebimento de matéria-prima</p>
                    </div>
                </div>

                {/* Cards de resumo, no padrão das telas de Produto Importado e
                    Injeção. Contam sobre o período escolhido e filtram a
                    tabela ao serem clicados. */}
                <div className="summary-grid recb-summary-grid">
                    {CARDS_RESUMO.map((card) => (
                        <button
                            key={card.chave}
                            type="button"
                            className={`summary-card is-clickable ${card.tom} ${filtroCard === card.chave ? 'is-active' : ''}`}
                            onClick={() => (card.chave === 'todos'
                                ? setFiltroCard('todos')
                                : alternarCard(card.chave))}
                            aria-pressed={filtroCard === card.chave}
                        >
                            <div className="summary-heading">
                                <i className={`fas ${card.icone}`} aria-hidden="true"></i>
                                <span>{card.rotulo}</span>
                            </div>
                            <strong>{loading ? '—' : contar(card.chave)}</strong>
                            <span className="summary-line" aria-hidden="true"></span>
                        </button>
                    ))}
                </div>

                {/* Busca, período, status, colunas, exportação e ação numa linha
                    só. Os rótulos ficam em `.filter-label`, que some no celular
                    deixando só os ícones. */}
                <div className="header-actions recb-filtros">
                    <div className="recb-busca">
                        <i className="fas fa-search" aria-hidden="true"></i>
                        <input
                            type="search"
                            className="form-control"
                            placeholder="Buscar por SAP, fornecedor, descrição..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Buscar entrada"
                        />
                    </div>

                    <div className="period-filter-wrapper" ref={periodMenuRef}>
                        <button
                            type="button"
                            className={showPeriodMenu ? 'period-filter-button active' : 'period-filter-button'}
                            onClick={() => setShowPeriodMenu((c) => !c)}
                            aria-expanded={showPeriodMenu}
                            aria-haspopup="dialog"
                            title={'Período (data de entrada): ' + periodoLabel}
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
                                        onChange={(e) => selecionarMes(e.target.value)} />
                                </label>

                                <div className="period-range-fields">
                                    <label>
                                        <span>Data inicial</span>
                                        <input type="date" value={rangeStartDraft}
                                            max={rangeEndDraft || undefined}
                                            onChange={(e) => setRangeStartDraft(e.target.value)} />
                                    </label>
                                    <label>
                                        <span>Data final</span>
                                        <input type="date" value={rangeEndDraft}
                                            min={rangeStartDraft || undefined}
                                            onChange={(e) => setRangeEndDraft(e.target.value)} />
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

                    {/* Mesmo estado dos cards: escolher aqui acende o card, e
                        clicar no card muda o que aparece aqui. */}
                    <select className="form-control recb-filtro-status" value={statusSelecionado}
                        onChange={(e) => setFiltroCard(e.target.value || 'todos')}
                        aria-label="Filtrar por status do material">
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

                    <button type="button" className="btn btn-success" onClick={exportarExcel}
                        disabled={exportando || registrosFiltrados.length === 0}
                        title="Exportar Excel">
                        <i className={`fas ${exportando ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
                        <span className="filter-label"> Exportar Excel</span>
                    </button>

                    <button type="button" className="btn btn-primary" onClick={() => { resetForm(); setShowModal(true); }}
                        title="Nova entrada">
                        <i className="fas fa-plus"></i>
                        <span className="filter-label"> Nova Entrada</span>
                    </button>
                </div>

                <div className="table-card">
                    <div className="table-container ficha-scroll">
                        <table className="table tabela-recebimento">
                            <thead>
                                <tr>
                                    {colunasVisiveis.map((c) => (
                                        <th key={c.key}>{c.label}</th>
                                    ))}
                                    <th className="actions-column">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={colunasVisiveis.length + 1} className="recb-vazio-celula">Carregando...</td></tr>
                                ) : registrosFiltrados.length === 0 ? (
                                    /* Dentro da tabela, e não abaixo dela: assim o
                                       cabeçalho continua à vista e dá para ver quais
                                       colunas estão ligadas. */
                                    <tr>
                                        <td colSpan={colunasVisiveis.length + 1} className="recb-vazio-celula">
                                            <i className="fas fa-inbox" aria-hidden="true"></i>
                                            {registros.length
                                                ? 'Nenhuma entrada corresponde aos filtros.'
                                                : 'Nenhuma entrada registrada ainda.'}
                                        </td>
                                    </tr>
                                ) : (
                                    registrosFiltrados.map((reg) => (
                                        <tr key={reg.id}
                                            className={`mobile-clickable-row ${sheetItem?.id === reg.id ? 'mobile-row-active' : ''}`}
                                            onClick={() => {
                                                if (typeof window === 'undefined') return;
                                                if (!window.matchMedia('(max-width: 1024px)').matches) return;
                                                setSheetItem(reg);
                                            }}>
                                            {colunasVisiveis.map((c) => (
                                                <td key={c.key}>{c.render(reg)}</td>
                                            ))}
                                            <td className="actions-column">
                                                <div className="acoes">
                                                    <button className="btn-icon btn-view" title="Ver"
                                                        aria-label="Ver entrada"
                                                        onClick={(e) => { e.stopPropagation(); setViewRecord(reg); }}>
                                                        <i className="fas fa-eye"></i>
                                                    </button>
                                                    <button className="btn-icon btn-edit" title="Editar"
                                                        aria-label="Editar entrada"
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(reg); }}>
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button className="btn-icon btn-delete" title="Excluir"
                                                        aria-label="Excluir entrada"
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(reg.id); }}>
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

                {/* Somente leitura: os dados são texto, sem nenhum campo que
                    possa ser alterado sem querer. */}
                {viewRecord && (
                    <div className="modal-overlay recb-view-modal" onClick={() => setViewRecord(null)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2><i className="fas fa-eye"></i> Entrada de Matéria-Prima</h2>
                                <button className="modal-close" onClick={() => setViewRecord(null)}
                                    aria-label="Fechar">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            <div className="modal-body">
                                <h3 className="section-title">Identificação</h3>
                                <div className="view-grid">
                                    <div className="view-item">
                                        <span className="view-label">Data Entrada</span>
                                        <span className="view-value">{formatarData(viewRecord.data_entrada)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Data Inspeção</span>
                                        <span className="view-value">{formatarData(viewRecord.data_inspecao)}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Código SAP</span>
                                        <span className="view-value">{viewRecord.cod_sap || '-'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Descrição SAP</span>
                                        <span className="view-value">{viewRecord.descricao_sap || '-'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Fornecedor</span>
                                        <span className="view-value">{viewRecord.fornecedor || '-'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Nota Fiscal</span>
                                        <span className="view-value">{viewRecord.nota_fiscal || '-'}</span>
                                    </div>
                                </div>

                                <h3 className="section-title">Quantidades e Resultado</h3>
                                <div className="view-grid">
                                    <div className="view-item">
                                        <span className="view-label">Qtd. Total</span>
                                        <span className="view-value">{viewRecord.qtd_total ?? 0}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Qtd. Inspecionada</span>
                                        <span className="view-value">{viewRecord.qtd_inspecionada ?? 0}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Qtd. NC</span>
                                        <span className="view-value">{viewRecord.qtd_nc ?? 0}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Status Material</span>
                                        <span className={`badge ${getStatusClass(viewRecord.status_material)}`}>
                                            {getStatusLabel(viewRecord.status_material)}
                                        </span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Disposição</span>
                                        <span className="view-value">{viewRecord.disposicao || '-'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Liberado no SAP</span>
                                        <span className="view-value">{viewRecord.liberado_sap || '-'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Inspetor</span>
                                        <span className="view-value">{viewRecord.inspetor || '-'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Rastreabilidade</span>
                                        <span className="view-value">{viewRecord.rastreabilidade || '-'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">MPN</span>
                                        <span className="view-value">{viewRecord.mpn || '-'}</span>
                                    </div>
                                </div>

                                {viewRecord.defeito && (
                                    <div className="view-section">
                                        <h4>Defeito</h4>
                                        <p>{viewRecord.defeito}</p>
                                    </div>
                                )}

                                {viewRecord.observacao && (
                                    <div className="view-section">
                                        <h4>Observação</h4>
                                        <p>{viewRecord.observacao}</p>
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
                                        handleEdit(alvo);
                                    }}>
                                    <i className="fas fa-pen" aria-hidden="true"></i> Editar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mesmas três ações da coluna, em tamanho de toque. */}
                <MobileActionSheet
                    item={sheetItem}
                    titulo={sheetItem ? (sheetItem.cod_sap || sheetItem.fornecedor || 'Entrada') : ''}
                    onFechar={() => setSheetItem(null)}
                    acoes={[
                        { id: 'ver', rotulo: 'Ver', icone: 'fa-eye', className: 'btn-view', onClick: setViewRecord },
                        { id: 'editar', rotulo: 'Editar', icone: 'fa-edit', className: 'btn-edit', onClick: handleEdit },
                        { id: 'excluir', rotulo: 'Excluir', icone: 'fa-trash', className: 'btn-delete', onClick: (r) => handleDelete(r.id) }
                    ]}
                />

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
                                            <div className="form-group">
                                                <label>MPN</label>
                                                <input type="text" className="form-control field-upper" value={formData.mpn}
                                                    onChange={(e) => setCampo('mpn', e.target.value)} />
                                            </div>
                                            {/* No lugar de REL, SEI, DEV e LP, que eram quatro
                                                campos de texto para marcar um destino só. */}
                                            <div className="form-group">
                                                <label>
                                                    Disposição{disposicaoObrigatoria ? ' *' : ''}
                                                </label>
                                                {/* Sem `required` no elemento: no modo Abas este
                                                    campo nem está no DOM quando outra aba está
                                                    aberta, e a validação do navegador passaria
                                                    direto. Quem cobra é o handleSubmit, que
                                                    também traz a aba certa para a frente. */}
                                                <select className="form-control" value={formData.disposicao}
                                                    onChange={(e) => setCampo('disposicao', e.target.value)}
                                                    aria-describedby="ajuda-disposicao">
                                                    <option value="">Selecione</option>
                                                    {DISPOSICOES.map((opcao) => (
                                                        <option key={opcao} value={opcao}>{opcao}</option>
                                                    ))}
                                                </select>
                                                {disposicaoObrigatoria && (
                                                    <small className="campo-ajuda" id="ajuda-disposicao">
                                                        Obrigatória: o lote tem não conformidade.
                                                    </small>
                                                )}
                                            </div>
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
            </div>
        </AppLayout>
    );
}

