import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '../../components/Layout/AppLayout';
import { Tabs } from '../../components/ui';
import { materiaisAPI, revisoesAPI, produtosAPI } from '../../services/api';
import { upperFields } from '../../utils/text';
import './CadastroMaterial.css';

/* Cadastro de Material e Revisão de Desenho.

   Separado da inspeção de propósito: aqui mora a referência técnica (o que o
   desenho manda) e lá a execução (o que o lote mediu). Uma revisão cadastrada
   uma vez serve a todas as inspeções daquele material. */

const INSTRUMENTOS = [
    'Paquímetro',
    'Micrômetro',
    'Relógio comparador',
    'Projetor de perfil',
    'Traçador de altura',
    'Calibrador passa/não passa',
    'Balança',
    'Visual'
];

const hoje = () => new Date().toISOString().slice(0, 10);

const posicaoVazia = () => ({ posicao: '', cota: '', instrumento: '', observacoes: '' });

const formVazio = () => ({
    codigo_sap: '',
    componente: '',
    aplicacao: '',
    setor: '',
    fornecedor: '',
    revisao_desenho: '',
    data: hoje(),
    observacoes: ''
});

export default function CadastroMaterial() {
    const [materiais, setMateriais] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');

    const [modalAberto, setModalAberto] = useState(false);
    const [activeTab, setActiveTab] = useState('dados');
    const [formData, setFormData] = useState(formVazio());
    const [posicoes, setPosicoes] = useState([posicaoVazia()]);
    const [salvando, setSalvando] = useState(false);
    const [alerta, setAlerta] = useState('');

    /* Quando preenchido, o modal está editando esta revisão em vez de criar. */
    const [revisaoEmEdicao, setRevisaoEmEdicao] = useState(null);

    /* ── Auto-preenchimento do Componente pelo Cód. SAP ── */
    const [buscandoComponente, setBuscandoComponente] = useState(false);
    const [origemComponente, setOrigemComponente] = useState('');
    /* O valor atual do Componente veio da busca? Só nesse caso uma busca
       seguinte pode substituí-lo ou limpá-lo. */
    const autoPreenchidoRef = useRef(false);
    /* A busca só dispara depois de o usuário digitar. Sem isto, abrir o modal
       para editar uma revisão já disparava consulta e sobrescrevia o que
       acabou de ser carregado do banco. */
    const sapDigitadoRef = useRef(false);
    const debounceSapRef = useRef(null);

    const [expandido, setExpandido] = useState({});

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

    const setCampo = (campo, valor) => setFormData((prev) => ({ ...prev, [campo]: valor }));

    /* Duas fontes, nesta ordem.

       1. A tabela de materiais: se o código já está cadastrado, o componente
          tem de ser o mesmo que consta lá — o caso comum aqui é lançar uma
          revisão nova de um material que já existe, e divergir do cadastro só
          criaria dois nomes para a mesma peça.

       2. A base de produtos do SAP: para código ainda não cadastrado, traz a
          descrição oficial em vez de deixar o inspetor digitar de memória. */
    const buscarComponentePorSap = async (codigo) => {
        try {
            const resp = await materiaisAPI.getAll({ codigo_sap: codigo, limit: 1 });
            const material = (resp.data?.data || resp.data || {}).materiais?.[0];
            if (material?.componente) {
                return { componente: material.componente, origem: 'material' };
            }
        } catch {
            /* Segue para o SAP. */
        }

        try {
            const resp = await produtosAPI.getByCode(codigo);
            const produto = resp.data?.data;
            if (produto?.desc_material) {
                return { componente: produto.desc_material, origem: 'produto' };
            }
        } catch {
            /* 404 é resposta esperada para código novo, não erro a exibir. */
        }

        return null;
    };

    useEffect(() => {
        if (!modalAberto || !sapDigitadoRef.current) return;

        const codigo = String(formData.codigo_sap || '').trim();
        clearTimeout(debounceSapRef.current);

        /* Menos de três caracteres ainda não é um código: consultar aqui só
           geraria chamada a cada tecla do começo da digitação. */
        if (codigo.length < 3) {
            setBuscandoComponente(false);
            setOrigemComponente('');
            return;
        }

        let cancelado = false;
        debounceSapRef.current = setTimeout(async () => {
            setBuscandoComponente(true);
            try {
                const achado = await buscarComponentePorSap(codigo);
                if (cancelado) return;

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

    const updatePosicao = (i, campo, valor) => setPosicoes((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));

    const addPosicao = () => setPosicoes((prev) => [...prev, posicaoVazia()]);

    const removePosicao = (i) => setPosicoes((prev) =>
        (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

    /* Toda abertura do modal começa sem busca pendente e sem marcar o
       Componente como preenchido pelo sistema — o valor que entra aqui vem do
       banco ou está vazio, e não deve ser apagado por uma busca. */
    const zerarBuscaSap = () => {
        clearTimeout(debounceSapRef.current);
        sapDigitadoRef.current = false;
        autoPreenchidoRef.current = false;
        setBuscandoComponente(false);
        setOrigemComponente('');
    };

    const abrirNovo = () => {
        zerarBuscaSap();
        setRevisaoEmEdicao(null);
        setFormData(formVazio());
        setPosicoes([posicaoVazia()]);
        setActiveTab('dados');
        setAlerta('');
        setModalAberto(true);
    };

    const abrirNovaRevisao = (material) => {
        /* Herda a identificação do material: só a revisão e as cotas mudam. */
        zerarBuscaSap();
        setRevisaoEmEdicao(null);
        setFormData({
            ...formVazio(),
            codigo_sap: material.codigo_sap,
            componente: material.componente || '',
            aplicacao: material.aplicacao || '',
            setor: material.setor || '',
            fornecedor: material.fornecedor || ''
        });
        setPosicoes([posicaoVazia()]);
        setActiveTab('dados');
        setAlerta('');
        setModalAberto(true);
    };

    const abrirEdicao = async (material, revisao) => {
        setAlerta('');
        zerarBuscaSap();
        try {
            const resp = await revisoesAPI.getById(revisao.id);
            const dados = resp.data?.data || resp.data || {};
            setRevisaoEmEdicao({ id: revisao.id, material_id: material.id });
            setFormData({
                codigo_sap: material.codigo_sap,
                componente: material.componente || '',
                aplicacao: material.aplicacao || '',
                setor: material.setor || '',
                fornecedor: material.fornecedor || '',
                revisao_desenho: dados.revisao || '',
                data: dados.data || '',
                observacoes: dados.observacoes || ''
            });
            setPosicoes(dados.posicoes?.length
                ? dados.posicoes.map((p) => ({
                    posicao: p.posicao || '', cota: p.cota || '',
                    instrumento: p.instrumento || '', observacoes: p.observacoes || ''
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
            }, ['codigo_sap', 'componente', 'aplicacao', 'setor', 'fornecedor', 'revisao_desenho']);

            if (revisaoEmEdicao) {
                /* O cadastro do material e a revisão são recursos distintos:
                   editar a revisão não deve alterar silenciosamente o material,
                   então os dois vão em chamadas separadas. */
                await materiaisAPI.update(revisaoEmEdicao.material_id, {
                    codigo_sap: payload.codigo_sap,
                    componente: payload.componente,
                    aplicacao: payload.aplicacao,
                    setor: payload.setor,
                    fornecedor: payload.fornecedor
                });
                await revisoesAPI.update(revisaoEmEdicao.id, {
                    revisao_desenho: payload.revisao_desenho,
                    data: payload.data || null,
                    observacoes: payload.observacoes,
                    posicoes: payload.posicoes
                });
            } else {
                await materiaisAPI.create({ ...payload, data: payload.data || null });
            }

            setModalAberto(false);
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

    const termo = busca.trim().toLowerCase();
    const visiveis = termo
        ? materiais.filter((m) => [m.codigo_sap, m.componente, m.fornecedor, m.setor]
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

                <div className="material-resumo">
                    <div className="material-resumo-card">
                        <span className="material-resumo-label">Materiais</span>
                        <strong className="material-resumo-valor">{materiais.length}</strong>
                    </div>
                    <div className="material-resumo-card">
                        <span className="material-resumo-label">Revisões</span>
                        <strong className="material-resumo-valor">{totalRevisoes}</strong>
                    </div>
                    <div className="material-resumo-card">
                        <span className="material-resumo-label">Sem revisão</span>
                        <strong className="material-resumo-valor">{semRevisao}</strong>
                    </div>
                </div>

                <div className="filters-card">
                    <div className="material-busca">
                        <i className="fas fa-search" aria-hidden="true"></i>
                        <input
                            type="search"
                            className="form-control"
                            placeholder="Buscar por código SAP, componente, fornecedor ou setor"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            aria-label="Buscar material"
                        />
                    </div>
                </div>

                <div className="table-card">
                    {loading ? (
                        <p className="material-vazio">Carregando…</p>
                    ) : !visiveis.length ? (
                        <p className="material-vazio">
                            {materiais.length
                                ? 'Nenhum material corresponde à busca.'
                                : 'Nenhum material cadastrado ainda.'}
                        </p>
                    ) : (
                        <div className="table-container">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 40 }}></th>
                                        <th>Cód. SAP</th>
                                        <th>Componente</th>
                                        <th className="col-hide">Aplicação</th>
                                        <th className="col-hide">Setor</th>
                                        <th>Fornecedor</th>
                                        <th className="col-num">Revisões</th>
                                        <th className="col-acoes">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visiveis.map((material) => {
                                        const aberto = !!expandido[material.id];
                                        const revisoes = material.revisoes || [];
                                        return [
                                            <tr key={material.id}>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="btn-expandir"
                                                        onClick={() => setExpandido((p) => ({ ...p, [material.id]: !aberto }))}
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
                                                <td>{material.fornecedor || '—'}</td>
                                                <td className="col-num">
                                                    <span className={`badge ${revisoes.length ? 'badge-info' : 'badge-warning'}`}>
                                                        {revisoes.length}
                                                    </span>
                                                </td>
                                                <td className="col-acoes">
                                                    <button className="btn-icon" title="Nova revisão deste material"
                                                        onClick={() => abrirNovaRevisao(material)}>
                                                        <i className="fas fa-plus"></i>
                                                    </button>
                                                    <button className="btn-icon btn-icon-danger" title="Excluir material"
                                                        onClick={() => excluirMaterial(material)}>
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>,
                                            aberto && (
                                                <tr key={`${material.id}-revisoes`} className="linha-revisoes">
                                                    <td colSpan={8}>
                                                        <table className="tabela-revisoes">
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
                                                                    <tr key={rev.id}>
                                                                        <td><strong>{rev.revisao}</strong></td>
                                                                        <td>{rev.data ? rev.data.split('-').reverse().join('/') : '—'}</td>
                                                                        <td className="col-num">{rev.total_posicoes}</td>
                                                                        <td className="col-acoes">
                                                                            <button className="btn-icon" title="Editar revisão"
                                                                                onClick={() => abrirEdicao(material, rev)}>
                                                                                <i className="fas fa-pen"></i>
                                                                            </button>
                                                                            <button className="btn-icon btn-icon-danger" title="Excluir revisão"
                                                                                onClick={() => excluirRevisao(rev)}>
                                                                                <i className="fas fa-trash"></i>
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )
                                        ];
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {modalAberto && (
                    <div className="modal-overlay material-modal" onClick={() => !salvando && setModalAberto(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{revisaoEmEdicao ? 'Editar Revisão' : 'Novo Material / Revisão'}</h2>
                                <button className="modal-close" onClick={() => setModalAberto(false)}
                                    aria-label="Fechar">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            {/* Tabs do UI Kit: já trazem o padrão ARIA de tablist,
                                com navegação por setas do teclado. */}
                            <Tabs
                                className="modal-tabs"
                                ariaLabel="Seções do cadastro"
                                activeId={activeTab}
                                onChange={setActiveTab}
                                items={[
                                    {
                                        id: 'dados',
                                        label: 'Dados do Material / Revisão',
                                        icon: <i className="fas fa-file-lines" aria-hidden="true"></i>
                                    },
                                    {
                                        id: 'cotas',
                                        label: 'Cotas Dimensionais',
                                        count: posicoesPreenchidas().length,
                                        icon: <i className="fas fa-ruler-combined" aria-hidden="true"></i>
                                    }
                                ]}
                            />

                            <div className="modal-body">
                                {alerta && (
                                    <div className="validacao-alerta">
                                        <i className="fas fa-triangle-exclamation"></i>
                                        <span>{alerta}</span>
                                    </div>
                                )}

                                {activeTab === 'dados' && (
                                    <div className="form-section">
                                        <div className="form-row-material">
                                            <div className="form-group">
                                                <label>Cód. SAP *</label>
                                                <input type="text" className="form-control field-upper"
                                                    value={formData.codigo_sap}
                                                    onChange={(e) => {
                                                        /* Libera a busca: a partir daqui o valor é do
                                                           usuário, não o que o modal carregou. */
                                                        sapDigitadoRef.current = true;
                                                        setCampo('codigo_sap', e.target.value);
                                                    }}
                                                    aria-required="true" />
                                            </div>
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
                                        </div>

                                        <div className="form-row-material duas-colunas">
                                            <div className="form-group">
                                                <label>Componente</label>
                                                <div className="campo-com-status">
                                                    <input type="text" className="form-control field-upper"
                                                        value={formData.componente}
                                                        onChange={(e) => {
                                                            /* Edição manual desliga o preenchimento
                                                               automático: uma busca posterior não deve
                                                               apagar o que o usuário escreveu. */
                                                            autoPreenchidoRef.current = false;
                                                            setCampo('componente', e.target.value);
                                                        }} />
                                                    {buscandoComponente && (
                                                        <span className="campo-spinner" role="status"
                                                            aria-label="Buscando componente">
                                                            <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
                                                        </span>
                                                    )}
                                                </div>
                                                {origemComponente && (
                                                    <small className="campo-ajuda">
                                                        {origemComponente === 'material'
                                                            ? 'Preenchido a partir do material já cadastrado.'
                                                            : 'Preenchido a partir da descrição do SAP.'}
                                                    </small>
                                                )}
                                            </div>
                                            <div className="form-group">
                                                <label>Aplicação</label>
                                                <input type="text" className="form-control field-upper"
                                                    value={formData.aplicacao}
                                                    onChange={(e) => setCampo('aplicacao', e.target.value)} />
                                            </div>
                                        </div>

                                        {/* Mesma grade da linha acima. Antes o Fornecedor ocupava
                                            duas das três colunas, e entre 561px e 900px — onde a
                                            grade cai para duas — ele não cabia ao lado do Setor e
                                            descia de linha. */}
                                        <div className="form-row-material duas-colunas">
                                            <div className="form-group">
                                                <label>Setor</label>
                                                <input type="text" className="form-control field-upper"
                                                    value={formData.setor}
                                                    onChange={(e) => setCampo('setor', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Fornecedor</label>
                                                <input type="text" className="form-control field-upper"
                                                    value={formData.fornecedor}
                                                    onChange={(e) => setCampo('fornecedor', e.target.value)} />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Observações da revisão</label>
                                            <textarea className="form-control" rows="2"
                                                value={formData.observacoes}
                                                onChange={(e) => setCampo('observacoes', e.target.value)} />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'cotas' && (
                                    <div className="form-section">
                                        <div className="section-header-linha">
                                            <h3 className="section-title">Cotas Dimensionais da Revisão</h3>
                                            <button type="button" className="btn btn-outline btn-sm" onClick={addPosicao}>
                                                <i className="fas fa-plus"></i> Adicionar posição
                                            </button>
                                        </div>

                                        <div className="table-container">
                                            <table className="ficha-table tabela-cotas">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: 110 }}>Posição *</th>
                                                        <th style={{ width: 160 }}>Cota</th>
                                                        <th style={{ width: 180 }}>Instrumento</th>
                                                        <th>Observações</th>
                                                        <th style={{ width: 44 }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {posicoes.map((p, i) => (
                                                        <tr key={i}>
                                                            <td>
                                                                <input type="text" className="field-upper" value={p.posicao}
                                                                    onChange={(e) => updatePosicao(i, 'posicao', e.target.value)}
                                                                    placeholder="1" />
                                                            </td>
                                                            <td>
                                                                <input type="text" value={p.cota}
                                                                    onChange={(e) => updatePosicao(i, 'cota', e.target.value)}
                                                                    placeholder="25,00 ± 0,20" />
                                                            </td>
                                                            <td>
                                                                <input type="text" list="lista-instrumentos" value={p.instrumento}
                                                                    onChange={(e) => updatePosicao(i, 'instrumento', e.target.value)}
                                                                    placeholder="Paquímetro" />
                                                            </td>
                                                            <td>
                                                                <input type="text" value={p.observacoes}
                                                                    onChange={(e) => updatePosicao(i, 'observacoes', e.target.value)} />
                                                            </td>
                                                            <td>
                                                                <button type="button" className="btn-row-del" title="Remover"
                                                                    onClick={() => removePosicao(i)}
                                                                    disabled={posicoes.length === 1}>
                                                                    <i className="fas fa-trash"></i>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Lista sugerida, mas o campo aceita texto livre: cada setor
                                            tem instrumento que a lista fixa não cobriria. */}
                                        <datalist id="lista-instrumentos">
                                            {INSTRUMENTOS.map((nome) => <option key={nome} value={nome} />)}
                                        </datalist>
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                <button className="btn btn-outline" onClick={() => setModalAberto(false)} disabled={salvando}>
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
            </div>
        </AppLayout>
    );
}
