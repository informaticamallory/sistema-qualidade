# models/recebimento.py - Modelos de Inspeção e Relatório de Recebimento
from datetime import datetime
from app.extensions import db


class FichaRecebimento(db.Model):
    """Ficha de Inspeção de Recebimento (layout de ficha/planilha).
    As tabelas internas (lotes, dimensões funcionais e matriz de resultados)
    são guardadas como JSON para manter tudo em um único registro."""
    __tablename__ = 'fichas_recebimento'

    __table_args__ = (
        db.Index('idx_ficha_recb_codigo', 'codigo'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)

    # Identificação do material
    codigo = db.Column(db.String(50), nullable=False, index=True)
    aplicacao = db.Column(db.String(255))
    componente = db.Column(db.String(255))
    setor = db.Column(db.String(100))
    fornecedor = db.Column(db.String(255))
    revisao_desenho = db.Column(db.String(50))

    # Tabelas aninhadas (arrays de objetos)
    lotes = db.Column(db.JSON, default=list)        # [{lote, data_entrada, data_saida, num_nota_fiscal, quant_total, parecer_c, parecer_sc, parecer_nc, amostragem, lote_fornecedor, inspetor, concessao}]
    dimensoes = db.Column(db.JSON, default=list)    # [{posicao, cota, instrumento, observacoes}]
    resultados = db.Column(db.JSON, default=list)   # [{linha, valores: [{v, d} x12]}]

    # Meta
    data_inspecao = db.Column(db.Date)
    inspetor = db.Column(db.String(100))
    status = db.Column(db.String(20), default='pendente', index=True)
    observacao = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<FichaRecebimento {self.codigo} - {self.componente}>'

    def to_dict(self):
        return {
            'id': self.id,
            'codigo': self.codigo,
            'aplicacao': self.aplicacao,
            'componente': self.componente,
            'setor': self.setor,
            'fornecedor': self.fornecedor,
            'revisao_desenho': self.revisao_desenho,
            'lotes': self.lotes or [],
            'dimensoes': self.dimensoes or [],
            'resultados': self.resultados or [],
            'data_inspecao': self.data_inspecao.isoformat() if self.data_inspecao else None,
            'inspetor': self.inspetor,
            'status': self.status,
            'observacao': self.observacao,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class RelatorioRecebimento(db.Model):
    """Relatório de Entrada de Matéria-Prima Nacional (listagem em tabela larga)."""
    __tablename__ = 'relatorios_recebimento'

    __table_args__ = (
        db.Index('idx_rel_recb_data', 'data_inspecao', 'status_material'),
        db.Index('idx_rel_recb_cod', 'cod_sap'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)

    data_entrada = db.Column(db.Date)
    data_inspecao = db.Column(db.Date, index=True)
    cod_sap = db.Column(db.String(50), index=True)
    descricao_sap = db.Column(db.Text)
    fornecedor = db.Column(db.String(255))

    qtd_total = db.Column(db.Integer, default=0)
    qtd_inspecionada = db.Column(db.Integer, default=0)
    qtd_nc = db.Column(db.Integer, default=0)

    status_material = db.Column(db.String(30), default='pendente')
    rastreabilidade = db.Column(db.String(100))
    documento = db.Column(db.String(100))
    defeito = db.Column(db.String(255))
    inspetor = db.Column(db.String(100))
    nota_fiscal = db.Column(db.String(50))

    # Indicadores/flags do relatório
    mpn = db.Column(db.String(20))
    rel = db.Column(db.String(20))
    sei = db.Column(db.String(20))
    dev = db.Column(db.String(20))
    lp = db.Column(db.String(20))
    liberado_sap = db.Column(db.String(10))

    observacao = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<RelatorioRecebimento {self.cod_sap} - {self.fornecedor}>'

    def to_dict(self):
        return {
            'id': self.id,
            'data_entrada': self.data_entrada.isoformat() if self.data_entrada else None,
            'data_inspecao': self.data_inspecao.isoformat() if self.data_inspecao else None,
            'cod_sap': self.cod_sap,
            'descricao_sap': self.descricao_sap,
            'fornecedor': self.fornecedor,
            'qtd_total': self.qtd_total,
            'qtd_inspecionada': self.qtd_inspecionada,
            'qtd_nc': self.qtd_nc,
            'status_material': self.status_material,
            'rastreabilidade': self.rastreabilidade,
            'documento': self.documento,
            'defeito': self.defeito,
            'inspetor': self.inspetor,
            'nota_fiscal': self.nota_fiscal,
            'mpn': self.mpn,
            'rel': self.rel,
            'sei': self.sei,
            'dev': self.dev,
            'lp': self.lp,
            'liberado_sap': self.liberado_sap,
            'observacao': self.observacao,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
