# models/injecao.py - Modelo de Registro de Inspeção de Injeção (peças plásticas)
from datetime import datetime
from app.extensions import db


class RegistroInjecao(db.Model):
    __tablename__ = 'registros_injecao'

    __table_args__ = (
        db.Index('idx_injecao_data_status', 'data', 'status'),
        db.Index('idx_injecao_cod', 'cod'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)

    # Dados de injeção
    data = db.Column(db.Date, nullable=False, index=True)
    semana = db.Column(db.String(10))
    turno_injecao = db.Column(db.String(10))
    maquina = db.Column(db.String(50))
    modelo_maquina = db.Column(db.String(100))
    cod = db.Column(db.String(50), nullable=False, index=True)
    peca = db.Column(db.String(255))
    molde = db.Column(db.String(50))

    # Amostragem
    amostra_insp = db.Column(db.Integer, default=0)
    amostra_nc = db.Column(db.Integer, default=0)
    qtde_lote = db.Column(db.Integer, default=0)
    peso = db.Column(db.String(50))

    # Status / defeito
    status = db.Column(db.String(20), default='pendente', index=True)
    defeito = db.Column(db.String(255))

    # Cotas críticas
    cota1 = db.Column(db.String(50))
    cota2 = db.Column(db.String(50))
    cota3 = db.Column(db.String(50))
    cota4 = db.Column(db.String(50))

    # Avaliação (C = Conforme, NC = Não Conforme, NA = N/A)
    visual = db.Column(db.String(5))
    cor_padrao = db.Column(db.String(5))
    encaixe = db.Column(db.String(5))
    contra_peca = db.Column(db.String(5))
    rebarbas = db.Column(db.String(5))
    funcional = db.Column(db.String(5))

    observacao = db.Column(db.Text)
    inspetor = db.Column(db.String(100), index=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<RegistroInjecao {self.cod} - {self.peca}>'

    def to_dict(self):
        return {
            'id': self.id,
            'data': self.data.isoformat() if self.data else None,
            'semana': self.semana,
            'turno_injecao': self.turno_injecao,
            'maquina': self.maquina,
            'modelo_maquina': self.modelo_maquina,
            'cod': self.cod,
            'peca': self.peca,
            'molde': self.molde,
            'amostra_insp': self.amostra_insp,
            'amostra_nc': self.amostra_nc,
            'qtde_lote': self.qtde_lote,
            'peso': self.peso,
            'status': self.status,
            'defeito': self.defeito,
            'cota1': self.cota1,
            'cota2': self.cota2,
            'cota3': self.cota3,
            'cota4': self.cota4,
            'visual': self.visual,
            'cor_padrao': self.cor_padrao,
            'encaixe': self.encaixe,
            'contra_peca': self.contra_peca,
            'rebarbas': self.rebarbas,
            'funcional': self.funcional,
            'observacao': self.observacao,
            'inspetor': self.inspetor,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
