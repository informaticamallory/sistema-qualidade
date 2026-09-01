import { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import ExcelJS from 'exceljs';
import AppLayout from '../../../components/Layout/AppLayout';
import { recebimentoAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { toUpper, upperFields } from '../../../utils/text';
import {
    formatDateBR, normalizeISODate, todayISO,
    currentMonthISO, monthRangeISO, previousMonthISO, formatMonthLabel, normalizarFotosPeca
} from '../../../utils/date';
/* Status vem dos lotes; a regra fica num utilitário compartilhado com a
   página de Indicadores, para não existir em duas versões. */
import {
    statusDoLote, resultadoDoLote, calcularStatusFicha, LABEL_STATUS, RESULTADOS_LOTE
} from '../../../utils/statusRecebimento';
import '../InspecaoMontagem/InspecaoMontagem.css';
/* CSS da Injeção: reaproveita period-filter, fotos, lightbox e o modal de
   alterações não salvas já existentes lá, em vez de recriar os estilos. */
import '../InspecaoInjecao/InspecaoInjecao.css';
import '../recebimento.css';

const hoje = todayISO;
const NUM_AMOSTRAS = 12;

const linhaLoteVazia = () => ({
    lote: '', data_entrada: '', data_saida: '', num_nota_fiscal: '', quant_total: '',
    /* Substituiu as colunas C / SC / NC. Lotes gravados antes disso seguem com
       os campos antigos e continuam sendo lidos por statusDoLote. */
    resultado: 'conforme', amostragem: '',
    lote_fornecedor: '', inspetor: '', concessao: ''
});
const linhaDimensaoVazia = () => ({ posicao: '', cota: '', instrumento: '', observacoes: '' });


/* Marcador de característica especial das Dimensões Funcionais.
   Reproduz o triângulo preenchido usado na ficha em Excel ao lado do código de
   posição. Em SVG e não com o caractere Unicode ▲, porque o glifo muda de
   forma e de peso conforme a fonte instalada — o traçado garante o mesmo
   desenho em qualquer máquina. currentColor deixa o triângulo acompanhar o
   tema claro/escuro em vez de ficar preto fixo. */
const MarcadorPosicao = () => (
    <svg
        className="posicao-marcador"
        viewBox="0 0 10 9"
        width="10"
        height="9"
        aria-hidden="true"
        focusable="false"
    >
        <polygon points="5,0 10,9 0,9" fill="currentColor" />
    </svg>
);
const linhaResultadoVazia = () => ({
    linha: '',
    valores: Array.from({ length: NUM_AMOSTRAS }, () => ({ v: '', d: '' }))
});

const estadoInicial = () => ({
    codigo: '',
    aplicacao: '',
    componente: '',
    setor: '',
    fornecedor: '',
    revisao_desenho: '',
    data_inspecao: hoje(),
    status: 'pendente',
    observacao: '',
    /* defeito, foto_peca e foto_peca_nome já existiam no modelo
       FichaRecebimento e eram persistidos pela rota — só não tinham campo na
       tela. Nada novo foi criado no backend por causa disso. */
    defeito: '',
    fotos_peca: [],
    lotes: [linhaLoteVazia()],
    dimensoes: [linhaDimensaoVazia()],
    resultados: [linhaResultadoVazia()]
});

export default function InspecaoRecebimento() {
    const { user } = useAuth();
    const [fichas, setFichas] = useState([]);
    /* Espelho filtrado apenas por período: alimenta os cards, para que os
       números continuem visíveis mesmo com um status selecionado. */
    const [resumoFichas, setResumoFichas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(estadoInicial());
    const [activeTab, setActiveTab] = useState('identificacao');
    const [formViewMode, setFormViewMode] = useState('tabs');

    // Filtros de período (mesmo modelo da Inspeção de Injeção)
    const [monthFilter, setMonthFilter] = useState(currentMonthISO());
    const [dateFilter, setDateFilter] = useState('');
    const [dateEndFilter, setDateEndFilter] = useState('');
    const [rangeStartDraft, setRangeStartDraft] = useState('');
    const [rangeEndDraft, setRangeEndDraft] = useState('');
    const [showPeriodMenu, setShowPeriodMenu] = useState(false);
    const periodMenuRef = useRef(null);
    const loadRequestRef = useRef(0);

    // Alterações não salvas e exclusão
    const [formDirty, setFormDirty] = useState(false);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [errosValidacao, setErrosValidacao] = useState([]);
    const formModalRef = useRef(null);

    // Fotos da peça reprovada e visualizador ampliado
    const fotoPecaInputRef = useRef(null);
    const [lightbox, setLightbox] = useState(null);
    const [lbZoom, setLbZoom] = useState(1);
    const [lbPos, setLbPos] = useState({ x: 0, y: 0 });
    const lbDrag = useRef(null);
    const lbPinch = useRef(null);

    useEffect(() => {
        loadFichas();
    }, [search, statusFilter, monthFilter, dateFilter, dateEndFilter]);

    // Fecha o menu de período ao clicar fora
    useEffect(() => {
        if (!showPeriodMenu) return;
        const fechar = (evento) => {
            if (periodMenuRef.current && !periodMenuRef.current.contains(evento.target)) setShowPeriodMenu(false);
        };
        document.addEventListener('mousedown', fechar);
        return () => document.removeEventListener('mousedown', fechar);
    }, [showPeriodMenu]);

    // Teclado no visualizador ampliado: Esc fecha, setas navegam
    useEffect(() => {
        if (!lightbox) return;
        const aoTeclar = (evento) => {
            if (evento.key === 'Escape') fecharLightbox();
            if (evento.key === 'ArrowLeft') lbNavegar(-1);
            if (evento.key === 'ArrowRight') lbNavegar(1);
        };
        document.addEventListener('keydown', aoTeclar);
        return () => document.removeEventListener('keydown', aoTeclar);
    }, [lightbox]);

    // Avisa ao fechar/recarregar a aba com alterações pendentes
    useEffect(() => {
        if (!showModal || !formDirty) return;
        const aoSair = (evento) => { evento.preventDefault(); evento.returnValue = ''; };
        window.addEventListener('beforeunload', aoSair);
        return () => window.removeEventListener('beforeunload', aoSair);
    }, [showModal, formDirty]);

    const normalizarStatus = (status) => String(status || 'pendente')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    /* A API de recebimento aceita só page/limit/search/status e devolve no
       máximo 100 por página, então o período é filtrado no cliente — mesma
       abordagem já usada em Injeção e Montagem. Percorre todas as páginas
       para que os cards e o Excel considerem o conjunto inteiro, e não
       apenas a primeira página. */
    const loadFichas = async () => {
        const requisicao = ++loadRequestRef.current;
        try {
            setLoading(true);

            const intervalo = dateFilter || dateEndFilter
                ? { start: dateFilter || dateEndFilter, end: dateEndFilter || dateFilter }
                : monthRangeISO(monthFilter);

            let pagina = 1;
            let todas = [];
            while (true) {
                const resposta = await recebimentoAPI.getAll({ page: pagina, limit: 100 });
                if (!resposta.data?.success) break;
                const lote = Array.isArray(resposta.data.data) ? resposta.data.data : [];
                todas = todas.concat(lote);
                if (lote.length < 100) break;
                pagina += 1;
                if (pagina > 100) break; // trava de segurança
            }

            if (requisicao !== loadRequestRef.current) return; // resposta obsoleta

            const noPeriodo = todas.filter((ficha) => {
                const data = normalizeISODate(ficha.data_inspecao, '');
                if (!data) return false;
                return data >= intervalo.start && data <= intervalo.end;
            });

            const termo = String(search || '').trim().toLowerCase();
            const status = normalizarStatus(statusFilter);

            const aplicarBusca = (ficha) => {
                if (!termo) return true;
                /* Busca sobre os campos que o inspetor de recebimento
                   reconhece, incluindo os números de lote e nota fiscal. */
                const alvos = [ficha.codigo, ficha.componente, ficha.fornecedor,
                    ficha.setor, ficha.aplicacao, ficha.inspetor, ficha.defeito];
                const dosLotes = (ficha.lotes || []).flatMap((lote) => [
                    lote?.lote, lote?.num_nota_fiscal, lote?.lote_fornecedor, lote?.inspetor
                ]);
                return [...alvos, ...dosLotes]
                    .map((valor) => String(valor || '').toLowerCase())
                    .join(' ')
                    .includes(termo);
            };

            setResumoFichas(noPeriodo.filter(aplicarBusca));
            setFichas(noPeriodo.filter((ficha) => {
                if (!aplicarBusca(ficha)) return false;
                if (statusFilter) {
                    /* Compara com o status derivado dos lotes, não com a coluna
                       gravada — é o valor que a tabela e os cards exibem.
                       Uma ficha aparece no filtro se QUALQUER lote dela tiver
                       aquele parecer, para acompanhar a contagem por lote. */
                    const linhas = Array.isArray(ficha.lotes) ? ficha.lotes : [];
                    const casa = linhas.length
                        ? linhas.some((lote) => statusDoLote(lote) === status)
                        : status === 'pendente';
                    if (!casa) return false;
                }
                return true;
            }));
        } catch (error) {
            console.error('Erro ao carregar fichas de recebimento:', error);
        } finally {
            if (requisicao === loadRequestRef.current) setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData(estadoInicial());
        setEditingId(null);
        setActiveTab('identificacao');
        setFormViewMode('tabs');
        setFormDirty(false);
        setErrosValidacao([]);
    };

    const setCampo = (campo, valor) => {
        setFormData((prev) => ({ ...prev, [campo]: valor }));
        setFormDirty(true);
    };

    /* ── Fotos da peça reprovada (até 3) ──────────────────────────────────
       Redimensiona para 1600px no maior lado antes de guardar em base64,
       mesmo tratamento da Injeção — sem isso uma foto de celular estoura o
       tamanho do payload. */
    const handleFotoPecaChange = async (evento) => {
        const arquivos = Array.from(evento.target.files || []);
        if (!arquivos.length) return;

        const disponivel = 3 - (formData.fotos_peca || []).length;
        const selecionados = arquivos.slice(0, Math.max(0, disponivel));

        const lidas = await Promise.all(selecionados.map((arquivo) => new Promise((resolve) => {
            const leitor = new FileReader();
            leitor.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const limite = 1600;
                    const escala = Math.min(1, limite / Math.max(img.width, img.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * escala);
                    canvas.height = Math.round(img.height * escala);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve({ src: canvas.toDataURL('image/jpeg', 0.82), nome: arquivo.name });
                };
                img.onerror = () => resolve(null);
                img.src = leitor.result;
            };
            leitor.onerror = () => resolve(null);
            leitor.readAsDataURL(arquivo);
        })));

        const validas = lidas.filter(Boolean);
        if (validas.length) {
            setFormData((prev) => ({
                ...prev,
                fotos_peca: [...(prev.fotos_peca || []), ...validas].slice(0, 3)
            }));
            setFormDirty(true);
        }
        if (fotoPecaInputRef.current) fotoPecaInputRef.current.value = '';
    };

    const removerFotoPeca = (indice) => {
        setFormData((prev) => ({
            ...prev,
            fotos_peca: (prev.fotos_peca || []).filter((_, i) => i !== indice)
        }));
        setFormDirty(true);
    };

    /* ── Visualizador ampliado com zoom ──────────────────────────────────
       Roda do mouse no desktop, pinça no celular, duplo toque alterna. */
    const abrirLightbox = (fotos, index = 0) => {
        if (!fotos?.length) return;
        setLightbox({ fotos, index });
        setLbZoom(1);
        setLbPos({ x: 0, y: 0 });
    };

    const fecharLightbox = () => { setLightbox(null); setLbZoom(1); setLbPos({ x: 0, y: 0 }); };

    const lbNavegar = (passo) => setLightbox((atual) => {
        if (!atual) return atual;
        const total = atual.fotos.length;
        setLbZoom(1); setLbPos({ x: 0, y: 0 });
        return { ...atual, index: (atual.index + passo + total) % total };
    });

    const lbAplicarZoom = (novo) => {
        const limitado = Math.min(4, Math.max(1, novo));
        setLbZoom(limitado);
        if (limitado === 1) setLbPos({ x: 0, y: 0 });
    };

    const lbToggleZoom = () => lbAplicarZoom(lbZoom > 1 ? 1 : 2);

    const handleLbWheel = (evento) => {
        evento.preventDefault();
        lbAplicarZoom(lbZoom + (evento.deltaY < 0 ? 0.25 : -0.25));
    };

    const handleLbPointerDown = (evento) => {
        if (lbZoom <= 1) return;
        lbDrag.current = { x: evento.clientX - lbPos.x, y: evento.clientY - lbPos.y };
    };

    const handleLbPointerMove = (evento) => {
        if (!lbDrag.current) return;
        setLbPos({ x: evento.clientX - lbDrag.current.x, y: evento.clientY - lbDrag.current.y });
    };

    const handleLbPointerUp = () => { lbDrag.current = null; };

    const distanciaEntreToques = (toques) => Math.hypot(
        toques[0].clientX - toques[1].clientX,
        toques[0].clientY - toques[1].clientY
    );

    const handleLbTouchStart = (evento) => {
        if (evento.touches.length === 2) {
            lbPinch.current = { distancia: distanciaEntreToques(evento.touches), zoom: lbZoom };
        }
    };

    const handleLbTouchMove = (evento) => {
        if (evento.touches.length === 2 && lbPinch.current) {
            evento.preventDefault();
            const fator = distanciaEntreToques(evento.touches) / lbPinch.current.distancia;
            lbAplicarZoom(lbPinch.current.zoom * fator);
        }
    };

    const handleLbTouchEnd = () => { lbPinch.current = null; };

    // ---- Lotes ----
    const updateLote = (i, campo, valor) => setFormData((prev) => {
        const lotes = prev.lotes.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l);
        return { ...prev, lotes };
    });
    const addLote = () => setFormData((prev) => ({ ...prev, lotes: [...prev.lotes, linhaLoteVazia()] }));
    const removeLote = (i) => setFormData((prev) => ({ ...prev, lotes: prev.lotes.filter((_, idx) => idx !== i) }));

    // ---- Dimensões ----
    const updateDimensao = (i, campo, valor) => setFormData((prev) => {
        const dimensoes = prev.dimensoes.map((d, idx) => idx === i ? { ...d, [campo]: valor } : d);
        return { ...prev, dimensoes };
    });
    const addDimensao = () => setFormData((prev) => ({ ...prev, dimensoes: [...prev.dimensoes, linhaDimensaoVazia()] }));
    const removeDimensao = (i) => setFormData((prev) => ({ ...prev, dimensoes: prev.dimensoes.filter((_, idx) => idx !== i) }));

    // ---- Resultados (matriz) ----
    const updateResultadoLinha = (i, valor) => setFormData((prev) => {
        const resultados = prev.resultados.map((r, idx) => idx === i ? { ...r, linha: valor } : r);
        return { ...prev, resultados };
    });
    const updateResultadoValor = (rowIdx, colIdx, key, valor) => setFormData((prev) => {
        const resultados = prev.resultados.map((r, idx) => {
            if (idx !== rowIdx) return r;
            const valores = r.valores.map((c, ci) => ci === colIdx ? { ...c, [key]: valor } : c);
            return { ...r, valores };
        });
        return { ...prev, resultados };
    });
    const addResultado = () => setFormData((prev) => ({ ...prev, resultados: [...prev.resultados, linhaResultadoVazia()] }));
    const removeResultado = (i) => setFormData((prev) => ({ ...prev, resultados: prev.resultados.filter((_, idx) => idx !== i) }));

    const normalizarResultados = (resultados) => (resultados || []).map((r) => {
        const valores = Array.from({ length: NUM_AMOSTRAS }, (_, i) => ({
            v: r.valores?.[i]?.v ?? '',
            d: r.valores?.[i]?.d ?? ''
        }));
        return { linha: r.linha || '', valores };
    });

    /* Validação antes do envio. Mesmo princípio adotado na Montagem: a aba é
       guardada junto da pendência para o formulário levar o inspetor até ela,
       já que a validação nativa do HTML não foca campo em aba oculta. */
    const validarFormulario = () => {
        const vazio = (valor) => valor === null || valor === undefined || String(valor).trim() === '';
        /* Status agora é derivado dos lotes, então não há mais o que "escolher".
           A antiga exigência de marcar Aprovado/Reprovado saiu; no lugar dela o
           formulário passa a exigir pelo menos um lote lançado, que é o que
           produz o parecer. */
        const status = calcularStatusFicha(formData.lotes);
        const pendencias = [];

        if (vazio(formData.codigo)) {
            pendencias.push({ campo: 'codigo', label: 'Código', aba: 'identificacao' });
        }

        /* `resultado` fica fora da checagem porque já nasce com valor padrão
           ('conforme'); sem essa exclusão um lote em branco passaria por
           preenchido e a exigência de informar o lote deixaria de valer. */
        const IGNORAR_NA_CHECAGEM = ['inspetor', 'resultado'];
        const lotesPreenchidos = (formData.lotes || []).filter((lote) => Object.entries(lote)
            .some(([chave, valor]) => !IGNORAR_NA_CHECAGEM.includes(chave) && String(valor ?? '').trim() !== ''));
        if (!lotesPreenchidos.length) {
            pendencias.push({
                campo: 'lotes',
                label: 'Informe ao menos um lote em Lotes/Entrada — o parecer vem dele',
                aba: 'lotes'
            });
        }

        if (status === 'reprovado') {
            if (vazio(formData.defeito)) {
                pendencias.push({ campo: 'defeito', label: 'Defeito (obrigatório em ficha reprovada)', aba: 'identificacao' });
            }
            if (vazio(formData.observacao)) {
                pendencias.push({ campo: 'observacao', label: 'Observação (obrigatória em ficha reprovada)', aba: 'identificacao' });
            }
        }

        return pendencias;
    };

    const fecharFormularioSemSalvar = () => {
        setShowUnsavedConfirm(false);
        setShowModal(false);
        resetForm();
    };

    const solicitarFechamentoFormulario = () => {
        if (formDirty) setShowUnsavedConfirm(true);
        else fecharFormularioSemSalvar();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const pendencias = validarFormulario();
        if (pendencias.length > 0) {
            setErrosValidacao(pendencias);
            if (formViewMode === 'tabs') setActiveTab(pendencias[0].aba);
            formModalRef.current?.querySelector('.modal-body')?.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setErrosValidacao([]);

        try {
            /* Grava o status calculado, não o que estiver no formData. Assim a
               coluna do banco fica coerente com o que a tela mostra e o
               dashboard do backend, que agrupa por essa coluna, passa a
               refletir a nova regra sem precisar de alteração. */
            const statusFinal = calcularStatusFicha(formData.lotes);
            const reprovado = statusFinal === 'reprovado';
            const fotos = (formData.fotos_peca || []).slice(0, 3);
            /* fotos_peca é só estado de tela; o que vai ao banco são as colunas
               foto_peca / foto_peca_nome que já existiam. */
            const { fotos_peca: _fotos, ...camposFicha } = formData;

            const dados = {
                ...upperFields(camposFicha, [
                    'codigo', 'aplicacao', 'componente', 'setor', 'fornecedor', 'revisao_desenho'
                ]),
                lotes: (formData.lotes || []).map((lote) => upperFields(lote, [
                    'lote', 'num_nota_fiscal', 'amostragem', 'lote_fornecedor', 'inspetor', 'concessao'
                ])),
                dimensoes: (formData.dimensoes || []).map((dimensao) => upperFields(dimensao, [
                    'posicao', 'cota', 'instrumento'
                ])),
                resultados: normalizarResultados(formData.resultados).map((resultado) => ({
                    ...resultado,
                    linha: toUpper(resultado.linha)
                })),
                /* Defeito e fotos só fazem sentido em ficha reprovada; se o
                   inspetor mudar de reprovado para aprovado, são limpos. */
                status: statusFinal,
                defeito: reprovado ? formData.defeito : '',
                foto_peca: reprovado && fotos.length ? JSON.stringify(fotos.map(({ src }) => src)) : null,
                foto_peca_nome: reprovado && fotos.length ? JSON.stringify(fotos.map(({ nome }) => nome)) : null,
                inspetor: user?.nome || formData.inspetor || 'Sistema'
            };
            if (editingId) {
                await recebimentoAPI.update(editingId, dados);
            } else {
                await recebimentoAPI.create(dados);
            }
            setShowModal(false);
            resetForm();
            loadFichas();
        } catch (error) {
            console.error('Erro ao salvar ficha de recebimento:', error);
            alert('Erro ao salvar ficha de recebimento');
        }
    };

    const handleEdit = (ficha) => {
        setFormData({
            codigo: ficha.codigo || '',
            aplicacao: ficha.aplicacao || '',
            componente: ficha.componente || '',
            setor: ficha.setor || '',
            fornecedor: ficha.fornecedor || '',
            revisao_desenho: ficha.revisao_desenho || '',
            data_inspecao: normalizeISODate(ficha.data_inspecao || hoje()),
            status: ficha.status || 'pendente',
            observacao: ficha.observacao || '',
            defeito: ficha.defeito || '',
            fotos_peca: normalizarFotosPeca(ficha.foto_peca, ficha.foto_peca_nome),
            lotes: ficha.lotes?.length ? ficha.lotes : [linhaLoteVazia()],
            dimensoes: ficha.dimensoes?.length ? ficha.dimensoes : [linhaDimensaoVazia()],
            resultados: ficha.resultados?.length ? normalizarResultados(ficha.resultados) : [linhaResultadoVazia()]
        });
        setEditingId(ficha.id);
        setActiveTab('identificacao');
        setFormViewMode('tabs');
        setFormDirty(false);
        setErrosValidacao([]);
        setShowModal(true);
    };

    /* window.confirm dava lugar ao modal próprio, o mesmo padrão visual da
       Injeção, conforme pedido. */
    const confirmarExclusao = (ficha) => setDeleteConfirm(ficha);

    const executarExclusao = async () => {
        const ficha = deleteConfirm;
        setDeleteConfirm(null);
        if (!ficha) return;
        try {
            await recebimentoAPI.delete(ficha.id);
            loadFichas();
        } catch (error) {
            console.error('Erro ao excluir ficha de recebimento:', error);
            alert('Erro ao excluir ficha de recebimento');
        }
    };

    const formatarData = (d) => {
        if (!d) return '-';
        try {
            const [year, month, day] = d.split('-');
            if (!year || !month || !day) return '-';
            return `${day}/${month}/${year}`;
        } catch { return '-'; }
    };

    const getStatusClass = (status) => ({
        'aprovado': 'badge-success',
        'concessao': 'badge-info',
        'pendente': 'badge-warning',
        'reprovado': 'badge-danger'
    }[normalizarStatus(status)] || 'badge-warning');

    /* Ícone por status: no celular ele carrega a informação sozinho, já que o
       texto é reduzido via CSS. Mesmo par de classes usado na Injeção. */
    const getStatusIconClass = (status) => ({
        'aprovado': 'fa-check-circle',
        'concessao': 'fa-handshake',
        'pendente': 'fa-clock',
        'reprovado': 'fa-times-circle'
    }[normalizarStatus(status)] || 'fa-clock');

    const formatarStatus = (status) => {
        const chave = normalizarStatus(status);
        return (LABEL_STATUS[chave] || String(status || 'pendente')).toUpperCase();
    };

    /* Contagem por LINHA DE LOTE, não por ficha. Cada lote lançado tem a sua
       própria data de entrada e conta como um evento independente — é o que
       preserva o histórico quando um novo lote é acrescentado a uma ficha já
       existente, em vez de o resultado anterior ser sobrescrito.
       Respeita período e busca; ignora o filtro de status. */
    const resumoInspecoes = resumoFichas.reduce((resumo, ficha) => {
        const linhas = Array.isArray(ficha.lotes) ? ficha.lotes : [];
        /* Ficha sem lote lançado ainda conta como uma linha, senão ela
           desapareceria dos indicadores. */
        if (!linhas.length) {
            resumo.total += 1;
            resumo.pendentes += 1;
            return resumo;
        }
        linhas.forEach((lote) => {
            const status = statusDoLote(lote);
            resumo.total += 1;
            if (status === 'reprovado') resumo.reprovadas += 1;
            else if (status === 'concessao') resumo.concessoes += 1;
            else resumo.aprovadas += 1;
        });
        return resumo;
    }, { total: 0, aprovadas: 0, reprovadas: 0, concessoes: 0, pendentes: 0 });

    const ativarFiltroStatus = (status) => setStatusFilter((atual) => (atual === status ? '' : status));
    const acionarCardPorTeclado = (evento, status) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
            evento.preventDefault();
            if (status) ativarFiltroStatus(status); else setStatusFilter('');
        }
    };

    const periodoLabel = dateFilter && dateEndFilter
        ? `${formatDateBR(dateFilter)} até ${formatDateBR(dateEndFilter)}`
        : formatMonthLabel(monthFilter);

    const selecionarMes = (mes) => {
        setDateFilter('');
        setDateEndFilter('');
        setRangeStartDraft('');
        setRangeEndDraft('');
        setMonthFilter(mes);
        setShowPeriodMenu(false);
    };

    const aplicarIntervalo = () => {
        if (!rangeStartDraft && !rangeEndDraft) return;
        setDateFilter(rangeStartDraft || rangeEndDraft);
        setDateEndFilter(rangeEndDraft || rangeStartDraft);
        setShowPeriodMenu(false);
    };

    const limparFiltros = () => {
        setSearch('');
        setStatusFilter('');
        setDateFilter('');
        setDateEndFilter('');
        setRangeStartDraft('');
        setRangeEndDraft('');
        setMonthFilter(currentMonthISO());
        setShowPeriodMenu(false);
    };

    const temFiltroAtivo = Boolean(search || statusFilter || dateFilter || dateEndFilter
        || monthFilter !== currentMonthISO());

    /* ── Exportação Excel ─────────────────────────────────────────────────
       Exporta `fichas`, que já é o conjunto inteiro filtrado (loadFichas
       percorre todas as páginas da API). A paginação visual da tabela não
       limita a exportação. Colunas próprias do Recebimento. */
    const exportarExcel = async () => {
        if (!fichas.length) return;

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Mallory — Qualidade Industrial';
        const worksheet = workbook.addWorksheet('Inspeção de Recebimento', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });

        worksheet.columns = [
            { header: 'Data Inspeção', key: 'data', width: 14 },
            { header: 'Código', key: 'codigo', width: 16 },
            { header: 'Componente', key: 'componente', width: 34 },
            { header: 'Aplicação', key: 'aplicacao', width: 26 },
            { header: 'Fornecedor', key: 'fornecedor', width: 28 },
            { header: 'Setor', key: 'setor', width: 16 },
            { header: 'Rev. Desenho', key: 'revisao', width: 14 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Lotes', key: 'lotes', width: 26 },
            { header: 'Notas Fiscais', key: 'notas', width: 22 },
            { header: 'Qtd. Total', key: 'quant', width: 12 },
            /* Substitui as colunas numéricas C / SC / NC: agora cada lote tem
               um resultado único, então a contagem por classificação é mais
               informativa que somar quantidades que não existem mais. */
            { header: 'Conformes', key: 'conformes', width: 11 },
            { header: 'Não Conformes', key: 'naoConformes', width: 15 },
            { header: 'Sob Concessão', key: 'concessoes', width: 15 },
            { header: 'Resultado por Lote', key: 'resultados', width: 34 },
            { header: 'Cotas Medidas', key: 'cotas', width: 14 },
            { header: 'Defeito', key: 'defeito', width: 32 },
            { header: 'Observação', key: 'observacao', width: 40 },
            { header: 'Inspetor', key: 'inspetor', width: 22 }
        ];

        const somarLotes = (lotes, campo) => (lotes || [])
            .reduce((total, lote) => total + (Number(lote?.[campo]) || 0), 0);
        const contarPorStatus = (lotes, status) => (lotes || [])
            .filter((lote) => statusDoLote(lote) === status).length;
        const juntarLotes = (lotes, campo) => (lotes || [])
            .map((lote) => String(lote?.[campo] || '').trim())
            .filter(Boolean)
            .join(', ');
        const limparTexto = (valor) => String(valor || '').replace(/\r?\n+/g, ' ').trim();

        fichas.forEach((ficha) => {
            worksheet.addRow({
                data: formatDateBR(ficha.data_inspecao, ''),
                codigo: ficha.codigo || '',
                componente: ficha.componente || '',
                aplicacao: ficha.aplicacao || '',
                fornecedor: ficha.fornecedor || '',
                setor: ficha.setor || '',
                revisao: ficha.revisao_desenho || '',
                status: formatarStatus((ficha.lotes || []).length ? calcularStatusFicha(ficha.lotes) : 'pendente'),
                lotes: juntarLotes(ficha.lotes, 'lote'),
                notas: juntarLotes(ficha.lotes, 'num_nota_fiscal'),
                quant: somarLotes(ficha.lotes, 'quant_total'),
                conformes: contarPorStatus(ficha.lotes, 'aprovado'),
                naoConformes: contarPorStatus(ficha.lotes, 'reprovado'),
                concessoes: contarPorStatus(ficha.lotes, 'concessao'),
                resultados: (ficha.lotes || [])
                    .map((lote) => {
                        const opcao = RESULTADOS_LOTE.find((o) => o.valor === resultadoDoLote(lote));
                        const identificacao = String(lote?.lote || '').trim();
                        return identificacao ? `${identificacao}: ${opcao.label}` : opcao.label;
                    })
                    .join(' | '),
                cotas: (ficha.dimensoes || []).filter((d) => String(d?.cota || '').trim()).length,
                defeito: limparTexto(ficha.defeito),
                observacao: limparTexto(ficha.observacao),
                inspetor: ficha.inspetor || ''
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
        ['quant', 'conformes', 'naoConformes', 'concessoes', 'cotas'].forEach((key) => {
            const coluna = worksheet.getColumn(key);
            coluna.alignment = { horizontal: 'center' };
        });
        worksheet.getColumn('status').alignment = { horizontal: 'center' };

        const buffer = await workbook.xlsx.writeBuffer();
        const url = URL.createObjectURL(new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }));
        const link = document.createElement('a');
        const sufixo = dateFilter && dateEndFilter ? `${dateFilter}_a_${dateEndFilter}` : monthFilter;
        link.href = url;
        link.download = `inspecao-recebimento-${sufixo}.xlsx`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const colunasIdentificacao = [
        { id: 'codigo', label: 'Código', upper: true, required: true },
        { id: 'aplicacao', label: 'Aplicação' },
        { id: 'componente', label: 'Componente' },
        { id: 'setor', label: 'Setor' },
        { id: 'fornecedor', label: 'Fornecedor' },
        { id: 'revisao_desenho', label: 'Revisão do Desenho' }
    ];

    /* Status vem dos lotes, não do campo. Defeito e fotos aparecem quando o
       cálculo resulta em Reprovado. */
    const statusCalculado = calcularStatusFicha(formData.lotes);
    const reprovado = statusCalculado === 'reprovado';

    const tabs = [
        { id: 'identificacao', icon: 'fa-id-card', label: 'Identificação' },
        { id: 'lotes', icon: 'fa-boxes-stacked', label: 'Lotes' },
        { id: 'dimensoes', icon: 'fa-ruler-combined', label: 'Dimensões' },
        { id: 'resultados', icon: 'fa-table-list', label: 'Resultados' },
        /* Antes chamava-se "Observação" e só tinha o campo de texto. O status
           não existia no formulário — ficava sempre "pendente", o que
           impossibilitava a decisão exigida no item 4. Agora concentra o
           parecer: status, defeito, observação e evidências. */
        { id: 'observacao', icon: 'fa-clipboard-check', label: 'Parecer' }
    ];

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Registro' }, { label: 'Inspeção de Recebimento' }]}
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-clipboard-check"></i> Ficha de Inspeção de Recebimento</h1>
                        <p>Inspeção de recebimento de materiais — identificação, lotes, dimensões e resultados</p>
                    </div>
                    <div className="header-actions recebimento-filters">
                        <input
                            type="text"
                            className="form-control recebimento-search"
                            placeholder="Buscar por código, componente, fornecedor, lote, nota..."
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

                        {temFiltroAtivo && (
                            <button type="button" className="shift-filter-button" onClick={limparFiltros}
                                title="Limpar todos os filtros">
                                <i className="fas fa-eraser" aria-hidden="true"></i>
                                <span className="filter-label">Limpar</span>
                            </button>
                        )}

                        <button
                            type="button"
                            className="btn btn-success btn-sm export-excel-button"
                            onClick={exportarExcel}
                            disabled={loading || fichas.length === 0}
                            title="Exportar as fichas filtradas para Excel"
                        >
                            <i className="fas fa-file-excel" aria-hidden="true"></i>
                            <span className="filter-label">Exportar Excel</span>
                        </button>

                        <button className="btn btn-primary btn-sm new-inspection-button"
                            onClick={() => { resetForm(); setShowModal(true); }}>
                            <i className="fas fa-plus" aria-hidden="true"></i>
                            <span className="filter-label">Nova Ficha</span>
                        </button>
                    </div>
                </div>

                {/* Cards de indicadores: contam o período e a busca, não o status */}
                <section className="recebimento-summary" aria-label="Resumo das fichas de recebimento">
                    <article className={`recebimento-summary-card filter-card total ${!statusFilter ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={!statusFilter}
                        onClick={() => setStatusFilter('')} onKeyDown={(e) => acionarCardPorTeclado(e, '')}>
                        <div className="recebimento-summary-heading"><i className="fas fa-clipboard-list" aria-hidden="true"></i><span>Total de lotes</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.total}</strong>
                        <span className="recebimento-summary-line" aria-hidden="true"></span>
                    </article>
                    <article className={`recebimento-summary-card filter-card approved ${statusFilter === 'aprovado' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'aprovado'}
                        onClick={() => ativarFiltroStatus('aprovado')} onKeyDown={(e) => acionarCardPorTeclado(e, 'aprovado')}>
                        <div className="recebimento-summary-heading"><i className="fas fa-check-circle" aria-hidden="true"></i><span>Aprovados</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.aprovadas}</strong>
                        <span className="recebimento-summary-line" aria-hidden="true"></span>
                    </article>
                    <article className={`recebimento-summary-card filter-card rejected ${statusFilter === 'reprovado' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'reprovado'}
                        onClick={() => ativarFiltroStatus('reprovado')} onKeyDown={(e) => acionarCardPorTeclado(e, 'reprovado')}>
                        <div className="recebimento-summary-heading"><i className="fas fa-times-circle" aria-hidden="true"></i><span>Reprovados</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.reprovadas}</strong>
                        <span className="recebimento-summary-line" aria-hidden="true"></span>
                    </article>
                    {/* Substitui o card Pendentes: com o status calculado a partir dos
                        lotes, "pendente" deixou de ser um resultado possível. */}
                    <article className={`recebimento-summary-card filter-card concession ${statusFilter === 'concessao' ? 'active' : ''}`}
                        role="button" tabIndex="0" aria-pressed={statusFilter === 'concessao'}
                        onClick={() => ativarFiltroStatus('concessao')} onKeyDown={(e) => acionarCardPorTeclado(e, 'concessao')}>
                        <div className="recebimento-summary-heading"><i className="fas fa-handshake" aria-hidden="true"></i><span>Sob concessão</span></div>
                        <strong>{loading ? '—' : resumoInspecoes.concessoes}</strong>
                        <span className="recebimento-summary-line" aria-hidden="true"></span>
                    </article>
                </section>

                <div className="table-card">
                    <div className="table-container">
                        <table className="table tabela-recebimento">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Componente</th>
                                    <th>Fornecedor</th>
                                    <th>Setor</th>
                                    <th>Data Inspeção</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center' }}>Carregando...</td></tr>
                                ) : fichas.length === 0 ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center' }}>Nenhuma ficha encontrada</td></tr>
                                ) : (
                                    fichas.map((f) => (
                                        <tr key={f.id}>
                                            <td>{f.codigo || '-'}</td>
                                            <td>{f.componente || '-'}</td>
                                            <td>{f.fornecedor || '-'}</td>
                                            <td>{f.setor || '-'}</td>
                                            <td>{formatarData(f.data_inspecao)}</td>
                                            <td>
                                                {/* Status derivado dos lotes, não a coluna gravada.
                                                    Ícone + texto no desktop; no celular o CSS reduz ao ícone. */}
                                                {(() => {
                                                    const st = (f.lotes || []).length ? calcularStatusFicha(f.lotes) : 'pendente';
                                                    return (
                                                        <span className={`badge status-badge ${getStatusClass(st)}`} title={formatarStatus(st)}>
                                                            <i className={`fas ${getStatusIconClass(st)}`} aria-hidden="true"></i>
                                                            <span className="status-text">{formatarStatus(st)}</span>
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td>
                                                <div className="acoes" style={{ display: 'flex', gap: '6px' }}>
                                                    <button className="btn-icon btn-edit" title="Editar" onClick={() => handleEdit(f)}>
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button className="btn-icon btn-delete" title="Excluir" onClick={() => confirmarExclusao(f)}>
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

                {/* createPortal: tira o modal de dentro do main-content, que tem
                    max-width e transform — a causa de modal descentralizado.
                    Mesmo tratamento da Injeção. */}
                {showModal && createPortal(
                    <div className="modal-overlay" onClick={solicitarFechamentoFormulario}>
                        <div ref={formModalRef} className="modal-content modal-large inspection-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Editar' : 'Nova'} Ficha de Inspeção de Recebimento</h2>
                                <button className="modal-close" onClick={solicitarFechamentoFormulario}>
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

                            {/* noValidate: a validação nativa não foca campo em aba
                                oculta e abortaria o submit sem mensagem */}
                            <form onSubmit={handleSubmit} onChange={() => setFormDirty(true)} noValidate>
                                <div className="modal-body">
                                    {errosValidacao.length > 0 && (
                                        <div className="validacao-alerta" role="alert">
                                            <div className="validacao-alerta-topo">
                                                <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
                                                <strong>
                                                    {errosValidacao.length === 1
                                                        ? 'Falta preencher 1 item antes de salvar'
                                                        : `Faltam preencher ${errosValidacao.length} itens antes de salvar`}
                                                </strong>
                                                <button type="button" onClick={() => setErrosValidacao([])} aria-label="Fechar aviso">
                                                    <i className="fas fa-times" aria-hidden="true"></i>
                                                </button>
                                            </div>
                                            <ul>
                                                {errosValidacao.map((item) => (
                                                    <li key={item.campo}>
                                                        {formViewMode === 'tabs'
                                                            ? <button type="button" onClick={() => setActiveTab(item.aba)}>{item.label}</button>
                                                            : item.label}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    <div className="ficha-band">Ficha de Inspeção de Recebimento</div>

                                    {/* Identificação do material */}
                                    {(formViewMode === 'geral' || activeTab === 'identificacao') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                        <h3 className="section-title">Identificação do Material</h3>
                                        <div className="form-row">
                                            {colunasIdentificacao.map((c) => (
                                                <div className="form-group" key={c.id}>
                                                    <label>{c.label}{c.required ? ' *' : ''}</label>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        value={formData[c.id]}
                                                        onChange={(e) => setCampo(c.id, c.upper ? e.target.value.toUpperCase() : e.target.value)}
                                                        required={c.required}
                                                    />
                                                </div>
                                            ))}
                                            <div className="form-group">
                                                <label>Data Inspeção</label>
                                                <input type="date" className="form-control" value={formData.data_inspecao}
                                                    onChange={(e) => setCampo('data_inspecao', e.target.value)} />
                                            </div>
                                            {/* O Status ficava aqui e passou para a aba Parecer, no fim do
                                                formulário: a decisão é a última etapa da inspeção, e manter
                                                dois selects do mesmo campo confundia. */}
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {/* Lotes / Entrada */}
                                    {(formViewMode === 'geral' || activeTab === 'lotes') && (
                                        <div className="tab-content active">
                                            <div className="form-section ficha-subsection">
                                        <div className="ficha-subsection-title">
                                            <h4>Lotes / Entrada</h4>
                                            <button type="button" className="btn-row-add" onClick={addLote}>
                                                <i className="fas fa-plus"></i> Adicionar lote
                                            </button>
                                        </div>
                                        <div className="ficha-scroll">
                                            <table className="ficha-table">
                                                <thead>
                                                    <tr>
                                                        <th>Lote</th>
                                                        <th>Data Entrada</th>
                                                        <th>Data Saída</th>
                                                        <th>N. Nota Fiscal</th>
                                                        <th>Quant. Total</th>
                                                        <th className="col-resultado">Resultado</th>
                                                        <th>Amostragem</th>
                                                        <th>Lote Fornecedor</th>
                                                        <th>Inspetor</th>
                                                        <th>Concessão</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {formData.lotes.map((l, i) => (
                                                        <tr key={i}>
                                                            <td><input type="text" className="field-upper" value={l.lote} onChange={(e) => updateLote(i, 'lote', e.target.value)} /></td>
                                                            <td><input type="date" value={l.data_entrada} onChange={(e) => updateLote(i, 'data_entrada', e.target.value)} /></td>
                                                            <td><input type="date" value={l.data_saida} onChange={(e) => updateLote(i, 'data_saida', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.num_nota_fiscal} onChange={(e) => updateLote(i, 'num_nota_fiscal', e.target.value)} /></td>
                                                            <td><input value={l.quant_total} onChange={(e) => updateLote(i, 'quant_total', e.target.value)} /></td>
                                                            {/* Campo único que alimenta o status da ficha e as
                                                                contagens do dashboard. resultadoDoLote resolve o
                                                                valor a exibir para lotes antigos, que ainda
                                                                guardam as quantidades de C/SC/NC. */}
                                                            <td className="col-resultado">
                                                                <select
                                                                    className={`select-resultado resultado-${statusDoLote(l)}`}
                                                                    value={resultadoDoLote(l)}
                                                                    onChange={(e) => updateLote(i, 'resultado', e.target.value)}
                                                                >
                                                                    {RESULTADOS_LOTE.map((opcao) => (
                                                                        <option key={opcao.valor} value={opcao.valor}>{opcao.label}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td><input type="text" className="field-upper" value={l.amostragem} onChange={(e) => updateLote(i, 'amostragem', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.lote_fornecedor} onChange={(e) => updateLote(i, 'lote_fornecedor', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.inspetor} onChange={(e) => updateLote(i, 'inspetor', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={l.concessao} onChange={(e) => updateLote(i, 'concessao', e.target.value)} /></td>
                                                            <td>
                                                                <button type="button" className="btn-row-del" title="Remover" onClick={() => removeLote(i)} disabled={formData.lotes.length === 1}>
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {/* Dimensões funcionais */}
                                    {(formViewMode === 'geral' || activeTab === 'dimensoes') && (
                                        <div className="tab-content active">
                                            <div className="form-section ficha-subsection">
                                        <div className="ficha-subsection-title">
                                            <h4>Dimensões Funcionais</h4>
                                            <button type="button" className="btn-row-add" onClick={addDimensao}>
                                                <i className="fas fa-plus"></i> Adicionar posição
                                            </button>
                                        </div>
                                        <div className="ficha-scroll">
                                            <table className="ficha-table">
                                                <thead>
                                                    <tr>
                                                        <th>Posição</th>
                                                        <th>Cota</th>
                                                        <th>Instrumento</th>
                                                        <th>Observações</th>
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {formData.dimensoes.map((d, i) => (
                                                        <tr key={i}>
                                                            <td>
                                                                {/* Marcador de característica especial: aparece só
                                                                    quando há posição informada. Renderização
                                                                    condicional, não CSS — assim o SVG nem existe no
                                                                    DOM enquanto o campo está vazio e não reserva
                                                                    espaço. */}
                                                                <div className={String(d.posicao || '').trim() !== ''
                                                                    ? 'posicao-cell com-marcador' : 'posicao-cell'}>
                                                                    <input type="text" className="field-upper" value={d.posicao}
                                                                        onChange={(e) => updateDimensao(i, 'posicao', e.target.value)} />
                                                                    {String(d.posicao || '').trim() !== '' && (
                                                                        <MarcadorPosicao />
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td><input type="text" className="field-upper" value={d.cota} onChange={(e) => updateDimensao(i, 'cota', e.target.value)} /></td>
                                                            <td><input type="text" className="field-upper" value={d.instrumento} onChange={(e) => updateDimensao(i, 'instrumento', e.target.value)} /></td>
                                                            <td><input value={d.observacoes} onChange={(e) => updateDimensao(i, 'observacoes', e.target.value)} /></td>
                                                            <td>
                                                                <button type="button" className="btn-row-del" title="Remover" onClick={() => removeDimensao(i)} disabled={formData.dimensoes.length === 1}>
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {/* Resultados (matriz de amostras) */}
                                    {(formViewMode === 'geral' || activeTab === 'resultados') && (
                                        <div className="tab-content active">
                                            <div className="form-section ficha-subsection">
                                        <div className="ficha-subsection-title">
                                            <h4>Resultados</h4>
                                            <button type="button" className="btn-row-add" onClick={addResultado}>
                                                <i className="fas fa-plus"></i> Adicionar linha
                                            </button>
                                        </div>
                                        <div className="ficha-scroll">
                                            <table className="ficha-table">
                                                <thead>
                                                    <tr>
                                                        <th>Lote / Posição</th>
                                                        {Array.from({ length: NUM_AMOSTRAS }, (_, i) => (
                                                            <th key={i} colSpan="2" className="col-num">{i + 1}</th>
                                                        ))}
                                                        <th></th>
                                                    </tr>
                                                    <tr>
                                                        <th></th>
                                                        {Array.from({ length: NUM_AMOSTRAS }, (_, i) => (
                                                            <Fragment key={i}>
                                                                <th className="col-num">Val</th>
                                                                <th className="col-d">D</th>
                                                            </Fragment>
                                                        ))}
                                                        <th></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {formData.resultados.map((r, rowIdx) => (
                                                        <tr key={rowIdx}>
                                                            <td><input type="text" className="field-upper" value={r.linha} onChange={(e) => updateResultadoLinha(rowIdx, e.target.value)} placeholder="Ex: Lote 1" /></td>
                                                            {r.valores.map((c, colIdx) => (
                                                                <Fragment key={colIdx}>
                                                                    <td className="col-num">
                                                                        <input value={c.v} onChange={(e) => updateResultadoValor(rowIdx, colIdx, 'v', e.target.value)} />
                                                                    </td>
                                                                    <td className="col-d">
                                                                        <input value={c.d} onChange={(e) => updateResultadoValor(rowIdx, colIdx, 'd', e.target.value)} />
                                                                    </td>
                                                                </Fragment>
                                                            ))}
                                                            <td>
                                                                <button type="button" className="btn-row-del" title="Remover" onClick={() => removeResultado(rowIdx)} disabled={formData.resultados.length === 1}>
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                        </div>
                                    )}

                                    {/* Observação */}
                                    {(formViewMode === 'geral' || activeTab === 'observacao') && (
                                        <div className="tab-content active">
                                            <div className="form-section">
                                                <h3 className="section-title">Parecer da Inspeção</h3>
                                                {/* Status e Observação na mesma linha; o select é estreito e
                                                    a observação aproveita a largura restante. */}
                                                <div className="parecer-row">
                                                    <div className="form-group">
                                                        <label>Status</label>
                                                        {/* Somente leitura: o valor vem dos pareceres NC e SC
                                                            lançados em Lotes/Entrada. */}
                                                        <div className={`status-calculado ${getStatusClass(statusCalculado)}`}>
                                                            <i className={`fas ${getStatusIconClass(statusCalculado)}`} aria-hidden="true"></i>
                                                            <span>{LABEL_STATUS[statusCalculado]}</span>
                                                        </div>
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Observação{reprovado ? ' *' : ''}</label>
                                                        <textarea className="form-control" rows="2" value={formData.observacao}
                                                            onChange={(e) => setCampo('observacao', e.target.value)}></textarea>
                                                    </div>
                                                </div>

                                                {reprovado && (
                                                    <div className="form-group">
                                                        <label>Defeito *</label>
                                                        <textarea className="form-control" rows="2"
                                                            placeholder="Descreva o defeito encontrado no material"
                                                            value={formData.defeito}
                                                            onChange={(e) => setCampo('defeito', e.target.value)}></textarea>
                                                    </div>
                                                )}

                                                {reprovado && (
                                                    <div className="injecao-photo-field" style={{ gridColumn: '1 / -1' }}>
                                                        <div className="injecao-photo-header">
                                                            <div>
                                                                <strong><i className="fas fa-camera"></i> Fotos do material reprovado</strong>
                                                                <small>Registre até três evidências visuais do defeito.</small>
                                                            </div>
                                                            <div className="injecao-photo-actions">
                                                                <span className="info-text">Fotos: {(formData.fotos_peca || []).length}/3</span>
                                                                <label className={`btn btn-secondary btn-sm ${(formData.fotos_peca || []).length >= 3 ? 'disabled' : ''}`}>
                                                                    <i className="fas fa-camera"></i> Tirar foto
                                                                    {/* capture=environment abre a câmera traseira no celular */}
                                                                    <input
                                                                        ref={fotoPecaInputRef}
                                                                        type="file"
                                                                        accept="image/*"
                                                                        capture="environment"
                                                                        multiple
                                                                        hidden
                                                                        onChange={handleFotoPecaChange}
                                                                        disabled={(formData.fotos_peca || []).length >= 3}
                                                                    />
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {(formData.fotos_peca || []).length > 0 ? (
                                                            <div className="injecao-photo-preview-grid">
                                                                {(formData.fotos_peca || []).map((foto, index) => (
                                                                    <div className="injecao-photo-preview" key={`${foto.nome}-${index}`}>
                                                                        <img src={foto.src} alt={foto.nome}
                                                                            style={{ cursor: 'zoom-in' }}
                                                                            onClick={() => abrirLightbox(formData.fotos_peca, index)} />
                                                                        <span>{foto.nome}</span>
                                                                        <button type="button" title="Remover foto"
                                                                            onClick={() => removerFotoPeca(index)}>
                                                                            <i className="fas fa-times"></i>
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <label className="injecao-photo-empty">
                                                                <i className="fas fa-image"></i> Nenhuma foto adicionada
                                                                <input type="file" accept="image/*" capture="environment" multiple hidden
                                                                    onChange={handleFotoPecaChange} />
                                                            </label>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={solicitarFechamentoFormulario}>Cancelar</button>
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-save"></i> {editingId ? 'Atualizar' : 'Salvar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Alterações não salvas — mesmo padrão visual da Injeção */}
                {showUnsavedConfirm && createPortal(
                    <div className="unsaved-confirm-overlay" onClick={() => setShowUnsavedConfirm(false)}>
                        <div className="unsaved-confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                            <div className="unsaved-confirm-icon"><i className="fas fa-exclamation-triangle"></i></div>
                            <div className="unsaved-confirm-copy">
                                <h2>Alterações não salvas</h2>
                                <p>Você possui alterações que ainda não foram salvas. Deseja realmente sair?</p>
                            </div>
                            <div className="unsaved-confirm-actions">
                                <button type="button" className="btn-confirm-cancel" onClick={() => setShowUnsavedConfirm(false)}>
                                    Continuar editando
                                </button>
                                <button type="button" className="btn-confirm-leave" onClick={fecharFormularioSemSalvar}>
                                    Sair sem salvar
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Exclusão: substitui o window.confirm nativo */}
                {deleteConfirm && createPortal(
                    <div className="unsaved-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
                        <div className="unsaved-confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                            <div className="unsaved-confirm-icon"
                                style={{ color: '#ef4444', background: 'rgba(239,68,68,.14)', borderColor: 'rgba(239,68,68,.35)' }}>
                                <i className="fas fa-trash"></i>
                            </div>
                            <div className="unsaved-confirm-copy">
                                <h2>Excluir ficha</h2>
                                <p>
                                    A ficha <strong>{deleteConfirm.codigo || 'sem código'}</strong>
                                    {deleteConfirm.componente ? ` — ${deleteConfirm.componente}` : ''} será excluída
                                    definitivamente. Essa ação não pode ser desfeita.
                                </p>
                            </div>
                            <div className="unsaved-confirm-actions">
                                <button type="button" className="btn-confirm-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                                <button type="button" className="btn-confirm-leave" onClick={executarExclusao}>Excluir</button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {/* Visualizador ampliado com zoom e carrossel */}
                {lightbox && createPortal(
                    <div className="lightbox-overlay" onClick={fecharLightbox} role="dialog" aria-modal="true"
                        aria-label="Visualizar foto ampliada">
                        <div className="lightbox-controls-top">
                            <span className="lightbox-counter">{lightbox.index + 1} / {lightbox.fotos.length}</span>
                            <div className="lightbox-zoom-controls">
                                <button type="button" onClick={(e) => { e.stopPropagation(); lbAplicarZoom(lbZoom - 0.25); }}
                                    aria-label="Reduzir zoom"><i className="fas fa-minus"></i></button>
                                <span className="lightbox-zoom-level">{Math.round(lbZoom * 100)}%</span>
                                <button type="button" onClick={(e) => { e.stopPropagation(); lbAplicarZoom(lbZoom + 0.25); }}
                                    aria-label="Ampliar zoom"><i className="fas fa-plus"></i></button>
                            </div>
                            <button type="button" className="lightbox-close" onClick={fecharLightbox}
                                aria-label="Fechar" title="Fechar (Esc)"><i className="fas fa-times"></i></button>
                        </div>
                        {lightbox.fotos.length > 1 && (
                            <>
                                <button type="button" className="lightbox-nav lightbox-prev"
                                    onClick={(e) => { e.stopPropagation(); lbNavegar(-1); }} aria-label="Foto anterior">
                                    <i className="fas fa-chevron-left"></i>
                                </button>
                                <button type="button" className="lightbox-nav lightbox-next"
                                    onClick={(e) => { e.stopPropagation(); lbNavegar(1); }} aria-label="Próxima foto">
                                    <i className="fas fa-chevron-right"></i>
                                </button>
                            </>
                        )}
                        <div className="lightbox-image-wrapper" onClick={(e) => e.stopPropagation()}
                            onWheel={handleLbWheel}
                            onPointerDown={handleLbPointerDown} onPointerMove={handleLbPointerMove}
                            onPointerUp={handleLbPointerUp} onPointerLeave={handleLbPointerUp}
                            onTouchStart={handleLbTouchStart} onTouchMove={handleLbTouchMove} onTouchEnd={handleLbTouchEnd}
                            onDoubleClick={lbToggleZoom}>
                            <img
                                src={lightbox.fotos[lightbox.index]?.src}
                                alt={lightbox.fotos[lightbox.index]?.nome || 'Foto ampliada'}
                                className="lightbox-image" draggable={false}
                                style={{
                                    transform: `translate(${lbPos.x}px, ${lbPos.y}px) scale(${lbZoom})`,
                                    cursor: lbZoom > 1 ? 'grab' : 'zoom-in'
                                }}
                            />
                        </div>
                        <div className="lightbox-caption">
                            {lightbox.fotos[lightbox.index]?.nome || `Foto ${lightbox.index + 1}`}
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </AppLayout>
    );
}
