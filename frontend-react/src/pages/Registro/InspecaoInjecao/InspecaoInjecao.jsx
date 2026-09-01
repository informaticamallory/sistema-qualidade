import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import AppLayout from '../../../components/Layout/AppLayout';
import { injecaoAPI, produtosAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { formatarTurno, normalizarTurno } from '../../../utils/turnos';
import { upperFields } from '../../../utils/text';
// Reaproveita os estilos de modal/formulário/tabela da Inspeção de Montagem
import '../InspecaoMontagem/InspecaoMontagem.css';
import './InspecaoInjecao.css';

const conformeOpcoes = [
    { value: '', label: 'Pendente' },
    { value: 'C', label: 'C — Conforme' },
    { value: 'NC', label: 'NC — Não Conforme' },
    { value: 'NA', label: 'N/A' }
];

const todayISO = () => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().split('T')[0];
};

const currentMonthISO = () => todayISO().slice(0, 7);

const monthRangeISO = (value = currentMonthISO()) => {
    const [year, month] = String(value || currentMonthISO()).split('-').map(Number);
    const safeYear = year || Number(currentMonthISO().slice(0, 4));
    const safeMonth = month || Number(currentMonthISO().slice(5, 7));
    const lastDay = new Date(safeYear, safeMonth, 0).getDate();
    const prefix = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
    return {
        start: `${prefix}-01`,
        end: `${prefix}-${String(lastDay).padStart(2, '0')}`
    };
};

const previousMonthISO = () => {
    const [year, month] = currentMonthISO().split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
};

const previousMonthFromISO = (value) => {
    const [year, month] = String(value || currentMonthISO()).split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
};

const formatMonthLabel = (value) => {
    const [year, month] = String(value || '').split('-').map(Number);
    if (!year || !month) return 'Mês atual';

    const label = new Intl.DateTimeFormat('pt-BR', {
        month: 'long',
        year: 'numeric'
    }).format(new Date(year, month - 1, 1));

    return label.charAt(0).toUpperCase() + label.slice(1);
};

const normalizarDataISO = (value) => {
    if (!value) return todayISO();
    const texto = String(value);
    const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    return todayISO();
};

const formatarDataBR = (value) => {
    const texto = String(value || '');
    const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return 'N/A';
    return `${match[3]}/${match[2]}/${match[1]}`;
};

const ajustarAlturaDefeito = (element) => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
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

const normalizarFotosPeca = (fotosSalvas, nomesSalvos) => {
    const lerLista = (valor) => {
        if (Array.isArray(valor)) return valor;
        if (!valor) return [];
        try {
            const parsed = JSON.parse(valor);
            return Array.isArray(parsed) ? parsed : [valor];
        } catch {
            return [valor];
        }
    };

    const fotos = lerLista(fotosSalvas);
    const nomes = lerLista(nomesSalvos);

    return fotos
        .filter((src) => typeof src === 'string' && src.trim())
        .slice(0, 3)
        .map((src, index) => ({
            src,
            nome: String(nomes[index] || `Foto ${index + 1}`)
        }));
};

const estadoInicial = {
    data: todayISO(),
    semana: getWeekFromDate(),
    turno_injecao: '',
    maquina: '',
    modelo_maquina: '',
    cod: '',
    peca: '',
    molde: '',
    amostra_insp: '',
    amostra_nc: '',
    qtde_lote: '',
    status: '',
    defeito: '',
    cota1: '',
    cota2: '',
    cota3: '',
    cota4: '',
    peso: '',
    visual: '',
    cor_padrao: '',
    encaixe: '',
    contra_peca: '',
    rebarbas: '',
    funcional: '',
    observacao: '',
    fotos_peca: []
};

export default function InspecaoInjecao() {
    const { user } = useAuth();
    const [registros, setRegistros] = useState([]);
    const [resumoRegistros, setResumoRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [dateEndFilter, setDateEndFilter] = useState('');
    const [rangeStartDraft, setRangeStartDraft] = useState('');
    const [rangeEndDraft, setRangeEndDraft] = useState('');
    const [monthFilter, setMonthFilter] = useState(currentMonthISO());
    const [shiftFilter, setShiftFilter] = useState('');
    const [showPeriodMenu, setShowPeriodMenu] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [formDirty, setFormDirty] = useState(false);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(estadoInicial);
    const [activeTab, setActiveTab] = useState('dados-injecao');
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [sheetData, setSheetData] = useState(null);
    const [panoramaRegistro, setPanoramaRegistro] = useState(null);
    const [panoramaDados, setPanoramaDados] = useState({
        loading: false,
        atual: [],
        anterior: [],
        mesAtual: '',
        mesAnterior: ''
    });

    // Autocomplete de produtos (campo Cód.)
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const [sugestaoAtivaIndex, setSugestaoAtivaIndex] = useState(-1);
    const searchTimeout = useRef(null);
    const maquinaSearchTimeout = useRef(null);
    const formModalRef = useRef(null);
    const viewModalRef = useRef(null);
    const [maquinaSugestoes, setMaquinaSugestoes] = useState([]);
    const [showMaquinaSugestoes, setShowMaquinaSugestoes] = useState(false);
    const [maquinaAtivaIndex, setMaquinaAtivaIndex] = useState(-1);
    const defeitoSearchTimeout = useRef(null);
    const [defeitoSugestoes, setDefeitoSugestoes] = useState([]);
    const [showDefeitoSugestoes, setShowDefeitoSugestoes] = useState(false);
    const [defeitoAtivoIndex, setDefeitoAtivoIndex] = useState(-1);
    const defeitoTextareaRef = useRef(null);
    const fotoPecaInputRef = useRef(null);
    const periodMenuRef = useRef(null);
    const loadRequestRef = useRef(0);

    // Visualização (somente leitura)
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewData, setViewData] = useState(null);

    // Lightbox de fotos com zoom
    const [lightbox, setLightbox] = useState({ open: false, fotos: [], index: 0 });
    const [lbZoom, setLbZoom] = useState(1);
    const [lbPan, setLbPan] = useState({ x: 0, y: 0 });
    const lbDragging = useRef(false);
    const lbDragStart = useRef({ x: 0, y: 0 });
    const lbPanStart = useRef({ x: 0, y: 0 });
    const lbLastTap = useRef(0);
    const lbPinchDist = useRef(null);
    const lbPinchZoom = useRef(1);

    const abrirLightbox = (fotos, index = 0) => {
        setLightbox({ open: true, fotos, index });
        setLbZoom(1);
        setLbPan({ x: 0, y: 0 });
    };

    const fecharLightbox = () => {
        setLightbox({ open: false, fotos: [], index: 0 });
        setLbZoom(1);
        setLbPan({ x: 0, y: 0 });
    };

    const lbNavegar = (direcao) => {
        setLightbox((prev) => ({
            ...prev,
            index: (prev.index + direcao + prev.fotos.length) % prev.fotos.length
        }));
        setLbZoom(1);
        setLbPan({ x: 0, y: 0 });
    };

    const lbToggleZoom = () => {
        setLbZoom((z) => {
            const novoZoom = z >= 2.5 ? 1 : z + 1;
            if (novoZoom === 1) setLbPan({ x: 0, y: 0 });
            return novoZoom;
        });
    };

    const handleLbWheel = (e) => {
        e.preventDefault();
        setLbZoom((z) => {
            const novoZoom = Math.min(5, Math.max(1, z - e.deltaY * 0.002));
            if (novoZoom <= 1) setLbPan({ x: 0, y: 0 });
            return novoZoom;
        });
    };

    const handleLbPointerDown = (e) => {
        if (e.pointerType === 'touch') return;
        if (lbZoom <= 1) return;
        lbDragging.current = true;
        lbDragStart.current = { x: e.clientX, y: e.clientY };
        lbPanStart.current = { ...lbPan };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handleLbPointerMove = (e) => {
        if (!lbDragging.current) return;
        setLbPan({
            x: lbPanStart.current.x + (e.clientX - lbDragStart.current.x),
            y: lbPanStart.current.y + (e.clientY - lbDragStart.current.y)
        });
    };

    const handleLbPointerUp = () => { lbDragging.current = false; };

    const handleLbTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lbPinchDist.current = Math.hypot(dx, dy);
            lbPinchZoom.current = lbZoom;
            return;
        }
        if (e.touches.length === 1) {
            const now = Date.now();
            if (now - lbLastTap.current < 300) {
                lbToggleZoom();
                lbLastTap.current = 0;
                return;
            }
            lbLastTap.current = now;
            if (lbZoom > 1) {
                lbDragging.current = true;
                lbDragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                lbPanStart.current = { ...lbPan };
            }
        }
    };

    const handleLbTouchMove = (e) => {
        if (e.touches.length === 2 && lbPinchDist.current !== null) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const novoZoom = Math.min(5, Math.max(1, lbPinchZoom.current * (dist / lbPinchDist.current)));
            setLbZoom(novoZoom);
            if (novoZoom <= 1) setLbPan({ x: 0, y: 0 });
            return;
        }
        if (lbDragging.current && e.touches.length === 1) {
            setLbPan({
                x: lbPanStart.current.x + (e.touches[0].clientX - lbDragStart.current.x),
                y: lbPanStart.current.y + (e.touches[0].clientY - lbDragStart.current.y)
            });
        }
    };

    const handleLbTouchEnd = () => {
        lbDragging.current = false;
        lbPinchDist.current = null;
    };

    useEffect(() => {
        if (!lightbox.open) return;
        const handleKey = (e) => {
            if (e.key === 'Escape') fecharLightbox();
            if (e.key === 'ArrowRight') lbNavegar(1);
            if (e.key === 'ArrowLeft') lbNavegar(-1);
            if (e.key === '+' || e.key === '=') setLbZoom((z) => Math.min(5, z + 0.5));
            if (e.key === '-') setLbZoom((z) => { const n = Math.max(1, z - 0.5); if (n <= 1) setLbPan({ x: 0, y: 0 }); return n; });
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [lightbox.open, lightbox.fotos.length]);

    useEffect(() => {
        loadRegistros();
    }, [search, statusFilter, dateFilter, dateEndFilter, monthFilter, shiftFilter]);

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
        const requestId = ++loadRequestRef.current;

        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;

            if (dateFilter) params.data_inicio = dateFilter;
            if (dateEndFilter) params.data_fim = dateEndFilter;
            if (monthFilter) params.mes = monthFilter;
            if (shiftFilter) params.turno = shiftFilter;

            const response = await injecaoAPI.getAll(params);
            if (requestId !== loadRequestRef.current) return;

            if (response.data.success) {
                const dadosRecebidos = Array.isArray(response.data.data) ? response.data.data : [];
                const termoBusca = String(params.search || '').trim().toLowerCase();
                const statusBusca = String(statusFilter || '').trim().toLowerCase();
                const turnoBusca = String(params.turno || '').trim().toUpperCase();

                const dadosFiltrados = dadosRecebidos.filter((registro) => {
                    const dataRegistro = String(registro.data || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
                    if (params.data_inicio && dataRegistro < params.data_inicio) return false;
                    if (params.data_fim && dataRegistro > params.data_fim) return false;
                    if (!params.data_inicio && !params.data_fim && params.mes && !dataRegistro.startsWith(`${params.mes}-`)) return false;
                    if (statusBusca && String(registro.status || '').trim().toLowerCase() !== statusBusca) return false;
                    if (turnoBusca && normalizarTurno(registro.turno_injecao) !== turnoBusca) return false;
                    if (termoBusca) {
                        const conteudo = [registro.cod, registro.peca, registro.maquina]
                            .map((valor) => String(valor || '').toLowerCase())
                            .join(' ');
                        if (!conteudo.includes(termoBusca)) return false;
                    }
                    return true;
                });

                setResumoRegistros(dadosRecebidos);
                setRegistros(dadosFiltrados);
            } else {
                setResumoRegistros([]);
                setRegistros([]);
            }
        } catch (error) {
            if (requestId !== loadRequestRef.current) return;
            console.error('Erro ao carregar inspeções de injeção:', error);
            setResumoRegistros([]);
            setRegistros([]);
        } finally {
            if (requestId === loadRequestRef.current) setLoading(false);
        }
    };

    const exportarExcel = async () => {
        if (loading) return;

        let dadosExportacao = [];
        try {
            const params = {};
            if (search) params.search = search;
            if (shiftFilter) params.turno = shiftFilter;

            if (dateFilter || dateEndFilter) {
                if (dateFilter) params.data_inicio = dateFilter;
                if (dateEndFilter) params.data_fim = dateEndFilter;
            } else {
                const intervaloMes = monthRangeISO(monthFilter);
                params.data_inicio = intervaloMes.start;
                params.data_fim = intervaloMes.end;
            }

            const response = await injecaoAPI.getAll(params);
            const recebidos = response.data.success && Array.isArray(response.data.data)
                ? response.data.data
                : [];
            const termoBusca = String(search || '').trim().toLowerCase();
            const statusBusca = String(statusFilter || '').trim().toLowerCase();
            const turnoBusca = String(shiftFilter || '').trim().toUpperCase();

            dadosExportacao = recebidos.filter((registro) => {
                const dataRegistro = String(registro.data || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
                if (params.data_inicio && dataRegistro < params.data_inicio) return false;
                if (params.data_fim && dataRegistro > params.data_fim) return false;
                if (statusBusca && String(registro.status || '').trim().toLowerCase() !== statusBusca) return false;
                if (turnoBusca && normalizarTurno(registro.turno_injecao) !== turnoBusca) return false;
                if (termoBusca) {
                    const conteudo = [registro.cod, registro.peca, registro.maquina]
                        .map((valor) => String(valor || '').toLowerCase())
                        .join(' ');
                    if (!conteudo.includes(termoBusca)) return false;
                }
                return true;
            });
        } catch (error) {
            console.error('Erro ao buscar inspeções para exportação:', error);
            alert('Não foi possível buscar os registros para exportação.');
            return;
        }

        if (dadosExportacao.length === 0) {
            alert('Nenhum registro encontrado no período selecionado.');
            return;
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Sistema Mallory';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('Inspeções de Injeção', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        worksheet.columns = [
            { header: 'Data', key: 'data', width: 13 },
            { header: 'Semana', key: 'semana', width: 10 },
            { header: 'Turno', key: 'turno', width: 10 },
            { header: 'Máquina', key: 'maquina', width: 14 },
            { header: 'Modelo da Máquina', key: 'modelo_maquina', width: 22 },
            { header: 'Código SAP', key: 'cod', width: 16 },
            { header: 'Peça', key: 'peca', width: 38 },
            { header: 'Molde', key: 'molde', width: 10 },
            { header: 'Amostra Inspecionada', key: 'amostra_insp', width: 21 },
            { header: 'Amostra NC', key: 'amostra_nc', width: 14 },
            { header: 'Quantidade do Lote', key: 'qtde_lote', width: 20 },
            { header: 'Peso (Kg)', key: 'peso', width: 14 },
            { header: 'Índice (%)', key: 'indice', width: 13 },
            { header: 'Visual', key: 'visual', width: 16 },
            { header: 'Cor Padrão', key: 'cor_padrao', width: 16 },
            { header: 'Encaixe', key: 'encaixe', width: 16 },
            { header: 'Contra Peça', key: 'contra_peca', width: 16 },
            { header: 'Rebarbas', key: 'rebarbas', width: 16 },
            { header: 'Funcional', key: 'funcional', width: 16 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Defeito', key: 'defeito', width: 24 },
            { header: 'Observação', key: 'observacao', width: 42 },
            { header: 'Foto registrada', key: 'foto_registrada', width: 18 },
            { header: 'Inspetor', key: 'inspetor', width: 24 }
        ];

        dadosExportacao.forEach((registro) => {
            const dataISO = String(registro.data || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
            const dataExcel = dataISO
                ? new Date(Number(dataISO[1]), Number(dataISO[2]) - 1, Number(dataISO[3]))
                : null;
            const quantidadeLote = Number(registro.qtde_lote) || 0;
            const amostraInspecionada = Number(registro.amostra_insp) || 0;

            worksheet.addRow({
                data: dataExcel,
                semana: Number(registro.semana) || registro.semana || '',
                turno: normalizarTurno(registro.turno_injecao),
                maquina: registro.maquina || '',
                modelo_maquina: registro.modelo_maquina || '',
                cod: registro.cod || '',
                peca: registro.peca || '',
                molde: registro.molde || '',
                amostra_insp: amostraInspecionada,
                amostra_nc: Number(registro.amostra_nc) || 0,
                qtde_lote: quantidadeLote,
                peso: registro.peso || '',
                indice: quantidadeLote > 0 ? amostraInspecionada / quantidadeLote : 0,
                visual: formatarResultadoAvaliacao(registro.visual),
                cor_padrao: formatarResultadoAvaliacao(registro.cor_padrao),
                encaixe: formatarResultadoAvaliacao(registro.encaixe),
                contra_peca: formatarResultadoAvaliacao(registro.contra_peca),
                rebarbas: formatarResultadoAvaliacao(registro.rebarbas),
                funcional: formatarResultadoAvaliacao(registro.funcional),
                status: formatarStatus(registro.status),
                defeito: registro.defeito || '',
                observacao: String(registro.observacao || '').replace(/\r?\n+/g, ' ').trim(),
                foto_registrada: registro.foto_peca ? 'Sim' : 'Não',
                inspetor: registro.inspetor || ''
            });
        });

        const header = worksheet.getRow(1);
        header.height = 28;
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF7A00' } };
        header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        worksheet.autoFilter = { from: 'A1', to: `X${worksheet.rowCount}` };
        worksheet.getColumn('data').numFmt = 'dd/mm/yyyy';
        worksheet.getColumn('indice').numFmt = '0.00%';
        worksheet.getColumn('cod').numFmt = '@';
        worksheet.getColumn('maquina').numFmt = '@';

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            row.height = 24;
            row.alignment = { vertical: 'middle', wrapText: false };
            row.eachCell((cell) => {
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'FFD9E1EA' } }
                };
            });
        });

        ['semana', 'turno', 'amostra_insp', 'amostra_nc', 'qtde_lote', 'indice', 'status', 'foto_registrada']
            .forEach((key) => {
                worksheet.getColumn(key).alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
            });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const sufixoFiltro = dateFilter && dateEndFilter
            ? `${dateFilter}_a_${dateEndFilter}`
            : monthFilter || currentMonthISO();

        link.href = url;
        link.download = `inspecoes_injecao_${sufixoFiltro}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
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
        setFormDirty(false);
        setEditingId(null);
        setActiveTab('dados-injecao');
        setFormViewMode('tabs');
    };

    const handleFotoPecaChange = (event) => {
        if ((formData.fotos_peca || []).length >= 3) {
            alert('Você pode registrar no máximo três fotos.');
            event.target.value = '';
            return;
        }
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('Selecione uma imagem válida.');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            alert('A imagem deve ter no máximo 15 MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const imagem = new Image();
            imagem.onload = () => {
                const limite = 1600;
                const escala = Math.min(1, limite / Math.max(imagem.width, imagem.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(imagem.width * escala));
                canvas.height = Math.max(1, Math.round(imagem.height * escala));
                const contexto = canvas.getContext('2d');
                contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
                setFormData((prev) => ({
                    ...prev,
                    fotos_peca: [
                        ...(prev.fotos_peca || []),
                        { src: canvas.toDataURL('image/jpeg', 0.8), nome: file.name.slice(0, 70) }
                    ].slice(0, 3)
                }));
                setFormDirty(true);
                if (fotoPecaInputRef.current) fotoPecaInputRef.current.value = '';
            };
            imagem.onerror = () => alert('Não foi possível processar a imagem.');
            imagem.src = String(reader.result || '');
        };
        reader.onerror = () => alert('Não foi possível ler a imagem.');
        reader.readAsDataURL(file);
    };

    const removerFotoPeca = (index) => {
        setFormData((prev) => ({
            ...prev,
            fotos_peca: (prev.fotos_peca || []).filter((_, fotoIndex) => fotoIndex !== index)
        }));
        setFormDirty(true);
        if (fotoPecaInputRef.current) fotoPecaInputRef.current.value = '';
    };

    const fecharFormularioSemSalvar = () => {
        setShowUnsavedConfirm(false);
        setShowModal(false);
        resetForm();
    };

    const solicitarFechamentoFormulario = () => {
        if (formDirty) {
            setShowUnsavedConfirm(true);
            return;
        }

        fecharFormularioSemSalvar();
    };


    const handleSubmit = async (e) => {
        e.preventDefault();

        const camposDadosPendentes = [
            !String(formData.turno_injecao || '').trim() && 'Turno de Injeção',
            !String(formData.maquina || '').trim() && 'Máquina',
            !String(formData.molde || '').trim() && 'Molde',
            (formData.amostra_insp === '' || Number(formData.amostra_insp) <= 0) && 'Amostra Inspecionada',
            (formData.amostra_nc === '' || Number(formData.amostra_nc) < 0) && 'Amostra NC',
            (formData.qtde_lote === '' || Number(formData.qtde_lote) <= 0) && 'Quantidade do Lote'
        ].filter(Boolean);

        if (camposDadosPendentes.length > 0) {
            setFormViewMode('tabs');
            setActiveTab('dados-injecao');
            alert(`Preencha os campos obrigatórios: ${camposDadosPendentes.join(', ')}.`);
            return;
        }

        const criteriosPendentes = camposAvaliacao.filter(({ id }) => !['C', 'NC', 'NA'].includes(formData[id]));
        if (criteriosPendentes.length > 0) {
            setFormViewMode('tabs');
            setActiveTab('avaliacao');
            alert(`Preencha todos os campos obrigatórios da avaliação: ${criteriosPendentes.map(({ label }) => label).join(', ')}.`);
            return;
        }

        const statusSelecionado = String(formData.status || '').toLowerCase();
        if (!['aprovado', 'reprovado'].includes(statusSelecionado)) {
            setFormViewMode('tabs');
            setActiveTab('avaliacao');
            alert('Selecione o status Aprovado ou Reprovado antes de salvar.');
            return;
        }

        try {
            const isReprovado = String(formData.status || '').toLowerCase() === 'reprovado';
            const fotosPeca = (formData.fotos_peca || []).slice(0, 3);
            const { fotos_peca: _fotosPeca, ...camposFormulario } = formData;
            const payload = {
                ...camposFormulario,
                data: normalizarDataISO(formData.data),
                defeito: isReprovado ? formData.defeito : '',
                foto_peca: isReprovado && fotosPeca.length ? JSON.stringify(fotosPeca.map(({ src }) => src)) : '',
                foto_peca_nome: isReprovado && fotosPeca.length ? JSON.stringify(fotosPeca.map(({ nome }) => nome)) : '',
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
        const data = normalizarDataISO(registro.data || todayISO());

        setFormData({
            data,
            semana: registro.semana || getWeekFromDate(data),
            turno_injecao: normalizarTurno(registro.turno_injecao),
            maquina: registro.maquina || '',
            modelo_maquina: registro.modelo_maquina || '',
            cod: registro.cod || '',
            peca: registro.peca || '',
            molde: registro.molde || '',
            amostra_insp: registro.amostra_insp ?? '',
            amostra_nc: registro.amostra_nc ?? '',
            qtde_lote: registro.qtde_lote ?? '',
            status: ['aprovado', 'reprovado'].includes(normalizarStatus(registro.status)) ? normalizarStatus(registro.status) : '',
            defeito: registro.defeito || '',
            cota1: registro.cota1 || '',
            cota2: registro.cota2 || '',
            cota3: registro.cota3 || '',
            cota4: registro.cota4 || '',
            peso: registro.peso || '',
            visual: ['C', 'NC', 'NA'].includes(registro.visual) ? registro.visual : '',
            cor_padrao: ['C', 'NC', 'NA'].includes(registro.cor_padrao) ? registro.cor_padrao : '',
            encaixe: ['C', 'NC', 'NA'].includes(registro.encaixe) ? registro.encaixe : '',
            contra_peca: ['C', 'NC', 'NA'].includes(registro.contra_peca) ? registro.contra_peca : '',
            rebarbas: ['C', 'NC', 'NA'].includes(registro.rebarbas) ? registro.rebarbas : '',
            funcional: ['C', 'NC', 'NA'].includes(registro.funcional) ? registro.funcional : '',
            observacao: registro.observacao || '',
            fotos_peca: normalizarFotosPeca(registro.foto_peca, registro.foto_peca_nome)
        });
        setEditingId(registro.id);
        setFormDirty(false);
        setActiveTab('dados-injecao');
        setFormViewMode('tabs');
        setShowModal(true);
    };

    useEffect(() => {
        if (!showModal || !formDirty) return undefined;

        const protegerSaidaDaPagina = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', protegerSaidaDaPagina);
        return () => window.removeEventListener('beforeunload', protegerSaidaDaPagina);
    }, [showModal, formDirty]);

    useEffect(() => {
        const modal = showModal ? formModalRef.current : (showViewModal ? viewModalRef.current : null);
        if (!modal) return;

        modal.scrollTop = 0;
        window.requestAnimationFrame(() => {
            modal.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        });
    }, [showModal, showViewModal]);

    const handleView = (reg) => {
        setViewData(reg);
        setShowViewModal(true);
    };

    const carregarPanorama = async (registro) => {
        setPanoramaRegistro(registro);
        const mesBase = monthFilter || String(dateFilter || registro.data || currentMonthISO()).slice(0, 7);
        const mesAnterior = previousMonthFromISO(mesBase);
        const termo = String(registro.cod || registro.peca || '').trim();
        setPanoramaDados({ loading: true, atual: [], anterior: [], mesAtual: mesBase, mesAnterior });

        try {
            const [respostaAtual, respostaAnterior] = await Promise.all([
                injecaoAPI.getAll({ search: termo, mes: mesBase }),
                injecaoAPI.getAll({ search: termo, mes: mesAnterior })
            ]);
            const filtrarPecaExata = (resposta) => {
                const lista = resposta?.data?.success && Array.isArray(resposta.data.data) ? resposta.data.data : [];
                return lista.filter((item) => registro.cod
                    ? String(item.cod || '').trim() === String(registro.cod).trim()
                    : String(item.peca || '').trim() === String(registro.peca || '').trim());
            };
            setPanoramaDados({ loading: false, atual: filtrarPecaExata(respostaAtual),
                anterior: filtrarPecaExata(respostaAnterior), mesAtual: mesBase, mesAnterior });
        } catch (error) {
            console.error('Erro ao carregar panorama da peça:', error);
            setPanoramaDados({ loading: false, atual: [], anterior: [], mesAtual: mesBase, mesAnterior });
        }
    };

    const handleRowClick = (registro) => {
        if (typeof window !== 'undefined' && window.innerWidth >= 1600) {
            carregarPanorama(registro);
            return;
        }
        openMobileActions(registro);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Tem certeza que deseja excluir esta inspeção?')) {
            try {
                await injecaoAPI.delete(id);
                loadRegistros();
            } catch (error) {
                console.error('Erro ao excluir inspeção de injeção:', error);
                const mensagem = error.response?.data?.message || 'Erro ao excluir inspeção de injeção';
                alert(mensagem);
            }
        }
    };

    const formatarData = (dataString) => formatarDataBR(dataString);

    const normalizarStatus = (status) => String(status || 'pendente')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    const getStatusClass = (status) => {
        const classes = {
            aprovado: 'badge-success',
            pendente: 'badge-warning',
            reprovado: 'badge-danger',
            concessao: 'badge-info'
        };
        return classes[normalizarStatus(status)] || 'badge-warning';
    };

    const getStatusIconClass = (status) => {
        const icons = {
            aprovado: 'fa-check',
            pendente: 'fa-clock',
            reprovado: 'fa-times',
            concessao: 'fa-handshake'
        };
        return icons[normalizarStatus(status)] || 'fa-clock';
    };

    const formatarStatus = (status) => String(status || 'pendente').toUpperCase();

    const formatarResultadoAvaliacao = (valor) => {
        const resultados = {
            C: 'Conforme',
            NC: 'Não Conforme',
            NA: 'Não se aplica'
        };

        return resultados[String(valor || '').trim().toUpperCase()] || 'Pendente';
    };

    const setCampo = (campo, valor) => setFormData((prev) => {
        if (campo === 'status' && String(valor || '').toLowerCase() !== 'reprovado') {
            return { ...prev, status: valor, defeito: '', fotos_peca: [] };
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

    const buscarMaquinas = (termo) => {
        if (maquinaSearchTimeout.current) clearTimeout(maquinaSearchTimeout.current);

        if (!termo || termo.trim().length < 1) {
            setMaquinaSugestoes([]);
            setShowMaquinaSugestoes(false);
            setMaquinaAtivaIndex(-1);
            return;
        }

        maquinaSearchTimeout.current = setTimeout(async () => {
            try {
                const response = await injecaoAPI.searchMachines(termo.trim());
                const sugestoes = response.data?.data || [];
                setMaquinaSugestoes(sugestoes);
                setShowMaquinaSugestoes(sugestoes.length > 0);
                setMaquinaAtivaIndex(sugestoes.length > 0 ? 0 : -1);
            } catch {
                setMaquinaSugestoes([]);
                setShowMaquinaSugestoes(false);
                setMaquinaAtivaIndex(-1);
            }
        }, 250);
    };

    const selecionarMaquina = (maquinaSelecionada) => {
        setFormData((prev) => ({
            ...prev,
            maquina: maquinaSelecionada.maquina || '',
            modelo_maquina: maquinaSelecionada.modelo || ''
        }));
        setMaquinaSugestoes([]);
        setShowMaquinaSugestoes(false);
        setMaquinaAtivaIndex(-1);
    };

    const handleMaquinaKeyDown = (event) => {
        if (event.key === 'Escape') {
            setShowMaquinaSugestoes(false);
            setMaquinaAtivaIndex(-1);
            return;
        }

        if (!maquinaSugestoes.length) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setShowMaquinaSugestoes(true);
            setMaquinaAtivaIndex((prev) => (prev < 0 ? 0 : (prev + 1) % maquinaSugestoes.length));
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setShowMaquinaSugestoes(true);
            setMaquinaAtivaIndex((prev) => (prev <= 0 ? maquinaSugestoes.length - 1 : prev - 1));
            return;
        }

        if (event.key === 'Enter' && showMaquinaSugestoes && maquinaAtivaIndex >= 0) {
            event.preventDefault();
            selecionarMaquina(maquinaSugestoes[maquinaAtivaIndex]);
        }
    };
    const buscarDefeitosInjecao = (termo) => {
        if (defeitoSearchTimeout.current) clearTimeout(defeitoSearchTimeout.current);

        if (!termo || termo.trim().length < 1) {
            setDefeitoSugestoes([]);
            setShowDefeitoSugestoes(false);
            setDefeitoAtivoIndex(-1);
            return;
        }

        defeitoSearchTimeout.current = setTimeout(async () => {
            try {
                const response = await injecaoAPI.searchDefects(termo.trim());
                const sugestoes = response.data?.data || [];
                setDefeitoSugestoes(sugestoes);
                setShowDefeitoSugestoes(sugestoes.length > 0);
                setDefeitoAtivoIndex(sugestoes.length > 0 ? 0 : -1);
            } catch {
                setDefeitoSugestoes([]);
                setShowDefeitoSugestoes(false);
                setDefeitoAtivoIndex(-1);
            }
        }, 250);
    };

    const selecionarDefeitoInjecao = (item) => {
        setCampo('defeito', item.defeito || '');
        setTimeout(() => ajustarAlturaDefeito(defeitoTextareaRef.current), 0);
        setDefeitoSugestoes([]);
        setShowDefeitoSugestoes(false);
        setDefeitoAtivoIndex(-1);
    };

    const handleDefeitoKeyDown = (event) => {
        if (event.key === 'Escape') {
            setShowDefeitoSugestoes(false);
            setDefeitoAtivoIndex(-1);
            return;
        }

        if (!defeitoSugestoes.length) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setShowDefeitoSugestoes(true);
            setDefeitoAtivoIndex((prev) => (prev < 0 ? 0 : (prev + 1) % defeitoSugestoes.length));
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setShowDefeitoSugestoes(true);
            setDefeitoAtivoIndex((prev) => (prev <= 0 ? defeitoSugestoes.length - 1 : prev - 1));
            return;
        }

        if (event.key === 'Enter' && showDefeitoSugestoes && defeitoAtivoIndex >= 0) {
            event.preventDefault();
            selecionarDefeitoInjecao(defeitoSugestoes[defeitoAtivoIndex]);
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

    const atualizarAvaliacao = (campo, valor) => {
        setCampo(campo, valor);
    };

    const tabs = [
        { id: 'dados-injecao', icon: 'fa-industry', label: 'Dados' },
        { id: 'cotas', icon: 'fa-ruler-combined', label: 'Cotas' },
        { id: 'avaliacao', icon: 'fa-clipboard-check', label: 'Avaliação' }
    ];

    const sheetRegistro = sheetData ? registros.find((registro) => registro.id === sheetData.id) : null;

    const resumoInspecoes = resumoRegistros.reduce((resumo, registro) => {
        const status = normalizarStatus(registro.status);

        resumo.total += 1;
        if (status === 'aprovado') {
            resumo.aprovadas += 1;
        } else if (status === 'reprovado') {
            resumo.reprovadas += 1;
        } else {
            resumo.pendentes += 1;
        }

        return resumo;
    }, { total: 0, aprovadas: 0, reprovadas: 0, pendentes: 0 });

    const resumirPanorama = (lista) => lista.reduce((resumo, registro) => {
        const status = normalizarStatus(registro.status);
        resumo.total += 1;
        if (status === 'aprovado') resumo.aprovadas += 1;
        if (status === 'reprovado') resumo.reprovadas += 1;
        return resumo;
    }, { total: 0, aprovadas: 0, reprovadas: 0 });
    const panoramaAtualResumo = resumirPanorama(panoramaDados.atual);
    const panoramaAnteriorResumo = resumirPanorama(panoramaDados.anterior);
    const panoramaMaiorValor = Math.max(panoramaAtualResumo.aprovadas, panoramaAtualResumo.reprovadas,
        panoramaAnteriorResumo.aprovadas, panoramaAnteriorResumo.reprovadas, 1);
    const camposDefeito = [['visual', 'Visual'], ['cor_padrao', 'Cor padrão'], ['encaixe', 'Encaixe'],
        ['contra_peca', 'Contra peça'], ['rebarbas', 'Rebarbas'], ['funcional', 'Funcional']];
    const contagemDefeitos = panoramaDados.atual.reduce((mapa, registro) => {
        if (normalizarStatus(registro.status) !== 'reprovado') return mapa;
        const descritos = String(registro.defeito || '').split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
        const nomes = descritos.length ? descritos : camposDefeito
            .filter(([campo]) => String(registro[campo] || '').toUpperCase() === 'NC').map(([, label]) => label);
        nomes.forEach((nome) => mapa.set(nome, (mapa.get(nome) || 0) + 1));
        return mapa;
    }, new Map());
    const panoramaDefeitos = [...contagemDefeitos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const maiorDefeito = Math.max(...panoramaDefeitos.map(([, quantidade]) => quantidade), 1);
    const panoramaMaquinas = [...new Set(panoramaDados.atual.map((item) => item.maquina).filter(Boolean))];
    const panoramaMoldes = [...new Set(panoramaDados.atual.map((item) => item.molde).filter(Boolean))];
    const ativarFiltroStatus = (status) => setStatusFilter((atual) => atual === status ? '' : status);
    const acionarCardPorTeclado = (event, status) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (status) ativarFiltroStatus(status);
            else setStatusFilter('');
        }
    };

    const periodoLabel = dateFilter && dateEndFilter
        ? `${formatarData(dateFilter)} até ${formatarData(dateEndFilter)}`
        : formatMonthLabel(monthFilter);

    const selecionarMes = (mes) => {
        setRegistros([]);
        setDateFilter('');
        setDateEndFilter('');
        setRangeStartDraft('');
        setRangeEndDraft('');
        setMonthFilter(mes || currentMonthISO());
        setShowPeriodMenu(false);
    };

    const selecionarInicioIntervalo = (dataInicio) => {
        setRangeStartDraft(dataInicio);
        if (dataInicio && rangeEndDraft && dataInicio > rangeEndDraft) {
            setRangeEndDraft(dataInicio);
        }
    };

    const selecionarFimIntervalo = (dataFim) => {
        setRangeEndDraft(dataFim);
        if (dataFim && rangeStartDraft && dataFim < rangeStartDraft) {
            setRangeStartDraft(dataFim);
        }
    };

    const aplicarIntervalo = () => {
        if (!rangeStartDraft || !rangeEndDraft) {
            alert('Selecione a data inicial e a data final.');
            return;
        }

        setRegistros([]);
        setDateFilter(rangeStartDraft);
        setDateEndFilter(rangeEndDraft);
        setMonthFilter('');
        setShowPeriodMenu(false);
    };

    const calcularIndice = (amostraInsp, qtde_lote) => {
    const inspecionada = Number(amostraInsp);
    const totalLote = Number(qtde_lote);

        if (!inspecionada) return '0,00%';

        return `${((inspecionada / totalLote) * 100)
            .toFixed(2)
            .replace('.', ',')}%`;
    };

    const fotosVisualizacao = normalizarFotosPeca(viewData?.foto_peca, viewData?.foto_peca_nome);

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Registro' }, { label: 'Inspeção de Injeção' }]}
            containerClassName="injecao-page"
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-cubes"></i> Inspeção de peças plasticas</h1>
                        <p>Acompanhamento de inspeção — Injeção</p>
                    </div>
                    <div className="header-actions injecao-filters">
                        <input
                            type="search"
                            className="form-control injecao-search"
                            placeholder="Buscar por código, peça, máquina..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <div className="period-filter-wrapper" ref={periodMenuRef}>
                            <button
                                type="button"
                                className={showPeriodMenu ? 'period-filter-button active' : 'period-filter-button'}
                                onClick={() => setShowPeriodMenu((current) => !current)}
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
                                        <button type="button" onClick={() => selecionarMes(currentMonthISO())}>
                                            Mês atual
                                        </button>
                                        <button type="button" onClick={() => selecionarMes(previousMonthISO())}>
                                            Mês anterior
                                        </button>
                                    </div>

                                    <label>
                                        <span>Outro mês</span>
                                        <input
                                            type="month"
                                            value={monthFilter}
                                            onChange={(e) => selecionarMes(e.target.value)}
                                        />
                                    </label>
                                    <div className="period-range-fields">
                                        <label>
                                            <span>Data inicial</span>
                                            <input
                                                type="date"
                                                value={rangeStartDraft}
                                                max={rangeEndDraft || undefined}
                                                onChange={(e) => selecionarInicioIntervalo(e.target.value)}
                                            />
                                        </label>
                                        <label>
                                            <span>Data final</span>
                                            <input
                                                type="date"
                                                value={rangeEndDraft}
                                                min={rangeStartDraft || undefined}
                                                onChange={(e) => selecionarFimIntervalo(e.target.value)}
                                            />
                                        </label>
                                    </div>
                                    <button
                                        type="button"
                                        className="period-range-apply"
                                        onClick={aplicarIntervalo}
                                    >
                                        Aplicar intervalo
                                    </button>
                                </div>
                            )}
                        </div>
                        <label className={shiftFilter ? 'shift-filter-button active' : 'shift-filter-button'} title={shiftFilter ? 'Turno: ' + shiftFilter : 'Filtrar por turno'}>
                            <i className="fas fa-clock" aria-hidden="true"></i>
                            <span className="filter-label">{shiftFilter ? 'Turno ' + shiftFilter : 'Turno'}</span>
                            <select
                                value={shiftFilter}
                                onChange={(e) => setShiftFilter(e.target.value)}
                                aria-label="Filtrar inspeções por turno"
                            >
                                <option value="">Todos os turnos</option>
                                <option value="A">Turno A</option>
                                <option value="B">Turno B</option>
                                <option value="C">Turno C</option>
                            </select>
                        </label>
                        <button
                            type="button"
                            className="btn btn-success btn-sm export-excel-button"
                            onClick={exportarExcel}
                            disabled={loading || registros.length === 0}
                            title="Exportar registros filtrados para Excel"
                        >
                            <i className="fas fa-file-excel" aria-hidden="true"></i>
                            <span className="filter-label">Exportar Excel</span>
                        </button>
                        <button className="btn btn-primary btn-sm new-inspection-button" onClick={() => { resetForm(); setShowModal(true); }} title="Nova Inspeção">
                            <i className="fas fa-plus" aria-hidden="true"></i>
                            <span className="filter-label">Nova Inspeção</span>
                        </button>
                    </div>
                </div>

                <section className="injecao-summary" aria-label="Resumo e filtros das inspeções">
                    <article className={`injecao-summary-card filter-card total ${!statusFilter ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={!statusFilter}
                        onClick={() => setStatusFilter('')} onKeyDown={(event) => acionarCardPorTeclado(event, '')}>
                        <div className="injecao-summary-heading"><i className="fas fa-clipboard-list" aria-hidden="true"></i><span>Total de inspeções</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.total}</strong><small>Todos os status</small>
                        <span className="injecao-summary-line" aria-hidden="true"></span>
                    </article>
                    <article className={`injecao-summary-card filter-card approved ${statusFilter === 'aprovado' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'aprovado'}
                        onClick={() => ativarFiltroStatus('aprovado')} onKeyDown={(event) => acionarCardPorTeclado(event, 'aprovado')}>
                        <div className="injecao-summary-heading"><i className="fas fa-check-circle" aria-hidden="true"></i><span>Aprovadas</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.aprovadas}</strong><small>Inspeções aprovadas</small>
                        <span className="injecao-summary-line" aria-hidden="true"></span>
                    </article>
                    <article className={`injecao-summary-card filter-card rejected ${statusFilter === 'reprovado' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'reprovado'}
                        onClick={() => ativarFiltroStatus('reprovado')} onKeyDown={(event) => acionarCardPorTeclado(event, 'reprovado')}>
                        <div className="injecao-summary-heading"><i className="fas fa-times-circle" aria-hidden="true"></i><span>Reprovadas</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.reprovadas}</strong><small>Inspeções reprovadas</small>
                        <span className="injecao-summary-line" aria-hidden="true"></span>
                    </article>
                    <article className={`injecao-summary-card filter-card pending ${statusFilter === 'pendente' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'pendente'}
                        onClick={() => ativarFiltroStatus('pendente')} onKeyDown={(event) => acionarCardPorTeclado(event, 'pendente')}>
                        <div className="injecao-summary-heading"><i className="fas fa-clock" aria-hidden="true"></i><span>Pendentes</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.pendentes}</strong><small>Pendentes ou em concessão</small>
                        <span className="injecao-summary-line" aria-hidden="true"></span>
                    </article>
                </section>

                {/* Tabela e panorama responsivo */}
                <div className="injecao-content-layout">
                    <div className="injecao-table-column">
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
                                            className={`mobile-clickable-row ${sheetData?.id === reg.id ? 'mobile-row-active' : ''} ${panoramaRegistro?.id === reg.id ? 'panorama-row-active' : ''}`}
                                            onClick={() => handleRowClick(reg)}
                                        >
                                            <td>{formatarData(reg.data)}</td>
                                            <td className="col-semana">{reg.semana || '-'}</td>
                                            <td>{normalizarTurno(reg.turno_injecao) || '-'}</td>
                                            <td>{reg.maquina || '-'}</td>
                                            <td>{reg.cod || '-'}</td>
                                            <td>{reg.peca || '-'}</td>
                                            <td>{reg.molde || '-'}</td>
                                            <td className="col-hide">{reg.amostra_insp ?? 0}</td>
                                            <td className="col-hide">{reg.amostra_nc ?? 0}</td>
                                            <td>{reg.qtde_lote ?? 0}</td>
                                            <td className="col-status"><span className={`badge responsive-status ${getStatusClass(reg.status)}`} title={formatarStatus(reg.status)} aria-label={formatarStatus(reg.status)}><span className="status-text">{formatarStatus(reg.status)}</span><i className={`status-icon fas ${getStatusIconClass(reg.status)}`} aria-hidden="true"></i></span></td>
                                            <td className="actions-column col-acoes">
                                                <div className="acoes">
                                                    <button className="btn-icon btn-view" title="Visualizar inspeção completa" onClick={(e) => { e.stopPropagation(); handleView(reg); }}>
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
                    </div>
                    <aside className="piece-panorama" aria-live="polite">
                        {!panoramaRegistro ? (
                            <div className="piece-panorama-empty"><i className="fas fa-chart-column"></i>
                                <h3>Panorama da peça</h3><p>Clique em uma linha da tabela para ver o histórico da peça.</p></div>
                        ) : panoramaDados.loading ? (
                            <div className="piece-panorama-empty"><i className="fas fa-spinner fa-spin"></i><p>Carregando panorama...</p></div>
                        ) : (
                            <>
                                <div className="piece-panorama-header"><span>Panorama da peça</span>
                                    <button type="button" onClick={() => setPanoramaRegistro(null)} aria-label="Fechar panorama"><i className="fas fa-times"></i></button></div>
                                <h3>{panoramaRegistro.peca || 'Peça sem descrição'}</h3><p className="piece-panorama-code">Código {panoramaRegistro.cod || '—'}</p>
                                <div className="piece-panorama-kpis">
                                    <div><strong>{panoramaAtualResumo.total}</strong><span>inspeções</span></div>
                                    <div className="positive"><strong>{panoramaAtualResumo.aprovadas}</strong><span>aprovadas</span></div>
                                    <div className="negative"><strong>{panoramaAtualResumo.reprovadas}</strong><span>reprovadas</span></div>
                                    <div><strong>{panoramaAtualResumo.total ? ((panoramaAtualResumo.aprovadas / panoramaAtualResumo.total) * 100).toFixed(1) : '0,0'}%</strong><span>aprovação</span></div>
                                </div>
                                <section className="panorama-block"><h4>Mês atual × mês anterior</h4>
                                    {[[panoramaDados.mesAnterior, panoramaAnteriorResumo], [panoramaDados.mesAtual, panoramaAtualResumo]].map(([mes, resumo]) => (
                                        <div className="panorama-month-row" key={mes}><span>{formatMonthLabel(mes)}</span><div className="panorama-bars">
                                            <i className="approved-bar" style={{ width: `${(resumo.aprovadas / panoramaMaiorValor) * 100}%` }}></i><b>{resumo.aprovadas}</b>
                                            <i className="rejected-bar" style={{ width: `${(resumo.reprovadas / panoramaMaiorValor) * 100}%` }}></i><b>{resumo.reprovadas}</b>
                                        </div></div>))}
                                    <div className="panorama-legend"><span><i className="approved-dot"></i>Aprovadas</span><span><i className="rejected-dot"></i>Reprovadas</span></div>
                                </section>
                                <section className="panorama-block"><h4>Defeitos mais frequentes</h4>
                                    {panoramaDefeitos.length ? panoramaDefeitos.map(([nome, quantidade]) => (
                                        <div className="defect-row" key={nome}><span>{nome}</span><i><b style={{ width: `${(quantidade / maiorDefeito) * 100}%` }}></b></i><strong>{quantidade}</strong></div>
                                    )) : <p className="panorama-no-data">Nenhum defeito registrado no período.</p>}
                                </section>
                                <section className="panorama-meta"><div><span>Máquinas</span><strong>{panoramaMaquinas.join(', ') || '—'}</strong></div>
                                    <div><span>Moldes</span><strong>{panoramaMoldes.join(', ') || '—'}</strong></div></section>
                            </>
                        )}
                    </aside>
                </div>

                {/* Modal de cadastro/edição */}
                {showModal && typeof document !== 'undefined' && createPortal((
                    <div className="modal-overlay" onClick={solicitarFechamentoFormulario}>
                        <div ref={formModalRef} className="modal-content modal-large injecao-form-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Editar' : 'Novo'} Registro de Injeção</h2>
                                <button type="button" className="modal-close" onClick={solicitarFechamentoFormulario}>
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

                            <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)}>
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
                                                        <input type="text" className="form-control field-upper calculated-field" value={formData.semana}
                                                            readOnly aria-readonly="true" title="Calculado automaticamente pela data" />
                                                    </div>
                                                    <div className="form-group form-group-turno">
                                                        <label>Turno de Injeção *</label>
                                                        <select className="form-control" value={formData.turno_injecao}
                                                            onChange={(e) => setCampo('turno_injecao', e.target.value)} aria-required="true">
                                                            <option value="" disabled>--</option>
                                                            <option value="A">Turno A</option>
                                                            <option value="B">Turno B</option>
                                                            <option value="C">Turno C</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group form-group-machine" style={{ position: 'relative' }}>
                                                        <label>Máquina *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.maquina}
                                                            aria-required="true"
                                                            onChange={(e) => {
                                                                const valor = e.target.value.toUpperCase();
                                                                setFormData((prev) => ({ ...prev, maquina: valor, modelo_maquina: '' }));
                                                                buscarMaquinas(valor);
                                                            }}
                                                            onFocus={() => {
                                                                if (maquinaSugestoes.length > 0) {
                                                                    setShowMaquinaSugestoes(true);
                                                                    setMaquinaAtivaIndex((prev) => (prev >= 0 ? prev : 0));
                                                                }
                                                            }}
                                                            onBlur={() => setTimeout(() => setShowMaquinaSugestoes(false), 150)}
                                                            onKeyDown={handleMaquinaKeyDown}
                                                            placeholder="Digite para buscar..."
                                                            autoComplete="off"
                                                        />
                                                        {showMaquinaSugestoes && maquinaSugestoes.length > 0 && (
                                                            <ul className="autocomplete-list" role="listbox">
                                                                {maquinaSugestoes.map((item, index) => (
                                                                    <li
                                                                        key={`${item.maquina}-${item.modelo}-${index}`}
                                                                        className={`autocomplete-item ${index === maquinaAtivaIndex ? 'active' : ''}`}
                                                                        role="option"
                                                                        aria-selected={index === maquinaAtivaIndex}
                                                                        onMouseEnter={() => setMaquinaAtivaIndex(index)}
                                                                        onMouseDown={() => selecionarMaquina(item)}
                                                                    >
                                                                        <span className="autocomplete-cod">{item.maquina}</span>
                                                                        <span className="autocomplete-desc">{item.modelo || 'Sem modelo informado'}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                    <div className="form-group form-group-machine-model">
                                                        <label>Modelo de Máquina</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.modelo_maquina}
                                                            readOnly
                                                            placeholder="Preenchido automaticamente"
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="form-row-injecao-row2">
                                                    <div className="form-group form-group-code" style={{ position: 'relative' }}>
                                                        <label>Cód. SAP *</label>
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
                                                </div>

                                                {/* Molde entrou aqui, e não na linha do Cód. SAP: com ele são seis
                                                    campos curtos, que fecham três linhas de dois no celular sem
                                                    sobrar meia linha vazia. */}
                                                <div className="form-row form-row-compact form-row-numeric">
                                                    <div className="form-group form-group-molde">
                                                        <label>Molde *</label>
                                                        <input type="text" className="form-control field-upper" value={formData.molde}
                                                            onChange={(e) => setCampo('molde', e.target.value)} aria-required="true" />
                                                    </div>
                                                    <div className="form-group form-group-number">
                                                        <label>Amostra Insp. *</label>
                                                        <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-control" value={formData.amostra_insp}
                                                            onChange={(e) => setCampo('amostra_insp', e.target.value === '' ? '' : Number(e.target.value))} aria-required="true" />
                                                    </div>
                                                    <div className="form-group form-group-number">
                                                        <label>Amostra NC *</label>
                                                        <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-control" value={formData.amostra_nc}
                                                            onChange={(e) => setCampo('amostra_nc', e.target.value === '' ? '' : Number(e.target.value))} aria-required="true" />
                                                    </div>
                                                    <div className="form-group form-group-number">
                                                        <label>Qtde Lote *</label>
                                                        <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-control" value={formData.qtde_lote}
                                                            onChange={(e) => setCampo('qtde_lote', e.target.value === '' ? '' : Number(e.target.value))} aria-required="true" />
                                                    </div>
                                                    <div className="form-group form-group-number">
                                                        <label>Peso (Kg)</label>
                                                        <input type="text" inputMode="decimal" className="form-control" value={formData.peso}
                                                            onChange={(e) => setCampo('peso', e.target.value)} placeholder="Ex: 0,250" />
                                                    </div>
                                                    <div className="form-group form-group-number">
                                                        <label>Índice(%)</label>
                                                        <input type="text" className="form-control calculated-field" value={calcularIndice(formData.amostra_insp, formData.qtde_lote)}
                                                            readOnly aria-readonly="true" title="Calculado automaticamente pela amostra e quantidade do lote" />
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
                                                            <label title="Informe o valor de referência da cota">{`Cota ${i + 1}`}</label>
                                                            <input type="text" className="form-control field-upper" value={formData[cota]}
                                                                onChange={(e) => setCampo(cota, e.target.value)}  title='Exemplo: 25,00 ± 0,20 mm'/>
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
                                                    <label>{campo.label} *</label>
                                                    <select className="form-control" value={formData[campo.id]}
                                                        onChange={(e) => atualizarAvaliacao(campo.id, e.target.value)} aria-required="true">
                                                        {conformeOpcoes.map((op) => (
                                                            <option key={op.value || 'pendente'} value={op.value} disabled={op.value === ''}>{op.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="avaliacao-resultado-layout">
                                            <div className="avaliacao-resultado-fields">
                                                <div className="form-group">
                                                    <label>Status *</label>
                                                    <select className="form-control" value={formData.status}
                                                        onChange={(e) => setCampo('status', e.target.value)} aria-required="true">
                                                        <option value="" disabled>Pendente</option>
                                                        <option value="aprovado">Aprovado</option>
                                                        <option value="reprovado">Reprovado</option>
                                                    </select>
                                                </div>
                                                {String(formData.status || '').toLowerCase() === 'reprovado' && (
                                                    <div className="form-group" style={{ position: 'relative' }}>
                                                        <label>Defeito</label>
                                                        <textarea
                                                            ref={defeitoTextareaRef}
                                                            className="form-control field-upper avaliacao-defeito-textarea"
                                                            rows="1"
                                                            value={formData.defeito}
                                                            onChange={(e) => {
                                                                const valor = e.target.value.toUpperCase();
                                                                setCampo('defeito', valor);
                                                                buscarDefeitosInjecao(valor);
                                                                ajustarAlturaDefeito(e.target);
                                                            }}
                                                            onFocus={() => {
                                                                if (defeitoSugestoes.length > 0) {
                                                                    setShowDefeitoSugestoes(true);
                                                                    setDefeitoAtivoIndex((prev) => (prev >= 0 ? prev : 0));
                                                                }
                                                            }}
                                                            onBlur={() => setTimeout(() => setShowDefeitoSugestoes(false), 150)}
                                                            onKeyDown={handleDefeitoKeyDown}
                                                            placeholder="Digite para buscar..."
                                                        />
                                                        {showDefeitoSugestoes && defeitoSugestoes.length > 0 && (
                                                            <ul className="autocomplete-list" role="listbox">
                                                                {defeitoSugestoes.map((item, index) => (
                                                                    <li
                                                                        key={`${item.defeito}-${index}`}
                                                                        className={`autocomplete-item ${index === defeitoAtivoIndex ? 'active' : ''}`}
                                                                        role="option"
                                                                        aria-selected={index === defeitoAtivoIndex}
                                                                        onMouseEnter={() => setDefeitoAtivoIndex(index)}
                                                                        onMouseDown={() => selecionarDefeitoInjecao(item)}
                                                                    >
                                                                        <span className="autocomplete-cod">{item.defeito}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="form-group avaliacao-observacao">
                                                <label>Observação</label>
                                                <textarea className="form-control" rows="4" value={formData.observacao}
                                                    onChange={(e) => setCampo('observacao', e.target.value)}></textarea>
                                            </div>
                                            {String(formData.status || '').toLowerCase() === 'reprovado' && (
                                            <div className="injecao-photo-field">
                                                <div className="injecao-photo-header">
                                                    <div>
                                                        <strong><i className="fas fa-camera" aria-hidden="true"></i> Fotos da peça reprovada</strong>
                                                        <small>Registre até três evidências visuais do defeito.</small>
                                                    </div>
                                                    <div className="injecao-photo-actions">
                                                        <label className={`btn btn-primary btn-sm ${(formData.fotos_peca || []).length >= 3 ? 'disabled' : ''}`}>
                                                            <i className="fas fa-camera" aria-hidden="true"></i>
                                                            {(formData.fotos_peca || []).length ? 'Adicionar foto' : 'Tirar foto'} ({(formData.fotos_peca || []).length}/3)
                                                            <input
                                                                ref={fotoPecaInputRef}
                                                                type="file"
                                                                accept="image/*"
                                                                capture="environment"
                                                                onChange={handleFotoPecaChange}
                                                                disabled={(formData.fotos_peca || []).length >= 3}
                                                                hidden
                                                            />
                                                        </label>
                                                    </div>
                                                </div>
                                                {(formData.fotos_peca || []).length ? (
                                                    <div className="injecao-photo-preview-grid">
                                                        {formData.fotos_peca.map((foto, index) => (
                                                            <div className="injecao-photo-preview" key={`${foto.nome}-${index}`}>
                                                                <img src={foto.src} alt={`Pré-visualização ${index + 1} da peça reprovada`}
                                                                    onClick={() => abrirLightbox(formData.fotos_peca, index)}
                                                                    style={{ cursor: 'zoom-in' }} />
                                                                <span title={foto.nome}>{foto.nome || `Foto ${index + 1}`}</span>
                                                                <button type="button" onClick={() => removerFotoPeca(index)} aria-label={`Remover foto ${index + 1}`} title="Remover foto">
                                                                    <i className="fas fa-trash" aria-hidden="true"></i>
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <label className="injecao-photo-empty">
                                                        <i className="fas fa-camera" aria-hidden="true"></i>
                                                        <span>Nenhuma foto registrada — toque para adicionar</span>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            capture="environment"
                                                            onChange={handleFotoPecaChange}
                                                            hidden
                                                        />
                                                    </label>
                                                )}
                                            </div>
                                            )}
                                        </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={solicitarFechamentoFormulario}>
                                        Cancelar
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-save"></i> {editingId ? 'Atualizar' : 'Salvar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ), document.body)}

                {showUnsavedConfirm && typeof document !== 'undefined' && createPortal((
                    <div className="unsaved-confirm-overlay" onClick={() => setShowUnsavedConfirm(false)}>
                        <div className="unsaved-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-confirm-title" onClick={(event) => event.stopPropagation()}>
                            <div className="unsaved-confirm-icon"><i className="fas fa-exclamation-triangle"></i></div>
                            <div className="unsaved-confirm-copy"><h2 id="unsaved-confirm-title">Alterações não salvas</h2>
                                <p>Você tem alterações que ainda não foram salvas. Deseja realmente sair sem salvar?</p></div>
                            <div className="unsaved-confirm-actions"><button type="button" className="btn-confirm-cancel" onClick={() => setShowUnsavedConfirm(false)}>Cancelar</button>
                                <button type="button" className="btn-confirm-leave" onClick={fecharFormularioSemSalvar}>Sair sem salvar</button></div>
                        </div>
                    </div>
                ), document.body)}

                {/* Modal de visualização (somente leitura) */}
                {showViewModal && viewData && typeof document !== 'undefined' && createPortal((
                    <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
                        <div ref={viewModalRef} className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
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

                                {fotosVisualizacao.length > 0 && (
                                <div className="view-section injecao-view-photo">
                                    <h4><i className="fas fa-camera" aria-hidden="true"></i> Fotos da peça reprovada</h4>
                                    <div className="injecao-view-photo-track">
                                        {fotosVisualizacao.map((foto, index) => (
                                            <button type="button" className="injecao-view-photo-thumb" title="Ampliar foto" key={`${foto.nome}-${index}`}
                                                onClick={() => abrirLightbox(fotosVisualizacao, index)}>
                                                <img src={foto.src} alt={`Peça reprovada — foto ${index + 1}`} />
                                                <span>{foto.nome || `Foto ${index + 1}`}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {fotosVisualizacao.length > 1 && <small className="injecao-photo-swipe-hint">Deslize para ver as demais fotos</small>}
                                </div>
                                )}
                                <div className="injecao-view-secondary-grid">
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
                                                <span className="view-value">{formatarResultadoAvaliacao(viewData[c.id])}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                </div>

                                {viewData.observacao && (
                                    <div className="view-section injecao-view-observacao">
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
                ), document.body)}

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
                {/* Lightbox de fotos com zoom */}
                {lightbox.open && lightbox.fotos.length > 0 && typeof document !== 'undefined' && createPortal((
                    <div className="lightbox-overlay" onClick={fecharLightbox} role="dialog" aria-modal="true" aria-label="Visualizar foto ampliada">
                        <div className="lightbox-controls-top">
                            <span className="lightbox-counter">{lightbox.index + 1} / {lightbox.fotos.length}</span>
                            <div className="lightbox-zoom-controls">
                                <button type="button" onClick={(e) => { e.stopPropagation(); setLbZoom((z) => { const n = Math.max(1, z - 0.5); if (n <= 1) setLbPan({ x: 0, y: 0 }); return n; }); }} aria-label="Reduzir zoom" title="Reduzir (−)">
                                    <i className="fas fa-search-minus"></i>
                                </button>
                                <span className="lightbox-zoom-level">{Math.round(lbZoom * 100)}%</span>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setLbZoom((z) => Math.min(5, z + 0.5)); }} aria-label="Aumentar zoom" title="Aumentar (+)">
                                    <i className="fas fa-search-plus"></i>
                                </button>
                            </div>
                            <button type="button" className="lightbox-close" onClick={fecharLightbox} aria-label="Fechar" title="Fechar (Esc)">
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {lightbox.fotos.length > 1 && (
                            <>
                                <button type="button" className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); lbNavegar(-1); }} aria-label="Foto anterior" title="Anterior (←)">
                                    <i className="fas fa-chevron-left"></i>
                                </button>
                                <button type="button" className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); lbNavegar(1); }} aria-label="Próxima foto" title="Próxima (→)">
                                    <i className="fas fa-chevron-right"></i>
                                </button>
                            </>
                        )}

                        <div className="lightbox-image-wrapper" onClick={(e) => e.stopPropagation()}
                            onWheel={handleLbWheel}
                            onPointerDown={handleLbPointerDown}
                            onPointerMove={handleLbPointerMove}
                            onPointerUp={handleLbPointerUp}
                            onTouchStart={handleLbTouchStart}
                            onTouchMove={handleLbTouchMove}
                            onTouchEnd={handleLbTouchEnd}
                            onDoubleClick={lbToggleZoom}
                            style={{ cursor: lbZoom > 1 ? 'grab' : 'zoom-in' }}
                        >
                            <img
                                src={lightbox.fotos[lightbox.index]?.src}
                                alt={lightbox.fotos[lightbox.index]?.nome || `Foto ${lightbox.index + 1}`}
                                className="lightbox-image"
                                draggable={false}
                                style={{
                                    transform: `scale(${lbZoom}) translate(${lbPan.x / lbZoom}px, ${lbPan.y / lbZoom}px)`,
                                    transition: lbDragging.current ? 'none' : 'transform 0.2s ease'
                                }}
                            />
                        </div>

                        <div className="lightbox-caption">
                            {lightbox.fotos[lightbox.index]?.nome || `Foto ${lightbox.index + 1}`}
                        </div>
                    </div>
                ), document.body)}
            </div>
        </AppLayout>
    );
}










