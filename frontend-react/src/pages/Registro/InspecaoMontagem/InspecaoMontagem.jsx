import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import AppLayout from '../../../components/Layout/AppLayout';
import ScannerCodigo from '../../../components/ScannerCodigo/ScannerCodigo';
import { ConfirmarSaida } from '../../../components/ui';
import { registrosAPI, defeitosAPI, produtosAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { upperFields } from '../../../utils/text';
import { formatDateBR, normalizeISODate, todayISO } from '../../../utils/date';
import { formatarTurno, normalizarTurno } from '../../../utils/turnos';
import './InspecaoMontagem.css';


const getWeekFromDate = (value = todayISO()) => {
    const [year, month, day] = String(value || '').split('-').map(Number);
    if (!year || !month || !day) return '';

    const date = new Date(Date.UTC(year, month - 1, day));
    const dayNumber = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNumber);

    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return String(Math.ceil((((date - yearStart) / 86400000) + 1) / 7));
};

const currentMonthISO = () => todayISO().slice(0, 7);

const monthRangeISO = (value = currentMonthISO()) => {
    const [year, month] = String(value || currentMonthISO()).split('-').map(Number);
    const safeYear = year || Number(currentMonthISO().slice(0, 4));
    const safeMonth = month || Number(currentMonthISO().slice(5, 7));
    const lastDay = new Date(safeYear, safeMonth, 0).getDate();
    const prefix = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
    return { start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, '0')}` };
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
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
        .format(new Date(year, month - 1, 1));
    return label.charAt(0).toUpperCase() + label.slice(1);
};

const normalizarFotosPeca = (fotosSalvas, nomesSalvos) => {
    const lerLista = (valor) => {
        if (Array.isArray(valor)) return valor;
        if (!valor) return [];
        try { const parsed = JSON.parse(valor); return Array.isArray(parsed) ? parsed : [valor]; }
        catch { return [valor]; }
    };
    const fotos = lerLista(fotosSalvas);
    const nomes = lerLista(nomesSalvos);
    return fotos
        .filter((src) => typeof src === 'string' && src.trim())
        .slice(0, 3)
        .map((src, index) => ({ src, nome: String(nomes[index] || `Foto ${index + 1}`) }));
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
    const [lineFilter, setLineFilter] = useState('');
    const [showPeriodMenu, setShowPeriodMenu] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [formDirty, setFormDirty] = useState(false);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [errosValidacao, setErrosValidacao] = useState([]);
    const [showViewModal, setShowViewModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [viewData, setViewData] = useState(null);
    const [defeitos, setDefeitos] = useState([]);
    const [activeTab, setActiveTab] = useState('dados-gerais');
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [printData, setPrintData] = useState(null);
    const [sheetData, setSheetData] = useState(null);
    const [panoramaRegistro, setPanoramaRegistro] = useState(null);
    const [panoramaDados, setPanoramaDados] = useState({
        loading: false, atual: [], anterior: [], mesAtual: '', mesAnterior: ''
    });

    // Autocomplete de produtos (Código SAP)
    const [produtoSugestoes, setProdutoSugestoes] = useState([]);
    const [showSugestoes, setShowSugestoes] = useState(false);
    const [sugestaoAtivaIndex, setSugestaoAtivaIndex] = useState(-1);
    const searchTimeout = useRef(null);
    const periodMenuRef = useRef(null);

    /* Fecha o seletor de período ao clicar fora.
       O ref já existia e estava preso ao wrapper, mas nunca era lido: sem
       este efeito o painel só fechava pelos próprios botões, e continuava
       aberto por cima do cabeçalho e da barra enquanto se usava o resto da
       tela. Mesmo efeito que a tela de Cartões já tinha. */
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
    const loadRequestRef = useRef(0);
    const formModalRef = useRef(null);
    const viewModalRef = useRef(null);
    const fotoPecaInputRef = useRef(null);

    // Feedback da leitura do código de barras
    const [barcodeStatus, setBarcodeStatus] = useState(null); // { type: 'success' | 'error', message }
    const [scannerAberto, setScannerAberto] = useState(false);

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
        qtd_total: '',
        qtd_inspecionada:  '',
        qtd_nc: '',
        qtd_pallet: '',
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
        observacao: '',
        fotos_peca: []
    });

    // ── Lightbox helpers ──
    const abrirLightbox = (fotos, index = 0) => {
        setLightbox({ open: true, fotos, index });
        setLbZoom(1); setLbPan({ x: 0, y: 0 });
    };
    const fecharLightbox = () => {
        setLightbox({ open: false, fotos: [], index: 0 });
        setLbZoom(1); setLbPan({ x: 0, y: 0 });
    };
    const lbNavegar = (direcao) => {
        setLightbox((prev) => ({ ...prev, index: (prev.index + direcao + prev.fotos.length) % prev.fotos.length }));
        setLbZoom(1); setLbPan({ x: 0, y: 0 });
    };
    const lbToggleZoom = () => {
        setLbZoom((z) => { const n = z >= 2.5 ? 1 : z + 1; if (n === 1) setLbPan({ x: 0, y: 0 }); return n; });
    };
    const handleLbWheel = (e) => {
        e.preventDefault();
        setLbZoom((z) => { const n = Math.min(5, Math.max(1, z - e.deltaY * 0.002)); if (n <= 1) setLbPan({ x: 0, y: 0 }); return n; });
    };
    const handleLbPointerDown = (e) => {
        if (e.pointerType === 'touch' || lbZoom <= 1) return;
        lbDragging.current = true;
        lbDragStart.current = { x: e.clientX, y: e.clientY };
        lbPanStart.current = { ...lbPan };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const handleLbPointerMove = (e) => {
        if (!lbDragging.current) return;
        setLbPan({ x: lbPanStart.current.x + (e.clientX - lbDragStart.current.x), y: lbPanStart.current.y + (e.clientY - lbDragStart.current.y) });
    };
    const handleLbPointerUp = () => { lbDragging.current = false; };
    const handleLbTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lbPinchDist.current = Math.hypot(dx, dy); lbPinchZoom.current = lbZoom; return;
        }
        if (e.touches.length === 1) {
            const now = Date.now();
            if (now - lbLastTap.current < 300) { lbToggleZoom(); lbLastTap.current = 0; return; }
            lbLastTap.current = now;
            if (lbZoom > 1) { lbDragging.current = true; lbDragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; lbPanStart.current = { ...lbPan }; }
        }
    };
    const handleLbTouchMove = (e) => {
        if (e.touches.length === 2 && lbPinchDist.current !== null) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const n = Math.min(5, Math.max(1, lbPinchZoom.current * (dist / lbPinchDist.current)));
            setLbZoom(n); if (n <= 1) setLbPan({ x: 0, y: 0 }); return;
        }
        if (lbDragging.current && e.touches.length === 1) {
            setLbPan({ x: lbPanStart.current.x + (e.touches[0].clientX - lbDragStart.current.x), y: lbPanStart.current.y + (e.touches[0].clientY - lbDragStart.current.y) });
        }
    };
    const handleLbTouchEnd = () => { lbDragging.current = false; lbPinchDist.current = null; };

    // ── Foto helpers ──
    const handleFotoPecaChange = (event) => {
        if ((formData.fotos_peca || []).length >= 3) { alert('Você pode registrar no máximo três fotos.'); event.target.value = ''; return; }
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Selecione uma imagem válida.'); return; }
        if (file.size > 15 * 1024 * 1024) { alert('A imagem deve ter no máximo 15 MB.'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            const imagem = new Image();
            imagem.onload = () => {
                const limite = 1600;
                const escala = Math.min(1, limite / Math.max(imagem.width, imagem.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(imagem.width * escala));
                canvas.height = Math.max(1, Math.round(imagem.height * escala));
                canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
                setFormData((prev) => ({ ...prev, fotos_peca: [...(prev.fotos_peca || []), { src: canvas.toDataURL('image/jpeg', 0.8), nome: file.name.slice(0, 70) }].slice(0, 3) }));
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
        setFormData((prev) => ({ ...prev, fotos_peca: (prev.fotos_peca || []).filter((_, i) => i !== index) }));
        setFormDirty(true);
        if (fotoPecaInputRef.current) fotoPecaInputRef.current.value = '';
    };

    const fecharFormularioSemSalvar = () => { setShowUnsavedConfirm(false); setShowModal(false); resetForm(); };
    const solicitarFechamentoFormulario = () => { if (formDirty) { setShowUnsavedConfirm(true); return; } fecharFormularioSemSalvar(); };

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
        if (!showModal || !formDirty) return undefined;
        const proteger = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', proteger);
        return () => window.removeEventListener('beforeunload', proteger);
    }, [showModal, formDirty]);

    useEffect(() => {
        const modal = showModal ? formModalRef.current : (showViewModal ? viewModalRef.current : null);
        if (!modal) return;
        modal.scrollTop = 0;
        window.requestAnimationFrame(() => { modal.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); });
    }, [showModal, showViewModal]);

    useEffect(() => {
        loadRegistros();
        loadDefeitos();
    }, [search, statusFilter, dateFilter, dateEndFilter, monthFilter, shiftFilter, lineFilter]);

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
            const params = { limit: 100 };
            if (search) params.search = search;

            // Carrega todas as páginas
            let todos = [];
            let page = 1;
            let temMais = true;
            while (temMais) {
                const response = await registrosAPI.getAll({ ...params, page });
                if (requestId !== loadRequestRef.current) return;
                if (response.data.success && Array.isArray(response.data.data)) {
                    todos = todos.concat(response.data.data);
                    temMais = response.data.data.length >= 100;
                    page++;
                } else {
                    temMais = false;
                }
            }

            // Filtros client-side
            const termoBusca = String(search || '').trim().toLowerCase();
            const statusBusca = String(statusFilter || '').trim().toLowerCase();
            const turnoBusca = String(shiftFilter || '').trim().toUpperCase();
            const linhaBusca = String(lineFilter || '').trim();

            const dadosFiltrados = todos.filter((registro) => {
                const dataRegistro = String(registro.data_inspecao || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
                if (dateFilter && dataRegistro < dateFilter) return false;
                if (dateEndFilter && dataRegistro > dateEndFilter) return false;
                if (!dateFilter && !dateEndFilter && monthFilter && !dataRegistro.startsWith(`${monthFilter}-`)) return false;
                if (statusBusca && String(registro.status || '').trim().toLowerCase() !== statusBusca) return false;
                if (turnoBusca && normalizarTurno(registro.turno) !== turnoBusca) return false;
                if (linhaBusca && String(registro.linha_montagem || '') !== linhaBusca) return false;
                if (termoBusca) {
                    const conteudo = [registro.cod_sap, registro.modelo, registro.descricao_sap, registro.linha_montagem]
                        .map((v) => String(v || '').toLowerCase()).join(' ');
                    if (!conteudo.includes(termoBusca)) return false;
                }
                return true;
            });

            setResumoRegistros(todos.filter((registro) => {
                const dataRegistro = String(registro.data_inspecao || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
                if (dateFilter && dataRegistro < dateFilter) return false;
                if (dateEndFilter && dataRegistro > dateEndFilter) return false;
                if (!dateFilter && !dateEndFilter && monthFilter && !dataRegistro.startsWith(`${monthFilter}-`)) return false;
                return true;
            }));
            setRegistros(dadosFiltrados);
        } catch (error) {
            if (requestId !== loadRequestRef.current) return;
            console.error('Erro ao carregar registros:', error);
            setResumoRegistros([]);
            setRegistros([]);
        } finally {
            if (requestId === loadRequestRef.current) setLoading(false);
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

    /* Câmera só entra em cena onde existe de fato: aparelho sem câmera ou
       página sem HTTPS não ganham um botão que só daria erro. */
    const suportaCamera = typeof navigator !== 'undefined'
        && !!navigator.mediaDevices?.getUserMedia
        && window.isSecureContext;

    const aoLerCodigoPelaCamera = (codigo) => {
        setFormData((prev) => ({ ...prev, codigo_barras: codigo }));
        setBarcodeStatus(null);
        /* Mesma validação da digitação: confere o produto e avisa se o código
           lido não corresponde ao Cód. SAP já informado. */
        buscarPorCodigoBarras(codigo);
        setFormDirty(true);
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

    /* Campos obrigatórios. A aba é guardada junto para o formulário poder pular
       direto para onde está a pendência — sem isso o inspetor recebe um erro
       sobre um campo que não está vendo. */
    const CAMPOS_OBRIGATORIOS = [
        { campo: 'data_inspecao', label: 'Data Inspeção', aba: 'dados-gerais' },
        { campo: 'semana', label: 'Semana', aba: 'dados-gerais' },
        { campo: 'turno', label: 'Turno', aba: 'dados-gerais' },
        { campo: 'linha_montagem', label: 'Linha Montagem', aba: 'dados-gerais' },
        { campo: 'cod_sap', label: 'Código SAP', aba: 'dados-gerais' },
        { campo: 'qtd_total', label: 'Qtd. Total', aba: 'dados-gerais' },
        { campo: 'qtd_inspecionada', label: 'Qtd. Inspecionada', aba: 'dados-gerais' },
        { campo: 'qtd_nc', label: 'Qtd. NC', aba: 'dados-gerais' },
        { campo: 'qtd_pallet', label: 'Num. Paletes', aba: 'dados-gerais' },
        { campo: 'rastreabilidade', label: 'Rastreabilidade', aba: 'dados-gerais' }
        /* Código de Barras e P.O. ficaram fora de propósito: há produto sem EAN
           cadastrado e lote sem P.O., e exigi-los travaria registro legítimo. */
    ];

    /* Só cobrados quando o status é Reprovado, que é quando o bloco aparece. */
    const CAMPOS_REPROVADO = [
        { campo: 'posto', label: 'Posto', aba: 'status-tab' },
        { campo: 'operador', label: 'Operador', aba: 'status-tab' },
        { campo: 'causa', label: 'Causa', aba: 'status-tab' },
        { campo: 'correcao', label: 'Correção', aba: 'status-tab' },
        { campo: 'responsavelCorrecao', label: 'Responsável pela Correção', aba: 'status-tab' }
    ];

    const validarFormulario = () => {
        /* Zero é valor legítimo nas quantidades, então a checagem é por vazio e
           não por falsy — `!0` classificaria um lote com 0 NC como pendente. */
        const vazio = (valor) => valor === null || valor === undefined || String(valor).trim() === '';
        const faltando = [];

        CAMPOS_OBRIGATORIOS.forEach((item) => {
            if (vazio(formData[item.campo])) faltando.push(item);
        });

        checklistItems.forEach((secao) => secao.items.forEach((item) => {
            if (checklist[item.id]?.conforme !== true && checklist[item.id]?.conforme !== false) {
                faltando.push({ campo: item.id, label: `Critérios de Inspeção — ${item.label}`, aba: 'checklist-tab' });
            }
        }));

        if (String(formData.status || '').toLowerCase() === 'reprovado') {
            CAMPOS_REPROVADO.forEach((item) => {
                if (vazio(formData[item.campo])) faltando.push(item);
            });
        }

        return faltando;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const pendencias = validarFormulario();
        if (pendencias.length > 0) {
            setErrosValidacao(pendencias);
            /* No modo Abas, leva o inspetor até a aba da primeira pendência. */
            if (formViewMode === 'tabs') setActiveTab(pendencias[0].aba);
            formModalRef.current?.querySelector('.modal-body')?.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setErrosValidacao([]);

        try {
            const isReprovado = String(formData.status || '').toLowerCase() === 'reprovado';
            const fotosPeca = (formData.fotos_peca || []).slice(0, 3);
            const { fotos_peca: _fotosPeca, ...camposFormulario } = formData;

            const sanitizedFormData = isReprovado
                ? camposFormulario
                : {
                    ...camposFormulario,
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
                checklist: checklist,
                foto_peca: isReprovado && fotosPeca.length ? JSON.stringify(fotosPeca.map(({ src }) => src)) : '',
                foto_peca_nome: isReprovado && fotosPeca.length ? JSON.stringify(fotosPeca.map(({ nome }) => nome)) : '',
                status: formData.status?.toUpperCase()
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
        const dataInspecao = normalizeISODate(registro.data_inspecao || todayISO());

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
            observacao: registro.observacao || '',
            fotos_peca: normalizarFotosPeca(registro.foto_peca, registro.foto_peca_nome)
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
        setFormDirty(false);
        setErrosValidacao([]);
        setActiveTab('dados-gerais');
        setFormViewMode('tabs');
        setShowModal(true);
    };

    const handleView = (registro) => {
        setViewData(registro);
        setShowViewModal(true);
    };

    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const confirmarExclusao = (id) => setDeleteConfirm(id);
    const executarExclusao = async () => {
        if (!deleteConfirm) return;
        try {
            await registrosAPI.delete(deleteConfirm);
            loadRegistros();
        } catch (error) {
            console.error('Erro ao excluir registro:', error);
            const mensagem = error.response?.data?.message || 'Erro ao excluir registro';
            alert(mensagem);
        } finally {
            setDeleteConfirm(null);
        }
    };
    const handleDelete = (id) => confirmarExclusao(id);

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

                        ${resumirNaoConformidades(printData) ? `
                        <div class="section">
                            <div class="section-title">⚠️ NC dos Critérios de Inspeção</div>
                            <div class="section-content">${resumirNaoConformidades(printData)}</div>
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
            /* Vazio, não 0: agora são obrigatórios, e um zero pré-preenchido
               passaria a validação sem o inspetor ter conferido a quantidade. */
            qtd_total: '',
            qtd_inspecionada: '',
            qtd_nc: '',
            qtd_pallet: '',
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
            observacao: '',
            fotos_peca: []
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
        setFormDirty(false);
        setErrosValidacao([]);
    };

    /* Delega ao utilitário compartilhado, que extrai a data por regex
       (`^\d{4}-\d{2}-\d{2}`) e portanto ignora a parte de hora. A versão
       local fazia `split('-')` e tomava o terceiro pedaço como dia: num
       `created_at` ISO isso virava "14T12:57:44.000Z/09/2026". */
    const formatarData = (dataString) => formatDateBR(dataString, 'N/A');

    const normalizarStatus = (status) => String(status || 'pendente').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    const getStatusClass = (status) => {
        const classes = { aprovado: 'badge-success', pendente: 'badge-warning', reprovado: 'badge-danger', concessao: 'badge-info' };
        return classes[normalizarStatus(status)] || 'badge-warning';
    };

    const getStatusIconClass = (status) => {
        const icons = { aprovado: 'fa-check', pendente: 'fa-clock', reprovado: 'fa-times', concessao: 'fa-handshake' };
        return icons[normalizarStatus(status)] || 'fa-clock';
    };

    const formatarStatus = (status) => String(status || 'pendente').toUpperCase();

    /* Campos de quantidade seguem o padrão da Injeção: type="text" com
       inputMode numérico, sem as setinhas do type="number" e permitindo campo
       vazio — o `|| 0` anterior devolvia 0 assim que o inspetor apagava o
       conteúdo, impedindo limpar o campo.

       A Injeção usa Number(e.target.value) direto, o que grava NaN se algo não
       numérico entrar; aqui descarto os não dígitos antes, então letra
       simplesmente não entra. Vazio vira 0 no backend, via _to_int. */
    const setCampoNumerico = (campo, valor) => {
        const digitos = String(valor).replace(/\D/g, '');
        setFormData((prev) => ({ ...prev, [campo]: digitos === '' ? '' : Number(digitos) }));
        setFormDirty(true);
    };

    const updateChecklist = (item, field, value) => {
        setChecklist(prev => ({
            ...prev,
            [item]: { ...prev[item], [field]: value }
        }));

        /* Marcar NC reprova a inspeção automaticamente. Não faz o caminho de
           volta: se o inspetor desmarcar o último NC, o status continua
           Reprovado para não apagar uma decisão que ele tomou de propósito
           (reprovar por defeito que não está no checklist, por exemplo). */
        if (field === 'conforme' && value === false) {
            setFormData(prev => (prev.status === 'reprovado' ? prev : { ...prev, status: 'reprovado' }));
        }
        setFormDirty(true);
    };

    const tabs = [
        { id: 'dados-gerais', icon: 'fa-info-circle', label: 'Dados Gerais' },
        { id: 'checklist-tab', icon: 'fa-tasks', label: 'Critérios de Inspeção' },
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

    /* Itens marcados como NC, achatados na ordem das seções. Alimenta o bloco
       único de descrição abaixo do grid, mantendo a obs vinculada a cada item. */
    const itensNaoConformes = checklistItems.flatMap((section) =>
        section.items
            .filter((item) => checklist[item.id]?.conforme === false)
            .map((item) => ({ ...item, section: section.section, icon: section.icon, color: section.color }))
    );

    /* Resume as NC do checklist de um registro já salvo (usa o payload do
       backend, não o formulário). Alimenta o Excel e o cartão impresso, que
       antes não mostravam nada do checklist. */
    const resumirNaoConformidades = (registro) => {
        const cl = registro?.checklist;
        if (!cl || typeof cl !== 'object') return '';
        return checklistItems
            .flatMap((secao) => secao.items)
            .filter((item) => cl[item.id]?.conforme === false)
            .map((item) => {
                const obs = String(cl[item.id]?.obs || '').replace(/\r?\n+/g, ' ').trim();
                return obs ? `${item.label}: ${obs}` : item.label;
            })
            .join(' | ');
    };

    const sheetRegistro = sheetData ? registros.find((registro) => registro.id === sheetData.id) : null;

    const resumoInspecoes = resumoRegistros.reduce((resumo, registro) => {
        const status = normalizarStatus(registro.status);
        resumo.total += 1;
        if (status === 'aprovado') resumo.aprovadas += 1;
        else if (status === 'reprovado') resumo.reprovadas += 1;
        else resumo.pendentes += 1;
        return resumo;
    }, { total: 0, aprovadas: 0, reprovadas: 0, pendentes: 0 });

    const resumirPanorama = (lista) => lista.reduce((r, reg) => {
        const s = normalizarStatus(reg.status); r.total += 1;
        if (s === 'aprovado') r.aprovadas += 1; if (s === 'reprovado') r.reprovadas += 1; return r;
    }, { total: 0, aprovadas: 0, reprovadas: 0 });
    const panoramaAtualResumo = resumirPanorama(panoramaDados.atual);
    const panoramaAnteriorResumo = resumirPanorama(panoramaDados.anterior);
    const panoramaMaiorValor = Math.max(panoramaAtualResumo.aprovadas, panoramaAtualResumo.reprovadas, panoramaAnteriorResumo.aprovadas, panoramaAnteriorResumo.reprovadas, 1);
    const panoramaDefeitos = (() => {
        const mapa = panoramaDados.atual.reduce((m, reg) => {
            if (normalizarStatus(reg.status) !== 'reprovado') return m;
            const d = String(reg.defeito || '').trim();
            if (d) m.set(d, (m.get(d) || 0) + 1);
            return m;
        }, new Map());
        return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    })();
    const maiorDefeito = Math.max(...panoramaDefeitos.map(([, q]) => q), 1);
    const panoramaLinhas = [...new Set(panoramaDados.atual.map((i) => i.linha_montagem).filter(Boolean))];

    const ativarFiltroStatus = (status) => setStatusFilter((atual) => atual === status ? '' : status);
    const acionarCardPorTeclado = (event, status) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (status) ativarFiltroStatus(status); else setStatusFilter(''); }
    };

    const periodoLabel = dateFilter && dateEndFilter
        ? `${formatarData(dateFilter)} até ${formatarData(dateEndFilter)}`
        : formatMonthLabel(monthFilter);

    const selecionarMes = (mes) => {
        setRegistros([]); setDateFilter(''); setDateEndFilter('');
        setRangeStartDraft(''); setRangeEndDraft('');
        setMonthFilter(mes || currentMonthISO()); setShowPeriodMenu(false);
    };
    const selecionarInicioIntervalo = (d) => { setRangeStartDraft(d); if (d && rangeEndDraft && d > rangeEndDraft) setRangeEndDraft(d); };
    const selecionarFimIntervalo = (d) => { setRangeEndDraft(d); if (d && rangeStartDraft && d < rangeStartDraft) setRangeStartDraft(d); };
    const aplicarIntervalo = () => {
        if (!rangeStartDraft || !rangeEndDraft) { alert('Selecione a data inicial e a data final.'); return; }
        setRegistros([]); setDateFilter(rangeStartDraft); setDateEndFilter(rangeEndDraft);
        setMonthFilter(''); setShowPeriodMenu(false);
    };

    const carregarPanorama = async (registro) => {
        setPanoramaRegistro(registro);
        const mesBase = monthFilter || String(dateFilter || registro.data_inspecao || currentMonthISO()).slice(0, 7);
        const mesAnterior = previousMonthFromISO(mesBase);
        const termo = String(registro.cod_sap || registro.modelo || '').trim();
        setPanoramaDados({ loading: true, atual: [], anterior: [], mesAtual: mesBase, mesAnterior });
        try {
            const [resAtual, resAnterior] = await Promise.all([
                registrosAPI.getAll({ search: termo, limit: 100 }),
                registrosAPI.getAll({ search: termo, limit: 100 })
            ]);
            const filtrar = (res, mes) => {
                const lista = res?.data?.success && Array.isArray(res.data.data) ? res.data.data : [];
                return lista.filter((item) => {
                    const dataItem = String(item.data_inspecao || '').slice(0, 7);
                    if (dataItem !== mes) return false;
                    return registro.cod_sap
                        ? String(item.cod_sap || '').trim() === String(registro.cod_sap).trim()
                        : String(item.modelo || '').trim() === String(registro.modelo || '').trim();
                });
            };
            setPanoramaDados({ loading: false, atual: filtrar(resAtual, mesBase), anterior: filtrar(resAnterior, mesAnterior), mesAtual: mesBase, mesAnterior });
        } catch (error) {
            console.error('Erro ao carregar panorama:', error);
            setPanoramaDados({ loading: false, atual: [], anterior: [], mesAtual: mesBase, mesAnterior });
        }
    };

    const handleRowClick = (registro) => {
        if (typeof window !== 'undefined' && window.innerWidth >= 1600) { carregarPanorama(registro); return; }
        openMobileActions(registro);
    };

    const fotosVisualizacao = normalizarFotosPeca(viewData?.foto_peca, viewData?.foto_peca_nome);

    const exportarExcel = async () => {
        if (loading) return;
        const dadosExportacao = registros;
        if (dadosExportacao.length === 0) { alert('Nenhum registro encontrado no período selecionado.'); return; }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Sistema Mallory';
        workbook.created = new Date();
        const worksheet = workbook.addWorksheet('Inspeções de Montagem', { views: [{ state: 'frozen', ySplit: 1 }] });

        worksheet.columns = [
            { header: 'Data', key: 'data', width: 13 },
            { header: 'Semana', key: 'semana', width: 10 },
            { header: 'Turno', key: 'turno', width: 10 },
            { header: 'Linha', key: 'linha', width: 10 },
            { header: 'Código SAP', key: 'cod_sap', width: 16 },
            { header: 'Descrição', key: 'descricao', width: 38 },
            { header: 'Qtd Total', key: 'qtd_total', width: 12 },
            { header: 'Qtd Inspecionada', key: 'qtd_insp', width: 18 },
            { header: 'Qtd NC', key: 'qtd_nc', width: 10 },
            { header: 'Pallet', key: 'pallet', width: 10 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Defeito', key: 'defeito', width: 24 },
            { header: 'Observação', key: 'observacao', width: 42 },
            { header: 'NC dos Critérios de Inspeção', key: 'nc_checklist', width: 46 },
            { header: 'Inspetor', key: 'inspetor', width: 24 }
        ];

        dadosExportacao.forEach((reg) => {
            const dataISO = String(reg.data_inspecao || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
            const dataExcel = dataISO ? new Date(Number(dataISO[1]), Number(dataISO[2]) - 1, Number(dataISO[3])) : null;
            worksheet.addRow({
                data: dataExcel, semana: reg.semana || '', turno: normalizarTurno(reg.turno),
                linha: reg.linha_montagem || '', cod_sap: reg.cod_sap || '',
                descricao: reg.modelo || reg.descricao_sap || '',
                qtd_total: Number(reg.qtd_total) || 0, qtd_insp: Number(reg.qtd_inspecionada) || 0,
                qtd_nc: Number(reg.qtd_nc) || 0, pallet: Number(reg.qtd_pallet) || 0,
                status: formatarStatus(reg.status), defeito: reg.defeito || '',
                observacao: String(reg.observacao || '').replace(/\r?\n+/g, ' ').trim(),
                nc_checklist: resumirNaoConformidades(reg),
                inspetor: reg.inspetor || ''
            });
        });

        const header = worksheet.getRow(1);
        header.height = 28;
        header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF7A00' } };
        header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        worksheet.autoFilter = { from: 'A1', to: `N${worksheet.rowCount}` };
        worksheet.getColumn('data').numFmt = 'dd/mm/yyyy';
        worksheet.getColumn('cod_sap').numFmt = '@';

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            row.height = 24;
            row.alignment = { vertical: 'middle', wrapText: false };
            row.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9E1EA' } } }; });
        });
        ['semana', 'turno', 'linha', 'qtd_total', 'qtd_insp', 'qtd_nc', 'pallet', 'status'].forEach((key) => {
            worksheet.getColumn(key).alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const sufixo = dateFilter && dateEndFilter ? `${dateFilter}_a_${dateEndFilter}` : monthFilter || currentMonthISO();
        link.href = url; link.download = `inspecoes_montagem_${sufixo}.xlsx`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    };

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Registro' }, { label: 'Inspeção de Montagem' }]}
            containerClassName="montagem-page"
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-list-check"></i> Inspeção de Montagem</h1>
                        <p>Acompanhamento de inspeção — Montagem</p>
                    </div>
                    <div className="header-actions montagem-filters">
                        <input
                            type="search"
                            className="form-control montagem-search"
                            placeholder="Buscar por código, modelo, linha..."
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
                                    <div className="period-filter-quick-actions">
                                        <button type="button" onClick={() => selecionarMes(currentMonthISO())}>Mês atual</button>
                                        <button type="button" onClick={() => selecionarMes(previousMonthISO())}>Mês anterior</button>
                                    </div>
                                    <label><span>Outro mês</span><input type="month" value={monthFilter} onChange={(e) => selecionarMes(e.target.value)} /></label>
                                    <div className="period-range-fields">
                                        <label><span>Data inicial</span><input type="date" value={rangeStartDraft} max={rangeEndDraft || undefined} onChange={(e) => selecionarInicioIntervalo(e.target.value)} /></label>
                                        <label><span>Data final</span><input type="date" value={rangeEndDraft} min={rangeStartDraft || undefined} onChange={(e) => selecionarFimIntervalo(e.target.value)} /></label>
                                    </div>
                                    <button type="button" className="period-range-apply" onClick={aplicarIntervalo}>Aplicar intervalo</button>
                                </div>
                            )}
                        </div>
                        <label className={shiftFilter ? 'shift-filter-button active' : 'shift-filter-button'} title={shiftFilter ? 'Turno: ' + shiftFilter : 'Filtrar por turno'}>
                            <i className="fas fa-clock" aria-hidden="true"></i>
                            <span className="filter-label">{shiftFilter ? 'Turno ' + shiftFilter : 'Turno'}</span>
                            <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)} aria-label="Filtrar por turno">
                                <option value="">Todos os turnos</option>
                                <option value="A">Turno A</option>
                                <option value="B">Turno B</option>
                                <option value="C">Turno C</option>
                            </select>
                        </label>
                        <label className={lineFilter ? 'shift-filter-button active' : 'shift-filter-button'} title={lineFilter ? 'Linha: ' + lineFilter : 'Filtrar por linha'}>
                            <i className="fas fa-industry" aria-hidden="true"></i>
                            <span className="filter-label">{lineFilter || 'Linha'}</span>
                            <select value={lineFilter} onChange={(e) => setLineFilter(e.target.value)} aria-label="Filtrar por linha">
                                <option value="">Todas as linhas</option>
                                <option value="LM-01">LM-01</option>
                                <option value="LM-02">LM-02</option>
                                <option value="LM-03">LM-03</option>
                                <option value="LM-04">LM-04</option>
                                <option value="LM-05">LM-05</option>
                                <option value="LM-06">LM-06</option>
                                <option value="LM-07">LM-07</option>
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

                <section className="montagem-summary" aria-label="Resumo e filtros das inspeções">
                    <article className={`montagem-summary-card filter-card total ${!statusFilter ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={!statusFilter}
                        onClick={() => setStatusFilter('')} onKeyDown={(e) => acionarCardPorTeclado(e, '')}>
                        <div className="montagem-summary-heading"><i className="fas fa-clipboard-list" aria-hidden="true"></i><span>Total de inspeções</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.total}</strong><small>Todos os status</small>
                        <span className="montagem-summary-line" aria-hidden="true"></span>
                    </article>
                    <article className={`montagem-summary-card filter-card approved ${statusFilter === 'aprovado' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'aprovado'}
                        onClick={() => ativarFiltroStatus('aprovado')} onKeyDown={(e) => acionarCardPorTeclado(e, 'aprovado')}>
                        <div className="montagem-summary-heading"><i className="fas fa-check-circle" aria-hidden="true"></i><span>Aprovadas</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.aprovadas}</strong><small>Inspeções aprovadas</small>
                        <span className="montagem-summary-line" aria-hidden="true"></span>
                    </article>
                    <article className={`montagem-summary-card filter-card rejected ${statusFilter === 'reprovado' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'reprovado'}
                        onClick={() => ativarFiltroStatus('reprovado')} onKeyDown={(e) => acionarCardPorTeclado(e, 'reprovado')}>
                        <div className="montagem-summary-heading"><i className="fas fa-times-circle" aria-hidden="true"></i><span>Reprovadas</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.reprovadas}</strong><small>Inspeções reprovadas</small>
                        <span className="montagem-summary-line" aria-hidden="true"></span>
                    </article>
                    <article className={`montagem-summary-card filter-card pending ${statusFilter === 'pendente' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'pendente'}
                        onClick={() => ativarFiltroStatus('pendente')} onKeyDown={(e) => acionarCardPorTeclado(e, 'pendente')}>
                        <div className="montagem-summary-heading"><i className="fas fa-clock" aria-hidden="true"></i><span>Pendentes</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.pendentes}</strong><small>Pendentes ou em concessão</small>
                        <span className="montagem-summary-line" aria-hidden="true"></span>
                    </article>
                </section>

                <div className="montagem-content-layout">
                    <div className="montagem-table-column">
                <div className="table-card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th className="col-semana">Sem.</th>
                                    <th>Turno</th>
                                    <th>Código SAP</th>
                                    <th>Descrição</th>
                                    <th>Linha</th>
                                    <th className="col-hide">Qtd Total</th>
                                    <th className="col-hide">Qtd Insp.</th>
                                    <th>Qtd NC</th>
                                    <th>STATUS</th>
                                    <th className="actions-column col-acoes">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="11" style={{ textAlign: 'center' }}>Carregando...</td></tr>
                                ) : registros.length === 0 ? (
                                    <tr><td colSpan="11" style={{ textAlign: 'center' }}>Nenhum registro encontrado</td></tr>
                                ) : (
                                    registros.map(reg => (
                                        <tr
                                            key={reg.id}
                                            className={`mobile-clickable-row ${sheetData?.id === reg.id ? 'mobile-row-active' : ''} ${panoramaRegistro?.id === reg.id ? 'panorama-row-active' : ''}`}
                                            onClick={() => handleRowClick(reg)}
                                        >
                                            <td>{formatarData(reg.data_inspecao)}</td>
                                            <td className="col-semana">{reg.semana || '-'}</td>
                                            <td>{normalizarTurno(reg.turno) || '-'}</td>
                                            <td><strong>{reg.cod_sap}</strong></td>
                                            <td>{reg.modelo || reg.descricao_sap || 'N/A'}</td>
                                            <td>{reg.linha_montagem || '--'}</td>
                                            <td className="col-hide">{reg.qtd_total}</td>
                                            <td className="col-hide">{reg.qtd_inspecionada}</td>
                                            <td>{reg.qtd_nc}</td>
                                            <td className="col-status">
                                                <span className={`badge responsive-status ${getStatusClass(reg.status)}`} title={formatarStatus(reg.status)} aria-label={formatarStatus(reg.status)}>
                                                    <span className="status-text">{formatarStatus(reg.status)}</span>
                                                    <i className={`status-icon fas ${getStatusIconClass(reg.status)}`} aria-hidden="true"></i>
                                                </span>
                                            </td>
                                            <td className="actions-column col-acoes">
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
                    </div>
                    <aside className="piece-panorama" aria-live="polite">
                        {!panoramaRegistro ? (
                            <div className="piece-panorama-empty"><i className="fas fa-chart-column"></i>
                                <h3>Panorama do produto</h3><p>Clique em uma linha da tabela para ver o histórico do produto.</p></div>
                        ) : panoramaDados.loading ? (
                            <div className="piece-panorama-empty"><i className="fas fa-spinner fa-spin"></i><p>Carregando panorama...</p></div>
                        ) : (
                            <>
                                <div className="piece-panorama-header"><span>Panorama do produto</span>
                                    <button type="button" onClick={() => setPanoramaRegistro(null)} aria-label="Fechar panorama"><i className="fas fa-times"></i></button></div>
                                <h3>{panoramaRegistro.modelo || panoramaRegistro.descricao_sap || 'Produto sem descrição'}</h3>
                                <p className="piece-panorama-code">Código {panoramaRegistro.cod_sap || '—'}</p>
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
                                <section className="panorama-meta"><div><span>Linhas</span><strong>{panoramaLinhas.join(', ') || '—'}</strong></div></section>
                            </>
                        )}
                    </aside>
                </div>

                {/* Modal de Criação/Edição */}
                {showModal && typeof document !== 'undefined' && createPortal((
                    <div className="modal-overlay" onClick={solicitarFechamentoFormulario}>
                        <div ref={formModalRef} className="modal-content modal-large inspection-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Editar Registro de Inspeção' : 'Novo Registro de Inspeção'}</h2>
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

                            {/* noValidate: a validação nativa do HTML não consegue focar campo
                                em aba oculta e aborta o submit sem mensagem. Toda a checagem
                                fica em validarFormulario(). */}
                            <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} noValidate>
                                <div className="modal-body">
                                    {errosValidacao.length > 0 && (
                                        <div className="validacao-alerta" role="alert">
                                            <div className="validacao-alerta-topo">
                                                <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                                                <strong>
                                                    {errosValidacao.length === 1
                                                        ? 'Falta preencher 1 campo antes de salvar'
                                                        : `Faltam preencher ${errosValidacao.length} campos antes de salvar`}
                                                </strong>
                                                <button type="button" onClick={() => setErrosValidacao([])} aria-label="Fechar aviso">
                                                    <i className="fas fa-times" aria-hidden="true"></i>
                                                </button>
                                            </div>
                                            <ul>
                                                {errosValidacao.map((item) => (
                                                    <li key={item.campo}>
                                                        {formViewMode === 'tabs' ? (
                                                            <button type="button" onClick={() => setActiveTab(item.aba)}>{item.label}</button>
                                                        ) : item.label}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Tab: Dados Gerais */}
                                    {(formViewMode === 'geral' || activeTab === 'dados-gerais') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Dados de Inspeção</h3>
                                                <div className="dados-inspecao-row">
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
                                                        <label>Semana *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.semana}
                                                            onChange={(e) => setFormData({ ...formData, semana: e.target.value })}
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label>Turno *</label>
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
                                                        <label>Linha Montagem *</label>
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
                                                </div>

                                                <div className="produto-row">
                                                    <div className="form-group familia-group">
                                                        <label>Linha do Produto</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.linha}
                                                            readOnly
                                                            title={formData.linha || 'Preenchido automaticamente pelo Código SAP'}
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                    </div>
                                                    <div className="form-group familia-group">
                                                        <label>Família</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.familia}
                                                            readOnly
                                                            title={formData.familia || 'Preenchido automaticamente pelo Código SAP'}
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                        />
                                                    </div>
                                                    <div className="form-group sap-descricao-group">
                                                        <label>Descrição SAP</label>
                                                        <textarea
                                                            className="form-control field-upper"
                                                            value={formData.descricao_sap}
                                                            readOnly
                                                            style={{ backgroundColor: 'var(--surface-3)' }}
                                                            rows="2"
                                                        ></textarea>
                                                    </div>
                                                    <div className="form-group sap-barcode-group">
                                                        <label><i className="fas fa-barcode"></i> Código de Barras do Produto</label>
                                                        {/* O botão da câmera é um extra: digitar e usar leitor
                                                            físico (que chega como digitação + Enter) seguem
                                                            funcionando igual. */}
                                                        <div className="barcode-campo">
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
                                                            {suportaCamera && (
                                                                <button
                                                                    type="button"
                                                                    className="barcode-camera-btn"
                                                                    onClick={() => setScannerAberto(true)}
                                                                    title="Ler com a câmera"
                                                                    aria-label="Ler código de barras com a câmera"
                                                                >
                                                                    <i className="fas fa-camera" aria-hidden="true"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                        {barcodeStatus && (
                                                            <span className={`barcode-status barcode-status-${barcodeStatus.type}`}>
                                                                <i className={`fas ${barcodeStatus.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                                                                {barcodeStatus.message}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="divider"></div>

                                            <div className="form-section">
                                                <h3 className="section-title">Quantidades</h3>
                                                <div className="qty-row">
                                                    <div className="form-group">
                                                        <label>Qtd. Total *</label>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            className="form-control"
                                                            value={formData.qtd_total}
                                                            onChange={(e) => setCampoNumerico('qtd_total', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Qtd. Inspecionada *</label>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            className="form-control"
                                                            value={formData.qtd_inspecionada}
                                                            onChange={(e) => setCampoNumerico('qtd_inspecionada', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Qtd. NC *</label>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            className="form-control"
                                                            value={formData.qtd_nc}
                                                            onChange={(e) => setCampoNumerico('qtd_nc', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Num. Paletes *</label>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            className="form-control"
                                                            value={formData.qtd_pallet}
                                                            onChange={(e) => setCampoNumerico('qtd_pallet', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="form-group qty-wide">
                                                        <label>Rastreabilidade *</label>
                                                        <input
                                                            type="text"
                                                            className="form-control field-upper"
                                                            value={formData.rastreabilidade}
                                                            onChange={(e) => setFormData({ ...formData, rastreabilidade: e.target.value.toUpperCase() })}
                                                        />
                                                    </div>
                                                    <div className="form-group qty-wide">
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

                                        </div>
                                    )}

                                    {/* Tab: Checklist */}
                                    {(formViewMode === 'geral' || activeTab === 'checklist-tab') && (
                                        <div className="tab-content active">
                                            {checklistItems.map(section => {
                                            const ncDaSecao = section.items.filter((i) => checklist[i.id]?.conforme === false);
                                            return (
                                                <div key={section.section} className="checklist-section">
                                                    <h4 className="checklist-title" style={{ color: section.color }}>
                                                        <i className={`fas ${section.icon}`}></i> {section.section}
                                                    </h4>
                                                    <div className={section.items.some((i) => i.hasValue) ? 'checklist-grid checklist-grid-wide' : 'checklist-grid'}>
                                                    {section.items.map(item => (
                                                        <div key={item.id} className={checklist[item.id].conforme === false ? 'checklist-item is-nc' : 'checklist-item'}>
                                                            <div className="checklist-label">
                                                                <i className={`fas ${section.icon}`}></i>
                                                                <span>{item.label}</span>
                                                            </div>
                                                            <div className="checklist-options">
                                                                {item.hasValue && (
                                                                    /* A unidade era um rótulo ao lado do campo. Virou sufixo do
                                                                       placeholder: o título do card já diz o que se mede, e os
                                                                       ~35px que o rótulo ocupava faltavam para os botões
                                                                       Conforme/NC caberem no card em telas estreitas. */
                                                                    <input
                                                                        type="number"
                                                                        step="0.01"
                                                                        className="value-input"
                                                                        placeholder={item.unit ? `Valor (${item.unit})` : 'Valor'}
                                                                        value={checklist[item.id].valor}
                                                                        onChange={(e) => updateChecklist(item.id, 'valor', e.target.value)}
                                                                    />
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
                                                        </div>
                                                    ))}
                                                    </div>

                                                    {ncDaSecao.length > 0 && (
                                                        <div className="checklist-nc-block">
                                                            <h4 className="checklist-nc-title">
                                                                <i className="fas fa-exclamation-triangle"></i>
                                                                Descreva {ncDaSecao.length > 1 ? 'os problemas' : 'o problema'} ({ncDaSecao.length})
                                                            </h4>
                                                            {ncDaSecao.map(item => (
                                                                <div key={item.id} className="checklist-nc-field">
                                                                    <label>
                                                                        <i className={`fas ${section.icon}`} style={{ color: section.color }}></i>
                                                                        <span>{item.label}</span>
                                                                    </label>
                                                                    <textarea
                                                                        className="form-control"
                                                                        value={checklist[item.id].obs}
                                                                        onChange={(e) => updateChecklist(item.id, 'obs', e.target.value.toUpperCase())}
                                                                        placeholder="Descreva o problema encontrado..."
                                                                    ></textarea>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                            })}
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

                                                {itensNaoConformes.length > 0 && (
                                                    <div className="nc-resumo">
                                                        <h4 className="nc-resumo-title">
                                                            <i className="fas fa-exclamation-triangle"></i>
                                                            Não conformidades do checklist ({itensNaoConformes.length})
                                                        </h4>
                                                        <ul className="nc-resumo-list">
                                                            {itensNaoConformes.map(item => (
                                                                <li key={item.id}>
                                                                    <strong>{item.label}</strong>
                                                                    <span>{checklist[item.id].obs?.trim() || 'Sem descrição informada'}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        <small>Espelha os critérios de inspeção automaticamente. Para alterar, edite na aba Critérios de Inspeção.</small>
                                                    </div>
                                                )}
                                            </div>

                                            {formData.status === 'reprovado' && (
                                                 //<>
                                                //     <div className="divider"></div>
                                                //     <div className="form-section nc-section">
                                                //         <h3 className="section-title">Não Conformidade</h3>
                                                //         <div className="form-row">
                                                //             <div className="form-group">
                                                //                 <label>Documento</label>
                                                //                 <input
                                                //                     type="text"
                                                //                     className="form-control field-upper"
                                                //                     value={formData.documento}
                                                //                     onChange={(e) => setFormData({ ...formData, documento: e.target.value.toUpperCase() })}
                                                //                 />
                                                //             </div>
                                                //             <div className="form-group">
                                                //                 <label>Prioridade</label>
                                                //                 <select
                                                //                     className="form-control"
                                                //                     value={formData.prioridade}
                                                //                     onChange={(e) => setFormData({ ...formData, prioridade: e.target.value })}
                                                //                 >
                                                //                     <option value="">Selecione</option>
                                                //                     <option value="critico">Crítico</option>
                                                //                     <option value="primario">Primário</option>
                                                //                     <option value="secundario">Secundário</option>
                                                //                 </select>
                                                //             </div>
                                                //         </div>
                                                //         <div className="form-row">
                                                //             <div className="form-group">
                                                //                 <label>Defeito</label>
                                                //                 <select
                                                //                     className="form-control"
                                                //                     value={formData.defeito}
                                                //                     onChange={(e) => setFormData({ ...formData, defeito: e.target.value })}
                                                //                 >
                                                //                     <option value="">Selecione ou digite...</option>
                                                //                     {defeitos.map(d => (
                                                //                         <option key={d.id} value={d.defeito}>{d.defeito}</option>
                                                //                     ))}
                                                //                 </select>
                                                //             </div>
                                                //             <div className="form-group">
                                                //                 <label>Origem do Problema</label>
                                                //                 <select
                                                //                     className="form-control"
                                                //                     value={formData.origem_problema}
                                                //                     onChange={(e) => setFormData({ ...formData, origem_problema: e.target.value })}
                                                //                 >
                                                //                     <option value="">Selecione</option>
                                                //                     <option value="Injeção">Injeção</option>
                                                //                     <option value="Montagem">Montagem</option>
                                                //                     <option value="Logística">Logística</option>
                                                //                 </select>
                                                //             </div>
                                                //         </div>
                                                //     </div>
                                                <>
                                                    <div className="form-section checklist-section">
                                                        <h3 className="checklist-section-title checklist-title">
                                                            <i className="fas fa-clipboard-list"></i>
                                                            Registro de Ocorrência
                                                        </h3>

                                                        <div className="checklist-ocorrencia-row">
                                                            <div className="form-group">
                                                                <label htmlFor="posto">Posto *</label>
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
                                                                <label htmlFor="operador">Operador *</label>
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

                                                        <div className="checklist-ocorrencia-row ocorrencia-textareas">
                                                            <div className="form-group">
                                                                <label htmlFor="causa">Causa *</label>
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
                                                                <label htmlFor="correcao">Correção *</label>
                                                                <textarea
                                                                    id="correcao"
                                                                    className="form-control field-upper"
                                                                    rows={3}
                                                                    placeholder="Descreva a correção aplicada..."
                                                                    value={formData.correcao}
                                                                    onChange={(e) => setFormData((prev) => ({ ...prev, correcao: e.target.value }))}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="checklist-ocorrencia-row">
                                                            <div className="form-group">
                                                                <label htmlFor="responsavelCorrecao">Responsável pela Correção *</label>
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
                                                    </div>

                                                    <div className="injecao-photo-field" style={{ gridColumn: '1 / -1' }}>
                                                        <div className="injecao-photo-header">
                                                            <div>
                                                                <strong><i className="fas fa-camera" aria-hidden="true"></i> Fotos da peça reprovada</strong>
                                                                <small>Registre até três evidências visuais do defeito.</small>
                                                            </div>
                                                            <div className="injecao-photo-actions">
                                                                <label className={`btn btn-primary btn-sm ${(formData.fotos_peca || []).length >= 3 ? 'disabled' : ''}`}>
                                                                    <i className="fas fa-camera" aria-hidden="true"></i>
                                                                    {(formData.fotos_peca || []).length ? 'Adicionar foto' : 'Tirar foto'} ({(formData.fotos_peca || []).length}/3)
                                                                    <input ref={fotoPecaInputRef} type="file" accept="image/*" capture="environment"
                                                                        onChange={handleFotoPecaChange} disabled={(formData.fotos_peca || []).length >= 3} hidden />
                                                                </label>
                                                            </div>
                                                        </div>
                                                        {(formData.fotos_peca || []).length ? (
                                                            <div className="injecao-photo-preview-grid">
                                                                {formData.fotos_peca.map((foto, index) => (
                                                                    <div className="injecao-photo-preview" key={`${foto.nome}-${index}`}>
                                                                        <img src={foto.src} alt={`Pré-visualização ${index + 1}`}
                                                                            onClick={() => abrirLightbox(formData.fotos_peca, index)} style={{ cursor: 'zoom-in' }} />
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
                                                                <input type="file" accept="image/*" capture="environment" onChange={handleFotoPecaChange} hidden />
                                                            </label>
                                                        )}
                                                    </div>
                                                </>
                                            )}
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

                {/* Modal de confirmação unsaved */}
                {/* Componente do UI Kit: o mesmo diálogo das telas novas, e é por
                    ele que o estilo entra na página. O diálogo de exclusão abaixo
                    reaproveita as mesmas classes. */}
                <ConfirmarSaida
                    aberto={showUnsavedConfirm}
                    onCancelar={() => setShowUnsavedConfirm(false)}
                    onSair={fecharFormularioSemSalvar}
                />

                {/* Modal de confirmação de exclusão */}
                {deleteConfirm && typeof document !== 'undefined' && createPortal((
                    <div className="unsaved-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
                        <div className="unsaved-confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                            <div className="unsaved-confirm-icon" style={{ color: '#ef4444', background: 'rgba(239,68,68,.14)', borderColor: 'rgba(239,68,68,.35)' }}>
                                <i className="fas fa-trash"></i></div>
                            <div className="unsaved-confirm-copy"><h2>Excluir registro</h2>
                                <p>Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.</p></div>
                            <div className="unsaved-confirm-actions"><button type="button" className="btn-confirm-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                                <button type="button" className="btn-confirm-leave" onClick={executarExclusao}>Excluir</button></div>
                        </div>
                    </div>
                ), document.body)}

                {/* Modal de Visualização */}
                {showViewModal && viewData && typeof document !== 'undefined' && createPortal((
                    <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
                        <div ref={viewModalRef} className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Detalhes da Inspeção de Montagem</h2>
                                <button className="modal-close" onClick={() => setShowViewModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="view-grid">
                                    <div className="view-item"><span className="view-label">Data:</span><span className="view-value">{formatarData(viewData.data_inspecao)}</span></div>
                                    <div className="view-item"><span className="view-label">Semana:</span><span className="view-value">{viewData.semana || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Turno:</span><span className="view-value">{formatarTurno(viewData.turno, 'N/A')}</span></div>
                                    <div className="view-item"><span className="view-label">Linha:</span><span className="view-value">{viewData.linha_montagem || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Código SAP:</span><span className="view-value">{viewData.cod_sap}</span></div>
                                    <div className="view-item"><span className="view-label">Modelo:</span><span className="view-value">{viewData.modelo || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Qtd. Total:</span><span className="view-value">{viewData.qtd_total}</span></div>
                                    <div className="view-item"><span className="view-label">Qtd. Inspecionada:</span><span className="view-value">{viewData.qtd_inspecionada}</span></div>
                                    <div className="view-item"><span className="view-label">Qtd. NC:</span><span className="view-value">{viewData.qtd_nc}</span></div>
                                    <div className="view-item"><span className="view-label">Pallet:</span><span className="view-value">{viewData.qtd_pallet || 0}</span></div>
                                    <div className="view-item"><span className="view-label">Inspetor:</span><span className="view-value">{viewData.inspetor || 'N/A'}</span></div>
                                    <div className="view-item"><span className="view-label">Status:</span><span className={`badge ${getStatusClass(viewData.status)}`}>{formatarStatus(viewData.status)}</span></div>
                                    {normalizarStatus(viewData.status) === 'reprovado' && viewData.defeito && (
                                        <div className="view-item"><span className="view-label">Defeito:</span><span className="view-value">{viewData.defeito}</span></div>
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

                                    {resumirNaoConformidades(printData) && (
                                        <div className="print-section">
                                            <div className="print-section-title">⚠️ NC dos Critérios de Inspeção</div>
                                            <div className="print-section-content">{resumirNaoConformidades(printData)}</div>
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
                {/* Lightbox de fotos com zoom */}
                {lightbox.open && lightbox.fotos.length > 0 && typeof document !== 'undefined' && createPortal((
                    <div className="lightbox-overlay" onClick={fecharLightbox} role="dialog" aria-modal="true" aria-label="Visualizar foto ampliada">
                        <div className="lightbox-controls-top">
                            <span className="lightbox-counter">{lightbox.index + 1} / {lightbox.fotos.length}</span>
                            <div className="lightbox-zoom-controls">
                                <button type="button" onClick={(e) => { e.stopPropagation(); setLbZoom((z) => { const n = Math.max(1, z - 0.5); if (n <= 1) setLbPan({ x: 0, y: 0 }); return n; }); }} aria-label="Reduzir zoom" title="Reduzir (−)"><i className="fas fa-search-minus"></i></button>
                                <span className="lightbox-zoom-level">{Math.round(lbZoom * 100)}%</span>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setLbZoom((z) => Math.min(5, z + 0.5)); }} aria-label="Aumentar zoom" title="Aumentar (+)"><i className="fas fa-search-plus"></i></button>
                            </div>
                            <button type="button" className="lightbox-close" onClick={fecharLightbox} aria-label="Fechar" title="Fechar (Esc)"><i className="fas fa-times"></i></button>
                        </div>
                        {lightbox.fotos.length > 1 && (<>
                            <button type="button" className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); lbNavegar(-1); }} aria-label="Foto anterior"><i className="fas fa-chevron-left"></i></button>
                            <button type="button" className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); lbNavegar(1); }} aria-label="Próxima foto"><i className="fas fa-chevron-right"></i></button>
                        </>)}
                        <div className="lightbox-image-wrapper" onClick={(e) => e.stopPropagation()}
                            onWheel={handleLbWheel} onPointerDown={handleLbPointerDown} onPointerMove={handleLbPointerMove} onPointerUp={handleLbPointerUp}
                            onTouchStart={handleLbTouchStart} onTouchMove={handleLbTouchMove} onTouchEnd={handleLbTouchEnd}
                            onDoubleClick={lbToggleZoom} style={{ cursor: lbZoom > 1 ? 'grab' : 'zoom-in' }}>
                            <img src={lightbox.fotos[lightbox.index]?.src} alt={lightbox.fotos[lightbox.index]?.nome || `Foto ${lightbox.index + 1}`}
                                className="lightbox-image" draggable={false}
                                style={{ transform: `scale(${lbZoom}) translate(${lbPan.x / lbZoom}px, ${lbPan.y / lbZoom}px)`, transition: lbDragging.current ? 'none' : 'transform 0.2s ease' }} />
                        </div>
                        <div className="lightbox-caption">{lightbox.fotos[lightbox.index]?.nome || `Foto ${lightbox.index + 1}`}</div>
                    </div>
                ), document.body)}

                {/* Fora do modal de inspeção: o componente já se projeta em
                    portal, e montá-lo aqui evita que fechar o formulário
                    deixe a câmera ligada. */}
                <ScannerCodigo
                    aberto={scannerAberto}
                    onLer={aoLerCodigoPelaCamera}
                    onFechar={() => setScannerAberto(false)}
                    titulo="Ler código de barras do produto"
                />
            </div>
        </AppLayout>
    );
}




