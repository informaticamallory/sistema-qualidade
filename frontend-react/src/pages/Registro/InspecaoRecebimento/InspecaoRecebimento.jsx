import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '../../../components/Layout/AppLayout';
import { Tabs } from '../../../components/ui';
import { materiaisAPI, revisoesAPI, inspecoesRecebimentoAPI } from '../../../services/api';
import { useAuth } from '../../../context/auth-context';
import { upperFields } from '../../../utils/text';
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
    observacao: ''
});

const formatarData = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

export default function InspecaoRecebimento() {
    const { user } = useAuth();

    const [inspecoes, setInspecoes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('todos');

    const [modalAberto, setModalAberto] = useState(false);
    const [activeTab, setActiveTab] = useState('identificacao');
    const [formData, setFormData] = useState(formVazio());
    const [resultados, setResultados] = useState([]);
    const [revisoesDisponiveis, setRevisoesDisponiveis] = useState([]);
    const [editandoId, setEditandoId] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [alerta, setAlerta] = useState('');

    /* Autocomplete de material */
    const [sugestoes, setSugestoes] = useState([]);
    const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
    const debounceRef = useRef(null);

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

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    const setCampo = (campo, valor) => setFormData((prev) => ({ ...prev, [campo]: valor }));

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
        setSugestoesAbertas(false);
        setAlerta(revisoes.length ? '' : 'Este material ainda não tem revisão de desenho cadastrada.');
    };

    /* ── Revisão escolhida: as posições viram as linhas de Resultados ── */
    const selecionarRevisao = async (revId) => {
        setCampo('revisao_id', revId);
        setResultados([]);
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
            setAlerta(posicoes.length ? '' : 'A revisão selecionada não tem posições cadastradas.');
        } catch (e) {
            setAlerta(e.response?.data?.message || 'Não foi possível carregar as cotas da revisão');
        }
    };

    const updateResultado = (i, campo, valor) => setResultados((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)));

    const marcarTodos = (status) => setResultados((prev) => prev.map((r) => ({ ...r, status })));

    /* ── Abrir / editar ── */
    const abrirNovo = () => {
        setEditandoId(null);
        setFormData(formVazio());
        setResultados([]);
        setRevisoesDisponiveis([]);
        setSugestoes([]);
        setActiveTab('identificacao');
        setAlerta('');
        setModalAberto(true);
    };

    const abrirEdicao = async (inspecao) => {
        setAlerta('');
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
                observacao: dados.observacao || ''
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
            setActiveTab('identificacao');
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
        if (!String(formData.lote).trim()) {
            setActiveTab('dados');
            return 'Informe o lote';
        }
        if (!formData.data_inspecao) {
            setActiveTab('dados');
            return 'Informe a data da inspeção';
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
                lote: formData.lote,
                data_entrada: formData.data_entrada || null,
                data_inspecao: formData.data_inspecao,
                nota_fiscal: formData.nota_fiscal,
                quantidade_total: Number(formData.quantidade_total) || 0,
                observacao: formData.observacao,
                resultados: resultados.map((r) => ({
                    posicao_revisao_id: r.posicao_revisao_id,
                    valor_medido: r.valor_medido,
                    observacao: r.observacao,
                    status: r.status
                }))
            }, ['fornecedor', 'lote', 'nota_fiscal']);

            if (editandoId) {
                await inspecoesRecebimentoAPI.update(editandoId, payload);
            } else {
                await inspecoesRecebimentoAPI.create(payload);
            }

            setModalAberto(false);
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
    const visiveis = inspecoes.filter((i) => {
        if (filtroStatus !== 'todos' && i.status !== filtroStatus) return false;
        if (!termo) return true;
        return [i.codigo_sap, i.componente, i.lote, i.nota_fiscal, i.fornecedor]
            .some((v) => String(v || '').toLowerCase().includes(termo));
    });

    const contar = (status) => inspecoes.filter((i) => i.status === status).length;

    const cards = [
        { chave: 'todos', rotulo: 'Total', valor: inspecoes.length, classe: 'total' },
        { chave: 'aprovado', rotulo: 'Aprovados', valor: contar('aprovado'), classe: 'approved' },
        { chave: 'reprovado', rotulo: 'Reprovados', valor: contar('reprovado'), classe: 'rejected' },
        { chave: 'pendente', rotulo: 'Pendentes', valor: contar('pendente'), classe: 'pending' }
    ];

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
                    <div className="header-actions">
                        <button className="btn btn-primary" onClick={abrirNovo}>
                            <i className="fas fa-plus"></i> Nova Inspeção
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

                <div className="recb-summary-grid">
                    {cards.map((card) => (
                        <button
                            key={card.chave}
                            type="button"
                            className={`recb-summary-card filter-card ${card.classe} ${filtroStatus === card.chave ? 'active' : ''}`}
                            onClick={() => setFiltroStatus(card.chave)}
                            aria-pressed={filtroStatus === card.chave}
                        >
                            <span className="recb-summary-label">{card.rotulo}</span>
                            <strong className="recb-summary-valor">{card.valor}</strong>
                        </button>
                    ))}
                </div>

                <div className="filters-card">
                    <div className="recb-busca">
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
                                        <tr key={i.id}>
                                            <td>{formatarData(i.data_inspecao)}</td>
                                            <td><strong>{i.codigo_sap}</strong></td>
                                            <td>{i.componente || '—'}</td>
                                            <td>{i.lote || '—'}</td>
                                            <td className="col-hide">{i.revisao_desenho || '—'}</td>
                                            <td className="col-hide">{i.nota_fiscal || '—'}</td>
                                            <td className="col-hide">{i.inspetor_nome || '—'}</td>
                                            <td>
                                                <span className={`badge status-${i.status}`}>
                                                    {STATUS_LABEL[i.status] || i.status}
                                                </span>
                                            </td>
                                            <td className="col-acoes">
                                                <button className="btn-icon" title="Abrir inspeção"
                                                    onClick={() => abrirEdicao(i)}>
                                                    <i className="fas fa-pen"></i>
                                                </button>
                                                <button className="btn-icon btn-icon-danger" title="Excluir"
                                                    onClick={() => excluir(i)}>
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {modalAberto && (
                    <div className="modal-overlay recb-modal" onClick={() => !salvando && setModalAberto(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editandoId ? 'Editar Inspeção' : 'Nova Inspeção de Recebimento'}</h2>
                                <button className="modal-close" onClick={() => setModalAberto(false)}
                                    aria-label="Fechar">
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>

                            {/* Tabs do UI Kit: já trazem o padrão ARIA de tablist,
                                com navegação por setas do teclado. */}
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
                                        id: 'dados',
                                        label: 'Dados Gerais',
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

                            <div className="modal-body">
                                {alerta && (
                                    <div className="validacao-alerta">
                                        <i className="fas fa-triangle-exclamation"></i>
                                        <span>{alerta}</span>
                                    </div>
                                )}

                                {activeTab === 'identificacao' && (
                                    <div className="form-section">
                                        <div className="form-row-recb">
                                            <div className="form-group recb-autocomplete">
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

                                        <div className="form-row-recb">
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

                                            <div className="form-group form-group-largo">
                                                <label>Fornecedor</label>
                                                <input type="text" className="form-control field-upper"
                                                    value={formData.fornecedor}
                                                    onChange={(e) => setCampo('fornecedor', e.target.value)} />
                                                <small className="campo-ajuda">
                                                    Vem do cadastro do material e pode ser alterado para este lote.
                                                </small>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'dados' && (
                                    <div className="form-section">
                                        <div className="form-row-recb">
                                            <div className="form-group">
                                                <label>Lote *</label>
                                                <input type="text" className="form-control field-upper"
                                                    value={formData.lote}
                                                    onChange={(e) => setCampo('lote', e.target.value)}
                                                    aria-required="true" />
                                            </div>
                                            <div className="form-group">
                                                <label>Nota Fiscal</label>
                                                <input type="text" className="form-control field-upper"
                                                    value={formData.nota_fiscal}
                                                    onChange={(e) => setCampo('nota_fiscal', e.target.value)} />
                                            </div>
                                            <div className="form-group">
                                                <label>Quantidade Total</label>
                                                <input type="text" inputMode="numeric" pattern="[0-9]*"
                                                    className="form-control"
                                                    value={formData.quantidade_total}
                                                    onChange={(e) => setCampo('quantidade_total',
                                                        e.target.value.replace(/\D/g, ''))} />
                                            </div>
                                        </div>

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
                                        </div>

                                        <div className="form-group">
                                            <label>Observação</label>
                                            <textarea className="form-control" rows="3"
                                                value={formData.observacao}
                                                onChange={(e) => setCampo('observacao', e.target.value)} />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'resultados' && (
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
                                                        <span className={`badge status-${statusPrevisto} badge-previa`}>
                                                            {STATUS_LABEL[statusPrevisto]}
                                                        </span>
                                                    </h3>
                                                    <div className="resultados-acoes">
                                                        <button type="button" className="btn btn-outline btn-sm"
                                                            onClick={() => marcarTodos('ok')}>
                                                            Marcar tudo OK
                                                        </button>
                                                        <button type="button" className="btn btn-outline btn-sm"
                                                            onClick={() => marcarTodos('')}>
                                                            Limpar status
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="table-container">
                                                    <table className="ficha-table tabela-resultados">
                                                        <thead>
                                                            <tr>
                                                                <th style={{ width: 90 }}>Posição</th>
                                                                <th style={{ width: 150 }}>Cota nominal</th>
                                                                <th style={{ width: 150 }}>Instrumento</th>
                                                                <th style={{ width: 140 }}>Valor medido</th>
                                                                <th style={{ width: 130 }}>Status</th>
                                                                <th>Observação</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {resultados.map((r, i) => (
                                                                <tr key={r.posicao_revisao_id || i}
                                                                    className={r.status === 'nok' ? 'linha-nok' : ''}>
                                                                    <td><strong>{r.posicao}</strong></td>
                                                                    <td className="celula-referencia">{r.cota_nominal || '—'}</td>
                                                                    <td className="celula-referencia">{r.instrumento || '—'}</td>
                                                                    <td>
                                                                        <input type="text" value={r.valor_medido}
                                                                            onChange={(e) => updateResultado(i, 'valor_medido', e.target.value)}
                                                                            aria-label={`Valor medido da posição ${r.posicao}`} />
                                                                    </td>
                                                                    <td>
                                                                        <div className="status-toggle" role="group"
                                                                            aria-label={`Status da posição ${r.posicao}`}>
                                                                            <button type="button"
                                                                                className={`status-btn ok ${r.status === 'ok' ? 'active' : ''}`}
                                                                                onClick={() => updateResultado(i, 'status', r.status === 'ok' ? '' : 'ok')}
                                                                                aria-pressed={r.status === 'ok'}>
                                                                                OK
                                                                            </button>
                                                                            <button type="button"
                                                                                className={`status-btn nok ${r.status === 'nok' ? 'active' : ''}`}
                                                                                onClick={() => updateResultado(i, 'status', r.status === 'nok' ? '' : 'nok')}
                                                                                aria-pressed={r.status === 'nok'}>
                                                                                NOK
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                    <td>
                                                                        <input type="text" value={r.observacao}
                                                                            onChange={(e) => updateResultado(i, 'observacao', e.target.value)}
                                                                            placeholder={r.observacoes_cota || ''}
                                                                            aria-label={`Observação da posição ${r.posicao}`} />
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
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
