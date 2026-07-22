# routes/auth.py - Rotas de autenticação
from flask import Blueprint, request
from datetime import datetime
from flask_jwt_extended import create_access_token

from app.extensions import db, limiter
from flask_jwt_extended import get_jwt_identity
from app.models.usuario import Usuario, ROLES_VALIDOS, FICHAS_PERMISSIONS_VALIDAS
from app.utils.responses import create_response
from app.utils.audit import log_audit
from app.utils.auth_decorators import auth_required
from app.utils.permissions import effective_permissions

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST', 'OPTIONS'])
@limiter.limit("10 per minute", methods=['POST'])
def login():
    """Login de usuário"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        dados = request.get_json() or {}
        usuario = dados.get('usuario')
        pin = dados.get('pin')

        if not usuario or not pin:
            return create_response(
                success=False,
                message='Usuário e PIN são obrigatórios',
                status_code=400
            )

        if len(pin) != 4 or not pin.isdigit():
            return create_response(
                success=False,
                message='PIN deve ter 4 dígitos',
                status_code=400
            )

        user = Usuario.query.filter_by(usuario=usuario, ativo=True).first()

        if not user or not user.verify_pin(pin):
            return create_response(
                success=False,
                message='Usuário ou PIN inválido',
                status_code=401
            )

        # Token JWT assinado, com o papel embutido nas claims
        token = create_access_token(
            identity=str(user.id),
            additional_claims={'role': user.role, 'usuario': user.usuario}
        )

        try:
            log_audit('usuarios', user.id, 'LOGIN',
                      dados_novos={'usuario': user.usuario, 'timestamp': datetime.utcnow().isoformat()})
        except Exception:
            pass

        usuario_data = user.to_dict()
        usuario_data['permissoes'] = effective_permissions(user)

        return create_response(
            success=True,
            message='Login realizado com sucesso',
            data={
                'token': token,
                'usuario': usuario_data
            }
        )

    except Exception:
        return create_response(
            success=False,
            message='Erro ao fazer login',
            status_code=500
        )


@auth_bp.route('/me', methods=['GET', 'OPTIONS'])
@auth_required()
def me():
    """Dados do usuário autenticado + permissões efetivas (para o frontend)."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        user = Usuario.query.get(int(get_jwt_identity()))
        if not user or not user.ativo:
            return create_response(success=False, message='Usuário inválido', status_code=401)
        data = user.to_dict()
        data['permissoes'] = effective_permissions(user)
        return create_response(success=True, data=data)
    except Exception:
        return create_response(success=False, message='Erro ao carregar usuário', status_code=500)


@auth_bp.route('/register', methods=['POST', 'OPTIONS'])
@auth_required('admin')
def register():
    """Registrar novo usuário (apenas administradores)"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        dados = request.get_json() or {}

        if not dados.get('nome') or not dados.get('usuario') or not dados.get('pin'):
            return create_response(
                success=False,
                message='Nome, usuário e PIN são obrigatórios',
                status_code=400
            )

        pin = dados.get('pin')
        if len(pin) != 4 or not pin.isdigit():
            return create_response(
                success=False,
                message='PIN deve ter 4 dígitos',
                status_code=400
            )

        # Validar papel contra a lista permitida (evita escalonamento arbitrário)
        role = dados.get('role', 'inspetor')
        if role not in ROLES_VALIDOS:
            return create_response(
                success=False,
                message='Papel (role) inválido',
                status_code=400
            )

        fichas_permission = dados.get('fichasPermission', dados.get('fichas_permission'))
        if role != 'consultor':
            fichas_permission = 'full'
        else:
            fichas_permission = fichas_permission or 'readonly'
            if fichas_permission not in FICHAS_PERMISSIONS_VALIDAS:
                return create_response(
                    success=False,
                    message='Permissão nas Fichas NC inválida',
                    status_code=400
                )

        usuario_existente = Usuario.query.filter_by(usuario=dados.get('usuario')).first()
        if usuario_existente:
            return create_response(
                success=False,
                message='Usuário já existe',
                status_code=409
            )

        novo_usuario = Usuario(
            nome=dados.get('nome'),
            usuario=dados.get('usuario'),
            role=role,
            fichas_permission=fichas_permission
        )
        novo_usuario.set_pin(pin)

        db.session.add(novo_usuario)
        db.session.commit()

        return create_response(
            success=True,
            message='Usuário criado com sucesso',
            data=novo_usuario.to_dict(),
            status_code=201
        )

    except Exception:
        db.session.rollback()
        return create_response(
            success=False,
            message='Erro ao criar usuário',
            status_code=500
        )


@auth_bp.route('/verify-admin', methods=['POST', 'OPTIONS'])
@limiter.limit("10 per minute", methods=['POST'])
def verify_admin():
    """Verificar PIN de administrador"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        dados = request.get_json() or {}
        pin = dados.get('pin')

        if not pin or len(pin) != 4:
            return create_response(
                success=False,
                message='PIN inválido',
                status_code=400
            )

        admins = Usuario.query.filter_by(role='admin', ativo=True).all()

        for admin in admins:
            if admin.verify_pin(pin):
                return create_response(
                    success=True,
                    message='Verificação bem-sucedida',
                    data={'admin_id': admin.id, 'admin_nome': admin.nome}
                )

        return create_response(
            success=False,
            message='PIN de administrador inválido',
            status_code=401
        )

    except Exception:
        return create_response(
            success=False,
            message='Erro na verificação',
            status_code=500
        )


@auth_bp.route('/usuarios', methods=['GET', 'OPTIONS'])
@auth_required('admin', 'supervisor')
def listar_usuarios():
    """Listar todos os usuários"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        usuarios = Usuario.query.filter_by(ativo=True).all()
        usuarios_data = [user.to_dict() for user in usuarios]

        return create_response(
            success=True,
            data=usuarios_data
        )

    except Exception:
        return create_response(
            success=False,
            message='Erro ao buscar usuários',
            status_code=500
        )


@auth_bp.route('/usuarios/<int:id>', methods=['DELETE', 'OPTIONS'])
@auth_required('admin')
def deletar_usuario(id):
    """Desativar usuário (apenas administradores)"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        usuario = Usuario.query.get(id)

        if not usuario:
            return create_response(
                success=False,
                message='Usuário não encontrado',
                status_code=404
            )

        usuario.ativo = False
        db.session.commit()

        return create_response(
            success=True,
            message='Usuário desativado com sucesso'
        )

    except Exception:
        db.session.rollback()
        return create_response(
            success=False,
            message='Erro ao desativar usuário',
            status_code=500
        )

