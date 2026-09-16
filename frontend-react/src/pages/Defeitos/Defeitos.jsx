import { useEffect, useMemo, useState } from 'react';
import AppLayout from '../../components/Layout/AppLayout';
import { defeitosAPI } from '../../services/api';
import { formatDateBR } from '../../utils/date';
import './Defeitos.css';

/* Cadastro de Defeitos — limpeza do que os inspetores criaram.

   A lista cresce sozinha: quem preenche uma inspeção digita um nome que ainda
   não existe e ele passa a valer na hora. O preço disso é duplicidade
   ("DIMENSIONAL NC" e "DIMENSIONAL NÃO CONFORME") e nome que não deveria mais
   aparecer. É o que se resolve aqui.

   Inativar, e não excluir: o defeito está amarrado a inspeções já lançadas, e
   apagá-lo levaria o histórico junto. A exclusão de verdade fica para o que
   nunca foi usado — e o servidor recusa o resto. */

const FILTROS = [
    { chave: 'ativos', rotulo: 'Ativos' },
    { chave: 'inativos', rotulo: 'Inativos' },
    { chave: 'todos', rotulo: 'Todos' }
];

export default function Defeitos() {
    const [defeitos, setDefeitos] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');
    const [filtro, setFiltro] = useState('ativos');

    const [editandoId, setEditandoId] = useState(null);
    const [rascunho, setRascunho] = useState('');
    const [salvando, setSalvando] = useState(false);

    const carregar = async () => {
        setCarregando(true);
        setErro('');
        try {
            const resposta = await defeitosAPI.getTodos();
            if (resposta.data?.success) setDefeitos(resposta.data.data || []);
        } catch (e) {
            setErro(e?.response?.status === 403
                ? 'Você não tem permissão para gerenciar defeitos.'
                : 'Não foi possível carregar a lista de defeitos.');
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => { carregar(); }, []);

    const visiveis = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        return defeitos
            .filter((d) => (filtro === 'todos'
                || (filtro === 'ativos' && d.ativo)
                || (filtro === 'inativos' && !d.ativo)))
            .filter((d) => !termo || d.defeito.toLowerCase().includes(termo));
    }, [defeitos, busca, filtro]);

    const contar = (chave) => (chave === 'todos'
        ? defeitos.length
        : defeitos.filter((d) => (chave === 'ativos' ? d.ativo : !d.ativo)).length);

    const aplicar = (atualizado) => {
        setDefeitos((atual) => atual.map((d) => (d.id === atualizado.id
            ? { ...d, ...atualizado }
            : d)));
    };

    const salvarNome = async (item) => {
        const nome = rascunho.trim();
        if (!nome || nome.toUpperCase() === item.defeito.toUpperCase()) {
            setEditandoId(null);
            return;
        }
        setSalvando(true);
        try {
            const resposta = await defeitosAPI.renomear(item.id, nome);
            if (resposta.data?.success) {
                aplicar(resposta.data.data);
                setEditandoId(null);
            }
        } catch (e) {
            alert(e?.response?.data?.message || 'Não foi possível renomear.');
        } finally {
            setSalvando(false);
        }
    };

    const alternarAtivo = async (item) => {
        /* Só a inativação pergunta: reativar não tira nada de ninguém. */
        if (item.ativo && !window.confirm(
            `Inativar "${item.defeito}"? Ele sai da lista de escolha, e os ${item.em_uso || 0} `
            + 'registro(s) que já o usam continuam como estão.')) return;

        try {
            const resposta = await defeitosAPI.definirAtivo(item.id, !item.ativo);
            if (resposta.data?.success) aplicar(resposta.data.data);
        } catch (e) {
            alert(e?.response?.data?.message || 'Não foi possível alterar a situação.');
        }
    };

    const excluir = async (item) => {
        if (!window.confirm(`Excluir "${item.defeito}" definitivamente?`)) return;
        try {
            await defeitosAPI.delete(item.id);
            setDefeitos((atual) => atual.filter((d) => d.id !== item.id));
        } catch (e) {
            alert(e?.response?.data?.message || 'Não foi possível excluir.');
        }
    };

    return (
        <AppLayout
            breadcrumb={[{ label: 'Qualidade' }, { label: 'Cadastro de Defeitos' }]}
            containerClassName="defeitos-page"
        >
            <div>
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-triangle-exclamation"></i> Cadastro de Defeitos</h1>
                        <p>Lista usada nos campos de defeito das inspeções</p>
                    </div>
                </div>

                <div className="summary-grid defeitos-summary-grid">
                    {FILTROS.map((item) => (
                        <button
                            key={item.chave}
                            type="button"
                            className={`summary-card is-clickable ${item.chave === 'inativos' ? 'rejected' : 'total'} ${filtro === item.chave ? 'is-active' : ''}`}
                            onClick={() => setFiltro(item.chave)}
                            aria-pressed={filtro === item.chave}
                        >
                            <div className="summary-heading">
                                <i className="fas fa-list" aria-hidden="true"></i>
                                <span>{item.rotulo}</span>
                            </div>
                            <strong>{carregando ? '—' : contar(item.chave)}</strong>
                            <span className="summary-line" aria-hidden="true"></span>
                        </button>
                    ))}
                </div>

                <div className="header-actions defeitos-filtros">
                    <div className="defeitos-busca">
                        <i className="fas fa-search" aria-hidden="true"></i>
                        <input type="search" className="form-control" value={busca}
                            placeholder="Buscar defeito..."
                            onChange={(e) => setBusca(e.target.value)}
                            aria-label="Buscar defeito" />
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={carregar}>
                        <i className="fas fa-rotate" aria-hidden="true"></i>
                        <span className="filter-label"> Atualizar</span>
                    </button>
                </div>

                {erro && (
                    <div className="defeitos-erro" role="alert">
                        <i className="fas fa-triangle-exclamation" aria-hidden="true"></i> {erro}
                    </div>
                )}

                <div className="table-card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Defeito</th>
                                    <th>Situação</th>
                                    <th>Criado por</th>
                                    <th>Em uso</th>
                                    <th className="actions-column">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {carregando ? (
                                    <tr><td colSpan="5" className="defeitos-vazio">Carregando...</td></tr>
                                ) : visiveis.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="defeitos-vazio">
                                            <i className="fas fa-inbox" aria-hidden="true"></i>
                                            {defeitos.length
                                                ? 'Nenhum defeito corresponde aos filtros.'
                                                : 'Nenhum defeito cadastrado ainda.'}
                                        </td>
                                    </tr>
                                ) : visiveis.map((item) => (
                                    <tr key={item.id} className={item.ativo ? '' : 'defeitos-inativo'}>
                                        <td>
                                            {editandoId === item.id ? (
                                                <input
                                                    type="text"
                                                    className="form-control field-upper"
                                                    value={rascunho}
                                                    autoFocus
                                                    disabled={salvando}
                                                    onChange={(e) => setRascunho(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') { e.preventDefault(); salvarNome(item); }
                                                        if (e.key === 'Escape') setEditandoId(null);
                                                    }}
                                                    onBlur={() => salvarNome(item)}
                                                    aria-label="Novo nome do defeito"
                                                />
                                            ) : item.defeito}
                                        </td>
                                        <td>
                                            <span className={`badge ${item.ativo ? 'badge-success' : 'badge-danger'}`}>
                                                {item.ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                        <td>{item.criado_por || 'Carga inicial'}
                                            {item.created_at && (
                                                <small className="defeitos-data"> · {formatDateBR(item.created_at, '')}</small>
                                            )}
                                        </td>
                                        <td>{item.em_uso ?? 0}</td>
                                        <td className="actions-column">
                                            <div className="acoes">
                                                <button className="btn-icon btn-edit" title="Renomear"
                                                    aria-label={`Renomear ${item.defeito}`}
                                                    onClick={() => { setEditandoId(item.id); setRascunho(item.defeito); }}>
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button
                                                    className={`btn-icon ${item.ativo ? 'btn-delete' : 'btn-view'}`}
                                                    title={item.ativo ? 'Inativar' : 'Reativar'}
                                                    aria-label={`${item.ativo ? 'Inativar' : 'Reativar'} ${item.defeito}`}
                                                    onClick={() => alternarAtivo(item)}>
                                                    <i className={`fas ${item.ativo ? 'fa-ban' : 'fa-rotate-left'}`}></i>
                                                </button>
                                                {/* Excluir de vez só o que nunca foi usado. O
                                                    servidor recusa o resto, mas esconder o botão
                                                    evita o clique que só traz erro. */}
                                                {!item.em_uso && (
                                                    <button className="btn-icon btn-delete" title="Excluir"
                                                        aria-label={`Excluir ${item.defeito}`}
                                                        onClick={() => excluir(item)}>
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="defeitos-nota">
                    Defeitos novos são criados pelos inspetores no próprio formulário de
                    inspeção, ao digitar um nome que ainda não existe.
                </p>
            </div>
        </AppLayout>
    );
}
