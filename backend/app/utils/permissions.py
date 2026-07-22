# utils/permissions.py - Catálogo, matriz padrão e helpers de permissão
from app.extensions import db
from app.models.permissao import Permissao, UsuarioPermissao

# Catálogo: módulo -> ações aplicáveis
PERMISSOES_CATALOGO = {
    'dashboard':         ['visualizar', 'exportar'],
    'registros':         ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
    'injecao':           ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
    'cartoes':           ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
    'nao_conformidades': ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
    'calibracao':        ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
    'relatorios':        ['visualizar', 'exportar'],
    'usuarios':          ['visualizar', 'criar', 'editar', 'excluir'],
    'configuracoes':     ['visualizar', 'editar'],
}

MODULO_LABELS = {
    'dashboard': 'Dashboard',
    'registros': 'Registros',
    'injecao': 'Inspeção de Injeção',
    'cartoes': 'Cartões de Qualidade',
    'nao_conformidades': 'Não Conformidades',
    'calibracao': 'Calibração',
    'relatorios': 'Relatórios',
    'usuarios': 'Usuários',
    'configuracoes': 'Configurações',
}

ACAO_LABELS = {
    'visualizar': 'Visualizar',
    'criar': 'Criar',
    'editar': 'Editar',
    'excluir': 'Excluir',
    'exportar': 'Exportar',
}


def _full_matrix():
    return {m: list(acoes) for m, acoes in PERMISSOES_CATALOGO.items()}


# Matriz de permissões padrão por papel
DEFAULT_MATRIX = {
    'admin': _full_matrix(),  # acesso total
    'supervisor': {
        'dashboard': ['visualizar', 'exportar'],
        'registros': ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
        'injecao': ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
        'cartoes': ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
        'nao_conformidades': ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
        'calibracao': ['visualizar', 'criar', 'editar', 'excluir', 'exportar'],
        'relatorios': ['visualizar', 'exportar'],
        'configuracoes': ['visualizar'],
    },
    'inspetor': {
        'dashboard': ['visualizar'],
        'registros': ['visualizar', 'criar', 'editar'],
        'injecao': ['visualizar', 'criar', 'editar'],
        'cartoes': ['visualizar', 'criar', 'editar'],
        'nao_conformidades': ['visualizar', 'criar', 'editar'],
        'calibracao': ['visualizar', 'criar', 'editar'],
    },
    'inspetor_injecao': {
        'injecao': ['visualizar', 'criar', 'editar'],
        'cartoes': ['visualizar', 'criar', 'editar'],
        'nao_conformidades': ['visualizar', 'criar', 'editar'],
        'calibracao': ['visualizar', 'criar', 'editar'],
    },
    'consultor': {
        'dashboard': ['visualizar'],
        'registros': ['visualizar'],
        'injecao': ['visualizar'],
        'cartoes': ['visualizar'],
        'nao_conformidades': ['visualizar'],
        'relatorios': ['visualizar'],
    },
}


def role_defaults(role):
    """Permissões padrão (dict modulo -> [acoes]) de um papel."""
    if role == 'admin':
        return _full_matrix()
    return {m: list(a) for m, a in DEFAULT_MATRIX.get(role, {}).items()}


def seed_permissoes():
    """Popula a tabela 'permissoes' com o catálogo (idempotente)."""
    existentes = {(p.modulo, p.acao) for p in Permissao.query.all()}
    novas = 0
    for modulo, acoes in PERMISSOES_CATALOGO.items():
        for acao in acoes:
            if (modulo, acao) not in existentes:
                db.session.add(Permissao(
                    modulo=modulo,
                    acao=acao,
                    descricao=f'{MODULO_LABELS.get(modulo, modulo)} — {ACAO_LABELS.get(acao, acao)}'
                ))
                novas += 1
    if novas:
        db.session.commit()
    return novas


def effective_permissions(user):
    """Permissões efetivas do usuário como dict {modulo: [acoes]}.

    - Admin tem tudo.
    - Usuário sem permissões explícitas cai no padrão do papel — isso evita
      travar usuários criados antes deste recurso.
    """
    if not user:
        return {}
    if user.role == 'admin':
        return _full_matrix()

    rows = (db.session.query(Permissao.modulo, Permissao.acao)
            .join(UsuarioPermissao, UsuarioPermissao.permissao_id == Permissao.id)
            .filter(UsuarioPermissao.usuario_id == user.id)
            .all())

    if not rows:
        return role_defaults(user.role)

    perms = {}
    for modulo, acao in rows:
        perms.setdefault(modulo, []).append(acao)
    return perms


def user_has_permission(user, modulo, acao):
    if not user:
        return False
    if user.role == 'admin':
        return True
    return acao in effective_permissions(user).get(modulo, [])


def set_user_permissions(user, pares):
    """Substitui as permissões explícitas do usuário por uma lista de pares
    {modulo, acao} (ou tuplas (modulo, acao))."""
    UsuarioPermissao.query.filter_by(usuario_id=user.id).delete()

    catalogo = {(p.modulo, p.acao): p.id for p in Permissao.query.all()}
    vistos = set()
    for par in pares or []:
        if isinstance(par, dict):
            chave = (par.get('modulo'), par.get('acao'))
        else:
            chave = (par[0], par[1])
        if chave in catalogo and chave not in vistos:
            db.session.add(UsuarioPermissao(usuario_id=user.id, permissao_id=catalogo[chave]))
            vistos.add(chave)
    db.session.commit()