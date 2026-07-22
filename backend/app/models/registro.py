# models/registro.py - Modelos de Registro de Inspeção
from datetime import datetime
from decimal import Decimal

from app.extensions import db


def _decimal_text(value):
    if value is None:
        return ''
    if isinstance(value, Decimal):
        return format(value.normalize(), 'f').rstrip('0').rstrip('.') or '0'
    return value


class RegistroInspecao(db.Model):
    __tablename__ = 'registros_inspecao'

    __table_args__ = (
        db.Index('idx_data_status', 'data_inspecao', 'status'),
        db.Index('idx_cod_sap_modelo', 'cod_sap', 'modelo'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)

    # Dados de inspeção
    data_inspecao = db.Column(db.Date, nullable=False, index=True)
    semana = db.Column(db.String(10))
    cod_sap = db.Column(db.String(50), nullable=False, index=True)
    linha = db.Column(db.String(50))
    familia = db.Column(db.String(100))
    modelo = db.Column(db.String(100), nullable=False)
    descricao_sap = db.Column(db.Text)
    codigo_barras = db.Column(db.String(255))

    # Quantidades
    qtd_total = db.Column(db.Integer, default=0)
    qtd_inspecionada = db.Column(db.Integer, default=0)
    qtd_nc = db.Column(db.Integer, default=0)
    qtd_pallet = db.Column(db.Integer, default=0)

    # Rastreabilidade
    rastreabilidade = db.Column(db.String(100))
    po = db.Column(db.String(50))

    # Operação
    turno = db.Column(db.String(1))  # 'A', 'B' ou 'C'
    linha_montagem = db.Column(db.String(20))

    # Inspeção
    inspetor = db.Column(db.String(100), nullable=False, index=True)
    status = db.Column(db.String(20), default='pendente', index=True)
    observacao = db.Column(db.Text)

    # Não conformidade
    documento = db.Column(db.String(100))
    defeito = db.Column(db.String(255))
    prioridade = db.Column(db.String(20))
    origem_problema = db.Column(db.Text)

    # Registro de ocorrência da montagem
    posto = db.Column(db.String(80))
    operador = db.Column(db.String(120))
    causa = db.Column(db.Text)
    correcao = db.Column(db.Text)
    responsavel_correcao = db.Column(db.String(120))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    checklist_testes = db.relationship('ChecklistTeste', backref='registro', lazy='dynamic', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<RegistroInspecao {self.cod_sap} - {self.modelo}>'

    def checklist_to_dict(self):
        checklist = self.checklist_testes.first()
        return checklist.to_dict() if checklist else None

    def to_dict(self):
        """Converter para dicionário"""
        return {
            'id': self.id,
            'data_inspecao': self.data_inspecao.isoformat() if self.data_inspecao else None,
            'semana': self.semana,
            'cod_sap': self.cod_sap,
            'linha': self.linha,
            'familia': self.familia,
            'modelo': self.modelo,
            'descricao_sap': self.descricao_sap,
            'codigo_barras': self.codigo_barras,
            'qtd_total': self.qtd_total,
            'qtd_inspecionada': self.qtd_inspecionada,
            'qtd_nc': self.qtd_nc,
            'qtd_pallet': self.qtd_pallet,
            'rastreabilidade': self.rastreabilidade,
            'po': self.po,
            'turno': self.turno,
            'linha_montagem': self.linha_montagem,
            'inspetor': self.inspetor,
            'status': self.status,
            'observacao': self.observacao,
            'documento': self.documento,
            'defeito': self.defeito,
            'prioridade': self.prioridade,
            'origem_problema': self.origem_problema,
            'posto': self.posto,
            'operador': self.operador,
            'causa': self.causa,
            'correcao': self.correcao,
            'responsavelCorrecao': self.responsavel_correcao,
            'responsavel_correcao': self.responsavel_correcao,
            'checklist': self.checklist_to_dict(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ChecklistTeste(db.Model):
    __tablename__ = 'checklist_testes'

    id = db.Column(db.Integer, primary_key=True)
    registro_id = db.Column(db.Integer, db.ForeignKey('registros_inspecao.id', ondelete='CASCADE'))

    # Testes de motor
    corrente_valor = db.Column(db.Numeric(10, 2))
    corrente_conforme = db.Column(db.Boolean)
    corrente_obs = db.Column(db.Text)
    potencia_valor = db.Column(db.Numeric(10, 2))
    potencia_conforme = db.Column(db.Boolean)
    potencia_obs = db.Column(db.Text)

    # Testes elétricos
    hipot_conforme = db.Column(db.Boolean)
    hipot_obs = db.Column(db.Text)
    etiquetas_conforme = db.Column(db.Boolean)
    etiquetas_obs = db.Column(db.Text)
    plugue_conforme = db.Column(db.Boolean)
    plugue_obs = db.Column(db.Text)

    # Testes visuais
    grafismos_conforme = db.Column(db.Boolean)
    grafismos_obs = db.Column(db.Text)
    embalagens_conforme = db.Column(db.Boolean)
    embalagens_obs = db.Column(db.Text)
    pecas_injetadas_conforme = db.Column(db.Boolean)
    pecas_injetadas_obs = db.Column(db.Text)
    montagem_conforme = db.Column(db.Boolean)
    montagem_obs = db.Column(db.Text)
    visual_conforme = db.Column(db.Boolean)
    visual_obs = db.Column(db.Text)

    # Código de barras
    codigo_barras = db.Column(db.String(255))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @staticmethod
    def _item(conforme, obs='', valor=None):
        dados = {'conforme': conforme, 'obs': obs or ''}
        if valor is not None:
            dados['valor'] = _decimal_text(valor)
        return dados

    def to_dict(self):
        return {
            'corrente': self._item(self.corrente_conforme, self.corrente_obs, self.corrente_valor),
            'potencia': self._item(self.potencia_conforme, self.potencia_obs, self.potencia_valor),
            'hipot': self._item(self.hipot_conforme, self.hipot_obs),
            'etiquetas': self._item(self.etiquetas_conforme, self.etiquetas_obs),
            'plugue': self._item(self.plugue_conforme, self.plugue_obs),
            'grafismos': self._item(self.grafismos_conforme, self.grafismos_obs),
            'embalagens': self._item(self.embalagens_conforme, self.embalagens_obs),
            'pecas_injetadas': self._item(self.pecas_injetadas_conforme, self.pecas_injetadas_obs),
            'montagem': self._item(self.montagem_conforme, self.montagem_obs),
            'visual': self._item(self.visual_conforme, self.visual_obs),
            'codigo_barras': self.codigo_barras or ''
        }