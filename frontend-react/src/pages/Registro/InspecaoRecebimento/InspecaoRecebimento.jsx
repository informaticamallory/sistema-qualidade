import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ExcelJS from 'exceljs';
import AppLayout from '../../../components/Layout/AppLayout';
import { Tabs, ConfirmarSaida, MobileActionSheet } from '../../../components/ui';
import { materiaisAPI, revisoesAPI, inspecoesRecebimentoAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { upperFields } from '../../../utils/text';
import { currentMonthISO, formatDateBR, formatMonthLabel, monthRangeISO, previousMonthISO } from '../../../utils/date';
import './InspecaoRecebimento.css';

/* Inspeção de Recebimento.

   Registra a inspeção de um lote contra uma revisão de desenho já cadastrada.
   O que se mede vem do cadastro (Cadastro de Material), não é digitado aqui:
   escolher a revisão pré-carrega as posições na aba de Resultados. */

const STATUS_LABEL = {
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
    pendente: 'Pendente'
};

/* As mesmas classes de badge da Inspecao de Injecao, definidas no UI Kit.
   Antes esta tela tinha `.badge.status-*` proprio, com as cores repetidas. */
const STATUS_BADGE = {
    aprovado: 'badge-success',
    reprovado: 'badge-danger',
    pendente: 'badge-warning'
};

const hoje = () => new Date().toISOString().slice(0, 10);

const formVazio = () => ({
    material_id: null,
    revisao_id: '',
    codigo_sap: '',
    componente: '',
    fornecedor: '',
    lote: '',
    data_entrada: '',
    data_inspecao: hoje(),
    nota_fiscal: '',
    quantidade_total: '',
    observacao: '',
    /* Vazio de propósito: o inspetor tem de concluir explicitamente, e não
       herdar um padrão que passaria batido. */
    status: ''
});

const loteVazio = () => ({ lote: '', nota_fiscal: '', quantidade_total: '' });

/* Delega ao utilitário compartilhado: ele extrai a data por regex e ignora a
   parte de hora. O `split('-').reverse()` daqui só funcionava com colunas de
   data pura — num datetime ISO devolveria "14T12:57:44.000Z/09/2026". */
const formatarData = (iso) => formatDateBR(iso, '—');

export default function InspecaoRecebimento() {
    const { user } = useAuth();

    const [inspecoes, setInspecoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('todos');

    /* ── Filtro de período ──
       Mesmo painel das telas de Injeção e Montagem, filtrando pela data da
       inspeção. A filtragem é no cliente, sobre a lista já carregada, como o
       status e a busca que já existiam aqui — nenhum contrato de API muda. */
    const [monthFilter, setMonthFilter] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [dateEndFilter, setDateEndFilter] = useState('');
    const [rangeStartDraft, setRangeStartDraft] = useState('');
    const [rangeEndDraft, setRangeEndDraft] = useState('');
    const [showPeriodMenu, setShowPeriodMenu] = useState(false);
    const periodMenuRef = useRef(null);
    const [exportando, setExportando] = useState(false);

    const [modalAberto, setModalAberto] = useState(false);
    const [activeTab, setActiveTab] = useState('identificacao');
    /* 'tabs' | 'geral' — mesmo alternador das telas de Injeção e Montagem. */
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [formData, setFormData] = useState(formVazio());
    const [resultados, setResultados] = useState([]);
    const [revisoesDisponiveis, setRevisoesDisponiveis] = useState([]);
    const [editandoId, setEditandoId] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [alerta, setAlerta] = useState('');
    /* Erro do status final fica junto do próprio campo, além do alerta no topo:
       na aba de Resultados o campo pode estar abaixo de nove cards. */
    const [erroStatusFinal, setErroStatusFinal] = useState('');
    /* Alteracoes pendentes: marcadas nas funcoes que mudam o formulario, e nao
       campo por campo, para nenhum campo novo escapar por esquecimento. */
    const [formDirty, setFormDirty] = useState(false);
    const [confirmarSaida, setConfirmarSaida] = useState(false);
    /* Desenho tecnico da revisao escolhida. Vem do cadastro, e serve de
       referencia enquanto o inspetor mede -- por isso vive fora do formData:
       nao e um campo da inspecao, e sim um dado da revisao. */
    const [linkDesenho, setLinkDesenho] = useState('');
    /* Fornecedores ja usados neste material. Vem do historico de inspecoes,
       nao de um cadastro: quem aparece aqui e quem ja entregou a peca. */
    const [fornecedoresDoMaterial, setFornecedoresDoMaterial] = useState([]);
    const [fornecedoresAbertos, setFornecedoresAbertos] = useState(false);
    /* Quais posições estão abertas, por chave. Mapa e não índice único porque
       o inspetor pode manter várias abertas ao mesmo tempo — comparar duas
       cotas é caso comum. Todas começam fechadas. */
    const [posicoesAbertas, setPosicoesAbertas] = useState({});
    /* Lotes da inspeção. Lista e não campos soltos: a mesma entrega pode vir
       em notas diferentes. Começa com uma linha, que é o caso comum. */
    const [lotes, setLotes] = useState([loteVazio()]);

    /* Visualização somente leitura, no padrão da Injeção e da Montagem.
       Estado próprio, e não o formulário com os campos travados: em leitura
       cabe mostrar lotes e cotas de uma vez, sem abas nem alternador. */
    const [viewAberto, setViewAberto] = useState(false);
    const [viewDados, setViewDados] = useState(null);
    const [viewCarregando, setViewCarregando] = useState(false);

    /* Linha tocada no celular: abre a folha de ações no lugar dos ícones da
       coluna, que abaixo de 1024px fica escondida. */
    const [sheetItem, setSheetItem] = useState(null);

    /* Só abre onde a coluna de ações está escondida. Acima disso os ícones
       estão à vista e o clique na linha não deve fazer nada. */
    const aoClicarNaLinha = (inspecao) => {
        if (typeof window === 'undefined') return;
        if (!window.matchMedia('(max-width: 1024px)').matches) return;
        setSheetItem(inspecao);
    };

    /* Autocomplete de material */
    const [sugestoes, setSugestoes] = useState([]);
    const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
    const debounceRef = useRef(null);
    const focarNovoLoteRef = useRef(false);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro('');
        try {
            const todas = [];
            let page = 1;
            let pages = 1;
            do {
                const resp = await inspecoesRecebimentoAPI.getAll({ page, limit: 100 });
                const dados = resp.data?.data || resp.data || {};
                todas.push(...(dados.inspecoes || []));
                pages = dados.pages || 1;
                page += 1;
            } while (page <= pages);
            setInspecoes(todas);
        } catch (e) {
            setErro(e.response?.data?.message || 'Não foi possível carregar as inspeções');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

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

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    /* Foco no campo Lote da linha recém-adicionada. */
    useEffect(() => {
        if (!focarNovoLoteRef.current) return;
        focarNovoLoteRef.current = false;
        document.getElementById(`lote-${lotes.length - 1}`)?.focus();
    }, [lotes.length]);

    /* Fechar a aba ou recarregar tambem e saida: o navegador mostra o proprio
       aviso, que o dialogo do sistema nao alcanca. */
    useEffect(() => {
        if (!modalAberto || !formDirty) return undefined;
        const proteger = (evento) => { evento.preventDefault(); evento.returnValue = ''; };
        window.addEventListener('beforeunload', proteger);
        return () => window.removeEventListener('beforeunload', proteger);
    }, [modalAberto, formDirty]);

    const setCampo = (campo, valor) => {
        setFormData((prev) => ({ ...prev, [campo]: valor }));
        setFormDirty(true);
    };

    const fecharModal = () => {
        setModalAberto(false);
        setFormDirty(false);
        setConfirmarSaida(false);
    };

    /* Unico caminho de fechamento: o X, o Cancelar, o clique no fundo e o Esc
       passam por aqui, senao um deles descartaria a medicao em silencio. */
    const solicitarFechamento = () => {
        if (formDirty) {
            setConfirmarSaida(true);
            return;
        }
        fecharModal();
    };

    /* ── Autocomplete de material ── */
    const buscarMateriais = (termo) => {
        clearTimeout(debounceRef.current);
        if (!termo.trim()) { setSugestoes([]); setSugestoesAbertas(false); return; }
        debounceRef.current = setTimeout(async () => {
            try {
                const resp = await materiaisAPI.search(termo.trim());
                const dados = resp.data?.data || resp.data || {};
                setSugestoes(dados.materiais || []);
                setSugestoesAbertas(true);
            } catch {
                setSugestoes([]);
            }
        }, 300);
    };

    const selecionarMaterial = (material) => {
        const revisoes = material.revisoes || [];
        setFormData((prev) => ({
            ...prev,
            material_id: material.id,
            codigo_sap: material.codigo_sap,
            componente: material.componente || '',
            /* Herdado do cadastro, mas o campo segue editável: o mesmo item
               pode chegar de outro fornecedor. */
            fornecedor: material.fornecedor || '',
            revisao_id: ''
        }));
        setRevisoesDisponiveis(revisoes);
        setResultados([]);
        /* Material novo, revisao ainda nao escolhida: o desenho do anterior
           nao vale mais. */
        setLinkDesenho('');
        carregarFornecedores(material.id);
        setSugestoesAbertas(false);
        setFormDirty(true);
        setAlerta(revisoes.length ? '' : 'Este material ainda não tem revisão de desenho cadastrada.');
    };

    /* Lista de sugestoes do material. Falha em silencio de proposito: sem
       sugestao o campo continua aceitando digitacao, que e o caminho normal
       para um fornecedor novo. */
    const carregarFornecedores = async (materialId) => {
        if (!materialId) { setFornecedoresDoMaterial([]); return; }
        try {
            const resp = await materiaisAPI.getFornecedores(materialId);
            const dados = resp.data?.data || resp.data || {};
            setFornecedoresDoMaterial(dados.fornecedores || []);
        } catch {
            setFornecedoresDoMaterial([]);
        }
    };

    /* ── Revisão escolhida: as posições viram as linhas de Resultados ── */
    const selecionarRevisao = async (revId) => {
        setCampo('revisao_id', revId);
        setResultados([]);
        setLinkDesenho('');
        if (!revId) return;
        try {
            const resp = await revisoesAPI.getPosicoes(revId);
            const dados = resp.data?.data || resp.data || {};
            const posicoes = dados.posicoes || [];
            setResultados(posicoes.map((p) => ({
                posicao_revisao_id: p.id,
                posicao: p.posicao,
                cota_nominal: p.cota,
                instrumento: p.instrumento,
                observacoes_cota: p.observacoes,
                valor_medido: '',
                observacao: '',
                status: ''
            })));
            /* Chega junto das cotas, na mesma resposta. */
            setLinkDesenho(dados.link_desenho || '');
            /* Posições novas, nenhuma aberta: as chaves antigas não valem mais. */
            setPosicoesAbertas({});
            setAlerta(posicoes.length ? '' : 'A revisão selecionada não tem posições cadastradas.');
        } catch (e) {
            setAlerta(e.response?.data?.message || 'Não foi possível carregar as cotas da revisão');
        }
    };

    const updateLote = (i, campo, valor) => {
        setLotes((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
        setFormDirty(true);
    };

    const addLote = () => {
        setLotes((prev) => [...prev, loteVazio()]);
        /* O "+" vive na última linha, então clicar nele o desloca para a linha
           nova e o foco do teclado ficaria órfão. Marca para levar o cursor ao
           primeiro campo da linha recém-criada. */
        focarNovoLoteRef.current = true;
        setFormDirty(true);
    };

    const removeLote = (i) => {
        setLotes((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
        setFormDirty(true);
    };

    /* Soma das quantidades. O campo é o único lugar onde esse número existe —
       não há outro consumidor na tela —, então serve de conferência do que foi
       lançado por linha. */
    const totalQuantidade = lotes.reduce(
        (soma, l) => soma + (Number(l.quantidade_total) || 0), 0);

    const alternarPosicao = (chave) => setPosicoesAbertas((prev) => (
        { ...prev, [chave]: !prev[chave] }
    ));

    const definirTodasPosicoes = (aberto) => setPosicoesAbertas(
        aberto
            ? Object.fromEntries(resultados.map((r, i) => [r.posicao_revisao_id || i, true]))
            : {}
    );

    const totalAbertas = resultados.filter(
        (r, i) => posicoesAbertas[r.posicao_revisao_id || i]
    ).length;

    const updateResultado = (i, campo, valor) => {
        setResultados((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)));
        setFormDirty(true);
    };

    const marcarTodos = (status) => {
        setResultados((prev) => prev.map((r) => ({ ...r, status })));
        setFormDirty(true);
    };

    /* ── Abrir / editar ── */
    const abrirNovo = () => {
        setEditandoId(null);
        setFormData(formVazio());
        setResultados([]);
        setRevisoesDisponiveis([]);
        setSugestoes([]);
        setLinkDesenho('');
        setFornecedoresDoMaterial([]);
        setFornecedoresAbertos(false);
        setPosicoesAbertas({});
        setLotes([loteVazio()]);
        setActiveTab('identificacao');
        setAlerta('');
        setErroStatusFinal('');
        /* Zerado aqui: os campos acabaram de ser preenchidos pelo formVazio,
           e isso nao e alteracao do usuario. */
        setFormDirty(false);
        setConfirmarSaida(false);
        setModalAberto(true);
    };

    /* O parâmetro é a linha da tabela. A listagem não traz lotes nem
       resultados — só o resumo —, então os detalhes vêm do mesmo GET que a
       edição usa. */
    const abrirVisualizacao = async (inspecao) => {
        setViewDados(null);
        setViewCarregando(true);
        setViewAberto(true);
        try {
            const resp = await inspecoesRecebimentoAPI.getById(inspecao.id);
            setViewDados(resp.data?.data || resp.data || {});
        } catch (e) {
            setViewAberto(false);
            setErro(e.response?.data?.message || 'Não foi possível abrir a inspeção');
        } finally {
            setViewCarregando(false);
        }
    };

    const fecharVisualizacao = () => {
        setViewAberto(false);
        setViewDados(null);
    };

    const abrirEdicao = async (inspecao) => {
        setAlerta('');
        setErroStatusFinal('');
        try {
            const resp = await inspecoesRecebimentoAPI.getById(inspecao.id);
            const dados = resp.data?.data || resp.data || {};

            const revs = await materiaisAPI.getRevisoes(dados.material_id);
            const listaRevs = (revs.data?.data || revs.data || {}).revisoes || [];

            setEditandoId(dados.id);
            setFormData({
                material_id: dados.material_id,
                revisao_id: String(dados.revisao_id || ''),
                codigo_sap: dados.codigo_sap || '',
                componente: dados.componente || '',
                fornecedor: dados.fornecedor || '',
                lote: dados.lote || '',
                data_entrada: dados.data_entrada || '',
                data_inspecao: dados.data_inspecao || hoje(),
                nota_fiscal: dados.nota_fiscal || '',
                quantidade_total: dados.quantidade_total ?? '',
                observacao: dados.observacao || '',
                /* 'pendente' não é opção do select: uma inspeção gravada antes
                   deste campo existir cai como não escolhida, e precisa ser
                   concluída para salvar de novo. */
                status: ['aprovado', 'reprovado'].includes(dados.status) ? dados.status : ''
            });
            setRevisoesDisponiveis(listaRevs);
            setResultados((dados.resultados || []).map((r) => ({
                posicao_revisao_id: r.posicao_revisao_id,
                posicao: r.posicao,
                cota_nominal: r.cota_nominal,
                instrumento: r.instrumento,
                observacoes_cota: '',
                valor_medido: r.valor_medido || '',
                observacao: r.observacao || '',
                status: r.status || ''
            })));
            setLinkDesenho(dados.link_desenho || '');
            carregarFornecedores(dados.material_id);
            setFornecedoresAbertos(false);
            setPosicoesAbertas({});
            /* Inspeção antiga, gravada antes da lista, tem só os campos soltos:
               viram uma linha para poder ser editada. */
            setLotes(dados.lotes?.length
                ? dados.lotes.map((l) => ({
                    lote: l.lote || '',
                    nota_fiscal: l.nota_fiscal || '',
                    quantidade_total: l.quantidade_total ?? ''
                }))
                : [{
                    lote: dados.lote || '',
                    nota_fiscal: dados.nota_fiscal || '',
                    quantidade_total: dados.quantidade_total ?? ''
                }]);
            setActiveTab('identificacao');
            /* Carregar do banco não é alteração do usuário: sem zerar aqui,
               abrir e fechar uma inspeção já pediria confirmação. */
            setFormDirty(false);
            setConfirmarSaida(false);
            setModalAberto(true);
        } catch (e) {
            setErro(e.response?.data?.message || 'Não foi possível abrir a inspeção');
        }
    };

    const validar = () => {
        if (!formData.material_id) {
            setActiveTab('identificacao');
            return 'Selecione o material pelo Cód. SAP';
        }
        if (!formData.revisao_id) {
            setActiveTab('identificacao');
            return 'Selecione a revisão do desenho';
        }
        if (!lotes.some((l) => String(l.lote || '').trim())) {
            setActiveTab('dados');
            return 'Informe ao menos um lote';
        }
        if (!formData.data_inspecao) {
            setActiveTab('dados');
            return 'Informe a data da inspeção';
        }
        if (!formData.status) {
            setActiveTab('resultados');
            setErroStatusFinal('Selecione o status final da inspeção');
            return 'Selecione o status final da inspeção, ao fim da aba Resultados';
        }
        return '';
    };

    const salvar = async () => {
        const problema = validar();
        if (problema) { setAlerta(problema); return; }

        setSalvando(true);
        setAlerta('');
        try {
            const payload = upperFields({
                revisao_id: Number(formData.revisao_id),
                fornecedor: formData.fornecedor,
                lotes: lotes
                    .map((l) => ({
                        lote: String(l.lote || '').trim().toUpperCase(),
                        nota_fiscal: String(l.nota_fiscal || '').trim().toUpperCase(),
                        quantidade_total: Number(l.quantidade_total) || 0
                    }))
                    /* Linha em branco não vai: a tela mantém sempre uma visível. */
                    .filter((l) => l.lote || l.nota_fiscal || l.quantidade_total),
                data_entrada: formData.data_entrada || null,
                data_inspecao: formData.data_inspecao,

                observacao: formData.observacao,
                /* Enviado explicitamente: o servidor só calcula o status pelas
                   medições quando o campo vem vazio. */
                status: formData.status,
                resultados: resultados.map((r) => ({
                    posicao_revisao_id: r.posicao_revisao_id,
                    valor_medido: r.valor_medido,
                    observacao: r.observacao,
                    status: r.status
                }))
            }, ['fornecedor']);

            if (editandoId) {
                await inspecoesRecebimentoAPI.update(editandoId, payload);
            } else {
                await inspecoesRecebimentoAPI.create(payload);
            }

            /* fecharModal e nao setModalAberto: salvou, entao nao ha mais
               alteracao pendente e reabrir nao deve pedir confirmacao. */
            fecharModal();
            await carregar();
        } catch (e) {
            setAlerta(e.response?.data?.message || 'Não foi possível salvar a inspeção');
        } finally {
            setSalvando(false);
        }
    };

    const excluir = async (inspecao) => {
        if (!window.confirm(`Excluir a inspeção do lote ${inspecao.lote || '—'}?`)) return;
        try {
            await inspecoesRecebimentoAPI.delete(inspecao.id);
            await carregar();
        } catch (e) {
            setErro(e.response?.data?.message || 'Não foi possível excluir a inspeção');
        }
    };

    /* ── Filtros e contadores ── */
    const termo = busca.trim().toLowerCase();

    /* O período é o primeiro corte, e os cards contam sobre ele: sem isto
       "Aprovadas" mostraria o total histórico enquanto a tabela mostra o mês
       escolhido. Status e busca refinam a tabela a partir daqui. */
    const noPeriodo = useMemo(() => {
        if (!dateFilter && !dateEndFilter) return inspecoes;
        return inspecoes.filter((i) => {
            const data = String(i.data_inspecao || '').slice(0, 10);
            if (!data) return false;
            if (dateFilter && data < dateFilter) return false;
            if (dateEndFilter && data > dateEndFilter) return false;
            return true;
        });
    }, [inspecoes, dateFilter, dateEndFilter]);

    const visiveis = noPeriodo.filter((i) => {
        if (filtroStatus !== 'todos' && i.status !== filtroStatus) return false;
        if (!termo) return true;
        return [i.codigo_sap, i.componente, i.lote, i.nota_fiscal, i.fornecedor]
            .some((v) => String(v || '').toLowerCase().includes(termo));
    });

    const contar = (status) => noPeriodo.filter((i) => i.status === status).length;

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
            : `${formatarData(dateFilter)} a ${formatarData(dateEndFilter)}`);

    /* Exporta o que está na tabela — período, status e busca aplicados — e
       com as mesmas colunas dela. */
    const exportarExcel = async () => {
        if (!visiveis.length) return;
        setExportando(true);
        try {
            const workbook = new ExcelJS.Workbook();
            const planilha = workbook.addWorksheet('Inspeções de Recebimento');
            planilha.columns = [
                { header: 'Data', key: 'data', width: 12 },
                { header: 'Cód. SAP', key: 'codigo_sap', width: 14 },
                { header: 'Componente', key: 'componente', width: 34 },
                { header: 'Lote', key: 'lote', width: 16 },
                { header: 'Revisão', key: 'revisao', width: 12 },
                { header: 'NF', key: 'nota_fiscal', width: 14 },
                { header: 'Inspetor', key: 'inspetor', width: 22 },
                { header: 'Status', key: 'status', width: 14 }
            ];

            visiveis.forEach((i) => {
                planilha.addRow({
                    data: formatarData(i.data_inspecao),
                    codigo_sap: i.codigo_sap || '',
                    componente: i.componente || '',
                    lote: i.lote || '',
                    revisao: i.revisao_desenho || '',
                    nota_fiscal: i.nota_fiscal || '',
                    inspetor: i.inspetor_nome || '',
                    status: STATUS_LABEL[i.status] || i.status || ''
                });
            });

            const cabecalho = planilha.getRow(1);
            cabecalho.font = { bold: true };
            cabecalho.alignment = { vertical: 'middle', horizontal: 'center' };
            planilha.autoFilter = { from: 'A1', to: `H${planilha.rowCount}` };

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `inspecoes-recebimento-${hoje()}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } finally {
            setExportando(false);
        }
    };

    const cards = [
        { chave: 'todos', rotulo: 'Total de inspeções', valor: inspecoes.length,
            classe: 'total', icone: 'fa-clipboard-list', descricao: 'Todos os status' },
        { chave: 'aprovado', rotulo: 'Aprovadas', valor: contar('aprovado'),
            classe: 'approved', icone: 'fa-check-circle', descricao: 'Lotes aprovados' },
        { chave: 'reprovado', rotulo: 'Reprovadas', valor: contar('reprovado'),
            classe: 'rejected', icone: 'fa-circle-xmark', descricao: 'Lotes reprovados' },
        { chave: 'pendente', rotulo: 'Pendentes', valor: contar('pendente'),
            classe: 'pending', icone: 'fa-clock', descricao: 'Medição incompleta' }
    ];

    /* Sugestoes filtradas pelo que ja foi digitado. Comparacao sem caixa e sem
       espaco nas pontas, porque o campo e field-upper e o historico guarda o
       que foi gravado antes. */
    const termoFornecedor = String(formData.fornecedor || '').trim().toUpperCase();
    const fornecedoresFiltrados = fornecedoresDoMaterial.filter((nome) => (
        !termoFornecedor || nome.toUpperCase().includes(termoFornecedor)
    ));

    /* Oferece registrar o que foi digitado quando nao existe igual no
       historico. Nao cria nada por si: salvar a inspecao e que passa a incluir
       o nome nas sugestoes das proximas. */
    const podeAdicionarFornecedor = !!termoFornecedor
        && !fornecedoresDoMaterial.some((nome) => nome.trim().toUpperCase() === termoFornecedor);

    /* Prévia do status enquanto o inspetor preenche, com a mesma regra do
       servidor — para ele não descobrir o resultado só depois de salvar. */
    const statusPrevisto = (() => {
        if (!resultados.length) return 'pendente';
        if (resultados.some((r) => r.status === 'nok')) return 'reprovado';
        if (resultados.some((r) => !String(r.valor_medido || '').trim())) return 'pendente';
        return 'aprovado';
    })();

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Registro' }, { label: 'Inspeção de Recebimento' }]}
            containerClassName="recebimento-page"
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-clipboard-check"></i> Inspeção de Recebimento</h1>
                        <p>Registro de inspeção por lote, medido contra a revisão de desenho cadastrada</p>
                    </div>
                    {/* Busca, período, exportação e ação numa linha só, como nas
                        telas de Injeção e Montagem. A busca estava num card
                        separado abaixo dos cards de resumo. Os rótulos ficam em
                        `.filter-label`, que some no celular deixando só ícones. */}
                    <div className="header-actions recb-filtros">
                        <div className="recb-busca recb-busca-barra">
                            <i className="fas fa-search" aria-hidden="true"></i>
                            <input
                                type="search"
                                className="form-control"
                                placeholder="Buscar por código SAP, componente, lote, nota fiscal ou fornecedor"
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                aria-label="Buscar inspeção"
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

                        <button className="btn btn-success" onClick={exportarExcel}
                            disabled={exportando || visiveis.length === 0}
                            title="Exportar Excel">
                            <i className={`fas ${exportando ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i>
                            <span className="filter-label"> Exportar Excel</span>
                        </button>

                        <button className="btn btn-primary" onClick={abrirNovo} title="Nova inspeção">
                            <i className="fas fa-plus"></i>
                            <span className="filter-label"> Nova Inspeção</span>
                        </button>
                    </div>
                </div>

                {erro && (
                    <div className="page-alert">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span>{erro}</span>
                        <button className="btn btn-outline btn-sm" onClick={carregar}>
                            <i className="fas fa-rotate-right"></i> Tentar novamente
                        </button>
                    </div>
                )}

                {/* Cards do UI Kit, os mesmos da Injeção e do Cadastro de Material.
                    Aqui também filtram a lista, então viram botão de verdade. */}
                <div className="summary-grid">
                    {cards.map((card) => (
                        <button
                            key={card.chave}
                            type="button"
                            className={`summary-card is-clickable ${card.classe} ${filtroStatus === card.chave ? 'is-active' : ''}`}
                            onClick={() => setFiltroStatus(card.chave)}
                            aria-pressed={filtroStatus === card.chave}
                        >
                            <div className="summary-heading">
                                <i className={`fas ${card.icone}`} aria-hidden="true"></i>
                                <span>{card.rotulo}</span>
                            </div>
                            <strong>{loading ? '—' : card.valor}</strong>
                            <small>{card.descricao}</small>
                            <span className="summary-line" aria-hidden="true"></span>
                        </button>
                    ))}
                </div>


                <div className="table-card">
                    {loading ? (
                        <p className="recb-vazio">Carregando…</p>
                    ) : !visiveis.length ? (
                        <p className="recb-vazio">
                            {inspecoes.length
                                ? 'Nenhuma inspeção corresponde ao filtro.'
                                : 'Nenhuma inspeção registrada ainda.'}
                        </p>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Data</th>
                                        <th>Cód. SAP</th>
                                        <th>Componente</th>
                                        <th>Lote</th>
                                        <th className="col-hide">Revisão</th>
                                        <th className="col-hide">NF</th>
                                        <th className="col-hide">Inspetor</th>
                                        <th>Status</th>
                                        <th className="col-acoes">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiveis.map((i) => (
                                        <tr key={i.id}
                                            className={`mobile-clickable-row ${sheetItem?.id === i.id ? 'mobile-row-active' : ''}`}
                                            onClick={() => aoClicarNaLinha(i)}>
                                            <td>{formatarData(i.data_inspecao)}</td>
                                            <td><strong>{i.codigo_sap}</strong></td>
                                            <td>{i.componente || '—'}</td>
                                            <td>{i.lote || '—'}</td>
                                            <td className="col-hide">{i.revisao_desenho || '—'}</td>
                                            <td className="col-hide">{i.nota_fiscal || '—'}</td>
                                            <td className="col-hide">{i.inspetor_nome || '—'}</td>
                                            <td>
                                                <span className={`badge ${STATUS_BADGE[i.status] || 'badge-warning'}`}>
                                                    {STATUS_LABEL[i.status] || i.status}
                                                </span>
                                            </td>
                                            <td className="col-acoes">
                                                <div className="acoes">
                                                    {/* Visualizar → Editar → Excluir, a ordem das
                                                        outras telas. `i` é a linha deste `map`; usar
                                                        outro nome aqui daria o `ReferenceError` que o
                                                        botão colado no Cadastro de Material dava. */}
                                                    <button className="btn-icon btn-view"
                                                        title="Visualizar inspeção"
                                                        aria-label={`Visualizar inspeção do lote ${i.lote || i.codigo_sap}`}
                                                        onClick={(e) => { e.stopPropagation(); abrirVisualizacao(i); }}>
                                                        <i className="fas fa-eye" aria-hidden="true"></i>
                                                    </button>
                                                    <button className="btn-icon btn-edit"
                                                        title="Abrir inspeção"
                                                        aria-label={`Abrir inspeção do lote ${i.lote || i.codigo_sap}`}
                                                        onClick={(e) => { e.stopPropagation(); abrirEdicao(i); }}>
                                                        <i className="fas fa-pen" aria-hidden="true"></i>
                                                    </button>
                                                    <button className="btn-icon btn-delete"
                                                        title="Excluir inspeção"
                                                        aria-label={`Excluir inspeção do lote ${i.lote || i.codigo_sap}`}
                                                        onClick={(e) => { e.stopPropagation(); excluir(i); }}>
                                                        <i className="fas fa-trash" aria-hidden="true"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {modalAberto && (
                    <div className="modal-overlay recb-modal" onClick={() => !salvando && solicitarFechamento()}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editandoId ? 'Editar Inspeção' : 'Nova Inspeção de Recebimento'}</h2>
                                <button className="modal-close" onClick={solicitarFechamento}
                                    aria-label="Fechar">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

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

                            {/* Tabs do UI Kit: já trazem o padrão ARIA de tablist,
                                com navegação por setas do teclado. Na visão geral
                                somem, porque não há mais o que navegar. */}
                            {formViewMode === 'tabs' && (
                            <Tabs
                                className="modal-tabs"
                                ariaLabel="Seções da inspeção"
                                activeId={activeTab}
                                onChange={setActiveTab}
                                items={[
                                    {
                                        id: 'identificacao',
                                        label: 'Identificação',
                                        icon: <i className="fas fa-fingerprint" aria-hidden="true"></i>
                                    },
                                    {
                                        /* "Dados" e não "Dados Gerais": o título por extenso está
                                           no conteúdo, e o rótulo curto é o que faz as três abas
                                           caberem na largura do celular. */
                                        id: 'dados',
                                        label: 'Dados',
                                        icon: <i className="fas fa-box" aria-hidden="true"></i>
                                    },
                                    {
                                        id: 'resultados',
                                        label: 'Resultados',
                                        count: resultados.length,
                                        icon: <i className="fas fa-ruler" aria-hidden="true"></i>
                                    }
                                ]}
                            />
                            )}

                            <div className="modal-body">
                                {alerta && (
                                    <div className="validacao-alerta">
                                        <i className="fas fa-triangle-exclamation"></i>
                                        <span>{alerta}</span>
                                    </div>
                                )}

                                {(formViewMode === 'geral' || activeTab === 'identificacao') && (
                                    <div className="form-section">
                                        {/* Titulo por extenso aqui porque a aba usa rotulo curto;
                                            serve tambem a visao geral, onde as secoes vem em
                                            sequencia e precisam se identificar. */}
                                        <h3 className="section-title">Identificação do Material</h3>
                                        {/* `linha-identificacao` só marca estas duas linhas: no
                                            celular elas empilham um campo por linha, enquanto as
                                            demais linhas do modal seguem em duas colunas. */}
                                        <div className="form-row-recb linha-identificacao">
                                            <div className="form-group campo-autocomplete">
                                                <label>Cód. SAP *</label>
                                                <input
                                                    type="text"
                                                    className="form-control field-upper"
                                                    value={formData.codigo_sap}
                                                    onChange={(e) => {
                                                        setCampo('codigo_sap', e.target.value);
                                                        setCampo('material_id', null);
                                                        buscarMateriais(e.target.value);
                                                    }}
                                                    onFocus={() => sugestoes.length && setSugestoesAbertas(true)}
                                                    placeholder="Digite para buscar"
                                                    autoComplete="off"
                                                    aria-required="true"
                                                />
                                                {sugestoesAbertas && sugestoes.length > 0 && (
                                                    <ul className="autocomplete-lista" role="listbox">
                                                        {sugestoes.map((m) => (
                                                            <li key={m.id}>
                                                                <button type="button" className="autocomplete-item"
                                                                    onClick={() => selecionarMaterial(m)}>
                                                                    <span className="autocomplete-cod">{m.codigo_sap}</span>
                                                                    <span className="autocomplete-desc">{m.componente || '—'}</span>
                                                                    <span className="autocomplete-meta">
                                                                        {(m.revisoes?.length || 0)} rev.
                                                                    </span>
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>

                                            <div className="form-group form-group-largo">
                                                <label>Componente</label>
                                                <input type="text" className="form-control campo-lido"
                                                    value={formData.componente} readOnly
                                                    placeholder="Preenchido pelo material" />
                                            </div>
                                        </div>

                                        <div className="form-row-recb linha-identificacao">
                                            <div className="form-group">
                                                <label>Revisão do Desenho *</label>
                                                <select className="form-control"
                                                    value={formData.revisao_id}
                                                    onChange={(e) => selecionarRevisao(e.target.value)}
                                                    disabled={!revisoesDisponiveis.length}
                                                    aria-required="true">
                                                    <option value="">
                                                        {revisoesDisponiveis.length ? 'Selecione…' : 'Selecione o material antes'}
                                                    </option>
                                                    {revisoesDisponiveis.map((r) => (
                                                        <option key={r.id} value={r.id}>
                                                            {r.revisao}{r.data ? ` — ${formatarData(r.data)}` : ''} ({r.total_posicoes} pos.)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Combobox: sugere quem já forneceu este material e aceita
                                                nome novo. Não é um select, porque a lista é histórico e
                                                não catálogo — travar impediria o primeiro lote de um
                                                fornecedor. */}
                                            <div className="form-group form-group-largo campo-autocomplete">
                                                <label htmlFor="fornecedor">Fornecedor</label>
                                                <input
                                                    id="fornecedor"
                                                    type="text"
                                                    className="form-control field-upper"
                                                    value={formData.fornecedor}
                                                    onChange={(e) => {
                                                        setCampo('fornecedor', e.target.value);
                                                        setFornecedoresAbertos(true);
                                                    }}
                                                    onFocus={() => setFornecedoresAbertos(true)}
                                                    /* Fecha depois do clique na sugestão, que usa
                                                       onMouseDown para chegar antes deste blur. */
                                                    onBlur={() => setTimeout(() => setFornecedoresAbertos(false), 120)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Escape') setFornecedoresAbertos(false);
                                                    }}
                                                    placeholder={formData.material_id
                                                        ? 'Digite ou escolha um fornecedor'
                                                        : 'Selecione o material antes'}
                                                    autoComplete="off"
                                                    role="combobox"
                                                    aria-expanded={fornecedoresAbertos}
                                                    aria-autocomplete="list"
                                                />
                                                {fornecedoresAbertos && (fornecedoresFiltrados.length > 0 || podeAdicionarFornecedor) && (
                                                    <ul className="autocomplete-lista" role="listbox">
                                                        {fornecedoresFiltrados.map((nome) => (
                                                            <li key={nome}>
                                                                <button type="button" className="autocomplete-item"
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        setCampo('fornecedor', nome);
                                                                        setFornecedoresAbertos(false);
                                                                    }}>
                                                                    <span className="autocomplete-cod">{nome}</span>
                                                                    <span className="autocomplete-desc"></span>
                                                                    <span className="autocomplete-meta">já usado</span>
                                                                </button>
                                                            </li>
                                                        ))}
                                                        {podeAdicionarFornecedor && (
                                                            <li>
                                                                <button type="button"
                                                                    className="autocomplete-item autocomplete-novo"
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        setFornecedoresAbertos(false);
                                                                    }}>
                                                                    <span className="autocomplete-cod">
                                                                        <i className="fas fa-plus" aria-hidden="true"></i>{' '}
                                                                        Usar “{formData.fornecedor.trim()}”
                                                                    </span>
                                                                    <span className="autocomplete-desc"></span>
                                                                    <span className="autocomplete-meta">novo</span>
                                                                </button>
                                                            </li>
                                                        )}
                                                    </ul>
                                                )}
                                                <small className="campo-ajuda">
                                                    Vem do cadastro do material e pode ser alterado para este lote.
                                                </small>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {(formViewMode === 'geral' || activeTab === 'dados') && (
                                    <div className="form-section">
                                        <h3 className="section-title">Dados Gerais do Lote</h3>

                                        {/* Uma linha por lote recebido: a mesma entrega pode chegar
                                            partida em notas diferentes, e antes só cabia uma. */}
                                        {lotes.map((l, i) => (
                                            <div className="form-row-recb linha-lote" key={i}>
                                                <div className="form-group">
                                                    <label htmlFor={`lote-${i}`}>
                                                        Lote {i === 0 ? '*' : ''}
                                                    </label>
                                                    <input id={`lote-${i}`} type="text"
                                                        className="form-control field-upper"
                                                        value={l.lote}
                                                        onChange={(e) => updateLote(i, 'lote', e.target.value)}
                                                        aria-required={i === 0} />
                                                </div>
                                                <div className="form-group">
                                                    <label htmlFor={`nf-${i}`}>Nota Fiscal</label>
                                                    <input id={`nf-${i}`} type="text"
                                                        className="form-control field-upper"
                                                        value={l.nota_fiscal}
                                                        onChange={(e) => updateLote(i, 'nota_fiscal', e.target.value)} />
                                                </div>
                                                <div className="form-group">
                                                    <label htmlFor={`qtd-${i}`}>Quantidade</label>
                                                    <input id={`qtd-${i}`} type="text" inputMode="numeric"
                                                        pattern="[0-9]*" className="form-control"
                                                        value={l.quantidade_total}
                                                        onChange={(e) => updateLote(i, 'quantidade_total',
                                                            e.target.value.replace(/\D/g, ''))} />
                                                </div>
                                                <div className="lote-acoes">
                                                    {/* O "+" fica só na última linha: é de lá que a
                                                        próxima nasce, e repeti-lo em todas sugeriria
                                                        inserir no meio. */}
                                                    {i === lotes.length - 1 && (
                                                        <button type="button" className="lote-add"
                                                            onClick={addLote}
                                                            title="Adicionar lote/nota fiscal"
                                                            aria-label="Adicionar lote/nota fiscal">
                                                            <i className="fas fa-plus" aria-hidden="true"></i>
                                                        </button>
                                                    )}
                                                    {/* A primeira linha não remove: ao menos um lote é
                                                        obrigatório, e removê-la deixaria o formulário
                                                        sem onde digitar. */}
                                                    <button type="button" className="lote-remover"
                                                        onClick={() => removeLote(i)}
                                                        disabled={lotes.length === 1}
                                                        title={lotes.length === 1
                                                            ? 'A inspeção precisa de ao menos um lote'
                                                            : 'Remover este lote'}
                                                        aria-label={`Remover lote ${i + 1}`}>
                                                        <i className="fas fa-trash" aria-hidden="true"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {/* O botão de adicionar passou para a coluna de ações da
                                            última linha; aqui ficou só a conferência da soma, que
                                            aparece a partir da segunda linha. */}
                                        {lotes.length > 1 && (
                                            <div className="lotes-rodape">
                                                <span className="lotes-total">
                                                    Quantidade total: <strong>{totalQuantidade}</strong>
                                                    {' '}em {lotes.length} lotes
                                                </span>
                                            </div>
                                        )}

                                        <div className="form-row-recb">
                                            <div className="form-group">
                                                <label>Data de Entrada</label>
                                                <input type="date" className="form-control"
                                                    value={formData.data_entrada || ''}
                                                    onChange={(e) => setCampo('data_entrada', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Data da Inspeção *</label>
                                                <input type="date" className="form-control"
                                                    value={formData.data_inspecao || ''}
                                                    onChange={(e) => setCampo('data_inspecao', e.target.value)}
                                                    aria-required="true" />
                                            </div>
                                            <div className="form-group">
                                                <label>Inspetor</label>
                                                <input type="text" className="form-control campo-lido"
                                                    value={user?.nome || ''} readOnly />
                                                <small className="campo-ajuda">Usuário da sessão.</small>
                                            </div>
                                            {/* Dentro da mesma linha do Inspetor de propósito: no
                                                celular a grade tem duas colunas e os dois dividem a
                                                linha, em vez de a Observação empurrar o rodapé para
                                                baixo. No desktop ela volta a ocupar a linha inteira,
                                                pelo CSS. */}
                                            <div className="form-group form-group-observacao">
                                                <label htmlFor="observacao">Observação</label>
                                                {/* Duas linhas, não três: ao lado do Inspetor no
                                                    celular, três deixavam a Observação mais alta que
                                                    o par e empurravam o rodapé. Abre ao focar. */}
                                                <textarea id="observacao" className="form-control" rows="2"
                                                    value={formData.observacao}
                                                    onChange={(e) => setCampo('observacao', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {(formViewMode === 'geral' || activeTab === 'resultados') && (
                                    <div className="form-section">
                                        {!resultados.length ? (
                                            <p className="recb-vazio">
                                                Selecione o material e a revisão na aba Identificação para carregar as cotas.
                                            </p>
                                        ) : (
                                            <>
                                                <div className="section-header-linha">
                                                    <h3 className="section-title">
                                                        Resultados
                                                        <span className={`badge ${STATUS_BADGE[statusPrevisto] || 'badge-warning'} badge-previa`}>
                                                            {STATUS_LABEL[statusPrevisto]}
                                                        </span>
                                                    </h3>
                                                    <div className="resultados-acoes">
                                                        {/* Desenho da revisão, à mão durante toda a medição.
                                                            Fica aqui e não em cada card porque o link é da
                                                            revisão inteira, não de uma posição. */}
                                                        {linkDesenho ? (
                                                            <a className="btn btn-outline btn-sm"
                                                                href={linkDesenho}
                                                                target="_blank" rel="noopener noreferrer"
                                                                title="Abrir o desenho técnico em outra aba">
                                                                <i className="fas fa-drafting-compass" aria-hidden="true"></i>
                                                                {' '}Ver desenho técnico
                                                            </a>
                                                        ) : (
                                                            <span className="sem-desenho">
                                                                <i className="fas fa-link-slash" aria-hidden="true"></i>
                                                                {' '}Nenhum desenho anexado
                                                            </span>
                                                        )}
                                                        {/* <button type="button" className="btn btn-outline btn-sm"
                                                            onClick={() => marcarTodos('ok')}>
                                                            Marcar tudo OK
                                                        </button>
                                                        <button type="button" className="btn btn-outline btn-sm"
                                                            onClick={() => marcarTodos('')}>
                                                            Limpar status
                                                        </button> */}
                                                        {/* Com tudo fechado, preencher posição a posição
                                                            exigiria um clique extra por cota; este botão
                                                            devolve a visão completa de uma vez. */}
                                                        <button type="button" className="btn btn-outline btn-sm"
                                                            onClick={() => definirTodasPosicoes(totalAbertas !== resultados.length)}>
                                                            <i className={`fas fa-chevron-${totalAbertas === resultados.length ? 'up' : 'down'}`}
                                                                aria-hidden="true"></i>
                                                            {totalAbertas === resultados.length ? ' Recolher todas' : ' Abrir todas'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Um card por posição da revisão. A cota vem travada:
                                                    é o que o desenho manda, e alterá-la aqui seria
                                                    mexer na referência durante a medição. */}
                                                <div className="cotas-grid">
                                                    {resultados.map((r, i) => {
                                                        const chave = r.posicao_revisao_id || i;
                                                        const aberto = !!posicoesAbertas[chave];
                                                        const medido = !!String(r.valor_medido || '').trim();
                                                        /* Tom do balão: verde conforme, vermelho NC, e um
                                                           terceiro para "medido mas ainda sem decisão" — sem
                                                           ele esse caso ficaria igual ao não medido. */
                                                        const tom = r.status === 'ok' ? 'tom-ok'
                                                            : r.status === 'nok' ? 'tom-nok'
                                                                : (medido ? 'tom-medido' : '');
                                                        return (
                                                        <div key={chave}
                                                            className={`cota-card ${aberto ? 'is-aberto' : 'is-colapsado'} ${tom}`}>
                                                            <header className="cota-card-topo">
                                                                <button type="button" className="cota-toggle"
                                                                    onClick={() => alternarPosicao(chave)}
                                                                    aria-expanded={aberto}
                                                                    aria-controls={`cota-corpo-${chave}`}>
                                                                <i className="fas fa-chevron-right cota-toggle-seta" aria-hidden="true"></i>
                                                                <span className="cota-posicao">
                                                                    <i className="fas fa-location-dot" aria-hidden="true"></i>
                                                                    {r.posicao}
                                                                    {/* Marca de medição registrada, como na tabela
                                                                        técnica. Só aparece com valor lançado, então
                                                                        vale como leitura rápida do que já foi medido
                                                                        numa grade de nove cards. O título carrega o
                                                                        significado: a forma sozinha não diz nada. */}
                                                                    {medido && (
                                                                        <span className="cota-medida" title="Medição registrada">
                                                                            ▲<span className="sr-only"> medição registrada</span>
                                                                        </span>
                                                                    )}
                                                                    {/* Resultado por extenso para leitor de tela e
                                                                        para quem não distingue as cores. */}
                                                                    {r.status && (
                                                                        <span className="sr-only">
                                                                            {r.status === 'ok' ? ' conforme' : ' não conforme'}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                </button>
                                                                <span className="cota-instrumento">
                                                                    <i className="fas fa-ruler-vertical" aria-hidden="true"></i>
                                                                    <span>{r.instrumento || '—'}</span>
                                                                </span>
                                                            </header>

                                                            {aberto && (<div className="cota-corpo" id={`cota-corpo-${chave}`}>
                                                            <div className="cota-referencia">
                                                                <span className="cota-rotulo">Referência</span>
                                                                <span className="cota-referencia-valor">
                                                                    {r.cota_nominal || '—'}
                                                                </span>
                                                            </div>

                                                            <div className="cota-campo">
                                                                <label htmlFor={`medido-${i}`}>Valor medido</label>
                                                                <input id={`medido-${i}`} type="text" className="form-control"
                                                                    value={r.valor_medido}
                                                                    onChange={(e) => updateResultado(i, 'valor_medido', e.target.value)} />
                                                            </div>

                                                            <div className="cota-status" role="group"
                                                                aria-label={`Status da posição ${r.posicao}`}>
                                                                <button type="button"
                                                                    className={`ok ${r.status === 'ok' ? 'is-ativo' : ''}`}
                                                                    onClick={() => updateResultado(i, 'status', r.status === 'ok' ? '' : 'ok')}
                                                                    aria-pressed={r.status === 'ok'}>
                                                                    Conforme
                                                                </button>
                                                                <button type="button"
                                                                    className={`nok ${r.status === 'nok' ? 'is-ativo' : ''}`}
                                                                    onClick={() => updateResultado(i, 'status', r.status === 'nok' ? '' : 'nok')}
                                                                    aria-pressed={r.status === 'nok'}>
                                                                    NC
                                                                </button>
                                                            </div>

                                                            <div className="cota-campo cota-campo-final">
                                                                <label htmlFor={`obs-res-${i}`}>Observação</label>
                                                                <input id={`obs-res-${i}`} type="text" className="form-control"
                                                                    value={r.observacao}
                                                                    onChange={(e) => updateResultado(i, 'observacao', e.target.value)}
                                                                    placeholder={r.observacoes_cota || ''} />
                                                            </div>
                                                            </div>)}
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                                {/* Fica na aba de Resultados, logo depois dos cards e
                                                    antes dos botões: é a conclusão da medição que
                                                    acabou de ser lançada. */}
                                                <div className={`status-final ${erroStatusFinal ? 'tem-erro' : ''}`}>
                                                    <label htmlFor="status-final">Status final da inspeção *</label>
                                                    <select
                                                        id="status-final"
                                                        className="form-control"
                                                        value={formData.status}
                                                        onChange={(e) => {
                                                            setCampo('status', e.target.value);
                                                            if (erroStatusFinal) setErroStatusFinal('');
                                                        }}
                                                        aria-required="true"
                                                        aria-invalid={!!erroStatusFinal}
                                                    >
                                                        <option value="" disabled>Selecione</option>
                                                        <option value="aprovado">Aprovado</option>
                                                        <option value="reprovado">Reprovado</option>
                                                    </select>
                                                    {erroStatusFinal ? (
                                                        <span className="status-final-erro" role="alert">
                                                            <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                                                            {erroStatusFinal}
                                                        </span>
                                                    ) : (
                                                        <small className="campo-ajuda">
                                                            Pelas medições lançadas, a inspeção está{' '}
                                                            <strong>{STATUS_LABEL[statusPrevisto]}</strong>.
                                                        </small>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={solicitarFechamento} disabled={salvando}>
                                    Cancelar
                                </button>
                                <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
                                    <i className={`fas ${salvando ? 'fa-spinner fa-spin' : 'fa-save'}`}></i>
                                    {salvando ? ' Salvando…' : ' Salvar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Somente leitura. Sem `form`, sem input e sem Salvar: os
                    dados são texto, então não há o que travar. */}
                {viewAberto && (
                    <div className="modal-overlay recb-modal" onClick={fecharVisualizacao}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Inspeção de Recebimento</h2>
                                <button className="modal-close" onClick={fecharVisualizacao}
                                    aria-label="Fechar">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            {viewCarregando || !viewDados ? (
                                <p className="recb-vazio">Carregando…</p>
                            ) : (
                                <div className="form-section">
                                    <h3 className="section-title">Identificação do Material</h3>
                                    <div className="view-grid">
                                        <div className="view-item">
                                            <span className="view-label">Cód. SAP</span>
                                            <span className="view-value">{viewDados.codigo_sap || '—'}</span>
                                        </div>
                                        <div className="view-item">
                                            <span className="view-label">Componente</span>
                                            <span className="view-value">{viewDados.componente || '—'}</span>
                                        </div>
                                        <div className="view-item">
                                            <span className="view-label">Revisão do Desenho</span>
                                            <span className="view-value">{viewDados.revisao_desenho || '—'}</span>
                                        </div>
                                        <div className="view-item">
                                            <span className="view-label">Fornecedor</span>
                                            <span className="view-value">{viewDados.fornecedor || '—'}</span>
                                        </div>
                                        <div className="view-item">
                                            <span className="view-label">Data de Entrada</span>
                                            <span className="view-value">{formatarData(viewDados.data_entrada)}</span>
                                        </div>
                                        <div className="view-item">
                                            <span className="view-label">Data da Inspeção</span>
                                            <span className="view-value">{formatarData(viewDados.data_inspecao)}</span>
                                        </div>
                                        <div className="view-item">
                                            <span className="view-label">Inspetor</span>
                                            <span className="view-value">{viewDados.inspetor_nome || '—'}</span>
                                        </div>
                                        <div className="view-item">
                                            <span className="view-label">Desenho Técnico</span>
                                            <span className="view-value">
                                                {viewDados.link_desenho ? (
                                                    /* noreferrer junto de noopener: o destino é um
                                                       link externo digitado no cadastro. */
                                                    <a href={viewDados.link_desenho} target="_blank"
                                                        rel="noopener noreferrer">
                                                        <i className="fas fa-up-right-from-square" aria-hidden="true"></i> Abrir desenho
                                                    </a>
                                                ) : '—'}
                                            </span>
                                        </div>
                                    </div>

                                    <h3 className="section-title">Dados Gerais do Lote</h3>
                                    {(viewDados.lotes?.length ? viewDados.lotes : [{
                                        /* Inspeção gravada antes da lista de lotes existir: os
                                           campos soltos viram uma linha, como na edição. */
                                        lote: viewDados.lote,
                                        nota_fiscal: viewDados.nota_fiscal,
                                        quantidade_total: viewDados.quantidade_total
                                    }]).map((l, idx) => (
                                        <div className="view-grid" key={l.id ?? idx}>
                                            <div className="view-item">
                                                <span className="view-label">Lote</span>
                                                <span className="view-value">{l.lote || '—'}</span>
                                            </div>
                                            <div className="view-item">
                                                <span className="view-label">Nota Fiscal</span>
                                                <span className="view-value">{l.nota_fiscal || '—'}</span>
                                            </div>
                                            <div className="view-item">
                                                <span className="view-label">Quantidade</span>
                                                <span className="view-value">{l.quantidade_total ?? '—'}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {viewDados.lotes?.length > 1 && (
                                        <p className="lotes-total">
                                            Quantidade total:{' '}
                                            <strong>
                                                {viewDados.lotes.reduce(
                                                    (s, l) => s + (Number(l.quantidade_total) || 0), 0)}
                                            </strong>
                                            {' '}em {viewDados.lotes.length} lotes
                                        </p>
                                    )}

                                    <h3 className="section-title">Resultados</h3>
                                    {!viewDados.resultados?.length ? (
                                        <p className="recb-vazio">Nenhuma cota medida.</p>
                                    ) : (
                                        <div className="table-container">
                                            <table className="table">
                                                <thead>
                                                    <tr>
                                                        <th>Posição</th>
                                                        <th>Cota nominal</th>
                                                        <th className="col-hide">Instrumento</th>
                                                        <th>Medido</th>
                                                        <th>Status</th>
                                                        <th className="col-hide">Observação</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {viewDados.resultados.map((r) => (
                                                        <tr key={r.id}>
                                                            <td><strong>{r.posicao || '—'}</strong></td>
                                                            <td>{r.cota_nominal || '—'}</td>
                                                            <td className="col-hide">{r.instrumento || '—'}</td>
                                                            <td>{r.valor_medido || '—'}</td>
                                                            <td>
                                                                {r.status ? (
                                                                    <span className={`badge ${r.status === 'ok' ? 'badge-success' : 'badge-danger'}`}>
                                                                        {r.status === 'ok' ? 'Conforme' : 'Não conforme'}
                                                                    </span>
                                                                ) : '—'}
                                                            </td>
                                                            <td className="col-hide">{r.observacao || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    <div className="view-section">
                                        <h4>Status final</h4>
                                        <p>
                                            <span className={`badge ${STATUS_BADGE[viewDados.status] || 'badge-warning'}`}>
                                                {STATUS_LABEL[viewDados.status] || viewDados.status || 'Pendente'}
                                            </span>
                                        </p>
                                    </div>

                                    {viewDados.observacao && (
                                        <div className="view-section">
                                            <h4>Observações</h4>
                                            <p>{viewDados.observacao}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={fecharVisualizacao}>
                                    Fechar
                                </button>
                                {/* Atalho para editar sem voltar à tabela, como na
                                    Injeção. Guarda a linha antes de fechar, porque
                                    `fecharVisualizacao` limpa `viewDados`. */}
                                <button className="btn btn-primary"
                                    disabled={!viewDados}
                                    onClick={() => {
                                        const alvo = viewDados;
                                        fecharVisualizacao();
                                        abrirEdicao(alvo);
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
                    titulo={sheetItem ? (sheetItem.lote || sheetItem.codigo_sap || 'Inspeção') : ''}
                    onFechar={() => setSheetItem(null)}
                    acoes={[
                        { id: 'ver', rotulo: 'Ver', icone: 'fa-eye', className: 'btn-view', onClick: abrirVisualizacao },
                        { id: 'editar', rotulo: 'Editar', icone: 'fa-edit', className: 'btn-edit', onClick: abrirEdicao },
                        { id: 'excluir', rotulo: 'Excluir', icone: 'fa-trash', className: 'btn-delete', onClick: excluir }
                    ]}
                />

                <ConfirmarSaida
                    aberto={confirmarSaida}
                    onCancelar={() => setConfirmarSaida(false)}
                    onSair={fecharModal}
                />
            </div>
        </AppLayout>
    );
}
