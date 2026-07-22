# extensions.py - Extensões Flask centralizadas
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_jwt_extended import JWTManager

# Instâncias das extensões (inicializadas sem app)
db = SQLAlchemy()
migrate = Migrate()
limiter = Limiter(key_func=get_remote_address)
jwt = JWTManager()


def init_extensions(app):
    """Inicializar todas as extensões com a aplicação Flask"""
    db.init_app(app)
    migrate.init_app(app, db)

    # Configurar CORS a partir das origens definidas em config
    origins = app.config.get('CORS_ORIGINS', '*')
    if isinstance(origins, str) and origins != '*':
        origins = [o.strip() for o in origins.split(',') if o.strip()]

    CORS(app, resources={
        r"/api/*": {
            "origins": origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })

    # Configurar rate limiter
    limiter.init_app(app)

    # Configurar JWT
    jwt.init_app(app)
    _register_jwt_handlers()


def _register_jwt_handlers():
    """Respostas padronizadas (401) para falhas de autenticação JWT"""
    # Import local para evitar import circular (utils -> audit -> extensions)
    from app.utils.responses import create_response

    @jwt.unauthorized_loader
    def _missing_token(reason):
        return create_response(
            success=False,
            message='Token de autenticação ausente',
            status_code=401
        )

    @jwt.invalid_token_loader
    def _invalid_token(reason):
        return create_response(
            success=False,
            message='Token de autenticação inválido',
            status_code=401
        )

    @jwt.expired_token_loader
    def _expired_token(header, payload):
        return create_response(
            success=False,
            message='Sessão expirada, faça login novamente',
            status_code=401
        )
