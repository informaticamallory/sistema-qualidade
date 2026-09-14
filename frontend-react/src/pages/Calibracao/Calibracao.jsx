import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import AppLayout from '../../components/Layout/AppLayout';
import { ConfirmarSaida } from '../../components/ui';
import { equipamentosAPI, calibracoesAPI, tiposEquipamentoAPI } from '../../services/api';
import { useAuth } from '../../context/auth-context';
import { toUpper, upperFields } from '../../utils/text';
/* Os ajudantes de mês vêm de utils/date, e não redeclarados aqui como na
   Inspeção de Injeção: são os mesmos e já estavam exportados. */
import {
    currentMonthISO, daysBetweenDates, formatDateBR, monthRangeISO,
    normalizeISODate, previousMonthISO, todayISO
} from '../../utils/date';
import './Calibracao.css';

/* As duas datas que o filtro de período pode usar. No escopo do módulo para
   não ser recriado a cada renderização e virar dependência do useMemo. */
const PERIODO_CAMPO = {
    proxima: { chave: 'data_proxima_calibracao', rotulo: 'Próxima calibração' },
    ultima: { chave: 'data_ultima_calibracao', rotulo: 'Última calibração' }
};

export default function Calibracao() {
    const { user } = useAuth();
    const fileInputRef = useRef(null);

    // Estados principais
    const [equipamentos, setEquipamentos] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [stats, setStats] = useState({
        total_equipamentos: 0,
        calibrados: 0,
        vencendo: 0,
        vencidos: 0,
        nunca_calibrados: 0
    });
    const [alertas, setAlertas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');

    /* ── Filtro de período ──
       Mesmo painel da Inspeção de Injeção. A diferença é que ali existe uma
       data só; aqui há duas, e qual delas o período filtra muda a pergunta
       que a tela responde: "o que vence neste mês" ou "o que foi calibrado
       neste mês". Por isso o campo é escolhido dentro do próprio painel.

       A filtragem é no cliente, sobre a lista já carregada: a busca é que vai
       ao backend, e `equipamentosAPI.getAll` não recebe intervalo de datas.
       Não há contrato de API novo. */
    const [periodField, setPeriodField] = useState('proxima');
    const [monthFilter, setMonthFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [dateEndFilter, setDateEndFilter] = useState('');
    const [rangeStartDraft, setRangeStartDraft] = useState('');
    const [rangeEndDraft, setRangeEndDraft] = useState('');
    const [showPeriodMenu, setShowPeriodMenu] = useState(false);
    const periodMenuRef = useRef(null);
    const [exporting, setExporting] = useState(false);

    // Modais
    const [showEquipamentoModal, setShowEquipamentoModal] = useState(false);
    const [showCalibracaoModal, setShowCalibracaoModal] = useState(false);
    const [showTipoModal, setShowTipoModal] = useState(false);
    const [showAlertasModal, setShowAlertasModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewEquipamento, setViewEquipamento] = useState(null);
    const [viewCalibracoes, setViewCalibracoes] = useState([]);
    const [viewLoading, setViewLoading] = useState(false);
    const [openingCertificadoId, setOpeningCertificadoId] = useState(null);
    const [equipmentModalTab, setEquipmentModalTab] = useState('geral');
    /* 'tabs' | 'geral' -- mesmo alternador do Cadastro de Material e da
       Inspeção de Recebimento. Na visão geral as seções vêm em sequência. */
    const [formViewMode, setFormViewMode] = useState('tabs');
    /* Alterações pendentes, marcadas na função que muda o formulário e não
       campo a campo, para nenhum campo novo escapar por esquecimento. */
    const [formDirty, setFormDirty] = useState(false);
    const [confirmarSaida, setConfirmarSaida] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [selectedEquipamento, setSelectedEquipamento] = useState(null);
    const [sheetData, setSheetData] = useState(null);

    // Formulário de Equipamento
    const [equipamentoForm, setEquipamentoForm] = useState({
        codigo: '',
        codigo_sap: '',
        numero_serie: '',
        nome: '',
        fabricante: '',
        modelo: '',
        setor: '',
        responsavel: '',
        tipo_id: '',
        tipo_afericao: 'interna',
        status_equipamento: 'ativo',
        frequencia_calibracao: '',
        ultimo_certificado: '',
        ultimo_certificado_rastreavel: '',
        data_ultima_calibracao: '',
        data_proxima_calibracao: '',
        status_ficha_calibracao: 'aprovada',
        erro_aceitavel: '',
        comentarios: ''
    });
    // Formulário de Calibração
    const [calibracaoForm, setCalibracaoForm] = useState({
        equipamento_id: '',
        data_calibracao: todayISO(),
        data_validade: '',
        laboratorio: '',
        numero_certificado: '',
        resultado: 'pendente',
        observacoes: '',
        arquivo: null
    });

    // Formulário de Tipo
    const [novoTipo, setNovoTipo] = useState('');

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [equipResult, tiposResult, statsResult, alertasResult] = await Promise.allSettled([
                equipamentosAPI.getAll({ search, ativo: 'true' }),
                tiposEquipamentoAPI.getAll(),
                calibracoesAPI.getStats(),
                calibracoesAPI.getAlertas()
            ]);

            const responses = [equipResult, tiposResult, statsResult, alertasResult]
                .filter((result) => result.status === 'fulfilled')
                .map((result) => result.value);

            if (equipResult.status === 'fulfilled' && equipResult.value.data.success) {
                setEquipamentos(equipResult.value.data.data);
            }
            if (tiposResult.status === 'fulfilled' && tiposResult.value.data.success) {
                setTipos(tiposResult.value.data.data);
            }
            if (statsResult.status === 'fulfilled' && statsResult.value.data.success) {
                setStats(statsResult.value.data.data);
            }
            if (alertasResult.status === 'fulfilled' && alertasResult.value.data.success) {
                setAlertas(alertasResult.value.data.data);
            }

            const failed = [equipResult, tiposResult, statsResult, alertasResult]
                .filter((result) => result.status === 'rejected');
            const hasFallback = responses.some((response) => response.data.fallback);

            if (hasFallback) {
                setError('O backend atual ainda não possui todas as rotas de calibração/equipamentos. Exibindo os dados disponíveis.');
            } else if (failed.length > 0) {
                setError('Alguns dados de calibração não puderam ser carregados.');
            } else {
                setError(null);
            }
        } finally {
            setLoading(false);
        }
    }, [search]);

    /* Exporta o que está na tela — a lista já filtrada por busca e período —
       e não a base inteira: o arquivo tem de bater com o que o usuário vê. */
    const exportarExcel = async () => {
        if (!equipamentosVisiveis.length) return;
        setExporting(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const planilha = workbook.addWorksheet('Equipamentos');
            planilha.columns = [
                { header: 'Código', key: 'codigo', width: 14 },
                { header: 'Cód. SAP', key: 'codigo_sap', width: 14 },
                { header: 'Equipamento', key: 'nome', width: 32 },
                { header: 'Tipo', key: 'tipo', width: 18 },
                { header: 'Marca', key: 'fabricante', width: 16 },
                { header: 'Série/Modelo', key: 'numero_serie', width: 18 },
                { header: 'Setor', key: 'setor', width: 16 },
                { header: 'Responsável', key: 'responsavel', width: 20 },
                { header: 'Aferição', key: 'tipo_afericao', width: 12 },
                { header: 'Frequência', key: 'frequencia_calibracao', width: 14 },
                { header: 'Última calibração', key: 'data_ultima_calibracao', width: 18 },
                { header: 'Próxima calibração', key: 'data_proxima_calibracao', width: 18 },
                { header: 'Situação', key: 'situacao', width: 16 }
            ];

            equipamentosVisiveis.forEach((equip) => {
                const situacao = getStatusCalibracao(equip);
                planilha.addRow({
                    codigo: equip.codigo || '',
                    codigo_sap: equip.codigo_sap || '',
                    nome: equip.nome || '',
                    tipo: equip.tipo || '',
                    fabricante: equip.fabricante || '',
                    numero_serie: equip.numero_serie || '',
                    setor: equip.setor || '',
                    responsavel: equip.responsavel || '',
                    tipo_afericao: equip.tipo_afericao || '',
                    frequencia_calibracao: equip.frequencia_calibracao || '',
                    data_ultima_calibracao: formatDateBR(equip.data_ultima_calibracao, ''),
                    data_proxima_calibracao: formatDateBR(equip.data_proxima_calibracao, ''),
                    situacao: situacao?.label || ''
                });
            });

            const cabecalho = planilha.getRow(1);
            cabecalho.font = { bold: true };
            cabecalho.alignment = { vertical: 'middle', horizontal: 'center' };
            planilha.autoFilter = { from: 'A1', to: `M${planilha.rowCount}` };

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `equipamentos-${todayISO()}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    /* Fecha o seletor de período ao clicar fora. */
    useEffect(() => {
        if (!showPeriodMenu) return;
        const fechar = (evento) => {
            if (periodMenuRef.current && !periodMenuRef.current.contains(evento.target)) {
                setShowPeriodMenu(false);
            }
        };
        document.addEventListener('mousedown', fechar);
        /* `touchstart` além de `mousedown`: no celular o mousedown sintético
           só chega depois do toque terminar, e em alguns casos nem chega. */
        document.addEventListener('touchstart', fechar);
        return () => {
            document.removeEventListener('mousedown', fechar);
            document.removeEventListener('touchstart', fechar);
        };
    }, [showPeriodMenu]);

    const selecionarMes = (mes) => {
        const { start, end } = monthRangeISO(mes || currentMonthISO());
        setMonthFilter(mes || currentMonthISO());
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
            ? `${PERIODO_CAMPO[periodField].rotulo} · ${monthFilter.split('-').reverse().join('/')}`
            : `${formatDateBR(dateFilter, '—')} a ${formatDateBR(dateEndFilter, '—')}`);

    /* Lista que a tabela mostra. Sem período escolhido devolve tudo, para a
       tela seguir funcionando como antes de o filtro existir. Equipamento sem
       a data escolhida fica de fora enquanto houver período — senão "vence em
       setembro" traria também os que nunca foram calibrados. */
    const equipamentosVisiveis = useMemo(() => {
        if (!dateFilter && !dateEndFilter) return equipamentos;
        const campo = PERIODO_CAMPO[periodField].chave;
        return equipamentos.filter((equip) => {
            const valor = normalizeISODate(equip[campo], '');
            if (!valor) return false;
            if (dateFilter && valor < dateFilter) return false;
            if (dateEndFilter && valor > dateEndFilter) return false;
            return true;
        });
    }, [equipamentos, dateFilter, dateEndFilter, periodField]);

    useEffect(() => {
        loadData();
    }, [loadData]);

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

    // === EQUIPAMENTO ===
    const handleEquipamentoSubmit = async (e) => {
        e.preventDefault();
        try {
            const equipamentoPayload = upperFields({
                ...equipamentoForm,
                data_ultima_calibracao: normalizeISODate(equipamentoForm.data_ultima_calibracao, ''),
                data_proxima_calibracao: normalizeISODate(equipamentoForm.data_proxima_calibracao, '')
            }, [
                'codigo', 'codigo_sap', 'numero_serie', 'nome', 'fabricante', 'modelo',
                'setor', 'responsavel', 'tipo_afericao', 'status_equipamento',
                'frequencia_calibracao', 'ultimo_certificado', 'ultimo_certificado_rastreavel',
                'status_ficha_calibracao', 'erro_aceitavel', 'comentarios'
            ]);

            if (editingId) {
                await equipamentosAPI.update(editingId, equipamentoPayload);
            } else {
                await equipamentosAPI.create(equipamentoPayload);
            }
            fecharEquipamentoModal();
            resetEquipamentoForm();
            loadData();
        } catch (error) {
            console.error('Erro ao salvar equipamento:', error);
            alert(error.response?.data?.message || 'Erro ao salvar equipamento');
        }
    };

    const handleEditEquipamento = (equip) => {
        setEquipamentoForm({
            codigo: equip.codigo || '',
            codigo_sap: equip.codigo_sap || '',
            numero_serie: equip.numero_serie || '',
            nome: equip.nome || '',
            fabricante: equip.fabricante || '',
            modelo: equip.modelo || '',
            setor: equip.setor || '',
            responsavel: equip.responsavel || '',
            tipo_id: equip.tipo_id || '',
            tipo_afericao: equip.tipo_afericao || 'interna',
            status_equipamento: equip.status_equipamento || 'ativo',
            frequencia_calibracao: equip.frequencia_calibracao || '',
            ultimo_certificado: equip.ultimo_certificado || '',
            ultimo_certificado_rastreavel: equip.ultimo_certificado_rastreavel || '',
            data_ultima_calibracao: equip.data_ultima_calibracao || '',
            data_proxima_calibracao: equip.data_proxima_calibracao || '',
            status_ficha_calibracao: equip.status_ficha_calibracao || 'aprovada',
            erro_aceitavel: equip.erro_aceitavel || '',
            comentarios: equip.comentarios || ''
        });
        setEditingId(equip.id);
        setEquipmentModalTab('geral');
        setShowEquipamentoModal(true);
    };

    const updateEquipamentoField = (field, value) => {
        setEquipamentoForm(prev => ({ ...prev, [field]: value }));
        setFormDirty(true);
    };

    const fecharEquipamentoModal = () => {
        setShowEquipamentoModal(false);
        setFormDirty(false);
        setConfirmarSaida(false);
    };

    /* Único caminho de fechamento: o X, o Cancelar e o clique no fundo passam
       por aqui, senão um deles descartaria o preenchimento em silêncio. */
    const solicitarFechamentoEquipamento = () => {
        if (formDirty) {
            setConfirmarSaida(true);
            return;
        }
        fecharEquipamentoModal();
    };
    const handleDeleteEquipamento = async (id) => {
        if (window.confirm('Tem certeza que deseja desativar este equipamento?')) {
            try {
                await equipamentosAPI.delete(id);
                loadData();
            } catch {
                alert('Erro ao desativar equipamento');
            }
        }
    };

    const handleCloseViewModal = () => {
        setShowViewModal(false);
        setViewEquipamento(null);
        setViewCalibracoes([]);
        setViewLoading(false);
    };

    const handleViewEquipamento = async (equip) => {
        setViewEquipamento(equip);
        setViewCalibracoes(equip.ultima_calibracao ? [equip.ultima_calibracao] : []);
        setShowViewModal(true);
        setViewLoading(true);

        try {
            const res = await calibracoesAPI.getAll({ equipamento_id: equip.id });
            if (res.data.success) {
                setViewCalibracoes(res.data.data);
            }
        } catch (error) {
            console.error('Erro ao buscar histórico de calibrações:', error);
        } finally {
            setViewLoading(false);
        }
    };
    const resetEquipamentoForm = () => {
        setFormDirty(false);
        setConfirmarSaida(false);
        setFormViewMode('tabs');
        setEquipamentoForm({
            codigo: '',
            codigo_sap: '',
            numero_serie: '',
            nome: '',
            fabricante: '',
            modelo: '',
            setor: '',
            responsavel: '',
            tipo_id: '',
            tipo_afericao: 'interna',
            status_equipamento: 'ativo',
            frequencia_calibracao: '',
            ultimo_certificado: '',
            ultimo_certificado_rastreavel: '',
            data_ultima_calibracao: '',
            data_proxima_calibracao: '',
            status_ficha_calibracao: 'aprovada',
            erro_aceitavel: '',
            comentarios: ''
        });
        setEditingId(null);
        setEquipmentModalTab('geral');
    };

    // === CALIBRAÇÃO ===
    const handleOpenCalibracaoModal = (equip) => {
        setSelectedEquipamento(equip);
        setCalibracaoForm({
            equipamento_id: equip.id,
            data_calibracao: todayISO(),
            data_validade: '',
            laboratorio: '',
            numero_certificado: '',
            resultado: 'pendente',
            observacoes: '',
            arquivo: null
        });
        setShowCalibracaoModal(true);
    };

    const openMobileActions = (equipamento) => {
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
            setSheetData((current) => (
                current?.id === equipamento.id
                    ? null
                    : { id: equipamento.id, label: equipamento.codigo || equipamento.nome || 'Equipamento selecionado' }
            ));
        }
    };

    const handleCalibracaoSubmit = async (e) => {
        e.preventDefault();
        try {
            const calibracaoPayload = upperFields({
                ...calibracaoForm,
                data_calibracao: normalizeISODate(calibracaoForm.data_calibracao),
                data_validade: normalizeISODate(calibracaoForm.data_validade, '')
            }, ['laboratorio', 'numero_certificado']);

            if (calibracaoForm.arquivo) {
                // Com arquivo - usar FormData
                const formData = new FormData();
                Object.keys(calibracaoPayload).forEach(key => {
                    if (key === 'arquivo') {
                        formData.append('arquivo_certificado', calibracaoForm.arquivo);
                    } else {
                        formData.append(key, calibracaoPayload[key]);
                    }
                });
                formData.append('responsavel', user?.nome || '');
                await calibracoesAPI.createWithFile(formData);
            } else {
                // Sem arquivo
                await calibracoesAPI.create({
                    ...calibracaoPayload,
                    responsavel: user?.nome || ''
                });
            }
            setShowCalibracaoModal(false);
            loadData();
            alert('Calibração registrada com sucesso!');
        } catch (error) {
            console.error('Erro ao registrar calibração:', error);
            alert(error.response?.data?.message || 'Erro ao registrar calibração');
        }
    };

    // === TIPO ===
    const handleAddTipo = async (e) => {
        e.preventDefault();
        if (!novoTipo.trim()) return;

        try {
            await tiposEquipamentoAPI.create({ nome: toUpper(novoTipo.trim()) });
            setNovoTipo('');
            const res = await tiposEquipamentoAPI.getAll();
            if (res.data.success) setTipos(res.data.data);
        } catch (error) {
            alert(error.response?.data?.message || 'Erro ao criar tipo');
        }
    };

    const handleDeleteTipo = async (id) => {
        if (window.confirm('Excluir este tipo?')) {
            try {
                await tiposEquipamentoAPI.delete(id);
                const res = await tiposEquipamentoAPI.getAll();
                if (res.data.success) setTipos(res.data.data);
            } catch (error) {
                alert(error.response?.data?.message || 'Erro ao excluir tipo');
            }
        }
    };

    // === HELPERS ===
    const getStatusCalibracao = (equip) => {
        if (!equip.ultima_calibracao) {
            return { status: 'pendente', label: 'Pendente', color: 'gray' };
        }

        const diasRestantes = daysBetweenDates(todayISO(), equip.ultima_calibracao.data_validade);

        if (diasRestantes === null || diasRestantes < 0) {
            return { status: 'vencida', label: 'Vencida', color: 'red', dias: diasRestantes };
        } else if (diasRestantes <= 20) {
            return { status: 'vencendo', label: `Vence em ${diasRestantes}d`, color: 'yellow', dias: diasRestantes };
        } else {
            return { status: 'ok', label: 'OK', color: 'green', dias: diasRestantes };
        }
    };

    /* Delega ao utilitário compartilhado, que extrai a data por regex
       (`^\d{4}-\d{2}-\d{2}`) e portanto ignora a parte de hora. A versão
       local fazia `split('-')` e tomava o terceiro pedaço como dia: num
       `created_at` ISO isso virava "14T12:57:44.000Z/09/2026". */
    const formatarData = (dataString) => formatDateBR(dataString, '-');

    const formatarValor = (valor) => {
        if (valor === null || valor === undefined || valor === '') return '-';
        return String(valor);
    };

    const formatarOpcao = (valor) => {
        if (!valor) return '-';
        return String(valor)
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, letra => letra.toUpperCase());
    };

    const getResultadoColor = (resultado) => {
        const normalizado = String(resultado || '').toLowerCase();
        if (normalizado.includes('aprov')) return 'green';
        if (normalizado.includes('reprov')) return 'red';
        if (normalizado.includes('pend')) return 'yellow';
        return 'gray';
    };

    const getArquivoNome = (arquivo) => {
        if (!arquivo) return '';
        return String(arquivo).split(/[\\/]/).pop();
    };

    const handleOpenCertificado = async (calibracao) => {
        if (!calibracao?.id || !calibracao.arquivo_certificado) {
            alert('Esta calibração não possui certificado PDF anexado.');
            return;
        }

        const arquivoCertificado = String(calibracao.arquivo_certificado || '');
        if (/^https?:\/\//i.test(arquivoCertificado)) {
            const opened = window.open(arquivoCertificado, '_blank', 'noopener,noreferrer');
            if (!opened) {
                alert('O navegador bloqueou a nova aba. Permita pop-ups para abrir o certificado.');
            }
            return;
        }

        const pdfWindow = window.open('', '_blank');
        if (!pdfWindow) {
            alert('O navegador bloqueou a nova aba. Permita pop-ups para abrir o certificado.');
            return;
        }

        pdfWindow.opener = null;
        pdfWindow.document.write('<p style="font-family: sans-serif; padding: 24px;">Carregando certificado...</p>');
        setOpeningCertificadoId(calibracao.id);

        try {
            const response = await calibracoesAPI.getCertificate(calibracao.id);
            const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/pdf' });
            const url = URL.createObjectURL(blob);
            pdfWindow.location.href = url;
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            pdfWindow.close();
            console.error('Erro ao abrir certificado:', error);
            alert('Não foi possível abrir o certificado PDF.');
        } finally {
            setOpeningCertificadoId(null);
        }
    };

    const renderInfoItem = (label, value, className = '') => {
        /* `'-'` também conta como vazio: vários chamadores passam o valor já
           por `formatarOpcao`, que devolve `'-'` quando não há dado. Sem isto
           só o `null` seria reconhecido e metade dos campos vazios ficaria com
           aparência de preenchido. */
        const vazio = value === null || value === undefined || value === '' || value === '-';
        return (
            <div className={`calibracao-view-item ${className}`}>
                <span className="calibracao-view-label">{label}</span>
                <span className={`calibracao-view-value ${vazio ? 'is-vazio' : ''}`}>
                    {vazio ? 'Não informado' : formatarValor(value)}
                </span>
            </div>
        );
    };
    const sheetEquipamento = sheetData ? equipamentos.find((equipamento) => equipamento.id === sheetData.id) : null;
    const viewStatusCalibracao = viewEquipamento ? getStatusCalibracao(viewEquipamento) : null;
    const ultimaCalibracaoView = viewCalibracoes[0] || viewEquipamento?.ultima_calibracao || null;

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Calibração' }]}
            containerClassName="calibracao-page"
        >
            <div>
                {/* Header */}
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-tools"></i> Calibração de Equipamentos</h1>
                        <p>Gerencie equipamentos e controle as calibrações</p>
                    </div>
                    {/* Mesma barra da Inspeção de Injeção: busca, período e os
                        botões de ação. Os rótulos ficam em `.filter-label`, que
                        some no celular e deixa só os ícones. */}
                    <div className="header-actions calibracao-filters">
                        <input
                            type="search"
                            className="form-control calibracao-search"
                            placeholder="Buscar equipamento..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

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
                                    {/* Qual das duas datas o período filtra. Sem
                                        isto o filtro seria ambíguo nesta tela. */}
                                    <div className="period-campo-escolha" role="group"
                                        aria-label="Filtrar período por">
                                        {Object.entries(PERIODO_CAMPO).map(([id, campo]) => (
                                            <button key={id} type="button"
                                                className={`period-campo-opcao ${periodField === id ? 'is-ativo' : ''}`}
                                                aria-pressed={periodField === id}
                                                onClick={() => setPeriodField(id)}>
                                                {campo.rotulo}
                                            </button>
                                        ))}
                                    </div>

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

                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowTipoModal(true)}
                            title="Tipos de equipamento"
                        >
                            <i className="fas fa-tags"></i>
                            <span className="filter-label"> Tipos</span>
                        </button>
                        <button
                            className="btn btn-success"
                            onClick={exportarExcel}
                            disabled={exporting || equipamentosVisiveis.length === 0}
                            title="Exportar Excel"
                        >
                            <i className={`fas ${exporting ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
                            <span className="filter-label"> Excel</span>
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={() => { resetEquipamentoForm(); setShowEquipamentoModal(true); }}
                            title="Novo equipamento"
                        >
                            <i className="fas fa-plus"></i>
                            <span className="filter-label"> Novo Equipamento</span>
                        </button>
                    </div>
                </div>

                {/* Aviso de erro com retry manual */}
                {error && (
                    <div className="page-alert">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span>{error}</span>
                        <button className="btn btn-outline btn-sm" onClick={loadData}>
                            <i className="fas fa-rotate-right"></i> Tentar novamente
                        </button>
                    </div>
                )}

                {/* Stats Cards */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon blue">
                            <i className="fas fa-tools"></i>
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.total_equipamentos}</span>
                            <span className="stat-label">Total Equipamentos</span>
                        </div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-icon green">
                            <i className="fas fa-check-circle"></i>
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.calibrados}</span>
                            <span className="stat-label">Calibrados</span>
                        </div>
                    </div>

                    <div
                        className={`stat-card clickable ${stats.vencendo > 0 ? 'warning' : ''}`}
                        onClick={() => stats.vencendo > 0 && setShowAlertasModal(true)}
                    >
                        <div className="stat-icon yellow">
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.vencendo}</span>
                            <span className="stat-label">Vencendo (20 dias)</span>
                        </div>
                        {stats.vencendo > 0 && <span className="alert-badge pulse">!</span>}
                    </div>

                    <div
                        className={`stat-card clickable ${stats.vencidos > 0 ? 'danger' : ''}`}
                        onClick={() => stats.vencidos > 0 && setShowAlertasModal(true)}
                    >
                        <div className="stat-icon red">
                            <i className="fas fa-times-circle"></i>
                        </div>
                        <div className="stat-info">
                            <span className="stat-value">{stats.vencidos}</span>
                            <span className="stat-label">Vencidos</span>
                        </div>
                        {stats.vencidos > 0 && <span className="alert-badge danger">!</span>}
                    </div>
                </div>

                {/* Tabela de Equipamentos */}
                <div className="table-card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Nome</th>
                                    <th>Tipo</th>
                                    <th>Setor</th>
                                    <th>Última Calibração</th>
                                    <th>Validade</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                    <th className="actions-column" style={{ textAlign: 'center' }}>Ações</th>
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
                                ) : equipamentosVisiveis.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="text-center">
                                            <div className="empty-state">
                                                <i className="fas fa-tools"></i>
                                                <p>Nenhum equipamento encontrado</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    equipamentosVisiveis.map(equip => {
                                        const statusCal = getStatusCalibracao(equip);
                                        return (
                                            <tr
                                                key={equip.id}
                                                className={`${statusCal.color === 'red' ? 'row-danger' : statusCal.color === 'yellow' ? 'row-warning' : ''} mobile-clickable-row ${sheetData?.id === equip.id ? 'mobile-row-active' : ''}`}
                                                onClick={() => openMobileActions(equip)}
                                            >
                                                <td>
                                                    <strong>{equip.codigo}</strong>
                                                    {equip.codigo_sap && <small className="table-subline">SAP: {equip.codigo_sap}</small>}
                                                </td>
                                                <td>
                                                    <span>{equip.nome}</span>
                                                    {(equip.fabricante || equip.numero_serie) && (
                                                        <small className="table-subline">
                                                            {[equip.fabricante, equip.numero_serie].filter(Boolean).join(' • ')}
                                                        </small>
                                                    )}
                                                </td>
                                                <td>
                                                    <span>{equip.tipo || '-'}</span>
                                                    {equip.tipo_afericao && (
                                                        <small className="table-subline">
                                                            {equip.tipo_afericao === 'externa' ? 'Externa' : 'Interna'}
                                                        </small>
                                                    )}
                                                </td>
                                                <td>{equip.setor || '-'}</td>
                                                <td>{equip.ultima_calibracao ? formatarData(equip.ultima_calibracao.data_calibracao) : '-'}</td>
                                                <td>{equip.ultima_calibracao ? formatarData(equip.ultima_calibracao.data_validade) : '-'}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <span className={`badge badge-${statusCal.color}`}>
                                                        {statusCal.label}
                                                    </span>
                                                </td>
                                                <td className="actions-column">
                                                    <div className="action-buttons">
                                                        <button
                                                            className="btn-icon btn-view"
                                                            onClick={(e) => { e.stopPropagation(); handleViewEquipamento(equip); }}
                                                            title="Visualizar"
                                                        >
                                                            <i className="fas fa-eye"></i>
                                                        </button>
                                                        <button
                                                            className="btn-icon btn-calibrate"
                                                            onClick={(e) => { e.stopPropagation(); handleOpenCalibracaoModal(equip); }}
                                                            title="Registrar Calibração"
                                                        >
                                                            <i className="fas fa-certificate"></i>
                                                        </button>
                                                        <button
                                                            className="btn-icon btn-edit"
                                                            onClick={(e) => { e.stopPropagation(); handleEditEquipamento(equip); }}
                                                            title="Editar"
                                                        >
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                        <button
                                                            className="btn-icon btn-delete"
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteEquipamento(equip.id); }}
                                                            title="Desativar"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modal de Equipamento */}
                {showEquipamentoModal && (
                    <div className="modal-overlay" onClick={solicitarFechamentoEquipamento}>
                        <div className="modal-content modal-equipment-list" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header modal-header-equipment">
                                <h2><i className="fas fa-clipboard-list"></i> {editingId ? 'Editar Equipamento' : 'Novo Equipamento'}</h2>
                                <button className="modal-close" onClick={solicitarFechamentoEquipamento}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <form onSubmit={handleEquipamentoSubmit}>
                                {/* Alternador Abas / Visão geral, o mesmo do Cadastro de
                                    Material e da Inspeção de Recebimento. Na visão geral
                                    as seções vêm em sequência e as abas somem, porque não
                                    há mais o que navegar. */}
                                <div className="form-view-switcher" role="group"
                                    aria-label="Modo de exibição do formulário">
                                    <button type="button"
                                        className={`view-switch-option ${formViewMode === 'tabs' ? 'active' : ''}`}
                                        onClick={() => setFormViewMode('tabs')}
                                        aria-pressed={formViewMode === 'tabs'}>
                                        <i className="fas fa-layer-group" aria-hidden="true"></i> Abas
                                    </button>
                                    <button type="button"
                                        className={`view-switch-option ${formViewMode === 'geral' ? 'active' : ''}`}
                                        onClick={() => setFormViewMode('geral')}
                                        aria-pressed={formViewMode === 'geral'}>
                                        <i className="fas fa-list-check" aria-hidden="true"></i> Visão geral
                                    </button>
                                </div>

                                {formViewMode === 'tabs' && (
                                <div className="equipment-modal-tabs" role="tablist" aria-label="Dados do equipamento">
                                    <button
                                        type="button"
                                        className={`equipment-modal-tab ${equipmentModalTab === 'geral' ? 'active' : ''}`}
                                        onClick={() => setEquipmentModalTab('geral')}
                                    >
                                        <i className="fas fa-list"></i> Geral
                                    </button>
                                    <button
                                        type="button"
                                        className={`equipment-modal-tab ${equipmentModalTab === 'detalhes' ? 'active' : ''}`}
                                        onClick={() => setEquipmentModalTab('detalhes')}
                                    >
                                        <i className="fas fa-sliders-h"></i> Detalhes
                                    </button>
                                </div>
                                )}

                                <div className="modal-body equipment-sheet-form">
                                    {(formViewMode === 'geral' || equipmentModalTab === 'geral') && (
                                        <section className="equipment-form-section">
                                            <h3>Cadastro Básico</h3>
                                            <div className="equipment-form-grid basic">
                                                <div className="form-group">
                                                    <label>Código Instrumento *</label>
                                                    <input
                                                        type="text"
                                                        className="form-control field-upper"
                                                        value={equipamentoForm.codigo}
                                                        onChange={(e) => updateEquipamentoField('codigo', e.target.value.toUpperCase())}
                                                        placeholder="Ex: 001-01"
                                                        required
                                                    />
                                                </div>
                                                <div className="form-group span-2">
                                                    <label>Equipamento *</label>
                                                    <input
                                                        type="text"
                                                        className="form-control field-upper"
                                                        value={equipamentoForm.nome}
                                                        onChange={(e) => updateEquipamentoField('nome', e.target.value)}
                                                        placeholder="Ex: Paquímetro Analógico 300 mm"
                                                        required
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Tipo de Equipamento</label>
                                                    <select
                                                        className="form-control"
                                                        value={equipamentoForm.tipo_id}
                                                        onChange={(e) => updateEquipamentoField('tipo_id', e.target.value)}
                                                    >
                                                        <option value="">Selecione</option>
                                                        {tipos.map(t => (
                                                            <option key={t.id} value={t.id}>{t.nome}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="form-group">
                                                    <label>Localização</label>
                                                    <input
                                                        type="text"
                                                        className="form-control field-upper"
                                                        value={equipamentoForm.setor}
                                                        onChange={(e) => updateEquipamentoField('setor', e.target.value)}
                                                        placeholder="Ex: Qualidade"
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>Responsável</label>
                                                    <input
                                                        type="text"
                                                        className="form-control field-upper"
                                                        value={equipamentoForm.responsavel}
                                                        onChange={(e) => updateEquipamentoField('responsavel', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </section>
                                    )}
                                    {(formViewMode === 'geral' || equipmentModalTab === 'detalhes') && (
                                        <>
                                            <section className="equipment-form-section">
                                                <h3>Identificação Complementar</h3>
                                                <div className="equipment-form-grid">
                                                    <div className="form-group">
                                                        <label>Código SAP</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.codigo_sap}
                                                            onChange={(e) => updateEquipamentoField('codigo_sap', e.target.value)}
                                                            placeholder="Ex: B91000990"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Série ou Modelo</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.numero_serie}
                                                            onChange={(e) => updateEquipamentoField('numero_serie', e.target.value)}
                                                            placeholder="Ex: 5037979"
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Marca</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.fabricante}
                                                            onChange={(e) => updateEquipamentoField('fabricante', e.target.value)}
                                                            placeholder="Ex: Mitutoyo"
                                                        />
                                                    </div>
                                                    <div className="form-group span-3">
                                                        <label>Modelo Complementar</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.modelo}
                                                            onChange={(e) => updateEquipamentoField('modelo', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </section>

                                            <section className="equipment-form-section">
                                                <h3>Classificação</h3>
                                                <div className="equipment-form-grid">
                                                    <div className="form-group">
                                                        <label>Tipo de Aferição</label>
                                                        <select
                                                            className="form-control"
                                                            value={equipamentoForm.tipo_afericao}
                                                            onChange={(e) => updateEquipamentoField('tipo_afericao', e.target.value)}
                                                        >
                                                            <option value="interna">Interna</option>
                                                            <option value="externa">Externa</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Status</label>
                                                        <select
                                                            className="form-control"
                                                            value={equipamentoForm.status_equipamento}
                                                            onChange={(e) => updateEquipamentoField('status_equipamento', e.target.value)}
                                                        >
                                                            <option value="ativo">Ativo</option>
                                                            <option value="inativo">Inativo</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Freq. Calibração</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.frequencia_calibracao}
                                                            onChange={(e) => updateEquipamentoField('frequencia_calibracao', e.target.value)}
                                                            placeholder="Ex: 24 meses"
                                                        />
                                                    </div>
                                                </div>
                                            </section>

                                            <section className="equipment-form-section">
                                                <h3>Controle de Calibração</h3>
                                                <div className="equipment-form-grid">
                                                    <div className="form-group">
                                                        <label>Último Nº de Cert. Calibração</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.ultimo_certificado}
                                                            onChange={(e) => updateEquipamentoField('ultimo_certificado', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group span-2">
                                                        <label>Último Nº de Certificado Rastreável/RF</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.ultimo_certificado_rastreavel}
                                                            onChange={(e) => updateEquipamentoField('ultimo_certificado_rastreavel', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Data da Calibração</label>
                                                        <input
                                                            type="date"
                                                            className="form-control"
                                                            value={equipamentoForm.data_ultima_calibracao}
                                                            onChange={(e) => updateEquipamentoField('data_ultima_calibracao', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Data para Próx. Calibração</label>
                                                        <input
                                                            type="date"
                                                            className="form-control"
                                                            value={equipamentoForm.data_proxima_calibracao}
                                                            onChange={(e) => updateEquipamentoField('data_proxima_calibracao', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Status Ficha Calibração</label>
                                                        <select
                                                            className="form-control"
                                                            value={equipamentoForm.status_ficha_calibracao}
                                                            onChange={(e) => updateEquipamentoField('status_ficha_calibracao', e.target.value)}
                                                        >
                                                            <option value="aprovada">Aprovada</option>
                                                            <option value="reprovada">Reprovada</option>
                                                            <option value="pendente">Pendente</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Erro Aceitável</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.erro_aceitavel}
                                                            onChange={(e) => updateEquipamentoField('erro_aceitavel', e.target.value)}
                                                            placeholder="Ex: 0,08 mm"
                                                        />
                                                    </div>
                                                    <div className="form-group span-3">
                                                        <label>Comentários</label>
                                                        <textarea
                                                            className="form-control field-upper"
                                                            value={equipamentoForm.comentarios}
                                                            onChange={(e) => updateEquipamentoField('comentarios', e.target.value)}
                                                            rows="3"
                                                        ></textarea>
                                                    </div>
                                                </div>
                                            </section>
                                        </>
                                    )}
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={solicitarFechamentoEquipamento}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-save"></i> Salvar
                                    </button>
                                </div>
                            </form>

                            <ConfirmarSaida
                                aberto={confirmarSaida}
                                onCancelar={() => setConfirmarSaida(false)}
                                onSair={fecharEquipamentoModal}
                            />
                        </div>
                    </div>
                )}
                {/* Modal de Calibração */}
                {showCalibracaoModal && selectedEquipamento && (
                    <div className="modal-overlay" onClick={() => setShowCalibracaoModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header modal-header-calibracao">
                                <h2><i className="fas fa-certificate"></i> Registrar Calibração</h2>
                                <button className="modal-close" onClick={() => setShowCalibracaoModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <form onSubmit={handleCalibracaoSubmit}>
                                <div className="modal-body">
                                    <div className="equipamento-info">
                                        <div className="equip-badge">
                                            <i className="fas fa-tools"></i>
                                            <span>{selectedEquipamento.codigo}</span>
                                        </div>
                                        <p>{selectedEquipamento.nome}</p>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label><i className="fas fa-calendar"></i> Data Calibração *</label>
                                            <input
                                                type="date"
                                                className="form-control"
                                                value={calibracaoForm.data_calibracao}
                                                onChange={(e) => setCalibracaoForm({ ...calibracaoForm, data_calibracao: e.target.value })}
                                                required
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label><i className="fas fa-calendar-check"></i> Data Validade *</label>
                                            <input
                                                type="date"
                                                className="form-control"
                                                value={calibracaoForm.data_validade}
                                                onChange={(e) => setCalibracaoForm({ ...calibracaoForm, data_validade: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label><i className="fas fa-building"></i> Laboratório</label>
                                            <input
                                                type="text"
                                                className="form-control field-upper"
                                                value={calibracaoForm.laboratorio}
                                                onChange={(e) => setCalibracaoForm({ ...calibracaoForm, laboratorio: e.target.value })}
                                                placeholder="Nome do laboratório"
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label><i className="fas fa-file-alt"></i> Nº Certificado</label>
                                            <input
                                                type="text"
                                                className="form-control field-upper"
                                                value={calibracaoForm.numero_certificado}
                                                onChange={(e) => setCalibracaoForm({ ...calibracaoForm, numero_certificado: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label><i className="fas fa-clipboard-check"></i> Resultado *</label>
                                        <div className="resultado-options">
                                            {['aprovado', 'reprovado', 'pendente'].map(res => (
                                                <label
                                                    key={res}
                                                    className={`resultado-option ${calibracaoForm.resultado === res ? 'selected ' + res : ''}`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="resultado"
                                                        value={res}
                                                        checked={calibracaoForm.resultado === res}
                                                        onChange={(e) => setCalibracaoForm({ ...calibracaoForm, resultado: e.target.value })}
                                                    />
                                                    <i className={`fas ${res === 'aprovado' ? 'fa-check-circle' : res === 'reprovado' ? 'fa-times-circle' : 'fa-clock'}`}></i>
                                                    {res.charAt(0).toUpperCase() + res.slice(1)}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label><i className="fas fa-file-pdf"></i> Certificado de Calibração (PDF)</label>
                                        <div className="upload-area" onClick={() => fileInputRef.current.click()}>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                accept=".pdf"
                                                onChange={(e) => setCalibracaoForm({ ...calibracaoForm, arquivo: e.target.files[0] })}
                                                style={{ display: 'none' }}
                                            />
                                            {calibracaoForm.arquivo ? (
                                                <div className="upload-file-selected">
                                                    <i className="fas fa-file-pdf"></i>
                                                    <span>{calibracaoForm.arquivo.name}</span>
                                                    <button
                                                        type="button"
                                                        className="btn-remove-file"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setCalibracaoForm({ ...calibracaoForm, arquivo: null });
                                                        }}
                                                    >
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="upload-placeholder">
                                                    <i className="fas fa-cloud-upload-alt"></i>
                                                    <span>Clique para selecionar o certificado PDF</span>
                                                    <small>ou arraste o arquivo aqui</small>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label><i className="fas fa-comment"></i> Observações</label>
                                        <textarea
                                            className="form-control"
                                            value={calibracaoForm.observacoes}
                                            onChange={(e) => setCalibracaoForm({ ...calibracaoForm, observacoes: e.target.value })}
                                            rows="3"
                                            placeholder="Observações sobre a calibração..."
                                        ></textarea>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowCalibracaoModal(false)}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="btn btn-success">
                                        <i className="fas fa-certificate"></i> Registrar Calibração
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Modal de Visualização */}
                {showViewModal && viewEquipamento && (
                    <div className="modal-overlay" onClick={handleCloseViewModal}>
                        <div className="modal-content modal-calibracao-view" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header modal-header-view">
                                <h2><i className="fas fa-eye"></i> Visualizar Equipamento</h2>
                                <button className="modal-close" onClick={handleCloseViewModal}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body calibracao-view-body">
                                <div className="calibracao-view-summary">
                                    <div>
                                        <span className="calibracao-view-eyebrow">Equipamento</span>
                                        <h3>{viewEquipamento.codigo} - {viewEquipamento.nome}</h3>
                                        <p>{[viewEquipamento.tipo, viewEquipamento.setor].filter(Boolean).join(' | ') || 'Sem tipo/setor informado'}</p>
                                    </div>
                                    {viewStatusCalibracao && (
                                        <span className={`badge badge-${viewStatusCalibracao.color}`}>
                                            {viewStatusCalibracao.label}
                                        </span>
                                    )}
                                </div>

                                <section className="calibracao-view-section">
                                    <h3>Identificação</h3>
                                    <div className="calibracao-view-grid">
                                        {renderInfoItem('Código', viewEquipamento.codigo)}
                                        {renderInfoItem('Código SAP', viewEquipamento.codigo_sap)}
                                        {renderInfoItem('Nome', viewEquipamento.nome)}
                                        {renderInfoItem('Tipo', viewEquipamento.tipo)}
                                        {renderInfoItem('Fabricante', viewEquipamento.fabricante)}
                                        {renderInfoItem('Modelo', viewEquipamento.modelo)}
                                        {renderInfoItem('Nº de Série', viewEquipamento.numero_serie)}
                                        {renderInfoItem('Criado em', formatarData(viewEquipamento.created_at))}
                                        {renderInfoItem('Situação', viewEquipamento.ativo ? 'Ativo' : 'Inativo')}
                                    </div>
                                </section>

                                <section className="calibracao-view-section">
                                    <h3>Controle do Equipamento</h3>
                                    <div className="calibracao-view-grid">
                                        {renderInfoItem('Setor', viewEquipamento.setor)}
                                        {renderInfoItem('Responsável', viewEquipamento.responsavel)}
                                        {renderInfoItem('Tipo de Aferição', formatarOpcao(viewEquipamento.tipo_afericao))}
                                        {renderInfoItem('Status do Equipamento', formatarOpcao(viewEquipamento.status_equipamento))}
                                        {renderInfoItem('Frequência de Calibração', viewEquipamento.frequencia_calibracao)}
                                        {renderInfoItem('Erro Aceitável', viewEquipamento.erro_aceitavel)}
                                    </div>
                                </section>

                                <section className="calibracao-view-section">
                                    <h3>Ficha e Certificado Cadastrados</h3>
                                    <div className="calibracao-view-grid">
                                        {renderInfoItem('Último Certificado', viewEquipamento.ultimo_certificado)}
                                        {renderInfoItem('Certificado Rastreável', viewEquipamento.ultimo_certificado_rastreavel)}
                                        {renderInfoItem('Última Calibração', formatarData(viewEquipamento.data_ultima_calibracao))}
                                        {renderInfoItem('Próxima Calibração', formatarData(viewEquipamento.data_proxima_calibracao))}
                                        {renderInfoItem('Status da Ficha', formatarOpcao(viewEquipamento.status_ficha_calibracao))}
                                        {renderInfoItem('Comentários', viewEquipamento.comentarios, 'full')}
                                    </div>
                                </section>

                                <section className="calibracao-view-section">
                                    <h3>Última Calibração Registrada</h3>
                                    {ultimaCalibracaoView ? (
                                        <>
                                            <div className="calibracao-view-grid">
                                                {renderInfoItem('Data da Calibração', formatarData(ultimaCalibracaoView.data_calibracao))}
                                                {renderInfoItem('Validade', formatarData(ultimaCalibracaoView.data_validade))}
                                                {renderInfoItem('Laboratório', ultimaCalibracaoView.laboratorio)}
                                                {renderInfoItem('Nº Certificado', ultimaCalibracaoView.numero_certificado)}
                                                {renderInfoItem('Resultado', formatarOpcao(ultimaCalibracaoView.resultado))}
                                                {renderInfoItem('Responsável', ultimaCalibracaoView.responsavel)}
                                                {renderInfoItem('Observações', ultimaCalibracaoView.observacoes, 'full')}
                                            </div>
                                            <div className="calibracao-certificate-line">
                                                {ultimaCalibracaoView.arquivo_certificado ? (
                                                    <button
                                                        type="button"
                                                        className="btn btn-outline btn-sm"
                                                        onClick={() => handleOpenCertificado(ultimaCalibracaoView)}
                                                        disabled={openingCertificadoId === ultimaCalibracaoView.id}
                                                    >
                                                        <i className="fas fa-file-pdf"></i>
                                                        {openingCertificadoId === ultimaCalibracaoView.id ? 'Abrindo...' : 'Abrir PDF em nova aba'}
                                                    </button>
                                                ) : (
                                                    <span className="calibracao-pdf-empty">Nenhum PDF anexado</span>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="calibracao-empty-inline">Nenhuma calibração registrada para este equipamento.</div>
                                    )}
                                </section>

                                <section className="calibracao-view-section">
                                    <div className="calibracao-history-header">
                                        <h3>Histórico de Calibrações</h3>
                                        {viewLoading && <span>Carregando...</span>}
                                    </div>
                                    {viewLoading ? (
                                        <div className="calibracao-loading-inline">
                                            <div className="loading-spinner"></div>
                                            <span>Buscando histórico...</span>
                                        </div>
                                    ) : viewCalibracoes.length === 0 ? (
                                        <div className="calibracao-empty-inline">Nenhum histórico encontrado.</div>
                                    ) : (
                                        <div className="calibracao-history-list">
                                            {viewCalibracoes.map((cal, index) => (
                                                <article className="calibracao-history-item" key={cal.id || `${cal.data_calibracao}-${index}`}>
                                                    {/* Cabecalho: a data manda, o status vem ao lado e
                                                        a validade fica em segundo plano, a direita. */}
                                                    <header className="calibracao-history-topo">
                                                        <strong className="calibracao-history-data">
                                                            {formatarData(cal.data_calibracao)}
                                                        </strong>
                                                        <span className={`badge badge-${getResultadoColor(cal.resultado)}`}>
                                                            {formatarOpcao(cal.resultado)}
                                                        </span>
                                                        <span className="calibracao-history-validade">
                                                            Validade: {formatarData(cal.data_validade)}
                                                        </span>
                                                    </header>

                                                    {/* Mesmo `renderInfoItem` das outras secoes do modal:
                                                        a tipografia de rotulo e valor e o tratamento de
                                                        campo vazio vem junto, em vez de um par
                                                        <strong>/texto com regras proprias. */}
                                                    <div className="calibracao-history-dados">
                                                        {renderInfoItem('Certificado', cal.numero_certificado)}
                                                        {renderInfoItem('Responsável', cal.responsavel)}
                                                        {renderInfoItem('Laboratório', cal.laboratorio)}
                                                    </div>

                                                    {/* Arquivo em linha propria, separada por um filete: o
                                                        nome e longo e, dentro da grade, desalinhava as
                                                        colunas. Truncado com reticencias, nome inteiro no
                                                        title. */}
                                                    <footer className="calibracao-history-arquivo">
                                                        {cal.arquivo_certificado ? (
                                                            <>
                                                                <span className="calibracao-history-arquivo-nome"
                                                                    title={getArquivoNome(cal.arquivo_certificado)}>
                                                                    <i className="fas fa-paperclip" aria-hidden="true"></i>
                                                                    {' '}
                                                                    {getArquivoNome(cal.arquivo_certificado)}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-outline btn-sm"
                                                                    onClick={() => handleOpenCertificado(cal)}
                                                                    disabled={openingCertificadoId === cal.id}
                                                                >
                                                                    <i className="fas fa-file-pdf"></i>
                                                                    {openingCertificadoId === cal.id ? 'Abrindo...' : 'PDF'}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className="calibracao-pdf-empty">Sem PDF anexado</span>
                                                        )}
                                                    </footer>
                                                </article>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={handleCloseViewModal}>
                                    Fechar
                                </button>
                                <button type="button" className="btn btn-calibrate" onClick={() => {
                                    const equipamento = viewEquipamento;
                                    handleCloseViewModal();
                                    handleOpenCalibracaoModal(equipamento);
                                }}>
                                    <i className="fas fa-certificate"></i> Registrar Calibração
                                </button>
                                <button type="button" className="btn btn-primary" onClick={() => {
                                    const equipamento = viewEquipamento;
                                    handleCloseViewModal();
                                    handleEditEquipamento(equipamento);
                                }}>
                                    <i className="fas fa-edit"></i> Editar Equipamento
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Modal de Tipos */}
                {showTipoModal && (
                    <div className="modal-overlay" onClick={() => setShowTipoModal(false)}>
                        <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2><i className="fas fa-tags"></i> Tipos de Equipamento</h2>
                                <button className="modal-close" onClick={() => setShowTipoModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body">
                                <form onSubmit={handleAddTipo} className="add-tipo-form">
                                    <input
                                        type="text"
                                        className="form-control field-upper"
                                        placeholder="Novo tipo (ex: Paquímetro)"
                                        value={novoTipo}
                                        onChange={(e) => setNovoTipo(e.target.value)}
                                    />
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-plus"></i>
                                    </button>
                                </form>

                                <div className="tipos-list">
                                    {tipos.length === 0 ? (
                                        <p className="text-center text-muted">Nenhum tipo cadastrado</p>
                                    ) : (
                                        tipos.map(tipo => (
                                            <div key={tipo.id} className="tipo-item">
                                                <span>{tipo.nome}</span>
                                                <button
                                                    className="btn-icon btn-delete"
                                                    onClick={() => handleDeleteTipo(tipo.id)}
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de Alertas */}
                {showAlertasModal && (
                    <div className="modal-overlay" onClick={() => setShowAlertasModal(false)}>
                        <div className="modal-content modal-alertas" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header modal-header-alertas">
                                <h2><i className="fas fa-exclamation-triangle"></i> Alertas de Calibração</h2>
                                <button className="modal-close" onClick={() => setShowAlertasModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body">
                                {alertas.length === 0 ? (
                                    <div className="empty-state">
                                        <i className="fas fa-check-circle" style={{ color: 'var(--success)' }}></i>
                                        <p>Nenhum alerta no momento</p>
                                    </div>
                                ) : (
                                    <div className="alertas-list">
                                        {alertas.map((alerta, index) => (
                                            <div
                                                key={index}
                                                className={`alerta-item ${alerta.status_alerta}`}
                                            >
                                                <div className="alerta-icon">
                                                    <i className={`fas ${alerta.status_alerta === 'vencida' ? 'fa-times-circle' : 'fa-exclamation-triangle'}`}></i>
                                                </div>
                                                <div className="alerta-info">
                                                    <strong>{alerta.equipamento.codigo}</strong>
                                                    <span>{alerta.equipamento.nome}</span>
                                                </div>
                                                <div className="alerta-status">
                                                    {alerta.status_alerta === 'vencida' ? (
                                                        <span className="badge badge-red">Vencida há {Math.abs(alerta.dias_restantes)} dias</span>
                                                    ) : (
                                                        <span className="badge badge-yellow">Vence em {alerta.dias_restantes} dias</span>
                                                    )}
                                                </div>
                                                <button
                                                    className="btn btn-sm btn-primary"
                                                    onClick={() => {
                                                        setShowAlertasModal(false);
                                                        handleOpenCalibracaoModal(alerta.equipamento);
                                                    }}
                                                >
                                                    <i className="fas fa-certificate"></i> Calibrar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {typeof document !== 'undefined' && createPortal(
                    <div className={`mobile-action-sheet ${sheetEquipamento ? 'open' : ''}`}>
                        <div className="mobile-action-sheet-backdrop" onClick={() => setSheetData(null)} />
                        <div className="mobile-action-sheet-panel">
                            <div className="mobile-action-sheet-handle" />
                            <p className="mobile-action-sheet-title">{sheetData?.label || 'Equipamento selecionado'}</p>
                            {sheetEquipamento && (
                                <div className="mobile-action-sheet-buttons">
                                    <button type="button" className="btn btn-view" onClick={() => { setSheetData(null); handleViewEquipamento(sheetEquipamento); }}>
                                        <i className="fas fa-eye"></i>
                                        <span>Visualizar</span>
                                    </button>
                                    <button type="button" className="btn btn-calibrate" onClick={() => { setSheetData(null); handleOpenCalibracaoModal(sheetEquipamento); }}>
                                        <i className="fas fa-certificate"></i>
                                        <span>Calibrar</span>
                                    </button>
                                    <button type="button" className="btn btn-edit" onClick={() => { setSheetData(null); handleEditEquipamento(sheetEquipamento); }}>
                                        <i className="fas fa-edit"></i>
                                        <span>Editar</span>
                                    </button>
                                    <button type="button" className="btn btn-delete" onClick={() => { setSheetData(null); handleDeleteEquipamento(sheetEquipamento.id); }}>
                                        <i className="fas fa-trash"></i>
                                        <span>Desativar</span>
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



