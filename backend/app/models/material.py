# models/material.py - Material, revisões de desenho e cotas de referência
from datetime import datetime
from app.extensions import db


class Material(db.Model):
    """Material recebido, identificado pelo código SAP.

    Substitui a parte de identificação que a ficha de recebimento antiga
    repetia a cada lançamento: aqui o material é cadastrado uma vez e as
    inspeções apontam para ele."""
    __tablename__ = 'materiais'

    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)

    codigo_sap = db.Column(db.String(50), nullable=False, unique=True, index=True)
    componente = db.Column(db.String(255))
    aplicacao = db.Column(db.String(255))
    setor = db.Column(db.String(100))
    fornecedor = db.Column(db.String(255))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    revisoes = db.relationship(
        'RevisaoDesenho',
        back_populates='material',
        cascade='all, delete-orphan',
        order_by='RevisaoDesenho.id.desc()'
    )

    def __repr__(self):
        return f'<Material {self.codigo_sap} - {self.componente}>'

    def to_dict(self, incluir_revisoes=False):
        dados = {
            'id': self.id,
            'codigo_sap': self.codigo_sap,
            'componente': self.componente,
            'aplicacao': self.aplicacao,
            'setor': self.setor,
            'fornecedor': self.fornecedor,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        if incluir_revisoes:
            dados['revisoes'] = [r.to_dict() for r in self.revisoes]
        return dados


class RevisaoDesenho(db.Model):
    """Uma revisão do desenho do material (A, B, REV01...).

    O mesmo material acumula revisões ao longo do tempo; a inspeção sempre
    aponta para a revisão que estava valendo quando o lote foi medido."""
    __tablename__ = 'revisoes_desenho'

    __table_args__ = (
        db.UniqueConstraint('material_id', 'revisao', name='uq_revisao_material'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    material_id = db.Column(db.Integer, db.ForeignKey('materiais.id', ondelete='CASCADE'),
                            nullable=False, index=True)

    revisao = db.Column(db.String(50), nullable=False)
    data = db.Column(db.Date)
    observacoes = db.Column(db.Text)

    # Link para o desenho técnico (Drive, SharePoint, storage interno). Fica na
    # revisão e não na posição: um desenho cobre todas as cotas da revisão.
    link_desenho = db.Column(db.String(1000))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    material = db.relationship('Material', back_populates='revisoes')
    posicoes = db.relationship(
        'PosicaoRevisao',
        back_populates='revisao_desenho',
        cascade='all, delete-orphan',
        order_by='PosicaoRevisao.ordem'
    )

    def __repr__(self):
        return f'<RevisaoDesenho {self.revisao} (material {self.material_id})>'

    def to_dict(self, incluir_posicoes=False, incluir_material=False):
        dados = {
            'id': self.id,
            'material_id': self.material_id,
            'revisao': self.revisao,
            'data': self.data.isoformat() if self.data else None,
            'observacoes': self.observacoes,
            'link_desenho': self.link_desenho,
            'total_posicoes': len(self.posicoes),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        if incluir_posicoes:
            dados['posicoes'] = [p.to_dict() for p in self.posicoes]
        if incluir_material and self.material:
            dados['material'] = self.material.to_dict()
        return dados


class PosicaoRevisao(db.Model):
    """Uma cota do desenho: o que a inspeção vai medir.

    `cota` é texto porque nem toda posição é dimensional — o desenho costuma
    trazer, junto das medidas, verificações de visual e funcional, que não têm
    valor numérico. Pelo mesmo motivo não há tolerância aqui: o resultado
    OK/NOK é decidido pelo inspetor, não calculado."""
    __tablename__ = 'posicoes_revisao'

    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    revisao_id = db.Column(db.Integer, db.ForeignKey('revisoes_desenho.id', ondelete='CASCADE'),
                           nullable=False, index=True)

    # Ordem de exibição, separada de `posicao` porque a posição do desenho pode
    # ser um rótulo qualquer ("1", "A2", "Visual") e não ordena sozinha.
    ordem = db.Column(db.Integer, default=0)
    posicao = db.Column(db.String(50), nullable=False)
    cota = db.Column(db.String(120))
    instrumento = db.Column(db.String(120))
    observacoes = db.Column(db.Text)

    revisao_desenho = db.relationship('RevisaoDesenho', back_populates='posicoes')

    def __repr__(self):
        return f'<PosicaoRevisao {self.posicao} (revisao {self.revisao_id})>'

    def to_dict(self):
        return {
            'id': self.id,
            'revisao_id': self.revisao_id,
            'ordem': self.ordem,
            'posicao': self.posicao,
            'cota': self.cota,
            'instrumento': self.instrumento,
            'observacoes': self.observacoes
        }
