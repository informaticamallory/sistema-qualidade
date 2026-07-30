# routes/auth.py - Rotas de autenticação
from flask import Blueprint, request
from datetime import datetime, timedelta
from flask_jwt_extended import create_access_token, get_jwt, get_jwt_identity, jwt_required

from app.extensions import db, limiter
from app.models.usuario import Usuario, ROLES_VALIDOS, FICHAS_PERMISSIONS_VALIDAS
from app.utils.responses import create_response
from app.utils.audit import log_audit
from app.utils.auth_decorators import auth_required
from app.utils.permissions import effective_permissions
from app.utils.password_validation import validar_senha, TAMANHO_MAXIMO

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
        senha = dados.get('senha')

        if not usuario or not senha:
            return create_response(
                success=False,
                message='Usuário e senha são obrigatórios',
                status_code=400
            )

        # Aqui só verificamos presença/tamanho básico, não a política de
        # complexidade: a senha já foi validada quando foi definida. Repetir
        # a checagem no login rejeitaria também PINs legados antes de darmos
        # a chance de identificar e bloquear via must_reset_password.
        if len(senha) > TAMANHO_MAXIMO:
            return create_response(
                success=False,
                message='Usuário ou senha inválido',
                status_code=401
            )

        user = Usuario.query.filter_by(usuario=usuario, ativo=True).first()

        if not user or not user.verificar_senha(senha):
            return create_response(
                success=False,
                message='Usuário ou senha inválido',
                status_code=401
            )

        if user.must_reset_password:
            reset_token = create_access_token(
                identity=str(user.id),
                expires_delta=timedelta(minutes=10),
                additional_claims={
                    'password_reset_only': True,
                    'role': user.role,
                    'usuario': user.usuario
                }
            )
            return create_response(
                success=False,
                message='Defina uma nova senha para continuar.',
                data={
                    'password_reset_required': True,
                    'password_reset_token': reset_token
                },
                status_code=403
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



@auth_bp.route('/redefinir-senha-legado', methods=['POST', 'OPTIONS'])
@limiter.limit("10 per minute", methods=['POST'])
@jwt_required()
def redefinir_senha_legado():
    """Conclui a migração de um PIN legado após uma autenticação válida."""
    if request.method == 'OPTIONS':
        return '', 200

    claims = get_jwt()
    if not claims.get('password_reset_only'):
        return create_response(success=False, message='Token inválido para redefinição de senha', status_code=403)

    try:
        dados = request.get_json() or {}
        senha = dados.get('senha')
        criterios_faltantes = validar_senha(senha)
        if criterios_faltantes:
            return create_response(
                success=False,
                message='Senha não atende aos requisitos de segurança',
                errors=criterios_faltantes,
                status_code=400
            )

        user = Usuario.query.get(int(get_jwt_identity()))
        if not user or not user.ativo or not user.must_reset_password:
            return create_response(success=False, message='Redefinição de senha indisponível', status_code=403)

        user.set_senha(senha)
        user.must_reset_password = False
        db.session.commit()

        token = create_access_token(
            identity=str(user.id),
            additional_claims={'role': user.role, 'usuario': user.usuario}
        )
        usuario_data = user.to_dict()
        usuario_data['permissoes'] = effective_permissions(user)
        return create_response(
            success=True,
            message='Senha atualizada com sucesso',
            data={'token': token, 'usuario': usuario_data}
        )
    except Exception:
        db.session.rollback()
        return create_response(success=False, message='Erro ao atualizar senha', status_code=500)
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

        if not dados.get('nome') or not dados.get('usuario') or not dados.get('senha'):
            return create_response(
                success=False,
                message='Nome, usuário e senha são obrigatórios',
                status_code=400
            )

        senha = dados.get('senha')
        criterios_faltantes = validar_senha(senha)
        if criterios_faltantes:
            return create_response(
                success=False,
                message='Senha não atende aos requisitos de segurança',
                errors=criterios_faltantes,
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
            fichas_permission=fichas_permission,
            must_reset_password=False
        )
        novo_usuario.set_senha(senha)

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
    """Verificar senha de administrador"""
    if request.method == 'OPTIONS':
        return '', 200

    try:
        dados = request.get_json() or {}
        senha = dados.get('senha')

        if not senha or len(senha) > TAMANHO_MAXIMO:
            return create_response(
                success=False,
                message='Senha inválida',
                status_code=400
            )

        admins = Usuario.query.filter_by(role='admin', ativo=True).all()

        for admin in admins:
            if admin.verificar_senha(senha) and not admin.must_reset_password:
                return create_response(
                    success=True,
                    message='Verificação bem-sucedida',
                    data={'admin_id': admin.id, 'admin_nome': admin.nome}
                )

        return create_response(
            success=False,
            message='Senha de administrador inválida',
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

