# utils/audit.py - Funções de auditoria
from flask import request, current_app
from app.extensions import db
from app.models.auditoria import Auditoria


def log_audit(tabela, registro_id, acao, dados_anteriores=None, dados_novos=None):
    """Registrar ação na auditoria"""
    try:
        auditoria = Auditoria(
            tabela=tabela,
            registro_id=registro_id,
            acao=acao,
            dados_anteriores=dados_anteriores,
            dados_novos=dados_novos,
            usuario=request.headers.get('X-User', 'sistema'),
            ip_address=request.remote_addr
        )
        db.session.add(auditoria)
        db.session.commit()
    except Exception as e:
        current_app.logger.error(f"Erro ao registrar auditoria: {str(e)}")
