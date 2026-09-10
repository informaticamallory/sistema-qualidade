import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import AppLayout from '../../components/Layout/AppLayout';
import { Tabs, ConfirmarSaida, MobileActionSheet } from '../../components/ui';
import { materiaisAPI, revisoesAPI, produtosAPI } from '../../services/api';
import { upperFields } from '../../utils/text';
import './CadastroMaterial.css';

/* Cadastro de Material e Revisão de Desenho.

   Separado da inspeção de propósito: aqui mora a referência técnica (o que o
   desenho manda) e lá a execução (o que o lote mediu). Uma revisão cadastrada
   uma vez serve a todas as inspeções daquele material. */

const INSTRUMENTOS = [
    'Trena métrica',
    'Trena',
    'Paquímetro',
    'Micrômetro',
    'Relógio comparador',
    'Projetor de perfil',
    'Traçador de altura',
    'Calibrador passa/não passa',
    'Multímetro',
    'Balança',
    'Visual',
    'Funcional'
];

/* Padrões do fluxo de recebimento. Ficam como valor inicial, não travado: são
   o caso mais comum, e o campo continua editável para as exceções. */
const INSTRUMENTO_PADRAO = 'Trena métrica';
const SETOR_PADRAO = 'Recebimento';

const hoje = () => new Date().toISOString().slice(0, 10);

const posicaoVazia = () => ({
    posicao: '',
    cota: '',
    instrumento: INSTRUMENTO_PADRAO,
    observacoes: ''
});

const formVazio = () => ({
    codigo_sap: '',
    componente: '',
    aplicacao: '',
    setor: SETOR_PADRAO,
    revisao_desenho: '',
    data: hoje(),
    observacoes: '',
    link_desenho: ''
});

/* Só http e https. O valor vai para um href, e `javascript:` ali executaria
   script no contexto de quem abrisse a revisão — o servidor recusa igual, mas
   é aqui que o usuário recebe o aviso antes de tentar salvar. */
const linkValido = (valor) => {
    const texto = String(valor || '').trim();
    if (!texto) return true;
    try {
        return ['http:', 'https:'].includes(new URL(texto).protocol);
    } catch {
        return false;
    }
};

/* Extensão de imagem no fim do caminho, ignorando query e fragmento. Link de
   Drive e SharePoint não expõe a imagem direto, então cai no botão de abrir. */
const ehImagemDireta = (valor) => {
    try {
        return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(new URL(valor).pathname);
    } catch {
        return false;
    }
};

export default function CadastroMaterial() {
    const [materiais, setMateriais] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');

    const [modalAberto, setModalAberto] = useState(false);
    const [activeTab, setActiveTab] = useState('dados');
    /* 'tabs' | 'geral' — mesmo alternador das telas de Injeção e Montagem. */
    const [formViewMode, setFormViewMode] = useState('tabs');
    const [formData, setFormData] = useState(formVazio());
    const [posicoes, setPosicoes] = useState([posicaoVazia()]);
    const [salvando, setSalvando] = useState(false);
    const [alerta, setAlerta] = useState('');
    /* Alterações pendentes: marcadas nas funções que mudam o formulário, e não
       campo por campo, para nenhum campo novo escapar por esquecimento. */
    const [formDirty, setFormDirty] = useState(false);
    const [confirmarSaida, setConfirmarSaida] = useState(false);
    const [erroLink, setErroLink] = useState('');
    /* A previa some se a imagem nao carregar: link pode apontar para arquivo
       que exige login, e um icone quebrado nao ajuda ninguem. */
    const [previaFalhou, setPreviaFalhou] = useState(false);
    /* Quais posições estão abertas, por índice. Várias podem ficar abertas ao
       mesmo tempo. Todas começam fechadas. */
    const [posicoesAbertas, setPosicoesAbertas] = useState({});

    /* Quando preenchido, o modal está editando esta revisão em vez de criar. */
    const [revisaoEmEdicao, setRevisaoEmEdicao] = useState(null);

    /* ── Busca do Cód. SAP ── */
    const [buscandoComponente, setBuscandoComponente] = useState(false);
    const [origemComponente, setOrigemComponente] = useState('');
    /* Códigos que casam com o que já foi digitado, para escolher da lista sem
       ter de saber o código inteiro de cor. */
    const [sugestoesSap, setSugestoesSap] = useState([]);
    const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
    /* O valor atual do Componente veio da busca? Só nesse caso uma busca
       seguinte pode substituí-lo ou limpá-lo. */
    const autoPreenchidoRef = useRef(false);
    /* A busca só dispara depois de o usuário digitar. Sem isto, abrir o modal
       para editar uma revisão já disparava consulta e sobrescrevia o que
       acabou de ser carregado do banco. */
    const sapDigitadoRef = useRef(false);
    const debounceSapRef = useRef(null);

    const [expandido, setExpandido] = useState({});

    /* Folha de ações do celular. Esta tela tem DOIS níveis de ação, e a
       folha precisa refletir os dois: a linha do material traz nova revisão
       e excluir material; a linha de revisão, dentro da expansão, traz
       editar e excluir aquela revisão. Um estado só, com o tipo dentro, em
       vez de dois estados que poderiam abrir juntos. */
    const [sheet, setSheet] = useState(null);
    /* Material aberto em modo leitura. */
    const [viewMaterial, setViewMaterial] = useState(null);

    /* Só abre onde as colunas de ações estão escondidas. Acima disso os
       ícones estão à vista e o clique na linha não deve fazer nada. */
    const noCelular = () => typeof window !== 'undefined'
        && window.matchMedia('(max-width: 1024px)').matches;

    const abrirFolhaMaterial = (material) => {
        if (noCelular()) setSheet({ tipo: 'material', material });
    };

    const abrirFolhaRevisao = (material, revisao) => {
        if (noCelular()) setSheet({ tipo: 'revisao', material, revisao });
    };

    /* "Editar" no modal de leitura abre a revisão mais recente — o backend
       devolve `revisoes` por id decrescente, então é a primeira. Sem nenhuma
       revisão, o caminho útil é criar a primeira. */
    const editarRevisaoMaisRecente = (material) => {
        const revisoes = material.revisoes || [];
        if (revisoes.length) abrirEdicao(material, revisoes[0]);
        else abrirNovaRevisao(material);
    };

    /* Ações e título mudam com o nível tocado. */
    const acoesDaFolha = sheet?.tipo === 'revisao'
        ? [
            {
                id: 'editar', rotulo: 'Editar', icone: 'fa-edit', className: 'btn-edit',
                onClick: (s) => abrirEdicao(s.material, s.revisao)
            },
            {
                id: 'excluir', rotulo: 'Excluir', icone: 'fa-trash', className: 'btn-delete',
                onClick: (s) => excluirRevisao(s.revisao)
            }
        ]
        : [
            {
                id: 'ver', rotulo: 'Ver', icone: 'fa-eye', className: 'btn-view',
                onClick: (s) => setViewMaterial(s.material)
            },
            {
                /* O equivalente ao "+" da coluna: nesta tela não se edita o
                   material, cria-se uma revisão nova dele. */
                id: 'nova', rotulo: 'Nova revisão', icone: 'fa-plus', className: 'btn-edit',
                onClick: (s) => abrirNovaRevisao(s.material)
            },
            {
                id: 'excluir', rotulo: 'Excluir', icone: 'fa-trash', className: 'btn-delete',
                onClick: (s) => excluirMaterial(s.material)
            }
        ];

    const tituloDaFolha = !sheet ? ''
        : sheet.tipo === 'revisao'
            ? `${sheet.material.codigo_sap} — Rev. ${sheet.revisao.revisao}`
            : (sheet.material.codigo_sap || 'Material');

    /* Componente e Aplicação crescem até caber o texto. `rows` fixo não
       resolve: medido, duas linhas cortavam uma descrição de 38 caracteres na
       coluna de 178px do celular, e qualquer número escolhido erra para o
       texto seguinte. A altura entra no style porque depende do conteúdo e da
       largura da coluna, coisas que o CSS não mede. */
    const componenteRef = useRef(null);
    const aplicacaoRef = useRef(null);

    const ajustarAltura = (el) => {
        if (!el) return;
        /* 'auto' antes de medir: sem isso o scrollHeight nunca diminui, e o
           campo só cresceria. */
        el.style.height = 'auto';
        /* Somar as bordas: com `box-sizing: border-box` o `height` define a
           caixa com borda, mas o `scrollHeight` mede só conteúdo + padding.
           Sem isto sobravam ~2px de corte em toda largura — medido. */
        const bordas = el.offsetHeight - el.clientHeight;
        el.style.height = `${el.scrollHeight + bordas}px`;
    };

    useLayoutEffect(() => {
        ajustarAltura(componenteRef.current);
        ajustarAltura(aplicacaoRef.current);
    }, [formData.componente, formData.aplicacao, modalAberto, formViewMode, activeTab]);

    /* A largura da coluna muda com a tela, e com ela o número de linhas. */
    useEffect(() => {
        const aoRedimensionar = () => {
            ajustarAltura(componenteRef.current);
            ajustarAltura(aplicacaoRef.current);
        };
        window.addEventListener('resize', aoRedimensionar);
        return () => window.removeEventListener('resize', aoRedimensionar);
    }, []);

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro('');
        try {
            /* As APIs paginam em no máximo 100 por página; o laço junta tudo
               para a busca e a contagem valerem sobre a base inteira. */
            const todos = [];
            let page = 1;
            let pages = 1;
            do {
                const resp = await materiaisAPI.getAll({ page, limit: 100 });
                const dados = resp.data?.data || resp.data || {};
                todos.push(...(dados.materiais || []));
                pages = dados.pages || 1;
                page += 1;
            } while (page <= pages);
            setMateriais(todos);
        } catch (e) {
            setErro(e.response?.data?.message || 'Não foi possível carregar os materiais');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const setCampo = (campo, valor) => {
        setFormData((prev) => ({ ...prev, [campo]: valor }));
        setFormDirty(true);
    };

    const fecharModal = () => {
        setModalAberto(false);
        setFormDirty(false);
        setConfirmarSaida(false);
        setErroLink('');
        setPreviaFalhou(false);
        setPosicoesAbertas({});
    };

    /* Único caminho de fechamento: o X, o Cancelar, o clique no fundo e o Esc
       passam por aqui, senão um deles descartaria o preenchimento em silêncio. */
    const solicitarFechamento = () => {
        if (formDirty) {
            setConfirmarSaida(true);
            return;
        }
        fecharModal();
    };

    /* Duas fontes, nesta ordem.

       1. A tabela de materiais: se o código já está cadastrado, o componente
          tem de ser o mesmo que consta lá — o caso comum aqui é lançar uma
          revisão nova de um material que já existe, e divergir do cadastro só
          criaria dois nomes para a mesma peça.

       2. A base de produtos do SAP: para código ainda não cadastrado, traz a
          descrição oficial em vez de deixar o inspetor digitar de memória. */
    const buscarSugestoesSap = async (termo) => {
        const achados = [];
        const vistos = new Set();
        /* Dedup por código: um material cadastrado costuma existir também na
           base do SAP, e a entrada do cadastro é a que vale. */
        const juntar = (codigo, descricao, origem) => {
            const cod = String(codigo || '').trim().toUpperCase();
            if (!cod || vistos.has(cod)) return;
            vistos.add(cod);
            achados.push({
                codigo_sap: cod,
                componente: String(descricao || '').trim(),
                origem
            });
        };

        try {
            const resp = await materiaisAPI.search(termo);
            const dados = resp.data?.data || resp.data || {};
            (dados.materiais || []).forEach(
                (m) => juntar(m.codigo_sap, m.componente, 'material'));
        } catch {
            /* Segue para o SAP. */
        }

        try {
            const resp = await produtosAPI.search(termo);
            const lista = resp.data?.data;
            (Array.isArray(lista) ? lista : []).forEach(
                (p) => juntar(p.cod_material, p.desc_material, 'produto'));
        } catch {
            /* Nada encontrado é resposta esperada para código novo, e o
               endpoint recusa termo com menos de dois caracteres: nenhum dos
               dois é erro a exibir. */
        }

        return achados;
    };

    /* Escolha na lista: o código vem inteiro e a descrição junto, então não há
       mais o que buscar. Desligar `sapDigitadoRef` impede que a própria
       mudança do campo reabra a lista logo em seguida; a próxima tecla no
       campo religa a busca. */
    const selecionarSugestao = (item) => {
        sapDigitadoRef.current = false;
        setSugestoesAbertas(false);
        if (item.componente) {
            autoPreenchidoRef.current = true;
            setOrigemComponente(item.origem);
        }
        setFormData((prev) => ({
            ...prev,
            codigo_sap: item.codigo_sap,
            componente: item.componente || prev.componente
        }));
        setFormDirty(true);
    };

    useEffect(() => {
        if (!modalAberto || !sapDigitadoRef.current) return;

        const codigo = String(formData.codigo_sap || '').trim().toUpperCase();
        clearTimeout(debounceSapRef.current);

        /* Dois caracteres é o mínimo que a busca de produtos aceita, e abaixo
           disso a lista traria a base inteira. */
        if (codigo.length < 2) {
            setBuscandoComponente(false);
            setOrigemComponente('');
            setSugestoesSap([]);
            setSugestoesAbertas(false);
            return;
        }

        let cancelado = false;
        debounceSapRef.current = setTimeout(async () => {
            setBuscandoComponente(true);
            try {
                const achados = await buscarSugestoesSap(codigo);
                if (cancelado) return;

                setSugestoesSap(achados);
                setSugestoesAbertas(achados.length > 0);

                /* Uma consulta serve aos dois usos: enche a lista e, quando o
                   código digitado é um dos resultados, preenche o Componente
                   sem exigir o clique — que é como a tela funcionava antes de
                   existir lista. */
                const achado = achados.find(
                    (a) => a.codigo_sap === codigo && a.componente);

                if (achado) {
                    setFormData((prev) => ({ ...prev, componente: achado.componente }));
                    setOrigemComponente(achado.origem);
                    autoPreenchidoRef.current = true;
                } else if (autoPreenchidoRef.current) {
                    /* Limpa apenas o que a própria busca havia preenchido: o
                       código mudou para um que não existe, e manter a descrição
                       do código anterior seria pior que o campo vazio. Digitação
                       manual nunca é apagada. */
                    setFormData((prev) => ({ ...prev, componente: '' }));
                    setOrigemComponente('');
                    autoPreenchidoRef.current = false;
                } else {
                    setOrigemComponente('');
                }
            } finally {
                if (!cancelado) setBuscandoComponente(false);
            }
        }, 450);

        return () => {
            cancelado = true;
            clearTimeout(debounceSapRef.current);
        };
    }, [formData.codigo_sap, modalAberto]);

    useEffect(() => () => clearTimeout(debounceSapRef.current), []);

    /* Fechar a aba ou recarregar também é saída: o navegador mostra o próprio
       aviso, que o diálogo do sistema não alcança. */
    useEffect(() => {
        if (!modalAberto || !formDirty) return undefined;
        const proteger = (evento) => { evento.preventDefault(); evento.returnValue = ''; };
        window.addEventListener('beforeunload', proteger);
        return () => window.removeEventListener('beforeunload', proteger);
    }, [modalAberto, formDirty]);

    const updatePosicao = (i, campo, valor) => {
        setPosicoes((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));
        setFormDirty(true);
    };

    const alternarPosicao = (indice) => setPosicoesAbertas((prev) => (
        { ...prev, [indice]: !prev[indice] }
    ));

    const addPosicao = () => {
        setPosicoes((prev) => {
            /* A posição recém-criada abre sozinha: ela nasce vazia, e o passo
               seguinte é sempre preencher. */
            setPosicoesAbertas((abertas) => ({ ...abertas, [prev.length]: true }));
            return [...prev, posicaoVazia()];
        });
        setFormDirty(true);
    };

    const removePosicao = (i) => {
        setPosicoes((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
        /* As chaves são índices, então remover do meio desloca as seguintes:
           sem reindexar, o card errado apareceria aberto. */
        setPosicoesAbertas((prev) => {
            const novo = {};
            Object.keys(prev).forEach((k) => {
                const idx = Number(k);
                if (idx < i) novo[idx] = prev[k];
                else if (idx > i) novo[idx - 1] = prev[k];
            });
            return novo;
        });
        setFormDirty(true);
    };

    /* Estado zerado a cada abertura do modal. Fica numa função só porque os
       três caminhos de abertura precisam do mesmo reset, e um deles esquecer
       significaria pedir confirmação de saída sem alteração alguma, ou pior,
       uma busca apagando o que acabou de vir do banco. */
    const zerarEstadoDoModal = () => {
        clearTimeout(debounceSapRef.current);
        sapDigitadoRef.current = false;
        autoPreenchidoRef.current = false;
        setBuscandoComponente(false);
        setOrigemComponente('');
        setSugestoesSap([]);
        setSugestoesAbertas(false);
        setFormDirty(false);
        setConfirmarSaida(false);
    };

    const abrirNovo = () => {
        zerarEstadoDoModal();
        setRevisaoEmEdicao(null);
        setFormData(formVazio());
        setPosicoes([posicaoVazia()]);
        setActiveTab('dados');
        setAlerta('');
        setModalAberto(true);
    };

    const abrirNovaRevisao = (material) => {
        /* Herda a identificação do material: só a revisão e as cotas mudam. */
        zerarEstadoDoModal();
        setRevisaoEmEdicao(null);
        setFormData({
            ...formVazio(),
            codigo_sap: material.codigo_sap,
            componente: material.componente || '',
            aplicacao: material.aplicacao || '',
            setor: material.setor || SETOR_PADRAO
        });
        setPosicoes([posicaoVazia()]);
        setActiveTab('dados');
        setAlerta('');
        setModalAberto(true);
    };

    const abrirEdicao = async (material, revisao) => {
        setAlerta('');
        zerarEstadoDoModal();
        try {
            const resp = await revisoesAPI.getById(revisao.id);
            const dados = resp.data?.data || resp.data || {};
            setRevisaoEmEdicao({ id: revisao.id, material_id: material.id });
            setFormData({
                codigo_sap: material.codigo_sap,
                componente: material.componente || '',
                aplicacao: material.aplicacao || '',
                setor: material.setor || SETOR_PADRAO,
                revisao_desenho: dados.revisao || '',
                data: dados.data || '',
                observacoes: dados.observacoes || '',
                link_desenho: dados.link_desenho || ''
            });
            setPosicoes(dados.posicoes?.length
                ? dados.posicoes.map((p) => ({
                    posicao: p.posicao || '', cota: p.cota || '',
                    /* Posição gravada sem instrumento recebe o padrão; o que já
                       tem instrumento próprio é preservado. */
                    instrumento: p.instrumento || INSTRUMENTO_PADRAO,
                    observacoes: p.observacoes || ''
                }))
                : [posicaoVazia()]);
            setActiveTab('dados');
            setModalAberto(true);
        } catch (e) {
            setErro(e.response?.data?.message || 'Não foi possível abrir a revisão');
        }
    };

    const posicoesPreenchidas = () => posicoes.filter((p) => String(p.posicao || '').trim());

    const validar = () => {
        const faltando = [];
        if (!String(formData.codigo_sap).trim()) faltando.push('Cód. SAP');
        if (!String(formData.revisao_desenho).trim()) faltando.push('Revisão do desenho');
        if (faltando.length) {
            setActiveTab('dados');
            return `Preencha: ${faltando.join(', ')}`;
        }
        if (!posicoesPreenchidas().length) {
            setActiveTab('cotas');
            return 'Cadastre ao menos uma posição na aba Cotas Dimensionais';
        }
        if (!linkValido(formData.link_desenho)) {
            setActiveTab('cotas');
            setErroLink('Informe um link válido começando com http:// ou https://');
            return 'O link do desenho não é válido';
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
                ...formData,
                posicoes: posicoesPreenchidas()
            }, ['codigo_sap', 'componente', 'aplicacao', 'setor', 'revisao_desenho']);

            if (revisaoEmEdicao) {
                /* O cadastro do material e a revisão são recursos distintos:
                   editar a revisão não deve alterar silenciosamente o material,
                   então os dois vão em chamadas separadas.

                   `fornecedor` não é enviado de propósito: saiu desta tela, e
                   mandar vazio apagaria o valor de materiais antigos. A coluna
                   segue no banco e a API continua aceitando o campo. */
                await materiaisAPI.update(revisaoEmEdicao.material_id, {
                    codigo_sap: payload.codigo_sap,
                    componente: payload.componente,
                    aplicacao: payload.aplicacao,
                    setor: payload.setor
                });
                await revisoesAPI.update(revisaoEmEdicao.id, {
                    revisao_desenho: payload.revisao_desenho,
                    data: payload.data || null,
                    observacoes: payload.observacoes,
                    /* Enviado sempre, inclusive vazio: e assim que a tela
                       remove um link que existia. */
                    link_desenho: payload.link_desenho,
                    posicoes: payload.posicoes
                });
            } else {
                await materiaisAPI.create({ ...payload, data: payload.data || null });
            }

            /* fecharModal e não setModalAberto: salvou, então não há mais
               alteração pendente e reabrir o modal não deve pedir confirmação. */
            fecharModal();
            await carregar();
        } catch (e) {
            setAlerta(e.response?.data?.message || 'Não foi possível salvar');
        } finally {
            setSalvando(false);
        }
    };

    const excluirRevisao = async (revisao) => {
        if (!window.confirm(`Excluir a revisão ${revisao.revisao}?`)) return;
        try {
            await revisoesAPI.delete(revisao.id);
            await carregar();
        } catch (e) {
            setErro(e.response?.data?.message || 'Não foi possível excluir a revisão');
        }
    };

    const excluirMaterial = async (material) => {
        if (!window.confirm(`Excluir o material ${material.codigo_sap} e todas as suas revisões?`)) return;
        try {
            await materiaisAPI.delete(material.id);
            await carregar();
        } catch (e) {
            setErro(e.response?.data?.message || 'Não foi possível excluir o material');
        }
    };

    /* Link em condicao de ser aberto: preenchido e no formato certo. Serve de
       guarda do href, para o botao nunca navegar para valor invalido. */
    const linkPronto = (() => {
        const texto = String(formData.link_desenho || '').trim();
        return texto && linkValido(texto) ? texto : '';
    })();

    const termo = busca.trim().toLowerCase();
    const visiveis = termo
        ? materiais.filter((m) => [m.codigo_sap, m.componente, m.setor]
            .some((v) => String(v || '').toLowerCase().includes(termo)))
        : materiais;

    const totalRevisoes = materiais.reduce((soma, m) => soma + (m.revisoes?.length || 0), 0);
    const semRevisao = materiais.filter((m) => !(m.revisoes?.length)).length;

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Cadastro de Material' }]}
            containerClassName="cadastro-material-page"
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-drafting-compass"></i> Cadastro de Material</h1>
                        <p>Materiais, revisões de desenho e as cotas que servem de referência para a inspeção</p>
                    </div>
                    <div className="header-actions">
                        <button className="btn btn-primary" onClick={abrirNovo}>
                            <i className="fas fa-plus"></i> Novo Material / Revisão
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

                {/* Cards de resumo do UI Kit, mesma anatomia da Inspeção de Injeção:
                    título com ícone, valor grande, descrição e faixa de tom no pé. */}
                <div className="summary-grid">
                    <article className="summary-card total">
                        <div className="summary-heading">
                            <i className="fas fa-cubes" aria-hidden="true"></i>
                            <span>Materiais</span>
                        </div>
                        <strong>{loading ? '—' : materiais.length}</strong>
                        <small>Códigos cadastrados</small>
                        <span className="summary-line" aria-hidden="true"></span>
                    </article>
                    <article className="summary-card approved">
                        <div className="summary-heading">
                            <i className="fas fa-file-lines" aria-hidden="true"></i>
                            <span>Revisões</span>
                        </div>
                        <strong>{loading ? '—' : totalRevisoes}</strong>
                        <small>Revisões de desenho</small>
                        <span className="summary-line" aria-hidden="true"></span>
                    </article>
                    <article className="summary-card pending">
                        <div className="summary-heading">
                            <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                            <span>Sem revisão</span>
                        </div>
                        <strong>{loading ? '—' : semRevisao}</strong>
                        <small>Materiais sem cotas</small>
                        <span className="summary-line" aria-hidden="true"></span>
                    </article>
                </div>

                <div className="filters-card">
                    <div className="material-busca">
                        <i className="fas fa-search" aria-hidden="true"></i>
                        <input
                            type="search"
                            className="form-control"
                            placeholder="Buscar por código SAP, componente ou setor"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            aria-label="Buscar material"
                        />
                    </div>
                </div>

                <div className="table-card">
                    {/* A tabela é renderizada sempre, inclusive vazia: o aviso vai
                        numa linha com colSpan, como na Inspeção de Injeção. Trocar
                        a tabela por um parágrafo fazia o cabeçalho e o container
                        desaparecerem justamente quando não há dados. */}
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}></th>
                                    <th>Cód. SAP</th>
                                    <th>Componente</th>
                                    <th className="col-hide">Aplicação</th>
                                    <th className="col-hide">Setor</th>
                                    <th className="col-num">Revisões</th>
                                    <th className="col-acoes">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center' }}>Carregando...</td></tr>
                                ) : !visiveis.length ? (
                                    <tr><td colSpan="7" style={{ textAlign: 'center' }}>
                                        {materiais.length
                                            ? 'Nenhum material corresponde à busca'
                                            : 'Nenhum material encontrado'}
                                    </td></tr>
                                ) : (
                                    visiveis.map((material) => {
                                        const aberto = !!expandido[material.id];
                                        const revisoes = material.revisoes || [];
                                        return [
                                            <tr key={material.id}
                                                className={`mobile-clickable-row ${sheet?.tipo === 'material' && sheet.material.id === material.id ? 'mobile-row-active' : ''}`}
                                                onClick={() => abrirFolhaMaterial(material)}>
                                                <td>
                                                    {/* stopPropagation: expandir as revisões é ação
                                                        do próprio botão, e sem isto o toque também
                                                        abriria a folha de ações da linha. */}
                                                    <button
                                                        type="button"
                                                        className="btn-expandir"
                                                        onClick={(e) => { e.stopPropagation(); setExpandido((p) => ({ ...p, [material.id]: !aberto })); }}
                                                        aria-expanded={aberto}
                                                        aria-label={aberto ? 'Ocultar revisões' : 'Ver revisões'}
                                                        disabled={!revisoes.length}
                                                    >
                                                        <i className={`fas fa-chevron-${aberto ? 'down' : 'right'}`}></i>
                                                    </button>
                                                </td>
                                                <td><strong>{material.codigo_sap}</strong></td>
                                                <td>{material.componente || '—'}</td>
                                                <td className="col-hide">{material.aplicacao || '—'}</td>
                                                <td className="col-hide">{material.setor || '—'}</td>
                                                <td className="col-num">
                                                    <span className={`badge ${revisoes.length ? 'badge-info' : 'badge-warning'}`}>
                                                        {revisoes.length}
                                                    </span>
                                                </td>
                                                <td className="col-acoes">
                                                    {/* .acoes deixa os botões lado a lado; sem ele
                                                        quebravam em coluna na célula estreita. As
                                                        variantes de cor são as do UI Kit. */}
                                                    <div className="acoes">
                                                        {/* Sem botão de "visualizar" aqui: a seta da
                                                            primeira coluna já abre as revisões, e os
                                                            dados do material são as próprias colunas
                                                            da linha. */}
                                                        <button className="btn-icon btn-edit"
                                                            title="Nova revisão deste material"
                                                            aria-label={`Nova revisão de ${material.codigo_sap}`}
                                                            onClick={(e) => { e.stopPropagation(); abrirNovaRevisao(material); }}>
                                                            <i className="fas fa-plus" aria-hidden="true"></i>
                                                        </button>
                                                        <button className="btn-icon btn-delete"
                                                            title="Excluir material"
                                                            aria-label={`Excluir ${material.codigo_sap}`}
                                                            onClick={(e) => { e.stopPropagation(); excluirMaterial(material); }}>
                                                            <i className="fas fa-trash" aria-hidden="true"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>,
                                            aberto && (
                                                <tr key={`${material.id}-revisoes`} className="linha-revisoes">
                                                    <td colSpan={7}>
                                                        {/* Classe `table` também aqui: a sub-tabela herda
                                                            cabeçalho, padding e divisores da tabela
                                                            principal, em vez de ter estilo próprio. */}
                                                        <table className="table tabela-revisoes">
                                                            <thead>
                                                                <tr>
                                                                    <th>Revisão</th>
                                                                    <th>Data</th>
                                                                    <th className="col-num">Posições</th>
                                                                    <th className="col-acoes">Ações</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {revisoes.map((rev) => (
                                                                    /* Segundo nível de ações: no celular
                                                                       esta linha abre a folha com editar
                                                                       e excluir daquela revisão. */
                                                                    <tr key={rev.id}
                                                                        className={`mobile-clickable-row ${sheet?.tipo === 'revisao' && sheet.revisao.id === rev.id ? 'mobile-row-active' : ''}`}
                                                                        onClick={() => abrirFolhaRevisao(material, rev)}>
                                                                        <td><strong>{rev.revisao}</strong></td>
                                                                        <td>{rev.data ? rev.data.split('-').reverse().join('/') : '—'}</td>
                                                                        <td className="col-num">{rev.total_posicoes}</td>
                                                                        <td className="col-acoes">
                                                                            <div className="acoes">
                                                                                <button className="btn-icon btn-edit"
                                                                                    title="Editar revisão"
                                                                                    aria-label={`Editar revisão ${rev.revisao}`}
                                                                                    onClick={(e) => { e.stopPropagation(); abrirEdicao(material, rev); }}>
                                                                                    <i className="fas fa-pen" aria-hidden="true"></i>
                                                                                </button>
                                                                                <button className="btn-icon btn-delete"
                                                                                    title="Excluir revisão"
                                                                                    aria-label={`Excluir revisão ${rev.revisao}`}
                                                                                    onClick={(e) => { e.stopPropagation(); excluirRevisao(rev); }}>
                                                                                    <i className="fas fa-trash" aria-hidden="true"></i>
                                                                                </button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )
                                        ];
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {modalAberto && (
                    <div className="modal-overlay material-modal" onClick={() => !salvando && solicitarFechamento()}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{revisaoEmEdicao ? 'Editar Revisão' : 'Novo Material / Revisão'}</h2>
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
                                    ariaLabel="Seções do cadastro"
                                    activeId={activeTab}
                                    onChange={setActiveTab}
                                    /* Rótulos curtos, como na Injeção: o título completo de
                                       cada seção já aparece no conteúdo, e "Dados do Material
                                       / Revisão" numa aba pedia a largura inteira do celular. */
                                    items={[
                                        {
                                            id: 'dados',
                                            label: 'Dados',
                                            icon: <i className="fas fa-file-lines" aria-hidden="true"></i>
                                        },
                                        {
                                            id: 'cotas',
                                            label: 'Cotas',
                                            count: posicoesPreenchidas().length,
                                            icon: <i className="fas fa-ruler-combined" aria-hidden="true"></i>
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

                                {(formViewMode === 'geral' || activeTab === 'dados') && (
                                    <div className="form-section">
                                        {/* O título por extenso vive aqui porque a aba usa o
                                            rótulo curto. Serve também à visão geral, onde as
                                            seções vêm em sequência e precisam se identificar. */}
                                        <h3 className="section-title">Dados do Material / Revisão</h3>
                                        {/* Identificação do material na primeira linha: digitar o
                                            Cód. SAP preenche o Componente ao lado, então os dois
                                            juntos deixam a resposta da busca à vista.

                                            `linha-identificacao` marca só esta linha: no celular os
                                            três campos empilham, enquanto a linha de baixo (revisão,
                                            data, setor, observações) segue em duas colunas. Mesmo
                                            nome e mesmo breakpoint da aba Identificação da Inspeção
                                            de Recebimento. */}
                                        <div className="form-row-material linha-identificacao">
                                            {/* onBlur no conjunto, não no input: clicar num item da
                                                lista também é um blur do campo, e fechar ali
                                                cancelaria a escolha antes de o clique valer. */}
                                            <div className="form-group campo-autocomplete"
                                                onBlur={(e) => {
                                                    if (!e.currentTarget.contains(e.relatedTarget)) {
                                                        setSugestoesAbertas(false);
                                                    }
                                                }}>
                                                <label htmlFor="codigo-sap">Cód. SAP *</label>
                                                <div className="campo-com-status">
                                                    <input id="codigo-sap" type="text"
                                                        className="form-control field-upper"
                                                        value={formData.codigo_sap}
                                                        onChange={(e) => {
                                                            /* Libera a busca: a partir daqui o valor é do
                                                               usuário, não o que o modal carregou. */
                                                            sapDigitadoRef.current = true;
                                                            setCampo('codigo_sap', e.target.value);
                                                        }}
                                                        onFocus={() => sugestoesSap.length
                                                            && setSugestoesAbertas(true)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Escape' && sugestoesAbertas) {
                                                                e.stopPropagation();
                                                                setSugestoesAbertas(false);
                                                            }
                                                        }}
                                                        placeholder="Digite para buscar"
                                                        autoComplete="off"
                                                        role="combobox"
                                                        aria-expanded={sugestoesAbertas}
                                                        aria-autocomplete="list"
                                                        aria-required="true" />
                                                    {/* O spinner mora no campo que dispara a consulta.
                                                        Antes ficava no Componente, que só recebe o
                                                        resultado. */}
                                                    {buscandoComponente && (
                                                        <span className="campo-spinner" role="status"
                                                            aria-label="Buscando código SAP">
                                                            <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                                                        </span>
                                                    )}
                                                </div>
                                                {sugestoesAbertas && sugestoesSap.length > 0 && (
                                                    <ul className="autocomplete-lista" role="listbox">
                                                        {sugestoesSap.map((s) => (
                                                            <li key={s.codigo_sap}>
                                                                <button type="button" className="autocomplete-item"
                                                                    onClick={() => selecionarSugestao(s)}>
                                                                    <span className="autocomplete-cod">{s.codigo_sap}</span>
                                                                    <span className="autocomplete-desc">
                                                                        {s.componente || '—'}
                                                                    </span>
                                                                    <span className="autocomplete-meta">
                                                                        {s.origem === 'material' ? 'cadastrado' : 'SAP'}
                                                                    </span>
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label htmlFor="componente">Componente</label>
                                                {/* readOnly: o valor vem sempre do Cód. SAP — do
                                                    material já cadastrado ou da base do SAP. Como
                                                    textarea e não input para a descrição quebrar em
                                                    linha em vez de correr para fora do campo. Sem
                                                    `tabIndex={-1}`: continua focável para selecionar
                                                    e copiar o texto. */}
                                                <textarea id="componente" rows="2" readOnly
                                                    ref={componenteRef}
                                                    aria-readonly="true"
                                                    className="form-control field-upper campo-multilinha campo-lido"
                                                    value={formData.componente} />
                                                {origemComponente && (
                                                    <small className="campo-ajuda">
                                                        {origemComponente === 'material'
                                                            ? 'Preenchido a partir do material já cadastrado.'
                                                            : 'Preenchido a partir da descrição do SAP.'}
                                                    </small>
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label htmlFor="aplicacao">Aplicação</label>
                                                {/* Editável, ao contrário do Componente: a mesma peça
                                                    pode ter aplicação diferente. Também textarea,
                                                    pelo mesmo motivo de leitura. */}
                                                <textarea id="aplicacao" rows="2"
                                                    ref={aplicacaoRef}
                                                    className="form-control field-upper campo-multilinha"
                                                    value={formData.aplicacao}
                                                    onChange={(e) => setCampo('aplicacao', e.target.value)} />
                                            </div>
                                        </div>

                                        {/* Dados da revisão na segunda linha, com o Setor, que antes
                                            ocupava uma linha inteira sozinho. O Fornecedor não está
                                            aqui de propósito: pertence ao lote recebido, e vive na
                                            tela de Inspeção de Recebimento. */}
                                        <div className="form-row-material">
                                            <div className="form-group">
                                                <label>Revisão do Desenho *</label>
                                                <input type="text" className="form-control field-upper"
                                                    value={formData.revisao_desenho}
                                                    onChange={(e) => setCampo('revisao_desenho', e.target.value)}
                                                    placeholder="Ex: A, REV01" aria-required="true" />
                                            </div>
                                            <div className="form-group">
                                                <label>Data da Revisão</label>
                                                <input type="date" className="form-control"
                                                    value={formData.data || ''}
                                                    onChange={(e) => setCampo('data', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label htmlFor="setor">Setor</label>
                                                {/* Fixo: este cadastro serve ao fluxo de recebimento, e o
                                                    setor não é escolha do usuário. readOnly em vez de
                                                    disabled, para o valor continuar sendo enviado no
                                                    formulário e chegar ao banco. */}
                                                <input id="setor" type="text"
                                                    className="form-control campo-travado"
                                                    value={formData.setor} readOnly
                                                    aria-readonly="true" tabIndex={-1} />
                                            </div>
                                            {/* Dentro da mesma linha do Setor de propósito: no
                                                celular a grade tem duas colunas e os dois dividem a
                                                linha. No desktop volta a ocupar a linha inteira,
                                                pelo CSS. */}
                                            <div className="form-group form-group-observacao">
                                                <label htmlFor="obs-revisao">Observações da revisão</label>
                                                <textarea id="obs-revisao" className="form-control" rows="2"
                                                    value={formData.observacoes}
                                                    onChange={(e) => setCampo('observacoes', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {(formViewMode === 'geral' || activeTab === 'cotas') && (
                                    <div className="form-section">
                                        <div className="section-header-linha">
                                            <h3 className="section-title">Cotas Dimensionais da Revisão</h3>
                                            <div className="resultados-acoes">
                                                {/* Com tudo fechado, conferir as cotas exigiria abrir uma a
                                                    uma; este botão devolve a visão completa. */}
                                                <button type="button" className="btn btn-outline btn-sm"
                                                    onClick={() => setPosicoesAbertas(
                                                        posicoes.every((_, i) => posicoesAbertas[i])
                                                            ? {}
                                                            : Object.fromEntries(posicoes.map((_, i) => [i, true]))
                                                    )}>
                                                    <i className={`fas fa-chevron-${posicoes.every((_, i) => posicoesAbertas[i]) ? 'up' : 'down'}`}
                                                        aria-hidden="true"></i>
                                                    {posicoes.every((_, i) => posicoesAbertas[i]) ? ' Recolher todas' : ' Abrir todas'}
                                                </button>
                                                <button type="button" className="btn btn-outline btn-sm" onClick={addPosicao}>
                                                    <i className="fas fa-plus"></i> Adicionar posição
                                                </button>
                                            </div>
                                        </div>

                                        {/* Um card por posição. A cota é editável aqui porque é
                                            nesta tela que ela é definida; na inspeção o mesmo card
                                            a mostra travada, como referência. */}
                                        <div className="cotas-grid">
                                            {posicoes.map((p, i) => {
                                                const aberto = !!posicoesAbertas[i];
                                                /* Aqui não há medição: o tom marca se a posição já foi
                                                   identificada, que é o que falta para poder salvar. */
                                                const identificada = !!String(p.posicao || '').trim();
                                                return (
                                                <div className={`cota-card ${aberto ? 'is-aberto' : 'is-colapsado'} ${identificada ? 'tom-medido' : ''}`}
                                                    key={i}>
                                                    <header className="cota-card-topo">
                                                        <button type="button" className="cota-toggle"
                                                            onClick={() => alternarPosicao(i)}
                                                            aria-expanded={aberto}
                                                            aria-controls={`cota-corpo-cad-${i}`}>
                                                            <i className="fas fa-chevron-right cota-toggle-seta" aria-hidden="true"></i>
                                                            <span className="cota-posicao">
                                                                <i className="fas fa-location-dot" aria-hidden="true"></i>
                                                                {/* Colapsada, mostra a identificação do desenho, que
                                                                    é o que distingue uma posição da outra; sem ela,
                                                                    cai no número de ordem. */}
                                                                {String(p.posicao || '').trim() || `Posição ${i + 1}`}
                                                            </span>
                                                        </button>
                                                        <button type="button" className="cota-remover"
                                                            title="Remover posição"
                                                            aria-label={`Remover posição ${i + 1}`}
                                                            onClick={() => removePosicao(i)}
                                                            disabled={posicoes.length === 1}>
                                                            <i className="fas fa-trash" aria-hidden="true"></i>
                                                        </button>
                                                    </header>

                                                    {aberto && (<div className="cota-corpo" id={`cota-corpo-cad-${i}`}>
                                                    <div className="cota-campo">
                                                        <label htmlFor={`pos-${i}`}>Identificação no desenho *</label>
                                                        <input id={`pos-${i}`} type="text"
                                                            className="form-control field-upper" value={p.posicao}
                                                            onChange={(e) => updatePosicao(i, 'posicao', e.target.value)}
                                                            placeholder="26-01" />
                                                    </div>

                                                    <div className="cota-referencia">
                                                        <span className="cota-rotulo">Referência</span>
                                                        <input type="text" value={p.cota}
                                                            onChange={(e) => updatePosicao(i, 'cota', e.target.value)}
                                                            placeholder="1450 +50/-10"
                                                            aria-label={`Cota de referência da posição ${i + 1}`} />
                                                    </div>

                                                    <div className="cota-campo">
                                                        <label htmlFor={`inst-${i}`}>Instrumento</label>
                                                        {/* Select, e não input com datalist: o navegador filtra
                                                            o datalist pelo texto do campo, e com o padrão já
                                                            preenchido só ele casava — a lista parecia ter uma
                                                            opção só. */}
                                                        <select id={`inst-${i}`} className="form-control"
                                                            value={p.instrumento}
                                                            onChange={(e) => updatePosicao(i, 'instrumento', e.target.value)}>
                                                            <option value="">Selecione</option>
                                                            {/* Valor gravado fora da lista entra como opção, para
                                                                editar uma revisão antiga não o descartar. */}
                                                            {p.instrumento && !INSTRUMENTOS.includes(p.instrumento) && (
                                                                <option value={p.instrumento}>{p.instrumento}</option>
                                                            )}
                                                            {INSTRUMENTOS.map((nome) => (
                                                                <option key={nome} value={nome}>{nome}</option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="cota-campo cota-campo-final">
                                                        <label htmlFor={`obs-${i}`}>Observações</label>
                                                        <input id={`obs-${i}`} type="text" className="form-control"
                                                            value={p.observacoes}
                                                            onChange={(e) => updatePosicao(i, 'observacoes', e.target.value)} />
                                                    </div>
                                                    </div>)}
                                                </div>
                                                );
                                            })}
                                        </div>

                                        {/* Desenho da revisão, depois dos cards: é a referência que
                                            cobre todas as cotas acima, e fica à mão para consultar
                                            enquanto se preenche. Opcional. */}
                                        <div className="desenho-bloco">
                                            <div className="cota-campo">
                                                <label htmlFor="link-desenho">
                                                    <i className="fas fa-paperclip" aria-hidden="true"></i> Link do desenho técnico
                                                </label>
                                                <div className="desenho-linha">
                                                    <input
                                                        id="link-desenho"
                                                        type="url"
                                                        inputMode="url"
                                                        className={`form-control ${erroLink ? 'campo-com-erro' : ''}`}
                                                        value={formData.link_desenho}
                                                        onChange={(e) => {
                                                            setCampo('link_desenho', e.target.value);
                                                            if (erroLink) setErroLink('');
                                                            /* Link novo merece nova tentativa de previa. */
                                                            if (previaFalhou) setPreviaFalhou(false);
                                                        }}
                                                        placeholder="https://drive.google.com/..."
                                                        aria-invalid={!!erroLink}
                                                        aria-describedby="link-desenho-ajuda"
                                                    />
                                                    {/* rel noopener e noreferrer: sem eles a página aberta
                                                        recebe referência a esta janela e pode redirecioná-la. */}
                                                    <a
                                                        className={`btn btn-outline desenho-abrir ${linkPronto ? '' : 'is-inativo'}`}
                                                        href={linkPronto || undefined}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        aria-disabled={!linkPronto}
                                                        onClick={(e) => { if (!linkPronto) e.preventDefault(); }}
                                                        title={linkPronto ? 'Abrir o desenho em outra aba' : 'Informe um link válido para abrir'}
                                                    >
                                                        <i className="fas fa-up-right-from-square" aria-hidden="true"></i>
                                                        <span>Abrir desenho</span>
                                                    </a>
                                                </div>
                                                {erroLink ? (
                                                    <span className="campo-erro" role="alert">
                                                        <i className="fas fa-triangle-exclamation" aria-hidden="true"></i> {erroLink}
                                                    </span>
                                                ) : (
                                                    <small className="campo-ajuda" id="link-desenho-ajuda">
                                                        Opcional. Cole o link do Drive, SharePoint ou do storage interno.
                                                    </small>
                                                )}
                                            </div>

                                            {/* Prévia só para link que aponta a imagem direto. Drive e
                                                SharePoint devolvem página HTML, não a imagem, então
                                                ali sobra o botão de abrir — e o onError cobre o caso
                                                de a imagem existir mas não carregar. */}
                                            {linkPronto && ehImagemDireta(linkPronto) && !previaFalhou && (
                                                <a className="desenho-previa" href={linkPronto}
                                                    target="_blank" rel="noopener noreferrer"
                                                    title="Abrir o desenho em outra aba">
                                                    <img src={linkPronto} alt="Prévia do desenho técnico"
                                                        loading="lazy" onError={() => setPreviaFalhou(true)} />
                                                </a>
                                            )}
                                        </div>
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

                {/* Somente leitura. Usa o que a listagem já traz — não há
                    segunda consulta: `materiaisAPI.getAll` devolve o material
                    com as revisões. No celular é o único caminho para ver
                    Aplicação e Setor, que a tabela esconde nessa largura. */}
                {viewMaterial && (
                    <div className="modal-overlay material-modal" onClick={() => setViewMaterial(null)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Material</h2>
                                <button className="modal-close" onClick={() => setViewMaterial(null)}
                                    aria-label="Fechar">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            <div className="form-section">
                                <h3 className="section-title">Dados do Material</h3>
                                <div className="view-grid">
                                    <div className="view-item">
                                        <span className="view-label">Cód. SAP</span>
                                        <span className="view-value">{viewMaterial.codigo_sap || '—'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Componente</span>
                                        <span className="view-value">{viewMaterial.componente || '—'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Aplicação</span>
                                        <span className="view-value">{viewMaterial.aplicacao || '—'}</span>
                                    </div>
                                    <div className="view-item">
                                        <span className="view-label">Setor</span>
                                        <span className="view-value">{viewMaterial.setor || '—'}</span>
                                    </div>
                                </div>

                                <h3 className="section-title">Revisões do Desenho</h3>
                                {!(viewMaterial.revisoes || []).length ? (
                                    <p className="recb-vazio">Nenhuma revisão cadastrada.</p>
                                ) : (
                                    <div className="table-container">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Revisão</th>
                                                    <th>Data</th>
                                                    <th className="col-num">Cotas</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {viewMaterial.revisoes.map((rev) => (
                                                    <tr key={rev.id}>
                                                        <td><strong>{rev.revisao}</strong></td>
                                                        <td>{rev.data ? rev.data.split('-').reverse().join('/') : '—'}</td>
                                                        <td className="col-num">{rev.total_posicoes}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setViewMaterial(null)}>
                                    Fechar
                                </button>
                                {/* Atalho para editar sem voltar à tabela, como na
                                    Inspeção de Recebimento. */}
                                <button className="btn btn-primary"
                                    onClick={() => {
                                        const alvo = viewMaterial;
                                        setViewMaterial(null);
                                        editarRevisaoMaisRecente(alvo);
                                    }}>
                                    <i className="fas fa-pen" aria-hidden="true"></i> Editar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Uma folha só, com o conteúdo do nível tocado: material ou
                    revisão. As duas colunas de ações somem abaixo de 1024px,
                    e sem o segundo nível as ações de revisão ficariam sem
                    nenhum caminho no celular. */}
                <MobileActionSheet
                    item={sheet}
                    titulo={tituloDaFolha}
                    onFechar={() => setSheet(null)}
                    acoes={acoesDaFolha}
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
