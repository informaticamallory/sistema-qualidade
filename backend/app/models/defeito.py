# models/defeito.py - Catálogo de defeitos
from datetime import datetime
from app.extensions import db


class Defeito(db.Model):
    __tablename__ = 'tb_defeito'

    id = db.Column(db.Integer, primary_key=True)
    defeito = db.Column(db.String(100), nullable=False)

    # Inativação em vez de exclusão: o defeito pode estar amarrado a inspeções
    # antigas, e apagá-lo levaria o histórico junto. Inativo só some da lista
    # de escolha; onde já foi usado, continua aparecendo.
    ativo = db.Column(db.Boolean, default=True, nullable=False)

    # Quem digitou o nome pela primeira vez. Vazio significa que veio da carga
    # inicial, antes de este campo existir.
    criado_por = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        """Converter objeto para dicionário"""
        return {
            'id': self.id,
            'defeito': self.defeito,
            'ativo': bool(self.ativo),
            'criado_por': self.criado_por or '',
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
