import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import AppLayout from '../../components/Layout/AppLayout';
import { useAuth } from '../../context/auth-context';
import {
    FilterCard, FilterCardStrip, GaleriaFotos, PeriodFilter, SidePanel
} from '../../components/ui';
import { fichasAPI, produtosAPI } from '../../services/api';
import { upperFields } from '../../utils/text';
import { urlArquivo } from '../../utils/arquivos';
import {
    currentMonthISO, formatDateBR, formatMonthLabel, monthRangeISO,
    normalizeISODate, previousMonthISO, todayISO
} from '../../utils/date';
import './Fichas.css';

/* O campo Status da ficha aceita cinco valores. Aqui eles viram tres
   recortes, que o seletor e os cards dividem — assim os dois nunca discordam.

   'Aguardando Ação' entra em "Em análise": é ficha em andamento, e um recorte
   só para ela deixaria o quarto card sem par no seletor. 'Cancelada' não entra
   em recorte nenhum e aparece apenas no total. */
const GRUPOS_STATUS = {
    aberta: ['aberta'],
    analise: ['em análise', 'aguardando ação'],
    concluida: ['concluída']
};

const OPCOES_STATUS = [
    { valor: '', rotulo: 'Todos os status' },
    { valor: 'aberta', rotulo: 'Aberta' },
    { valor: 'analise', rotulo: 'Em análise' },
    { valor: 'concluida', rotulo: 'Concluída' }
];

/* Mesma faixa da Inspeção de Injeção: total à esquerda, depois as situações. */
const CARDS_RESUMO = [
    { chave: '', contagem: 'total', rotulo: 'Total de FNCs', legenda: 'Todos os status', icone: 'fa-clipboard-list', tom: 'total' },
    { chave: 'concluida', contagem: 'concluidas', rotulo: 'Concluídas', legenda: 'FNCs encerradas', icone: 'fa-check-circle', tom: 'approved' },
    { chave: 'aberta', contagem: 'abertas', rotulo: 'Em aberto', legenda: 'Aguardando tratativa', icone: 'fa-times-circle', tom: 'rejected' },
    { chave: 'analise', contagem: 'pendentes', rotulo: 'Pendentes', legenda: 'Pendentes de decisão', icone: 'fa-clock', tom: 'pending' }
];

/* Badge com a cor da situação, como nas demais listagens: verde para
   encerrada, vermelho para o que ainda não foi tratado, amarelo no meio. */
const classeDoStatus = (valor) => {
    const status = String(valor || 'Aberta').trim().toLowerCase();
    if (status === 'concluída') return 'badge-success';
    if (status === 'cancelada') return 'badge-secondary';
    if (status === 'aberta') return 'badge-danger';
    return 'badge-warning';
};

const normalizarStatus = (valor) => String(valor || 'Aberta').trim().toLowerCase();

const noGrupo = (ficha, chave) => (GRUPOS_STATUS[chave] || []).includes(normalizarStatus(ficha.status));

const PARTIAL_TABS = ['analise', 'acoes', 'custos'];
const PARTIAL_FIELDS = [
    'porque_1', 'porque_2', 'porque_3', 'porque_4', 'porque_5',
    'acao_imediata', 'correcao', 'acao_corretiva', 'responsavel_acao', 'prazo_acao',
    'total_horas', 'taxa_trabalho', 'custo_material', 'custo_refugo', 'taxa_cambio'
];

function ReadonlyBanner({ type }) {
    if (type === 'partial') {
        return (
            <div className="readonly-banner partial">
                <i className="fas fa-unlock-alt"></i>
                <span>Você pode editar apenas Análise de Causas, Ações e Custos.</span>
            </div>
        );
    }

    return (
        <div className="readonly-banner readonly">
            <i className="fas fa-lock"></i>
            <span>Você tem permissão apenas para visualizar esta ficha.</span>
        </div>
    );
}

export default function Fichas() {
    const { user } = useAuth();
    const [fichas, setFichas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [activeTab, setActiveTab] = useState('identificacao');
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const [sheetData, setSheetData] = useState(null);
    const searchTimeout = useRef(null);

    /* ── Filtros da listagem ──
       Período e status são recortes de cliente: o parâmetro `status` que a API
       aceita filtra a inspeção de origem, não a situação da ficha. */
    const [monthFilter, setMonthFilter] = useState(currentMonthISO());
    const [dateFilter, setDateFilter] = useState('');
    const [dateEndFilter, setDateEndFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [exportando, setExportando] = useState(false);

    /* Ficha escolhida na tabela, que alimenta o painel lateral. */
    const [fichaPanorama, setFichaPanorama] = useState(null);

    const initialFormData = {
        // Identificação
        numero_fnc: '',
        ficha_nc_id: null,
        fonte_registro_id: null,
        data_fnc: todayISO(),
        de_departamento: 'CONTROLE DE QUALIDADE',
        para_departamento: '',
        codigo: '',
        produto: '',
        nf_po: '',
        num_serie: '',
        foto_nc: '',
        foto_nc_nome: '',
        quantidade: 0,
        qtd_nao_conforme: 0,
        qtd_inspecionadas: 0,
        indice: 0,
        // Descrição NC
        descricao_nc: '',
        disposicao: '',
        // Análise 5 Porquês
        porque_1: '',
        porque_2: '',
        porque_3: '',
        porque_4: '',
        porque_5: '',
        // Ações
        acao_imediata: '',
        correcao: '',
        acao_corretiva: '',
        responsavel_acao: '',
        prazo_acao: '',
        // Custos
        total_horas: 0,
        taxa_trabalho: 0,
        custo_material: 0,
        custo_refugo: 0,
        taxa_cambio: 0,
        // Decisão
        decisao_final: '',
        status: 'Aberta',
        observacoes: '',
        inspecao_resultado: '',
        data_inspecao: '',
        aprovacao_qc: '',
        aprovacao_responsavel: '',
        aprovacao_manager: ''
    };

    const [formData, setFormData] = useState(initialFormData);

    const fichasPermission = user?.role !== 'consultor' ? 'full' : (user?.fichasPermission || 'readonly');
    const canEditAll = fichasPermission === 'full';
    const canEditPartial = fichasPermission === 'partial';
    const isReadonly = fichasPermission === 'readonly';

    const isTabEditable = (tabId) => {
        if (canEditAll) return true;
        if (canEditPartial) return PARTIAL_TABS.includes(tabId);
        return false;
    };

    const tabContentClass = (tabId) => `tab-content active ${isTabEditable(tabId) ? '' : 'tab-readonly'}`.trim();

    const buildPayload = (dados) => {
        if (canEditAll) return dados;
        if (isReadonly) return null;
        return Object.fromEntries(
            Object.entries(dados).filter(([key]) => PARTIAL_FIELDS.includes(key) || ['numero_fnc', 'ficha_nc_id', 'fonte_registro_id'].includes(key))
        );
    };

    useEffect(() => {
        loadFichas();
    }, [search]);
    useEffect(() => {
        if (!showModal || typeof document === 'undefined') return undefined;

        const controls = document.querySelectorAll(
            '.modal-xl .tab-content[data-editable="false"] input, .modal-xl .tab-content[data-editable="false"] select, .modal-xl .tab-content[data-editable="false"] textarea, .modal-xl .tab-content[data-editable="false"] button'
        );
        controls.forEach((control) => {
            control.disabled = true;
            control.dataset.fichasDisabled = 'true';
        });

        return () => {
            document.querySelectorAll('[data-fichas-disabled="true"]').forEach((control) => {
                control.disabled = false;
                delete control.dataset.fichasDisabled;
            });
        };
    }, [showModal, activeTab, formViewMode, fichasPermission]);

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

    const loadFichas = async () => {
        try {
            setLoading(true);
            const params = { status: 'reprovado' };
            if (search) params.search = search;

            const response = await fichasAPI.getAll(params);

            if (response.data.success) {
                // O backend já filtra por status; sem necessidade de filtrar novamente no cliente
                setFichas(response.data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar fichas:', error);
        } finally {
            setLoading(false);
        }
    };
    const periodoLabel = dateFilter && dateEndFilter
        ? `${formatarData(dateFilter)} até ${formatarData(dateEndFilter)}`
        : formatMonthLabel(monthFilter);

    const selecionarMes = (mes) => {
        setDateFilter('');
        setDateEndFilter('');
        setMonthFilter(mes || currentMonthISO());
    };

    const aplicarIntervalo = (inicio, fim) => {
        setDateFilter(inicio);
        setDateEndFilter(fim);
        setMonthFilter('');
    };

    /* O período é o primeiro corte, e os indicadores contam sobre ele: senão
       "Concluídas" mostraria o total histórico com a tabela num mês só. */
    const noPeriodo = useMemo(() => {
        const { start, end } = dateFilter && dateEndFilter
            ? { start: dateFilter, end: dateEndFilter }
            : monthRangeISO(monthFilter || currentMonthISO());

        return fichas.filter((ficha) => {
            const data = normalizeISODate(ficha.data_fnc || ficha.data_inspecao, '');
            if (!data) return false;
            return data >= start && data <= end;
        });
    }, [fichas, monthFilter, dateFilter, dateEndFilter]);

    const resumoFichas = {
        total: noPeriodo.length,
        concluidas: noPeriodo.filter((f) => noGrupo(f, 'concluida')).length,
        abertas: noPeriodo.filter((f) => noGrupo(f, 'aberta')).length,
        pendentes: noPeriodo.filter((f) => noGrupo(f, 'analise')).length
    };

    const fichasVisiveis = useMemo(
        () => (statusFilter ? noPeriodo.filter((f) => noGrupo(f, statusFilter)) : noPeriodo),
        [noPeriodo, statusFilter]);

    /* Clicar de novo no card aceso volta para todos. */
    const ativarFiltroStatus = (chave) => setStatusFilter((atual) => (atual === chave ? '' : chave));

    /* ── Panorama do produto ──
       Sai da lista que já está na tela: todas as fichas do mesmo código, sem
       consulta nova ao servidor. */
    const panorama = useMemo(() => {
        if (!fichaPanorama) return null;

        const codigo = String(fichaPanorama.codigo || fichaPanorama.cod_sap || '').trim().toUpperCase();
        const doProduto = fichas.filter(
            (f) => String(f.codigo || f.cod_sap || '').trim().toUpperCase() === codigo);

        const mesAtual = monthFilter || currentMonthISO();
        const mesAnterior = previousMonthISO();
        const contarNoMes = (mes) => {
            const { start, end } = monthRangeISO(mes);
            return doProduto.filter((f) => {
                const data = normalizeISODate(f.data_fnc || f.data_inspecao, '');
                return data && data >= start && data <= end;
            }).length;
        };

        const defeitos = new Map();
        doProduto.forEach((f) => {
            const nome = String(f.descricao_nc || f.defeito || '').trim();
            if (nome) defeitos.set(nome, (defeitos.get(nome) || 0) + 1);
        });
        const maisFrequentes = [...defeitos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

        return {
            total: doProduto.length,
            concluidas: doProduto.filter((f) => noGrupo(f, 'concluida')).length,
            abertas: doProduto.filter((f) => noGrupo(f, 'aberta')).length,
            qtdNC: doProduto.reduce((soma, f) => soma + Number(f.qtd_nao_conforme || 0), 0),
            mesAtual,
            mesAnterior,
            porMes: [[mesAnterior, contarNoMes(mesAnterior)], [mesAtual, contarNoMes(mesAtual)]],
            maiorMes: Math.max(contarNoMes(mesAnterior), contarNoMes(mesAtual), 1),
            defeitos: maisFrequentes,
            maiorDefeito: Math.max(...maisFrequentes.map(([, q]) => q), 1),
            decisoes: [...new Set(doProduto.map((f) => f.decisao_final || f.decisao).filter(Boolean))],
            destinos: [...new Set(doProduto.map((f) => f.para_departamento).filter(Boolean))]
        };
    }, [fichaPanorama, fichas, monthFilter]);

    /* Clique na linha: no celular abre a folha de ações, no desktop escolhe a
       ficha do painel lateral. Mesma divisão da Inspeção de Injeção. */
    const handleRowClick = (ficha) => {
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches) {
            openMobileActions(ficha);
            return;
        }
        setFichaPanorama((atual) => (atual?.id === ficha.id ? null : ficha));
    };

    const exportarExcel = async () => {
        if (fichasVisiveis.length === 0) {
            alert('Nenhuma FNC para exportar.');
            return;
        }
        setExportando(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const planilha = workbook.addWorksheet('Fichas NC');
            planilha.columns = [
                { header: 'Nº FNC', key: 'numero', width: 16 },
                { header: 'Data', key: 'data', width: 14 },
                { header: 'Código', key: 'codigo', width: 16 },
                { header: 'Produto', key: 'produto', width: 38 },
                { header: 'Qtd NC', key: 'qtdNC', width: 10 },
                { header: 'Decisão', key: 'decisao', width: 22 },
                { header: 'Status', key: 'status', width: 16 }
            ];

            fichasVisiveis.forEach((ficha) => planilha.addRow({
                numero: ficha.numero_fnc || `FNC-${ficha.id}`,
                data: formatDateBR(ficha.data_fnc || ficha.data_inspecao, ''),
                codigo: ficha.codigo || ficha.cod_sap || '',
                produto: ficha.produto || ficha.modelo || '',
                qtdNC: Number(ficha.qtd_nao_conforme ?? ficha.qtd_nc ?? 0),
                decisao: ficha.decisao_final || ficha.decisao || '',
                status: ficha.status || 'Aberta'
            }));

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
            link.download = `fichas-nc-${todayISO()}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setExportando(false);
        }
    };

    const buscarProduto = async (codigo) => {
        if (!codigo || codigo.length < 3) return;

        try {
            const response = await produtosAPI.getByCode(codigo);
            if (response.data.success && response.data.data) {
                setFormData(prev => ({
                    ...prev,
                    produto: response.data.data.desc_material || ''
                }));
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
                    setProdutoSugestoes(response.data.data || []);
                    setShowSugestoes(true);
                }
            } catch {
                setProdutoSugestoes([]);
                setShowSugestoes(false);
            }
        }, 300);
    };

    const selecionarProduto = (produto) => {
        setFormData(prev => ({
            ...prev,
            codigo: produto.cod_material || '',
            produto: produto.desc_material || ''
        }));
        setProdutoSugestoes([]);
        setShowSugestoes(false);
    };

    /* Ler o arquivo, reduzir e remover agora e a GaleriaFotos quem faz. A
       versao que estava aqui guardava a imagem no tamanho original; a do
       componente reduz o maior lado a 1600px antes de gravar. */

    const calcularIndice = () => {
        const { qtd_nao_conforme, qtd_inspecionadas } = formData;
        if (qtd_inspecionadas > 0) {
            const indice = ((qtd_nao_conforme / qtd_inspecionadas) * 100).toFixed(2);
            setFormData(prev => ({ ...prev, indice: parseFloat(indice) }));
        }
    };

    const calcularCustoTotal = () => {
        const { total_horas, taxa_trabalho, custo_material, custo_refugo } = formData;
        return (parseFloat(total_horas || 0) * parseFloat(taxa_trabalho || 0)) +
            parseFloat(custo_material || 0) +
            parseFloat(custo_refugo || 0);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const numero = formData.numero_fnc || `FNC-${editingId || Date.now()}`;
        const payload = buildPayload({
            ...upperFields(formData, [
                'numero_fnc', 'de_departamento', 'para_departamento', 'codigo', 'produto',
                'nf_po', 'num_serie', 'descricao_nc', 'porque_1', 'porque_2', 'porque_3',
                'porque_4', 'porque_5', 'acao_imediata', 'correcao', 'acao_corretiva',
                'responsavel_acao', 'observacoes', 'aprovacao_qc', 'aprovacao_responsavel',
                'aprovacao_manager'
            ]),
            numero_fnc: numero,
            data_fnc: normalizeISODate(formData.data_fnc),
            prazo_acao: normalizeISODate(formData.prazo_acao, ''),
            data_inspecao: normalizeISODate(formData.data_inspecao, ''),
            ficha_nc_id: formData.ficha_nc_id,
            fonte_registro_id: formData.fonte_registro_id
        });

        if (!payload) {
            alert('Você tem permissão apenas para visualizar esta ficha.');
            return;
        }

        try {
            if (editingId) {
                await fichasAPI.update(editingId, payload);
            } else {
                await fichasAPI.create(payload);
            }
            setShowModal(false);
            resetForm();
            await loadFichas();
            alert('Ficha NC salva com sucesso!');
        } catch (error) {
            console.error('Erro ao salvar ficha NC:', error);
            alert('Erro ao salvar Ficha NC no banco de dados.');
        }
    };

    const handleEdit = async (ficha) => {
        try {
            const response = await fichasAPI.getById(ficha.id);
            const dados = response.data?.success ? response.data.data : ficha;
            const today = todayISO();
            const numero = dados.numero_fnc || `FNC-${dados.id || ficha.id}`;

            setFormData({
                ...initialFormData,
                ficha_nc_id: dados.ficha_nc_id || null,
                fonte_registro_id: dados.fonte_registro_id || null,
                numero_fnc: numero,
                data_fnc: normalizeISODate(dados.data_fnc || dados.data_inspecao || today),
                de_departamento: dados.de_departamento || 'CONTROLE DE QUALIDADE',
                para_departamento: dados.para_departamento || '',
                codigo: dados.codigo || dados.cod_sap || '',
                produto: dados.produto || dados.modelo || '',
                nf_po: dados.nf_po || '',
                num_serie: dados.num_serie || '',
                foto_nc: dados.foto_nc || '',
                foto_nc_nome: dados.foto_nc_nome || '',
                quantidade: dados.quantidade ?? dados.qtd_total ?? 0,
                qtd_nao_conforme: dados.qtd_nao_conforme ?? dados.qtd_nc ?? 0,
                qtd_inspecionadas: dados.qtd_inspecionadas ?? dados.qtd_inspecionada ?? 0,
                indice: dados.indice || 0,
                descricao_nc: dados.descricao_nc || dados.defeito || dados.observacao || '',
                disposicao: dados.disposicao || '',
                porque_1: dados.porque_1 || '',
                porque_2: dados.porque_2 || '',
                porque_3: dados.porque_3 || '',
                porque_4: dados.porque_4 || '',
                porque_5: dados.porque_5 || '',
                acao_imediata: dados.acao_imediata || '',
                correcao: dados.correcao || '',
                acao_corretiva: dados.acao_corretiva || '',
                responsavel_acao: dados.responsavel_acao || user?.nome || '',
                prazo_acao: normalizeISODate(dados.prazo_acao, ''),
                total_horas: dados.total_horas || 0,
                taxa_trabalho: dados.taxa_trabalho || 0,
                custo_material: dados.custo_material || 0,
                custo_refugo: dados.custo_refugo || 0,
                taxa_cambio: dados.taxa_cambio || 0,
                decisao_final: dados.decisao_final || dados.decisao || '',
                status: dados.status || 'Aberta',
                observacoes: dados.observacoes || dados.observacao || '',
                inspecao_resultado: dados.inspecao_resultado || '',
                data_inspecao: normalizeISODate(dados.data_inspecao_fnc, ''),
                aprovacao_qc: dados.aprovacao_qc || '',
                aprovacao_responsavel: dados.aprovacao_responsavel || '',
                aprovacao_manager: dados.aprovacao_manager || ''
            });
            setEditingId(dados.id || ficha.id);
            setShowModal(true);
        } catch (error) {
            console.error('Erro ao carregar ficha NC:', error);
            alert('Erro ao carregar Ficha NC.');
        }
    };

    const openMobileActions = (ficha) => {
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
            setSheetData((current) => (
                current?.id === ficha.id
                    ? null
                    : { id: ficha.id, label: ficha.numero_fnc || `FNC-${ficha.id}` }
            ));
        }
    };

    const resetForm = () => {
        setFormData(initialFormData);
        setEditingId(null);
        setActiveTab('identificacao');
        setFormViewMode('tabs');
        setProdutoSugestoes([]);
        setShowSugestoes(false);
    };

    const formatarData = (dataString) => formatDateBR(dataString);

    const tabs = [
        { id: 'identificacao', icon: 'fa-info-circle', label: 'Identificação' },
        { id: 'descricao', icon: 'fa-file-alt', label: 'Descrição NC' },
        { id: 'analise', icon: 'fa-search', label: 'Análise Causas' },
        { id: 'acoes', icon: 'fa-tasks', label: 'Ações' },
        { id: 'custos', icon: 'fa-dollar-sign', label: 'Custos' },
        { id: 'decisao', icon: 'fa-check-circle', label: 'Decisão' }
    ];

    /* getCurrentTabIndex, goToNextTab e goToPrevTab saíram com os botões
       Anterior/Próximo do rodapé: a navegação é pelas abas e pelo alternador
       Abas / Visão geral no topo. */

    const disposicaoOptions = [
        { value: 'Refugado', icon: 'fa-ban', color: 'var(--danger)', desc: 'Produto descartado' },
        { value: 'Retrabalhado', icon: 'fa-wrench', color: 'var(--warning)', desc: 'Correção aplicada' },
        { value: 'Devolução', icon: 'fa-undo', color: 'var(--purple)', desc: 'Retorno ao fornecedor' },
        { value: 'Seleção', icon: 'fa-filter', color: 'var(--info)', desc: 'Separação de peças' },
        { value: 'Reclamação', icon: 'fa-exclamation-triangle', color: 'var(--warning)', desc: 'Registro formal' }
    ];

    const sheetFicha = sheetData ? fichas.find((ficha) => ficha.id === sheetData.id) : null;

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Fichas NC' }, { label: 'Fichas de Não Conformidade' }]}
            containerClassName="fichas-page listing-page"
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-exclamation-triangle"></i> Fichas de Não Conformidade</h1>
                        <p>Gerencie e acompanhe todas as não conformidades identificadas</p>
                    </div>
                    {/* Mesma barra da Inspeção de Injeção, na mesma ordem: busca,
                        período, filtro secundário, exportar e ação primária. */}
                    <div className="header-actions listing-filters">
                        <input
                            type="search"
                            className="form-control listing-search"
                            placeholder="Buscar por FNC, produto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <PeriodFilter
                            label={periodoLabel}
                            mes={monthFilter}
                            mesAtual={currentMonthISO()}
                            mesAnterior={previousMonthISO()}
                            onMes={selecionarMes}
                            onIntervalo={aplicarIntervalo}
                        />

                        {/* No lugar do Turno da injeção, com o mesmo formato de
                            rótulo sobre <select> invisível. */}
                        <label className={statusFilter ? 'shift-filter-button active' : 'shift-filter-button'}
                            title={statusFilter ? 'Status: ' + (OPCOES_STATUS.find((o) => o.valor === statusFilter)?.rotulo || '') : 'Filtrar por status'}>
                            <i className="fas fa-filter" aria-hidden="true"></i>
                            <span className="filter-label">
                                {statusFilter
                                    ? OPCOES_STATUS.find((o) => o.valor === statusFilter)?.rotulo
                                    : 'Status'}
                            </span>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                aria-label="Filtrar fichas por status"
                            >
                                {OPCOES_STATUS.map((opcao) => (
                                    <option key={opcao.valor || 'todos'} value={opcao.valor}>{opcao.rotulo}</option>
                                ))}
                            </select>
                        </label>

                        <button
                            type="button"
                            className="btn btn-success btn-sm export-excel-button"
                            onClick={exportarExcel}
                            disabled={exportando || loading || fichasVisiveis.length === 0}
                            title="Exportar fichas filtradas para Excel"
                        >
                            <i className={`fas ${exportando ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} aria-hidden="true"></i>
                            <span className="filter-label">Exportar Excel</span>
                        </button>
                        <button className="btn btn-primary btn-sm new-inspection-button"
                            onClick={() => { resetForm(); setShowModal(true); }} title="Nova FNC">
                            <i className="fas fa-plus" aria-hidden="true"></i>
                            <span className="filter-label">Nova FNC</span>
                        </button>
                    </div>
                </div>

                <FilterCardStrip rotulo="Resumo e filtros das fichas">
                    {CARDS_RESUMO.map((card) => (
                        <FilterCard
                            key={card.chave || 'total'}
                            icone={card.icone}
                            rotulo={card.rotulo}
                            legenda={card.legenda}
                            tom={card.tom}
                            valor={loading ? '—' : resumoFichas[card.contagem]}
                            ativo={card.chave ? statusFilter === card.chave : !statusFilter}
                            onClick={() => (card.chave ? ativarFiltroStatus(card.chave) : setStatusFilter(''))}
                        />
                    ))}
                </FilterCardStrip>

                {/* Tabela e panorama, mesmo grid de duas colunas da injeção */}
                <div className="listing-layout">
                    <div className="listing-table-column">
                        <div className="table-card">
                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Nº FNC</th>
                                            <th>Data</th>
                                            <th>Produto</th>
                                            <th>Qtd NC</th>
                                            <th>Decisão</th>
                                            <th>Status</th>
                                            <th className="actions-column col-acoes">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="7" style={{ textAlign: 'center' }}>Carregando...</td></tr>
                                        ) : fichasVisiveis.length === 0 ? (
                                            <tr><td colSpan="7" style={{ textAlign: 'center' }}>
                                                {fichas.length
                                                    ? 'Nenhuma FNC no período e status escolhidos'
                                                    : 'Nenhuma FNC encontrada'}
                                            </td></tr>
                                        ) : (
                                            fichasVisiveis.map((ficha) => (
                                                <tr
                                                    key={ficha.id}
                                                    className={`mobile-clickable-row ${sheetData?.id === ficha.id ? 'mobile-row-active' : ''} ${fichaPanorama?.id === ficha.id ? 'panorama-row-active' : ''}`}
                                                    onClick={() => handleRowClick(ficha)}
                                                >
                                                    <td><strong>{ficha.numero_fnc || `FNC-${ficha.id}`}</strong></td>
                                                    <td>{formatarData(ficha.data_fnc || ficha.data_inspecao)}</td>
                                                    <td>{ficha.codigo || ficha.cod_sap} - {ficha.produto || ficha.modelo || 'N/A'}</td>
                                                    <td><span className="badge badge-danger">{ficha.qtd_nao_conforme ?? ficha.qtd_nc}</span></td>
                                                    <td>{ficha.decisao_final || ficha.decisao || '-'}</td>
                                                    <td><span className={`badge ${classeDoStatus(ficha.status)}`}>{ficha.status || 'Aberta'}</span></td>
                                                    <td className="actions-column col-acoes">
                                                        <div className="acoes">
                                                            <button className="btn-icon btn-view" onClick={(e) => { e.stopPropagation(); handleEdit(ficha); }} title="Visualizar">
                                                                <i className="fas fa-eye"></i>
                                                            </button>
                                                            <button className="btn-icon btn-edit" onClick={(e) => { e.stopPropagation(); handleEdit(ficha); }} title="Editar">
                                                                <i className="fas fa-edit"></i>
                                                            </button>
                                                            <button className="btn-icon btn-print" onClick={(e) => { e.stopPropagation(); window.print(); }} title="Imprimir">
                                                                <i className="fas fa-print"></i>
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
                    </div>

                    <SidePanel
                        titulo="Panorama do produto"
                        textoVazio="Clique em uma linha da tabela para ver o histórico do produto."
                        item={fichaPanorama}
                        nome={fichaPanorama?.produto || fichaPanorama?.modelo || 'Produto sem descrição'}
                        subtitulo={`Código ${fichaPanorama?.codigo || fichaPanorama?.cod_sap || '—'}`}
                        onFechar={() => setFichaPanorama(null)}
                    >
                        {panorama && (
                            <>
                                <div className="piece-panorama-kpis">
                                    <div><strong>{panorama.total}</strong><span>fichas</span></div>
                                    <div className="positive"><strong>{panorama.concluidas}</strong><span>concluídas</span></div>
                                    <div className="negative"><strong>{panorama.abertas}</strong><span>em aberto</span></div>
                                    <div><strong>{panorama.qtdNC}</strong><span>peças NC</span></div>
                                </div>

                                <section className="panorama-block"><h4>Mês atual × mês anterior</h4>
                                    {panorama.porMes.map(([mes, quantidade]) => (
                                        <div className="panorama-month-row" key={mes}>
                                            <span>{formatMonthLabel(mes)}</span>
                                            <div className="panorama-bars">
                                                <i className="rejected-bar" style={{ width: `${(quantidade / panorama.maiorMes) * 100}%` }}></i><b>{quantidade}</b>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="panorama-legend"><span><i className="rejected-dot"></i>Fichas abertas no mês</span></div>
                                </section>

                                <section className="panorama-block"><h4>Não conformidades mais frequentes</h4>
                                    {panorama.defeitos.length ? panorama.defeitos.map(([nome, quantidade]) => (
                                        <div className="defect-row" key={nome}>
                                            <span>{nome}</span>
                                            <i><b style={{ width: `${(quantidade / panorama.maiorDefeito) * 100}%` }}></b></i>
                                            <strong>{quantidade}</strong>
                                        </div>
                                    )) : <p className="panorama-no-data">Nenhuma descrição registrada.</p>}
                                </section>

                                <section className="panorama-meta">
                                    <div><span>Decisões</span><strong>{panorama.decisoes.join(', ') || '—'}</strong></div>
                                    <div><span>Destinos</span><strong>{panorama.destinos.join(', ') || '—'}</strong></div>
                                </section>
                            </>
                        )}
                    </SidePanel>
                </div>

                {/* Modal de Ficha NC */}
                {showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal-content modal-xl" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header modal-header-warning">
                                <h2><i className="fas fa-exclamation-triangle"></i> {editingId ? 'Editar' : 'Nova'} Ficha de Não Conformidade</h2>
                                <button className="modal-close" onClick={() => setShowModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            <div className="fnc-view-switcher">
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
                                    {user?.role === 'consultor' && fichasPermission !== 'full' && (
                                        <ReadonlyBanner type={fichasPermission} />
                                    )}
                                    {/* Tab 1: Identificação */}
                                    {(formViewMode === 'geral' || activeTab === 'identificacao') && (
                                        <div className={tabContentClass('identificacao')} data-editable={isTabEditable('identificacao')}>
                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-clipboard"></i> Dados da FNC</h3>
                                                {/* `form-row-compact` e a mesma classe dos campos curtos da
                                                    Inspecao de Injecao: cada campo ganha largura propria em vez
                                                    de esticar ate a coluna inteira, e quebra sozinho quando nao
                                                    cabe. A largura vem de `--compact-field-width`. */}
                                                <div className="form-row form-row-compact fnc-linha-dados">
                                                    <div className="form-group">
                                                        <label>Nº da FNC *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.numero_fnc}
                                                            onChange={(e) => setFormData({ ...formData, numero_fnc: e.target.value.toUpperCase() })}
                                                            required
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Data da FNC *</label>
                                                        <input
                                                            type="date"
                                                            className="form-control"
                                                            value={formData.data_fnc}
                                                            onChange={(e) => setFormData({ ...formData, data_fnc: e.target.value })}
                                                            required
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>De (Departamento)</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.de_departamento}
                                                            readOnly
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Para (Departamento)</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.para_departamento}
                                                            onChange={(e) => setFormData({ ...formData, para_departamento: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="divider"></div>

                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-box"></i> Identificação do Produto</h3>
                                                <div className="form-row form-row-compact fnc-linha-produto">
                                                    <div className="form-group produto-autocomplete">
                                                        <label>Código SAP *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.codigo}
                                                            onChange={(e) => {
                                                                const valor = e.target.value.toUpperCase();
                                                                setFormData({ ...formData, codigo: valor });
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
                                                        <label>Produto *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.produto}
                                                            readOnly
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>NF / PO</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.nf_po}
                                                            onChange={(e) => setFormData({ ...formData, nf_po: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Num. de Série</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.num_serie}
                                                            onChange={(e) => setFormData({ ...formData, num_serie: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                </div>
                                                {/* Mesma galeria da Inspecao de Montagem, agora componente do
                                                    UI Kit. A FNC guarda uma foto so, em `foto_nc` e
                                                    `foto_nc_nome`: `max={1}` respeita isso, e o payload nao muda. */}
                                                <GaleriaFotos
                                                    titulo="Foto da Não Conformidade"
                                                    descricao="Registre uma evidência visual do problema encontrado no produto."
                                                    max={1}
                                                    rotuloAdicionar="Adicionar foto"
                                                    somenteLeitura={isReadonly}
                                                    fotos={formData.foto_nc
                                                        ? [{ src: urlArquivo(formData.foto_nc), nome: formData.foto_nc_nome || 'Imagem anexada' }]
                                                        : []}
                                                    onChange={(fotos) => setFormData((prev) => ({
                                                        ...prev,
                                                        foto_nc: fotos[0]?.src || '',
                                                        foto_nc_nome: fotos[0]?.nome || ''
                                                    }))}
                                                />
                                                <div className="form-row form-row-compact fnc-linha-quantidades">
                                                    <div className="form-group">
                                                        <label>Quantidade Total</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.quantidade}
                                                            onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 0 })}
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Qtd Não Conforme</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.qtd_nao_conforme}
                                                            onChange={(e) => {
                                                                setFormData({ ...formData, qtd_nao_conforme: parseInt(e.target.value) || 0 });
                                                                setTimeout(calcularIndice, 100);
                                                            }}
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Qtd Inspecionadas</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.qtd_inspecionadas}
                                                            onChange={(e) => {
                                                                setFormData({ ...formData, qtd_inspecionadas: parseInt(e.target.value) || 0 });
                                                                setTimeout(calcularIndice, 100);
                                                            }}
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Índice (%)</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.indice}
                                                            readOnly
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 2: Descrição NC */}
                                    {(formViewMode === 'geral' || activeTab === 'descricao') && (
                                        <div className={tabContentClass('descricao')} data-editable={isTabEditable('descricao')}>
                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-exclamation-circle"></i> Descrição da Não Conformidade</h3>
                                                <div className="form-group">
                                                    <label>Descrição da Não Conformidade *</label>
                                                    <textarea
                                                        className="form-control"
                                                        value={formData.descricao_nc}
                                                        onChange={(e) => setFormData({ ...formData, descricao_nc: e.target.value.toUpperCase() })}
                                                        rows="5"
                                                        placeholder="Descreva detalhadamente a não conformidade encontrada..."
                                                        required
                                                    ></textarea>
                                                </div>

                                                <div className="divider"></div>

                                                <h3 className="section-title"><i className="fas fa-cogs"></i> Disposição / Ação a Tomar</h3>
                                                <div className="form-group">
                                                    <label>Selecione a ação a ser tomada: *</label>
                                                    <div className="disposicao-grid">
                                                        {disposicaoOptions.map(opt => (
                                                            <label
                                                                key={opt.value}
                                                                className={`disposicao-option ${formData.disposicao === opt.value ? 'selected' : ''}`}
                                                                style={{ borderColor: formData.disposicao === opt.value ? opt.color : 'var(--border)' }}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name="disposicao"
                                                                    value={opt.value}
                                                                    checked={formData.disposicao === opt.value}
                                                                    onChange={(e) => setFormData({ ...formData, disposicao: e.target.value })}
                                                                    required
                                                                />
                                                                <div>
                                                                    <div className="disposicao-title" style={{ color: opt.color }}>
                                                                        <i className={`fas ${opt.icon}`}></i> {opt.value}
                                                                    </div>
                                                                    <small>{opt.desc}</small>
                                                                </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 3: Análise de Causas */}
                                    {(formViewMode === 'geral' || activeTab === 'analise') && (
                                        <div className={tabContentClass('analise')} data-editable={isTabEditable('analise')}>
                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-microscope"></i> Análise dos 5 Porquês</h3>
                                                <p className="info-text" style={{ marginBottom: '1.5rem' }}>
                                                    Preencha a sequência de perguntas "Por quê?" até identificar a causa raiz da não conformidade.
                                                </p>

                                                <div className="porques-container">
                                                    {[1, 2, 3, 4, 5].map(num => (
                                                        <div key={num} className="porque-item">
                                                            <label className="porque-label">
                                                                <span className="porque-numero">{num}º</span> Por quê?
                                                                {num === 5 && <span className="causa-raiz-tag">(Causa Raiz)</span>}
                                                            </label>
                                                            <input
                                                                type="text"
                                                                className="form-control field-upper"
                                                                value={formData[`porque_${num}`]}
                                                                onChange={(e) => setFormData({ ...formData, [`porque_${num}`]: e.target.value.toUpperCase() })}
                                                                placeholder={`Responda o ${num}º por quê...`}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 4: Ações */}
                                    {(formViewMode === 'geral' || activeTab === 'acoes') && (
                                        <div className={tabContentClass('acoes')} data-editable={isTabEditable('acoes')}>
                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-bolt"></i> Ação Imediata</h3>
                                                <div className="form-group">
                                                    <textarea
                                                        className="form-control"
                                                        value={formData.acao_imediata}
                                                        onChange={(e) => setFormData({ ...formData, acao_imediata: e.target.value.toUpperCase() })}
                                                        rows="3"
                                                        placeholder="Descreva a ação imediata tomada..."
                                                    ></textarea>
                                                </div>
                                            </div>

                                            <div className="divider"></div>

                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-wrench"></i> Correção</h3>
                                                <div className="form-group">
                                                    <textarea
                                                        className="form-control"
                                                        value={formData.correcao}
                                                        onChange={(e) => setFormData({ ...formData, correcao: e.target.value.toUpperCase() })}
                                                        rows="3"
                                                        placeholder="Descreva a correção aplicada..."
                                                    ></textarea>
                                                </div>
                                            </div>

                                            <div className="divider"></div>

                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-shield-alt"></i> Ação Corretiva</h3>
                                                <div className="form-group">
                                                    <textarea
                                                        className="form-control"
                                                        value={formData.acao_corretiva}
                                                        onChange={(e) => setFormData({ ...formData, acao_corretiva: e.target.value.toUpperCase() })}
                                                        rows="3"
                                                        placeholder="Descreva a ação corretiva planejada..."
                                                    ></textarea>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Responsável</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.responsavel_acao}
                                                            onChange={(e) => setFormData({ ...formData, responsavel_acao: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Prazo</label>
                                                        <input
                                                            type="date"
                                                            className="form-control"
                                                            value={formData.prazo_acao}
                                                            onChange={(e) => setFormData({ ...formData, prazo_acao: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 5: Custos */}
                                    {(formViewMode === 'geral' || activeTab === 'custos') && (
                                        <div className={tabContentClass('custos')} data-editable={isTabEditable('custos')}>
                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-calculator"></i> Custos Estimados</h3>
                                                <div className="custos-grid">
                                                    <div className="custo-item">
                                                        <label>Horas Totais</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.total_horas}
                                                            onChange={(e) => setFormData({ ...formData, total_horas: parseFloat(e.target.value) || 0 })}
                                                            step="0.01"
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="custo-item">
                                                        <label>Taxa Trabalho (R$)</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.taxa_trabalho}
                                                            onChange={(e) => setFormData({ ...formData, taxa_trabalho: parseFloat(e.target.value) || 0 })}
                                                            step="0.01"
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="custo-item">
                                                        <label>Custo Material (R$)</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.custo_material}
                                                            onChange={(e) => setFormData({ ...formData, custo_material: parseFloat(e.target.value) || 0 })}
                                                            step="0.01"
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="custo-item">
                                                        <label>Custo Refugo (R$)</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.custo_refugo}
                                                            onChange={(e) => setFormData({ ...formData, custo_refugo: parseFloat(e.target.value) || 0 })}
                                                            step="0.01"
                                                            min="0"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="divider"></div>

                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Taxa Câmbio USD</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={formData.taxa_cambio}
                                                            onChange={(e) => setFormData({ ...formData, taxa_cambio: parseFloat(e.target.value) || 0 })}
                                                            step="0.01"
                                                            min="0"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Custo Total (USD)</label>
                                                        <input
                                                            type="text"
                                                            className="form-control"
                                                            value={formData.taxa_cambio > 0 ? (calcularCustoTotal() / formData.taxa_cambio).toFixed(2) : '0.00'}
                                                            readOnly
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="custo-total-box">
                                                    <div className="custo-total-label">CUSTO TOTAL (R$)</div>
                                                    <div className="custo-total-value">R$ {calcularCustoTotal().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                                </div>

                                                <div className="alert-info">
                                                    <i className="fas fa-info-circle"></i>
                                                    <strong>Nota:</strong> Todos os custos de envio de material serão por conta do fornecedor.
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 6: Decisão */}
                                    {(formViewMode === 'geral' || activeTab === 'decisao') && (
                                        <div className={tabContentClass('decisao')} data-editable={isTabEditable('decisao')}>
                                            <div className="form-section">
                                                <h3 className="section-title"><i className="fas fa-gavel"></i> Decisão Final</h3>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Decisão *</label>
                                                        <select
                                                            className="form-control"
                                                            value={formData.decisao_final}
                                                            onChange={(e) => setFormData({ ...formData, decisao_final: e.target.value })}
                                                            required
                                                        >
                                                            <option value="">Selecione</option>
                                                            <option value="Aprovada">Aprovada</option>
                                                            <option value="Reprovada">Reprovada</option>
                                                            <option value="Pendente">Pendente</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Status da FNC</label>
                                                        <select
                                                            className="form-control"
                                                            value={formData.status}
                                                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                        >
                                                            <option value="Aberta">Aberta</option>
                                                            <option value="Em Análise">Em Análise</option>
                                                            <option value="Aguardando Ação">Aguardando Ação</option>
                                                            <option value="Concluída">Concluída</option>
                                                            <option value="Cancelada">Cancelada</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="form-group">
                                                    <label>Observações / Comentários</label>
                                                    <textarea
                                                        className="form-control"
                                                        value={formData.observacoes}
                                                        onChange={(e) => setFormData({ ...formData, observacoes: e.target.value.toUpperCase() })}
                                                        rows="4"
                                                    ></textarea>
                                                </div>

                                                <div className="divider"></div>

                                                <h3 className="section-title"><i className="fas fa-clipboard-check"></i> Inspeção Após Retrabalho</h3>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>Resultado Inspeção</label>
                                                        <select
                                                            className="form-control"
                                                            value={formData.inspecao_resultado}
                                                            onChange={(e) => setFormData({ ...formData, inspecao_resultado: e.target.value })}
                                                        >
                                                            <option value="">Selecione</option>
                                                            <option value="Aprovado">Aprovado</option>
                                                            <option value="Rejeitado">Rejeitado</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Data Inspeção</label>
                                                        <input
                                                            type="date"
                                                            className="form-control"
                                                            value={formData.data_inspecao}
                                                            onChange={(e) => setFormData({ ...formData, data_inspecao: e.target.value })}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="divider"></div>

                                                <h3 className="section-title"><i className="fas fa-user-check"></i> Aprovações</h3>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label>QC Department</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.aprovacao_qc}
                                                            onChange={(e) => setFormData({ ...formData, aprovacao_qc: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Responsável</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.aprovacao_responsavel}
                                                            onChange={(e) => setFormData({ ...formData, aprovacao_responsavel: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Quality Manager</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.aprovacao_manager}
                                                            onChange={(e) => setFormData({ ...formData, aprovacao_manager: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Anterior/Proximo sairam: a navegacao e pelas abas e pelo
                                    alternador Abas / Visao geral no topo. Ficaram Fechar e
                                    Salvar, a direita, como estavam. */}
                                <div className="modal-footer fnc-modal-footer">
                                    <div className="action-buttons-footer">
                                        <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                            <i className="fas fa-times"></i> Fechar
                                        </button>
                                        <button type="submit" className="btn btn-primary" disabled={isReadonly}>
                                            <i className="fas fa-save"></i> Salvar FNC
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {typeof document !== 'undefined' && createPortal(
                    <div className={`mobile-action-sheet ${sheetFicha ? 'open' : ''}`}>
                        <div className="mobile-action-sheet-backdrop" onClick={() => setSheetData(null)} />
                        <div className="mobile-action-sheet-panel">
                            <div className="mobile-action-sheet-handle" />
                            <p className="mobile-action-sheet-title">{sheetData?.label || 'Ficha selecionada'}</p>
                            {sheetFicha && (
                                <div className="mobile-action-sheet-buttons">
                                    <button type="button" className="btn btn-view" onClick={() => { setSheetData(null); handleEdit(sheetFicha); }}>
                                        <i className="fas fa-eye"></i>
                                        <span>Ver</span>
                                    </button>
                                    <button type="button" className="btn btn-edit" onClick={() => { setSheetData(null); handleEdit(sheetFicha); }}>
                                        <i className="fas fa-edit"></i>
                                        <span>Editar</span>
                                    </button>
                                    <button type="button" className="btn btn-print" onClick={() => { setSheetData(null); window.print(); }}>
                                        <i className="fas fa-print"></i>
                                        <span>Imprimir</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </AppLayout>
    );
}


