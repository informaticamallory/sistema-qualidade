# routes/__init__.py - Registro de blueprints
from app.routes.auth import auth_bp
from app.routes.usuarios import usuarios_bp
from app.routes.registros import registros_bp
from app.routes.nao_conformidades import nao_conformidades_bp
from app.routes.injecao import injecao_bp
from app.routes.recebimento import ficha_recebimento_bp, relatorio_recebimento_bp
from app.routes.cartoes import cartoes_bp
from app.routes.produtos import produtos_bp
from app.routes.defeitos import defeitos_bp
from app.routes.dashboard import dashboard_bp
from app.routes.calibracoes import equipamentos_bp, tipos_equipamento_bp, calibracoes_bp
from app.routes.q49 import q49_bp
from app.routes.resumo_bloqueio import resumo_bloqueio_bp


def register_blueprints(app):
    """Registrar todos os blueprints na aplicação"""
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(usuarios_bp, url_prefix='/api/usuarios')
    app.register_blueprint(registros_bp, url_prefix='/api/registros')
    app.register_blueprint(nao_conformidades_bp, url_prefix='/api/nao-conformidades')
    app.register_blueprint(injecao_bp, url_prefix='/api/inspecao-injecao')
    app.register_blueprint(ficha_recebimento_bp, url_prefix='/api/inspecao-recebimento')
    app.register_blueprint(relatorio_recebimento_bp, url_prefix='/api/relatorio-recebimento')
    app.register_blueprint(cartoes_bp, url_prefix='/api/cartoes')
    app.register_blueprint(produtos_bp, url_prefix='/api/produtos')
    app.register_blueprint(defeitos_bp, url_prefix='/api/defeitos')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(q49_bp, url_prefix='/api/q49')
    app.register_blueprint(equipamentos_bp, url_prefix='/api/equipamentos')
    app.register_blueprint(tipos_equipamento_bp, url_prefix='/api/tipos-equipamento')
    app.register_blueprint(calibracoes_bp, url_prefix='/api/calibracoes')
    app.register_blueprint(resumo_bloqueio_bp, url_prefix='/api/resumo-bloqueio')
