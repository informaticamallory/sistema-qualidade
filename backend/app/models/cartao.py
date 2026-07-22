# models/cartao.py - Modelo de Cartão de Qualidade
from datetime import datetime
from app.extensions import db


class CartaoQualidade(db.Model):
    __tablename__ = 'cartoes_qualidade'
    
    id = db.Column(db.Integer, primary_key=True)
    codigo_produto = db.Column(db.String(50), index=True)
    nome_produto = db.Column(db.String(200), nullable=False)
    origem = db.Column(db.String(50), nullable=False)
    setor = db.Column(db.String(50), nullable=False)
    turno = db.Column(db.String(1), nullable=False)
    
    qtd_conforme = db.Column(db.Integer, default=0)
    qtd_nao_conforme = db.Column(db.Integer, default=0)
    
    status = db.Column(db.String(20), nullable=False)
    documento_reprovacao = db.Column(db.String(100))
    
    descricao = db.Column(db.Text)
    observacoes = db.Column(db.Text)
    
    responsavel = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Converter objeto para dicionário"""
        return {
            'id': self.id,
            'codigo_produto': self.codigo_produto,
            'nome_produto': self.nome_produto,
            'origem': self.origem,
            'setor': self.setor,
            'turno': self.turno,
            'qtd_conforme': self.qtd_conforme,
            'qtd_nao_conforme': self.qtd_nao_conforme,
            'status': self.status,
            'documento_reprovacao': self.documento_reprovacao,
            'descricao': self.descricao,
            'observacoes': self.observacoes,
            'responsavel': self.responsavel,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
