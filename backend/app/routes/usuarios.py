# routes/usuarios.py - Gerenciamento de Usuários e Permissões (admin)
from flask import Blueprint, request
from flask_jwt_extended import get_jwt_identity

from app.extensions import db, limiter
from app.models.usuario import Usuario, ROLES_VALIDOS, FICHAS_PERMISSIONS_VALIDAS
from app.models.permissao import UsuarioPermissao
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, permission_required, check_permission
from app.utils.permissions import (
    PERMISSOES_CATALOGO, MODULO_LABELS, ACAO_LABELS, DEFAULT_MATRIX,
    effective_permissions, role_defaults, set_user_permissions
)

usuarios_bp = Blueprint('usuarios', __name__)


def _usuario_completo(user):
    data = user.to_dict()
    data['permissoes'] = effective_permissions(user)
    return data


def _is_last_admin(user):
    if user.role != 'admin':
        return False
    outros = Usuario.query.filter(
        Usuario.role == 'admin', Usuario.ativo.is_(True), Usuario.id != user.id
    ).count()
    return outros == 0


def _validar_pin(pin):
    return bool(pin) and len(pin) == 4 and pin.isdigit()


def _normalizar_fichas_permission(role, valor=None, default=None):
    permission = valor if valor is not None else default
    if role != 'consultor':
        return 'full', None

    permission = permission or 'readonly'
    if permission not in FICHAS_PERMISSIONS_VALIDAS:
        return None, 'Permissão nas Fichas NC inválida'
    return permission, None


@usuarios_bp.route('/catalogo', methods=['GET', 'OPTIONS'])
@permission_required('usuarios', 'visualizar')
def catalogo():
    """Catálogo de permissões + rótulos + matriz padrão por papel (para a UI)."""
    return create_response(success=True, data={
        'modulos': PERMISSOES_CATALOGO,
        'labels_modulos': MODULO_LABELS,
        'labels_acoes': ACAO_LABELS,
        'matriz_padrao': DEFAULT_MATRIX
    })


@usuarios_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("120 per minute")
@auth_required()
def handle_usuarios():
    if request.method == 'OPTIONS':
        return '', 200

    # GET — listar
    if request.method == 'GET':
        if not check_permission('usuarios', 'visualizar'):
            return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
        try:
            search = (request.args.get('search') or '').strip()
            role = (request.args.get('role') or '').strip()

            query = Usuario.query
            if search:
                query = query.filter(Usuario.nome.like(f"%{search}%"))
            if role:
                query = query.filter(Usuario.role == role)

            usuarios = query.order_by(Usuario.nome.asc()).all()
            return create_response(success=True, data=[_usuario_completo(u) for u in usuarios])
        except Exception:
            return create_response(success=False, message='Erro ao buscar usuários', status_code=500)

    # POST — criar
    if not check_permission('usuarios', 'criar'):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    try:
        dados = request.get_json() or {}
        nome = (dados.get('nome') or '').strip()
        usuario = (dados.get('usuario') or '').strip()
        pin = dados.get('pin')
        role = dados.get('role', 'inspetor')

        if not nome or not usuario:
            return create_response(success=False, message='Nome e usuário são obrigatórios', status_code=400)
        if not _validar_pin(pin):
            return create_response(success=False, message='PIN deve ter 4 dígitos', status_code=400)
        if role not in ROLES_VALIDOS:
            return create_response(success=False, message='Papel (role) inválido', status_code=400)

        fichas_permission, erro_permission = _normalizar_fichas_permission(
            role, dados.get('fichasPermission', dados.get('fichas_permission'))
        )
        if erro_permission:
            return create_response(success=False, message=erro_permission, status_code=400)

        if Usuario.query.filter_by(usuario=usuario).first():
            return create_response(success=False, message='Usuário já existe', status_code=409)

        novo = Usuario(
            nome=nome,
            usuario=usuario,
            role=role,
            fichas_permission=fichas_permission,
            ativo=dados.get('ativo', True)
        )
        novo.set_pin(pin)
        db.session.add(novo)
        db.session.flush()  # garante novo.id antes de gravar permissões

        # Permissões: usa as enviadas; se não vierem, aplica o padrão do papel
        permissoes = dados.get('permissoes')
        if permissoes is None:
            d = role_defaults(role)
            permissoes = [{'modulo': m, 'acao': a} for m, acoes in d.items() for a in acoes]
        set_user_permissions(novo, permissoes)

        db.session.commit()
        return create_response(success=True, message='Usuário criado com sucesso',
                               data=_usuario_completo(novo), status_code=201)
    except Exception:
        db.session.rollback()
        return create_response(success=False, message='Erro ao criar usuário', status_code=500)


@usuarios_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def handle_usuario(id):
    if request.method == 'OPTIONS':
        return '', 200

    usuario = Usuario.query.get(id)
    if not usuario:
        return create_response(success=False, message='Usuário não encontrado', status_code=404)

    if request.method == 'GET':
        if not check_permission('usuarios', 'visualizar'):
            return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
        return create_response(success=True, data=_usuario_completo(usuario))

    if request.method == 'PUT':
        if not check_permission('usuarios', 'editar'):
            return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
        try:
            dados = request.get_json() or {}

            role_atual = usuario.role
            novo_role = dados.get('role') or role_atual

            if 'nome' in dados and dados['nome'].strip():
                usuario.nome = dados['nome'].strip()

            if 'usuario' in dados and dados['usuario'].strip():
                novo_usuario_login = dados['usuario'].strip()
                if novo_usuario_login != usuario.usuario:
                    existente = Usuario.query.filter(
                        Usuario.usuario == novo_usuario_login,
                        Usuario.id != usuario.id
                    ).first()
                    if existente:
                        return create_response(success=False, message='Usuário já existe', status_code=409)
                    usuario.usuario = novo_usuario_login

            if 'role' in dados and dados['role']:
                if novo_role not in ROLES_VALIDOS:
                    return create_response(success=False, message='Papel (role) inválido', status_code=400)
                # Não permite rebaixar o último admin
                if usuario.role == 'admin' and novo_role != 'admin' and _is_last_admin(usuario):
                    return create_response(success=False, message='Não é possível rebaixar o último administrador', status_code=400)
                usuario.role = novo_role

            fichas_default = usuario.fichas_permission if role_atual == novo_role else None
            fichas_permission, erro_permission = _normalizar_fichas_permission(
                novo_role,
                dados.get('fichasPermission', dados.get('fichas_permission')),
                fichas_default
            )
            if erro_permission:
                return create_response(success=False, message=erro_permission, status_code=400)
            usuario.fichas_permission = fichas_permission

            if 'ativo' in dados:
                if dados['ativo'] is False and _is_last_admin(usuario):
                    return create_response(success=False, message='Não é possível inativar o último administrador', status_code=400)
                usuario.ativo = bool(dados['ativo'])

            if dados.get('pin'):
                if not _validar_pin(dados['pin']):
                    return create_response(success=False, message='PIN deve ter 4 dígitos', status_code=400)
                usuario.set_pin(dados['pin'])

            if 'permissoes' in dados and dados['permissoes'] is not None:
                set_user_permissions(usuario, dados['permissoes'])

            db.session.commit()
            return create_response(success=True, message='Usuário atualizado com sucesso',
                                   data=_usuario_completo(usuario))
        except Exception:
            db.session.rollback()
            return create_response(success=False, message='Erro ao atualizar usuário', status_code=500)

    # DELETE
    if not check_permission('usuarios', 'excluir'):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    try:
        if str(usuario.id) == str(get_jwt_identity()):
            return create_response(success=False, message='Você não pode excluir o próprio usuário', status_code=400)
        if _is_last_admin(usuario):
            return create_response(success=False, message='Não é possível excluir o último administrador', status_code=400)

        # Sem cascade no banco: remove as permissões do usuário manualmente
        UsuarioPermissao.query.filter_by(usuario_id=usuario.id).delete()
        db.session.delete(usuario)
        db.session.commit()
        return create_response(success=True, message='Usuário excluído com sucesso')
    except Exception:
        db.session.rollback()
        return create_response(success=False, message='Erro ao excluir usuário', status_code=500)


@usuarios_bp.route('/<int:id>/ativo', methods=['PATCH', 'OPTIONS'])
@permission_required('usuarios', 'editar')
def toggle_ativo(id):
    usuario = Usuario.query.get(id)
    if not usuario:
        return create_response(success=False, message='Usuário não encontrado', status_code=404)
    try:
        if usuario.ativo and _is_last_admin(usuario):
            return create_response(success=False, message='Não é possível inativar o último administrador', status_code=400)
        usuario.ativo = not usuario.ativo
        db.session.commit()
        return create_response(success=True, message='Status atualizado', data=_usuario_completo(usuario))
    except Exception:
        db.session.rollback()
        return create_response(success=False, message='Erro ao atualizar status', status_code=500)


