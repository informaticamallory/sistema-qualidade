# models/q49.py - Modelo de registros Q49 (Produto Importado)
from datetime import datetime
from app.extensions import db


class Q49Registro(db.Model):
    __tablename__ = 'q49_registros'

    __table_args__ = (
        db.Index('idx_q49_data_status', 'data_china', 'resultado'),
        db.Index('idx_q49_codigo_sap', 'codigo_sap'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)

    # China
    data_china = db.Column(db.Date, nullable=False, index=True)
    ano_china = db.Column(db.String(10))
    mes_china = db.Column(db.String(30))
    po = db.Column(db.String(100))
    emani = db.Column(db.String(100))
    semana = db.Column(db.String(10))
    tipo_item = db.Column(db.String(100))
    n_insp = db.Column(db.String(100), index=True)
    nacionalizacao = db.Column(db.String(50))
    codigo_sap = db.Column(db.String(100), index=True)
    descricao_sap = db.Column(db.Text)
    linha = db.Column(db.String(100))
    modelo = db.Column(db.String(255))
    fornecedor = db.Column(db.String(255), index=True)
    qtd_total = db.Column(db.Integer, default=0)
    qtd_inspecionada = db.Column(db.Integer, default=0)
    rastreabilidade = db.Column(db.String(255))
    inspetor_china = db.Column(db.String(100))
    resultado = db.Column(db.String(30), default='pendente', index=True)
    rejeicoes = db.Column(db.Text)
    resumo_problemas = db.Column(db.Text)

    # Decisão Brasil
    decisao_mallory = db.Column(db.String(100))
    acao = db.Column(db.Text)
    prazo = db.Column(db.Date)
    decisao_status = db.Column(db.String(30), default='pendente', index=True)
    tipo_reprovacao = db.Column(db.String(255))
    data_aceite_q49 = db.Column(db.Date)
    resp_reprovacao = db.Column(db.String(100))
    observacoes_decisao = db.Column(db.Text)

    # Brasil
    data_entrada = db.Column(db.Date)
    ano_brasil = db.Column(db.String(10))
    mes_brasil = db.Column(db.String(30))
    data_inspecao_brasil = db.Column(db.Date)
    qtd_inspecionada_brasil = db.Column(db.Integer, default=0)
    qtd_nc_inspecionada = db.Column(db.Integer, default=0)
    qtd_liberados = db.Column(db.Integer, default=0)
    qtd_bloqueados = db.Column(db.Integer, default=0)
    inspetor = db.Column(db.String(100), index=True)
    decisao_brasil = db.Column(db.String(30), default='pendente', index=True)
    reporte_docushare = db.Column(db.String(255))
    disposicao_decisao = db.Column(db.Text)
    defeitos = db.Column(db.Text)
    n_rna = db.Column(db.String(100))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def status_dashboard(self):
        return self.decisao_brasil or self.decisao_status or self.resultado or 'pendente'

    @staticmethod
    def _iso_date(value):
        return value.isoformat() if value else ''

    def to_dict(self):
        return {
            'id': self.id,
            'china': {
                'datachina': self._iso_date(self.data_china),
                'ano': self.ano_china or '',
                'mes': self.mes_china or '',
                'po': self.po or '',
                'emani': self.emani or '',
                'semana': self.semana or '',
                'tipoItem': self.tipo_item or '',
                'nInsp': self.n_insp or '',
                'nacionalizacao': self.nacionalizacao or '',
                'codigoSAP': self.codigo_sap or '',
                'descricaoSAP': self.descricao_sap or '',
                'linha': self.linha or '',
                'modelo': self.modelo or '',
                'fornecedor': self.fornecedor or '',
                'qtdTotal': self.qtd_total or 0,
                'qtdInspecionada': self.qtd_inspecionada or 0,
                'rastreabilidade': self.rastreabilidade or '',
                'inspetorChina': self.inspetor_china or '',
                'resultado': self.resultado or 'pendente',
                'rejeicoes': self.rejeicoes or '',
                'resumoProblemas': self.resumo_problemas or ''
            },
            'decisaoBrasil': {
                'decisaoMallory': self.decisao_mallory or '',
                'acao': self.acao or '',
                'prazo': self._iso_date(self.prazo),
                'status': self.decisao_status or 'pendente',
                'tipoReprovacao': self.tipo_reprovacao or '',
                'dataAceiteQ49': self._iso_date(self.data_aceite_q49),
                'respReprovacao': self.resp_reprovacao or '',
                'observacoes': self.observacoes_decisao or ''
            },
            'brasil': {
                'dataEntrada': self._iso_date(self.data_entrada),
                'ano': self.ano_brasil or '',
                'mes': self.mes_brasil or '',
                'dataInspecao': self._iso_date(self.data_inspecao_brasil),
                'qtdInspecionada': self.qtd_inspecionada_brasil or 0,
                'qtdNCInspecionada': self.qtd_nc_inspecionada or 0,
                'qtdLiberados': self.qtd_liberados or 0,
                'qtdBloqueados': self.qtd_bloqueados or 0,
                'inspetor': self.inspetor or '',
                'decisaoBrasil': self.decisao_brasil or 'pendente',
                'reporteDocushare': self.reporte_docushare or '',
                'disposicaoDecisao': self.disposicao_decisao or '',
                'defeitos': self.defeitos or '',
                'nRNA': self.n_rna or ''
            },
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }