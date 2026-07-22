# models/ficha_nc.py - Persistência das Fichas de Não Conformidade
from datetime import datetime
from decimal import Decimal

from sqlalchemy.dialects.mysql import LONGTEXT

from app.extensions import db


class FichaNC(db.Model):
    __tablename__ = 'fichas_nc'

    __table_args__ = (
        db.Index('idx_fichas_nc_numero_fnc', 'numero_fnc'),
        db.Index('idx_fichas_nc_fonte_registro', 'fonte_registro_id'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    fonte_registro_id = db.Column(db.Integer, db.ForeignKey('registros_inspecao.id', ondelete='SET NULL'), nullable=True)
    numero_fnc = db.Column(db.String(80))

    codigo = db.Column(db.String(80))
    produto = db.Column(db.String(255), nullable=False)
    data = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(40), default='Aberta')
    responsavel = db.Column(db.String(100))

    de_departamento = db.Column(db.String(120))
    para_departamento = db.Column(db.String(120))
    nf_po = db.Column(db.String(100))
    num_serie = db.Column(db.String(100))

    quantidade = db.Column(db.Integer, default=0)
    qtd_nao_conforme = db.Column(db.Integer, default=0)
    qtd_inspecionadas = db.Column(db.Integer, default=0)
    indice = db.Column(db.Numeric(12, 2), default=0)

    descricao_nc = db.Column(db.Text)
    disposicao = db.Column(db.String(80))
    porques = db.Column(db.JSON)

    acao_imediata = db.Column(db.Text)
    correcao = db.Column(db.Text)
    acao_corretiva = db.Column(db.Text)
    prazo_acao = db.Column(db.Date)
    responsavel_acao = db.Column(db.String(100))

    custo_horas = db.Column(db.Numeric(12, 2), default=0)
    custo_trabalho = db.Column(db.Numeric(12, 2), default=0)
    custo_material = db.Column(db.Numeric(12, 2), default=0)
    custo_refugo = db.Column(db.Numeric(12, 2), default=0)
    taxa_cambio = db.Column(db.Numeric(12, 4), default=0)

    decisao_final = db.Column(db.String(120))
    observacoes = db.Column(db.Text)
    inspecao_resultado = db.Column(db.String(120))
    data_inspecao = db.Column(db.Date)
    aprovacao_qc = db.Column(db.String(120))
    aprovacao_responsavel = db.Column(db.String(120))
    aprovacao_manager = db.Column(db.String(120))

    evidencia_foto = db.Column(db.Text().with_variant(LONGTEXT(), 'mysql'))
    evidencia_foto_nome = db.Column(db.String(255))

    eficacia_validada = db.Column(db.Boolean, default=False)
    eficacia_resultado = db.Column(db.String(20))
    eficacia_data = db.Column(db.Date)
    eficacia_responsavel = db.Column(db.String(100))
    historico = db.Column(db.JSON)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.String(100))
    deleted_at = db.Column(db.DateTime)

    def __repr__(self):
        return f'<FichaNC {self.numero_fnc or self.id}>'

    @staticmethod
    def _date(value):
        return value.isoformat() if value else ''

    @staticmethod
    def _number(value, default=0):
        if value is None:
            return default
        if isinstance(value, Decimal):
            value = float(value)
        return value

    def _porques_dict(self):
        porques = self.porques or {}
        if isinstance(porques, list):
            return {f'porque_{idx + 1}': item or '' for idx, item in enumerate(porques[:5])}
        if isinstance(porques, dict):
            return {f'porque_{idx}': porques.get(f'porque_{idx}') or porques.get(str(idx)) or '' for idx in range(1, 6)}
        return {f'porque_{idx}': '' for idx in range(1, 6)}

    def to_dict(self, registro=None):
        registro_id = registro.id if registro else self.fonte_registro_id
        numero = self.numero_fnc or (f'FNC-{registro_id}' if registro_id else f'FNC-{self.id}')

        data_fnc = self.data or (registro.data_inspecao if registro else None)
        codigo = self.codigo or (registro.cod_sap if registro else '')
        produto = self.produto or (registro.modelo if registro else '')
        quantidade = self.quantidade if self.quantidade is not None else (registro.qtd_total if registro else 0)
        qtd_nc = self.qtd_nao_conforme if self.qtd_nao_conforme is not None else (registro.qtd_nc if registro else 0)
        qtd_inspec = self.qtd_inspecionadas if self.qtd_inspecionadas is not None else (registro.qtd_inspecionada if registro else 0)
        descricao = self.descricao_nc or (registro.defeito or registro.observacao if registro else '')
        observacoes = self.observacoes or (registro.observacao if registro else '')

        dados = {
            'id': registro_id or self.id,
            'ficha_nc_id': self.id,
            'fonte_registro_id': registro_id,
            'numero_fnc': numero,
            'data_fnc': self._date(data_fnc),
            'data_inspecao': self._date(data_fnc),
            'de_departamento': self.de_departamento or 'CONTROLE DE QUALIDADE',
            'para_departamento': self.para_departamento or '',
            'codigo': codigo or '',
            'cod_sap': codigo or '',
            'produto': produto or '',
            'modelo': produto or '',
            'nf_po': self.nf_po or '',
            'num_serie': self.num_serie or '',
            'foto_nc': self.evidencia_foto or '',
            'foto_nc_nome': self.evidencia_foto_nome or '',
            'quantidade': quantidade or 0,
            'qtd_total': quantidade or 0,
            'qtd_nao_conforme': qtd_nc or 0,
            'qtd_nc': qtd_nc or 0,
            'qtd_inspecionadas': qtd_inspec or 0,
            'qtd_inspecionada': qtd_inspec or 0,
            'indice': self._number(self.indice),
            'descricao_nc': descricao or '',
            'defeito': descricao or '',
            'disposicao': self.disposicao or '',
            'acao_imediata': self.acao_imediata or '',
            'correcao': self.correcao or '',
            'acao_corretiva': self.acao_corretiva or '',
            'responsavel_acao': self.responsavel_acao or '',
            'prazo_acao': self._date(self.prazo_acao),
            'total_horas': self._number(self.custo_horas),
            'taxa_trabalho': self._number(self.custo_trabalho),
            'custo_material': self._number(self.custo_material),
            'custo_refugo': self._number(self.custo_refugo),
            'taxa_cambio': self._number(self.taxa_cambio),
            'decisao_final': self.decisao_final or '',
            'decisao': self.decisao_final or '',
            'status': self.status or 'Aberta',
            'observacoes': observacoes or '',
            'observacao': observacoes or '',
            'inspecao_resultado': self.inspecao_resultado or '',
            'data_inspecao_fnc': self._date(self.data_inspecao),
            'aprovacao_qc': self.aprovacao_qc or '',
            'aprovacao_responsavel': self.aprovacao_responsavel or '',
            'aprovacao_manager': self.aprovacao_manager or '',
            'responsavel': self.responsavel or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        dados.update(self._porques_dict())
        return dados