# models/resumo_bloqueio.py - Resumo Diário de Bloqueio
from datetime import datetime

from sqlalchemy.dialects.mysql import LONGTEXT

from app.extensions import db


class ResumoBloqueio(db.Model):
    __tablename__ = 'resumos_bloqueio'

    __table_args__ = (
        db.Index('idx_resumo_bloqueio_data', 'data'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.Date, nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    linhas = db.relationship(
        'ResumoBloqueioLinha',
        backref='resumo',
        cascade='all, delete-orphan',
        order_by='ResumoBloqueioLinha.ordem'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'data': self.data.isoformat() if self.data else None,
            'rows': [linha.to_dict() for linha in self.linhas],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ResumoBloqueioLinha(db.Model):
    __tablename__ = 'resumo_bloqueio_linhas'

    __table_args__ = (
        db.Index('idx_resumo_bloqueio_linha_resumo', 'resumo_id'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    resumo_id = db.Column(db.Integer, db.ForeignKey('resumos_bloqueio.id'), nullable=False)
    ordem = db.Column(db.Integer, default=0)
    turno = db.Column(db.String(1))
    qtd = db.Column(db.Integer)
    produto = db.Column(db.Text)
    peca = db.Column(db.Text)
    defeito = db.Column(db.Text)
    evidencia_nome = db.Column(db.String(255))
    evidencia_dados = db.Column(db.Text().with_variant(LONGTEXT(), 'mysql'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'turno': self.turno or '',
            'qtd': '' if self.qtd is None else self.qtd,
            'produto': self.produto or '',
            'peca': self.peca or '',
            'defeito': self.defeito or '',
            'evidencia': (
                {'url': self.evidencia_dados, 'name': self.evidencia_nome}
                if self.evidencia_dados else None
            ),
            'evidenciaPreview': self.evidencia_dados or ''
        }