# utils/auth_decorators.py - Decorators de autenticação e autorização
from functools import wraps
from flask import request
from flask_jwt_extended import verify_jwt_in_request, get_jwt, get_jwt_identity

from app.utils.responses import create_response


def _current_user():
    """Carrega o usuário autenticado a partir da identidade do JWT.
    Assume que o JWT já foi verificado."""
    from app.models.usuario import Usuario
    try:
        return Usuario.query.get(int(get_jwt_identity()))
    except (TypeError, ValueError):
        return None


def check_permission(modulo, acao):
    """Verifica se o usuário autenticado tem a permissão (módulo + ação).
    Para uso dentro de handlers que combinam métodos (GET/POST/PUT/DELETE),
    onde um decorator por-ação não se aplica. Requer JWT já verificado
    (ex.: via @auth_required())."""
    from app.utils.permissions import user_has_permission
    return user_has_permission(_current_user(), modulo, acao)


def permission_required(modulo, acao):
    """Exige JWT válido e a permissão (módulo + ação) para a rota.
    Ideal para endpoints de ação única.

    Uso:
        @permission_required('usuarios', 'criar')
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)

            verify_jwt_in_request()
            if get_jwt().get('password_reset_only'):
                return create_response(success=False, message='Conclua a redefinição de senha para continuar', status_code=403)
            user = _current_user()
            if not user or not user.ativo:
                return create_response(success=False, message='Usuário inválido ou inativo', status_code=401)

            from app.utils.permissions import user_has_permission
            if not user_has_permission(user, modulo, acao):
                return create_response(
                    success=False,
                    message='Acesso negado: permissão insuficiente',
                    status_code=403
                )
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def auth_required(*roles):
    """Exige um JWT válido. Se 'roles' for informado, exige que o papel
    do usuário (claim 'role') esteja entre os permitidos.

    Uso:
        @auth_required()                  -> qualquer usuário autenticado
        @auth_required('admin')           -> apenas admin
        @auth_required('admin', 'supervisor')
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Deixa o preflight CORS passar (a própria view trata OPTIONS)
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)

            verify_jwt_in_request()

            claims = get_jwt()
            if claims.get('password_reset_only'):
                return create_response(success=False, message='Conclua a redefinição de senha para continuar', status_code=403)

            if roles:
                if claims.get('role') not in roles:
                    return create_response(
                        success=False,
                        message='Acesso negado: permissão insuficiente',
                        status_code=403
                    )

            return fn(*args, **kwargs)
        return wrapper
    return decorator
