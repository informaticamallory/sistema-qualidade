import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Sidebar from '../../components/Sidebar/Sidebar';
import { usuariosAPI } from '../../services/api';
import { toUpper } from '../../utils/text';
import { useAuth } from '../../context/auth-context';
import './Usuarios.css';

const ROLES = [
    { value: 'admin', label: 'Administrador' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'inspetor', label: 'Inspetor' },
    { value: 'inspetor_injecao', label: 'INSPETOR DE INJEÇÃO' },
    { value: 'consultor', label: 'Consultor' }
];

const MODULO_ICONS = {
    dashboard: 'fa-gauge-high',
    registros: 'fa-list-check',
    injecao: 'fa-cubes',
    cartoes: 'fa-id-card',
    nao_conformidades: 'fa-triangle-exclamation',
    calibracao: 'fa-tools',
    relatorios: 'fa-file-lines',
    usuarios: 'fa-users-gear',
    configuracoes: 'fa-gear'
};

const estadoInicial = () => ({ nome: '', usuario: '', role: 'inspetor', fichasPermission: 'readonly', pin: '', confirmPin: '', ativo: true });

const roleLabel = (r) => ROLES.find((x) => x.value === r)?.label || r;

export default function Usuarios() {
    const { can, user } = useAuth();
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState(estadoInicial());
    const [permSet, setPermSet] = useState(new Set());
    const [catalogo, setCatalogo] = useState({ modulos: {}, labels_modulos: {}, labels_acoes: {}, matriz_padrao: {} });
    const [erro, setErro] = useState('');
    const [sheetData, setSheetData] = useState(null);

    const podeCriar = can('usuarios', 'criar');
    const podeEditar = can('usuarios', 'editar');
    const podeExcluir = can('usuarios', 'excluir');

    useEffect(() => { loadCatalogo(); }, []);
    useEffect(() => { loadUsuarios(); }, [search, roleFilter]);

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

    const loadCatalogo = async () => {
        try {
            const res = await usuariosAPI.getCatalogo();
            if (res.data.success) setCatalogo(res.data.data);
        } catch (e) {
            console.error('Erro ao carregar catálogo de permissões:', e);
        }
    };

    const loadUsuarios = async () => {
        try {
            setLoading(true);
            const params = {};
            if (search) params.search = search;
            if (roleFilter) params.role = roleFilter;
            const res = await usuariosAPI.getAll(params);
            if (res.data.success) setUsuarios(res.data.data);
        } catch (e) {
            console.error('Erro ao carregar usuários:', e);
        } finally {
            setLoading(false);
        }
    };

    // ----- Permissões (Set de "modulo:acao") -----
    const matrizParaSet = (role) => {
        const matriz = catalogo.matriz_padrao?.[role] || {};
        const s = new Set();
        Object.entries(matriz).forEach(([m, acoes]) => acoes.forEach((a) => s.add(`${m}:${a}`)));
        return s;
    };

    const objParaSet = (perms) => {
        const s = new Set();
        Object.entries(perms || {}).forEach(([m, acoes]) => (acoes || []).forEach((a) => s.add(`${m}:${a}`)));
        return s;
    };

    const isChecked = (m, a) => permSet.has(`${m}:${a}`);

    const toggleAcao = (m, a) => {
        setPermSet((prev) => {
            const s = new Set(prev);
            const key = `${m}:${a}`;
            if (s.has(key)) s.delete(key); else s.add(key);
            return s;
        });
    };

    const moduloTodoMarcado = (m) => (catalogo.modulos[m] || []).every((a) => isChecked(m, a));

    const toggleModulo = (m) => {
        setPermSet((prev) => {
            const s = new Set(prev);
            const acoes = catalogo.modulos[m] || [];
            const todos = acoes.every((a) => s.has(`${m}:${a}`));
            acoes.forEach((a) => { if (todos) s.delete(`${m}:${a}`); else s.add(`${m}:${a}`); });
            return s;
        });
    };

    const selecionarTudo = () => {
        const s = new Set();
        Object.entries(catalogo.modulos).forEach(([m, acoes]) => acoes.forEach((a) => s.add(`${m}:${a}`)));
        setPermSet(s);
    };

    const limparTudo = () => setPermSet(new Set());

    const copiarDePerfil = (role) => { if (role) setPermSet(matrizParaSet(role)); };

    // ----- Abrir modal -----
    const abrirNovo = () => {
        setEditingId(null);
        setErro('');
        setFormData(estadoInicial());
        setPermSet(matrizParaSet('inspetor'));
        setShowModal(true);
    };

    const abrirEdicao = (u) => {
        setEditingId(u.id);
        setErro('');
        setFormData({
            nome: u.nome || '',
            usuario: u.usuario || '',
            role: u.role || 'inspetor',
            fichasPermission: u.fichasPermission || 'readonly',
            pin: '',
            confirmPin: '',
            ativo: u.ativo
        });
        setPermSet(objParaSet(u.permissoes));
        setShowModal(true);
    };

    const onRoleChange = (role) => {
        setFormData((prev) => ({
            ...prev,
            role,
            fichasPermission: role === 'consultor'
                ? (prev.role === 'consultor' ? prev.fichasPermission : 'readonly')
                : 'full'
        }));
        if (!editingId) setPermSet(matrizParaSet(role)); // novo usuário herda o padrão do perfil
    };

    // ----- Ações -----
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErro('');

        if (!formData.nome.trim() || !formData.usuario.trim()) {
            setErro('Nome e usuário são obrigatórios.');
            return;
        }
        const precisaPin = !editingId || formData.pin.length > 0;
        if (precisaPin) {
            if (!/^\d{4}$/.test(formData.pin)) {
                setErro('O PIN deve ter exatamente 4 dígitos.');
                return;
            }
            if (formData.pin !== formData.confirmPin) {
                setErro('Os PINs não conferem.');
                return;
            }
        }

        const permissoes = [...permSet].map((s) => {
            const [modulo, acao] = s.split(':');
            return { modulo, acao };
        });

        const payload = {
            nome: toUpper(formData.nome.trim()),
            usuario: formData.usuario.trim(),
            role: formData.role,
            fichasPermission: formData.role === 'consultor' ? formData.fichasPermission : 'full',
            ativo: formData.ativo,
            permissoes
        };
        if (formData.pin) payload.pin = formData.pin;

        try {
            if (editingId) {
                await usuariosAPI.update(editingId, payload);
            } else {
                await usuariosAPI.create(payload);
            }
            setShowModal(false);
            loadUsuarios();
        } catch (error) {
            setErro(error.response?.data?.message || 'Erro ao salvar usuário.');
        }
    };

    const handleToggleAtivo = async (u) => {
        try {
            await usuariosAPI.toggleAtivo(u.id);
            loadUsuarios();
        } catch (error) {
            alert(error.response?.data?.message || 'Erro ao alterar status.');
        }
    };

    const handleDelete = async (u) => {
        if (!window.confirm(`Excluir o usuário "${u.nome}"? Esta ação não pode ser desfeita.`)) return;
        try {
            await usuariosAPI.delete(u.id);
            loadUsuarios();
        } catch (error) {
            alert(error.response?.data?.message || 'Erro ao excluir usuário.');
        }
    };

    const openMobileActions = (usuario) => {
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
            setSheetData((current) => (
                current?.id === usuario.id
                    ? null
                    : { id: usuario.id, label: usuario.nome || usuario.usuario || 'Usuário selecionado' }
            ));
        }
    };

    const modulos = Object.keys(catalogo.modulos || {});
    const sheetUsuario = sheetData ? usuarios.find((usuario) => usuario.id === sheetData.id) : null;

    return (
        <div className="app-container">
            <Sidebar />
            <main className="main-content">
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-users-gear"></i> Gerenciamento de Usuários</h1>
                        <p>Cadastro de usuários, perfis e permissões de acesso</p>
                    </div>
                    <div className="header-actions">
                        <input
                            type="text"
                            className="form-control"
                            placeholder="Pesquisar por nome..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select className="form-control" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                            <option value="">Todos os perfis</option>
                            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {podeCriar && (
                            <button className="btn btn-primary btn-sm" onClick={abrirNovo}>
                                <i className="fas fa-plus"></i> Novo Usuário
                            </button>
                        )}
                    </div>
                </div>

                <div className="table-card">
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Nome Completo</th>
                                    <th>Usuário</th>
                                    <th>Perfil</th>
                                    <th>Status</th>
                                    <th className="actions-column">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="5" style={{ textAlign: 'center' }}>Carregando...</td></tr>
                                ) : usuarios.length === 0 ? (
                                    <tr><td colSpan="5" style={{ textAlign: 'center' }}>Nenhum usuário encontrado</td></tr>
                                ) : (
                                    usuarios.map((u) => (
                                        <tr
                                            key={u.id}
                                            className={`mobile-clickable-row ${sheetData?.id === u.id ? 'mobile-row-active' : ''}`}
                                            onClick={() => openMobileActions(u)}
                                        >
                                            <td>{u.nome}</td>
                                            <td>{u.usuario}</td>
                                            <td><span className={`role-chip role-${u.role}`}>{roleLabel(u.role)}</span></td>
                                            <td>
                                                <span className={`badge ${u.ativo ? 'badge-success' : 'badge-danger'}`}>
                                                    {u.ativo ? 'Ativo' : 'Inativo'}
                                                </span>
                                            </td>
                                            <td className="actions-column">
                                                <div className="acoes-usuario">
                                                    {podeEditar && (
                                                        <button className="btn-icon btn-edit" title="Editar" onClick={(e) => { e.stopPropagation(); abrirEdicao(u); }}>
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                    )}
                                                    {podeEditar && (
                                                        <button
                                                            className={`btn-icon ${u.ativo ? 'btn-toggle-off' : 'btn-toggle-on'}`}
                                                            title={u.ativo ? 'Inativar' : 'Ativar'}
                                                            onClick={(e) => { e.stopPropagation(); handleToggleAtivo(u); }}
                                                        >
                                                            <i className={`fas ${u.ativo ? 'fa-user-slash' : 'fa-user-check'}`}></i>
                                                        </button>
                                                    )}
                                                    {podeExcluir && u.id !== user?.id && (
                                                        <button className="btn-icon btn-delete" title="Excluir" onClick={(e) => { e.stopPropagation(); handleDelete(u); }}>
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {showModal && (
                    <div className="modal-overlay" onClick={() => setShowModal(false)}>
                        <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
                                <button className="modal-close" onClick={() => setShowModal(false)}>
                                    <i className="fas fa-times"></i>
                                </button>
                            </div>
                            <form onSubmit={handleSubmit}>
                                <div className="modal-body">
                                    {erro && <div className="usuario-erro"><i className="fas fa-circle-exclamation"></i> {erro}</div>}

                                    <div className="form-section">
                                        <h3 className="section-title">Dados do Usuário</h3>
                                        <div className="form-row">
                                            <div className="form-group" style={{ flex: 2 }}>
                                                <label>Nome Completo *</label>
                                                <input type="text" className="form-control field-upper" value={formData.nome}
                                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label>Usuário *</label>
                                                <input type="text" className="form-control" value={formData.usuario}
                                                    onChange={(e) => setFormData({ ...formData, usuario: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label>Perfil</label>
                                                <select className="form-control" value={formData.role} onChange={(e) => onRoleChange(e.target.value)}>
                                                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>PIN de 4 dígitos {editingId && <span className="hint">(deixe em branco para manter)</span>}</label>
                                                <input type="password" inputMode="numeric" maxLength={4} className="form-control"
                                                    value={formData.pin}
                                                    onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                                                    placeholder="••••" />
                                            </div>
                                            <div className="form-group">
                                                <label>Confirmar PIN</label>
                                                <input type="password" inputMode="numeric" maxLength={4} className="form-control"
                                                    value={formData.confirmPin}
                                                    onChange={(e) => setFormData({ ...formData, confirmPin: e.target.value.replace(/\D/g, '') })}
                                                    placeholder="••••" />
                                            </div>
                                            {formData.role === 'consultor' && (
                                                <div className="form-group">
                                                    <label>Permissão nas Fichas NC</label>
                                                    <select
                                                        className="form-control"
                                                        value={formData.fichasPermission}
                                                        onChange={(e) => setFormData({ ...formData, fichasPermission: e.target.value })}
                                                    >
                                                        <option value="full">Editar tudo</option>
                                                        <option value="partial">Editar apenas Análise, Ações e Custos</option>
                                                        <option value="readonly">Somente visualizar</option>
                                                    </select>
                                                </div>
                                            )}
                                            {editingId && (
                                                <div className="form-group">
                                                    <label>Status</label>
                                                    <select className="form-control" value={formData.ativo ? '1' : '0'}
                                                        onChange={(e) => setFormData({ ...formData, ativo: e.target.value === '1' })}>
                                                        <option value="1">Ativo</option>
                                                        <option value="0">Inativo</option>
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="divider"></div>

                                    <div className="form-section">
                                        <div className="perm-header">
                                            <h3 className="section-title" style={{ marginBottom: 0 }}>Permissões de Acesso</h3>
                                            <div className="perm-tools">
                                                <button type="button" className="perm-tool-btn" onClick={selecionarTudo}>
                                                    <i className="fas fa-check-double"></i> Selecionar Tudo
                                                </button>
                                                <button type="button" className="perm-tool-btn" onClick={limparTudo}>
                                                    <i className="fas fa-eraser"></i> Limpar
                                                </button>
                                                <select className="form-control perm-copy" defaultValue=""
                                                    onChange={(e) => { copiarDePerfil(e.target.value); e.target.value = ''; }}>
                                                    <option value="" disabled>Copiar permissões de…</option>
                                                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {formData.role === 'admin' && (
                                            <p className="perm-aviso"><i className="fas fa-shield-halved"></i> Administradores têm acesso total automaticamente.</p>
                                        )}

                                        <div className="perm-grid">
                                            {modulos.map((m) => (
                                                <div className="perm-card" key={m}>
                                                    <div className="perm-card-head">
                                                        <span className="perm-card-title">
                                                            <i className={`fas ${MODULO_ICONS[m] || 'fa-cube'}`}></i>
                                                            {catalogo.labels_modulos?.[m] || m}
                                                        </span>
                                                        <label className="perm-selectall" title="Marcar/desmarcar módulo">
                                                            <input type="checkbox" checked={moduloTodoMarcado(m)} onChange={() => toggleModulo(m)} />
                                                            <span>Tudo</span>
                                                        </label>
                                                    </div>
                                                    <div className="perm-actions">
                                                        {(catalogo.modulos[m] || []).map((a) => (
                                                            <label className="perm-check" key={a}>
                                                                <input type="checkbox" checked={isChecked(m, a)} onChange={() => toggleAcao(m, a)} />
                                                                <span>{catalogo.labels_acoes?.[a] || a}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                    <button type="submit" className="btn btn-primary">
                                        <i className="fas fa-save"></i> {editingId ? 'Atualizar' : 'Criar Usuário'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {typeof document !== 'undefined' && createPortal(
                    <div className={`mobile-action-sheet ${sheetUsuario ? 'open' : ''}`}>
                        <div className="mobile-action-sheet-backdrop" onClick={() => setSheetData(null)} />
                        <div className="mobile-action-sheet-panel">
                            <div className="mobile-action-sheet-handle" />
                            <p className="mobile-action-sheet-title">{sheetData?.label || 'Usuário selecionado'}</p>
                            {sheetUsuario && (
                                <div className="mobile-action-sheet-buttons">
                                    {podeEditar && (
                                        <button type="button" className="btn btn-edit" onClick={() => { setSheetData(null); abrirEdicao(sheetUsuario); }}>
                                            <i className="fas fa-edit"></i>
                                            <span>Editar</span>
                                        </button>
                                    )}
                                    {podeEditar && (
                                        <button type="button" className={`btn ${sheetUsuario.ativo ? 'btn-toggle-off' : 'btn-toggle-on'}`} onClick={() => { setSheetData(null); handleToggleAtivo(sheetUsuario); }}>
                                            <i className={`fas ${sheetUsuario.ativo ? 'fa-user-slash' : 'fa-user-check'}`}></i>
                                            <span>{sheetUsuario.ativo ? 'Inativar' : 'Ativar'}</span>
                                        </button>
                                    )}
                                    {podeExcluir && sheetUsuario.id !== user?.id && (
                                        <button type="button" className="btn btn-delete" onClick={() => { setSheetData(null); handleDelete(sheetUsuario); }}>
                                            <i className="fas fa-trash"></i>
                                            <span>Excluir</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
            </main>
        </div>
    );
}




