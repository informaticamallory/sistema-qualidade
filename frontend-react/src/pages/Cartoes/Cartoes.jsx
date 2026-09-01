import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import AppLayout from '../../components/Layout/AppLayout';
import { cartoesAPI, produtosAPI } from '../../services/api';
import { upperFields } from '../../utils/text';
import {
    formatDateBR, normalizeISODate, currentMonthISO, monthRangeISO,
    previousMonthISO, formatMonthLabel
} from '../../utils/date';
import { formatarTurno, normalizarTurno } from '../../utils/turnos';
import { useAuth } from '../../context/auth-context';
/* Componentes do Mallory UI Kit (Etapa 3) — consomem os tokens, então
   herdam tema e densidade sem prop de estilo. */
import { KpiCard, Button } from '../../components/ui';
/* Reaproveita do layout de Inspeção de Injeção: seletor de período, botões de
   filtro e barra de ações — importado em vez de reescrito. */
import '../Registro/InspecaoInjecao/InspecaoInjecao.css';
import './Cartoes.css';

/* Definição dos KPIs em dados, não em JSX repetido: os quatro cards só
   diferem em rótulo, chave, tom e ícone. `status` nulo é o card "Total",
   que limpa o filtro em vez de aplicar um. */
const KPIS = [
    { chave: 'total', label: 'Total de cartões', tone: 'primary', icone: 'fa-credit-card', status: null },
    { chave: 'aprovados', label: 'Aprovados', tone: 'success', icone: 'fa-check-circle', status: 'aprovado' },
    { chave: 'reprovados', label: 'Reprovados', tone: 'danger', icone: 'fa-times-circle', status: 'reprovado' },
    { chave: 'pendentes', label: 'Pendentes', tone: 'warning', icone: 'fa-clock', status: 'pendente' }
];

export default function Cartoes() {
    const { user } = useAuth();
    const [cartoes, setCartoes] = useState([]);
    /* Espelho filtrado só por período/turno/busca: alimenta os cards, para que
       os números continuem visíveis com um status selecionado. */
    const [resumoCartoes, setResumoCartoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Filtros no mesmo modelo da Inspeção de Injeção
    const [statusFilter, setStatusFilter] = useState('');
    const [shiftFilter, setShiftFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState(currentMonthISO());
    const [dateFilter, setDateFilter] = useState('');
    const [dateEndFilter, setDateEndFilter] = useState('');
    const [rangeStartDraft, setRangeStartDraft] = useState('');
    const [rangeEndDraft, setRangeEndDraft] = useState('');
    const [showPeriodMenu, setShowPeriodMenu] = useState(false);
    const periodMenuRef = useRef(null);
    const loadRequestRef = useRef(0);
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
    }, [search, statusFilter, shiftFilter, monthFilter, dateFilter, dateEndFilter]);

    // Fecha o seletor de período ao clicar fora
    useEffect(() => {
        if (!showPeriodMenu) return;
        const fechar = (evento) => {
            if (periodMenuRef.current && !periodMenuRef.current.contains(evento.target)) setShowPeriodMenu(false);
        };
        document.addEventListener('mousedown', fechar);
        return () => document.removeEventListener('mousedown', fechar);
    }, [showPeriodMenu]);

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
    const normalizarStatus = (status) => String(status || 'pendente')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    /* O cartão não tem data de inspeção própria; a referência de período é o
       created_at, que vem como datetime ISO — daí o corte nos 10 primeiros
       caracteres para comparar por dia. */
    const dataDoCartao = (cartao) => normalizeISODate(String(cartao?.created_at || '').slice(0, 10), '');

    /* A API aceita apenas page/limit/search/status e devolve no máximo 100 por
       página, então período e turno são filtrados no cliente. Percorre todas as
       páginas para os cards e o Excel considerarem o conjunto inteiro. */
    const loadCartoes = async () => {
        const requisicao = ++loadRequestRef.current;
        try {
            setLoading(true);

            const intervalo = dateFilter || dateEndFilter
                ? { start: dateFilter || dateEndFilter, end: dateEndFilter || dateFilter }
                : monthRangeISO(monthFilter);

            let pagina = 1;
            let todos = [];
            while (true) {
                const resposta = await cartoesAPI.getAll({ page: pagina, limit: 100 });
                if (!resposta.data?.success) break;
                const lote = Array.isArray(resposta.data.data) ? resposta.data.data : [];
                todos = todos.concat(lote);
                if (lote.length < 100) break;
                pagina += 1;
                if (pagina > 100) break; // trava de segurança
            }

            if (requisicao !== loadRequestRef.current) return; // resposta obsoleta

            const noPeriodo = todos.filter((cartao) => {
                const data = dataDoCartao(cartao);
                return data && data >= intervalo.start && data <= intervalo.end;
            });

            const termo = String(search || '').trim().toLowerCase();
            const turno = normalizarTurno(shiftFilter);
            const status = normalizarStatus(statusFilter);

            const passaBusca = (cartao) => {
                if (!termo) return true;
                return [cartao.codigo_produto, cartao.nome_produto, cartao.origem,
                    cartao.setor, cartao.responsavel, cartao.descricao, cartao.documento_reprovacao]
                    .map((valor) => String(valor || '').toLowerCase())
                    .join(' ')
                    .includes(termo);
            };
            const passaTurno = (cartao) => !shiftFilter || normalizarTurno(cartao.turno) === turno;

            setResumoCartoes(noPeriodo.filter((c) => passaBusca(c) && passaTurno(c)));
            setCartoes(noPeriodo.filter((cartao) => {
                if (!passaBusca(cartao) || !passaTurno(cartao)) return false;
                if (statusFilter && normalizarStatus(cartao.status) !== status) return false;
                return true;
            }));
        } catch (error) {
            console.error('Erro ao carregar cartões:', error);
        } finally {
            if (requisicao === loadRequestRef.current) setLoading(false);
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
                    .header h2 { font-size: 1.3rem; font-weight: normal; margin-top: 10px; overflow-wrap: anywhere; }
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
                        <h2>${cartaoParaImprimir.codigo_produto || '-'} - ${produto}</h2>
                        
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
            const [year, month, day] = dataString.split('-');
            if (!year || !month || !day) return 'N/A';
            return `${day}/${month}/${year}`;
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
        return classes[normalizarStatus(status)] || 'badge-warning';
    };

    const getStatusIconClass = (status) => ({
        aprovado: 'fa-check-circle',
        pendente: 'fa-clock',
        reprovado: 'fa-times-circle'
    }[normalizarStatus(status)] || 'fa-clock');

    const formatarStatus = (status) => String(status || 'pendente').toUpperCase();

    /* KPIs pelos status que o módulo realmente registra. Respeitam período,
       turno e busca; ignoram o filtro de status para os números não sumirem
       quando um card está selecionado. */
    const resumoIndicadores = resumoCartoes.reduce((resumo, cartao) => {
        const status = normalizarStatus(cartao.status);
        resumo.total += 1;
        if (status === 'aprovado') resumo.aprovados += 1;
        else if (status === 'reprovado') resumo.reprovados += 1;
        else resumo.pendentes += 1;
        return resumo;
    }, { total: 0, aprovados: 0, reprovados: 0, pendentes: 0 });

    const ativarFiltroStatus = (status) => setStatusFilter((atual) => (atual === status ? '' : status));
    /* O handler de teclado dos cards saiu: o KpiCard do UI Kit já trata
       Enter e Espaço internamente, com role e tabIndex próprios. */

    const periodoLabel = dateFilter && dateEndFilter
        ? `${formatDateBR(dateFilter)} até ${formatDateBR(dateEndFilter)}`
        : formatMonthLabel(monthFilter);

    const selecionarMes = (mes) => {
        setDateFilter(''); setDateEndFilter('');
        setRangeStartDraft(''); setRangeEndDraft('');
        setMonthFilter(mes);
        setShowPeriodMenu(false);
    };

    const aplicarIntervalo = () => {
        if (!rangeStartDraft && !rangeEndDraft) return;
        setDateFilter(rangeStartDraft || rangeEndDraft);
        setDateEndFilter(rangeEndDraft || rangeStartDraft);
        setShowPeriodMenu(false);
    };

    /* Exporta `cartoes`, que já é o conjunto inteiro filtrado — a paginação da
       API não limita a exportação. */
    const exportarExcel = async () => {
        if (!cartoes.length) return;

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Mallory — Qualidade Industrial';
        const worksheet = workbook.addWorksheet('Cartões de Qualidade', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        worksheet.columns = [
            { header: 'Data', key: 'data', width: 13 },
            { header: 'Código', key: 'codigo', width: 16 },
            { header: 'Produto', key: 'produto', width: 34 },
            { header: 'Origem', key: 'origem', width: 16 },
            { header: 'Setor', key: 'setor', width: 16 },
            { header: 'Turno', key: 'turno', width: 10 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Qtd. Conforme', key: 'conforme', width: 15 },
            { header: 'Qtd. Não Conforme', key: 'naoConforme', width: 18 },
            { header: 'Doc. Reprovação', key: 'documento', width: 20 },
            { header: 'Descrição', key: 'descricao', width: 40 },
            { header: 'Observações', key: 'observacoes', width: 40 },
            { header: 'Responsável', key: 'responsavel', width: 22 }
        ];

        const limparTexto = (valor) => String(valor || '').replace(/\r?\n+/g, ' ').trim();

        cartoes.forEach((cartao) => {
            worksheet.addRow({
                data: formatDateBR(dataDoCartao(cartao), ''),
                codigo: cartao.codigo_produto || '',
                produto: cartao.nome_produto || '',
                origem: cartao.origem || '',
                setor: cartao.setor || '',
                turno: formatarTurno(cartao.turno, ''),
                status: formatarStatus(cartao.status),
                conforme: Number(cartao.qtd_conforme) || 0,
                naoConforme: Number(cartao.qtd_nao_conforme) || 0,
                documento: cartao.documento_reprovacao || '',
                descricao: limparTexto(cartao.descricao),
                observacoes: limparTexto(cartao.observacoes),
                responsavel: cartao.responsavel || ''
            });
        });

        const cabecalho = worksheet.getRow(1);
        cabecalho.height = 28;
        cabecalho.eachCell((celula) => {
            celula.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } };
            celula.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });

        worksheet.autoFilter = { from: 'A1', to: { row: 1, column: worksheet.columns.length } };
        ['turno', 'status', 'conforme', 'naoConforme'].forEach((key) => {
            worksheet.getColumn(key).alignment = { horizontal: 'center' };
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const url = URL.createObjectURL(new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }));
        const link = document.createElement('a');
        const sufixo = dateFilter && dateEndFilter ? `${dateFilter}_a_${dateEndFilter}` : monthFilter;
        link.href = url;
        link.download = `cartoes-qualidade-${sufixo}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const sheetCartao = sheetData ? cartoes.find((cartao) => cartao.id === sheetData.id) : null;

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Cartões' }]}
            mainClassName="cartoes-page"
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-credit-card"></i> Cartões de Qualidade</h1>
                        <p>Acompanhamento de cartões — criação, consulta e impressão</p>
                    </div>
                    <div className="header-actions cartoes-filters">
                        <input
                            type="text"
                            className="form-control cartoes-search"
                            placeholder="Buscar por código, produto, setor, responsável..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />

                        <div className="period-filter-wrapper" ref={periodMenuRef}>
                            <button
                                type="button"
                                className={showPeriodMenu ? 'period-filter-button active' : 'period-filter-button'}
                                onClick={() => setShowPeriodMenu((aberto) => !aberto)}
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
                                        <input type="month" value={monthFilter} onChange={(e) => selecionarMes(e.target.value)} />
                                    </label>
                                    <div className="period-range-fields">
                                        <label>
                                            <span>Data inicial</span>
                                            <input type="date" value={rangeStartDraft} max={rangeEndDraft || undefined}
                                                onChange={(e) => setRangeStartDraft(e.target.value)} />
                                        </label>
                                        <label>
                                            <span>Data final</span>
                                            <input type="date" value={rangeEndDraft} min={rangeStartDraft || undefined}
                                                onChange={(e) => setRangeEndDraft(e.target.value)} />
                                        </label>
                                    </div>
                                    <button type="button" className="period-range-apply" onClick={aplicarIntervalo}>
                                        Aplicar intervalo
                                    </button>
                                </div>
                            )}
                        </div>

                        <label className={shiftFilter ? 'shift-filter-button active' : 'shift-filter-button'}
                            title={shiftFilter ? 'Turno: ' + shiftFilter : 'Filtrar por turno'}>
                            <i className="fas fa-clock" aria-hidden="true"></i>
                            <span className="filter-label">{shiftFilter ? 'Turno ' + shiftFilter : 'Turno'}</span>
                            <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}
                                aria-label="Filtrar por turno">
                                <option value="">Todos os turnos</option>
                                <option value="A">Turno A</option>
                                <option value="B">Turno B</option>
                                <option value="C">Turno C</option>
                            </select>
                        </label>

                        {/* Button do UI Kit: mantém btn-success/btn-sm e ganha o
                            estado disabled com contraste acessível (o .btn:disabled
                            do ui-kit usa opacity .5 e reprova em AA). */}
                        <Button
                            variant="primary"
                            size="sm"
                            className="btn-success export-excel-button"
                            onClick={exportarExcel}
                            disabled={loading || cartoes.length === 0}
                            title="Exportar os cartões filtrados para Excel"
                            icon={<i className="fas fa-file-excel" aria-hidden="true"></i>}
                        >
                            <span className="filter-label">Exportar Excel</span>
                        </Button>

                        <Button
                            variant="primary"
                            size="sm"
                            className="new-inspection-button"
                            onClick={() => { resetForm(); setShowModal(true); }}
                            icon={<i className="fas fa-plus" aria-hidden="true"></i>}
                        >
                            <span className="filter-label">Novo Cartão</span>
                        </Button>
                    </div>
                </div>

                {/* KPIs pelo componente do UI Kit: as cores vêm dos tokens
                    semânticos, no lugar dos hex literais que estavam no CSS
                    desta página. O comportamento de filtro é o mesmo. */}
                <section className="cartoes-summary" aria-label="Resumo dos cartões de qualidade">
                    {KPIS.map((kpi) => (
                        <KpiCard
                            key={kpi.status || 'total'}
                            label={kpi.label}
                            value={loading ? '—' : resumoIndicadores[kpi.chave]}
                            tone={kpi.tone}
                            icon={<i className={`fas ${kpi.icone}`} aria-hidden="true"></i>}
                            active={kpi.status ? statusFilter === kpi.status : !statusFilter}
                            onClick={() => (kpi.status ? ativarFiltroStatus(kpi.status) : setStatusFilter(''))}
                        />
                    ))}
                </section>

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
                                        <td colSpan="8" className="tabela-vazia">Nenhum cartão encontrado</td>
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
                                            <td>{formatarTurno(cartao.turno, 'N/A')}</td>
                                            <td>
                                                {/* Ícone + texto no desktop; no celular o CSS reduz ao ícone */}
                                                <span className={`badge status-badge ${getStatusClass(cartao.status)}`}
                                                    title={formatarStatus(cartao.status)}>
                                                    <i className={`fas ${getStatusIconClass(cartao.status)}`} aria-hidden="true"></i>
                                                    <span className="status-text">{formatarStatus(cartao.status)}</span>
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
                                        <div className="form-row cartao-qualidade-row">
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

                                        <div className="form-row cartao-qualidade-row">
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
                                        <i className="fas fa-print"></i> Editar Cartão
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
            </div>
        </AppLayout>
    );
}


