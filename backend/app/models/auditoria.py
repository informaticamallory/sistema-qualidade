# models/auditoria.py - Modelo de Auditoria
from datetime import datetime
from app.extensions import db


class Auditoria(db.Model):
    __tablename__ = 'auditoria'
    
    id = db.Column(db.Integer, primary_key=True)
    tabela = db.Column(db.String(50), nullable=False)
    registro_id = db.Column(db.Integer, nullable=False)
    acao = db.Column(db.Enum('INSERT', 'UPDATE', 'DELETE', 'LOGIN', name='acao_enum'), nullable=False)
    dados_anteriores = db.Column(db.JSON)
    dados_novos = db.Column(db.JSON)
    usuario = db.Column(db.String(100))
    ip_address = db.Column(db.String(45))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
