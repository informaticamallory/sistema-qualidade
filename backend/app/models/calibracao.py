# models/calibracao.py - Modelos de Equipamento, Tipo e Calibração
from datetime import datetime
from app.extensions import db


class TipoEquipamento(db.Model):
    __tablename__ = 'tipos_equipamento'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    equipamentos = db.relationship('Equipamento', backref='tipo_rel', lazy=True)

    def __repr__(self):
        return f'<TipoEquipamento {self.nome}>'

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome
        }


class Equipamento(db.Model):
    __tablename__ = 'equipamentos'

    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(50), unique=True, nullable=False, index=True)
    nome = db.Column(db.String(150), nullable=False)
    tipo_id = db.Column(db.Integer, db.ForeignKey('tipos_equipamento.id'), nullable=True)
    codigo_sap = db.Column(db.String(50))
    fabricante = db.Column(db.String(100))
    modelo = db.Column(db.String(100))
    numero_serie = db.Column(db.String(100))
    setor = db.Column(db.String(100))
    responsavel = db.Column(db.String(100))
    tipo_afericao = db.Column(db.String(30))
    status_equipamento = db.Column(db.String(30), default='ativo')
    frequencia_calibracao = db.Column(db.String(30))
    ultimo_certificado = db.Column(db.String(100))
    ultimo_certificado_rastreavel = db.Column(db.String(150))
    data_ultima_calibracao = db.Column(db.Date)
    data_proxima_calibracao = db.Column(db.Date)
    status_ficha_calibracao = db.Column(db.String(30))
    erro_aceitavel = db.Column(db.String(50))
    comentarios = db.Column(db.Text)
    ativo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    calibracoes = db.relationship(
        'Calibracao',
        backref='equipamento_rel',
        lazy=True,
        order_by='Calibracao.data_calibracao.desc()'
    )

    def __repr__(self):
        return f'<Equipamento {self.codigo}>'

    def ultima_calibracao(self):
        """Calibração mais recente do equipamento (ou None)"""
        return self.calibracoes[0] if self.calibracoes else None

    def to_dict(self):
        ultima = self.ultima_calibracao()
        ultima_calibracao = ultima.to_dict() if ultima else None
        if not ultima_calibracao and (self.data_ultima_calibracao or self.data_proxima_calibracao):
            ultima_calibracao = {
                'id': None,
                'equipamento_id': self.id,
                'data_calibracao': self.data_ultima_calibracao.isoformat() if self.data_ultima_calibracao else None,
                'data_validade': self.data_proxima_calibracao.isoformat() if self.data_proxima_calibracao else None,
                'laboratorio': None,
                'numero_certificado': self.ultimo_certificado,
                'resultado': self.status_ficha_calibracao or 'pendente',
                'observacoes': self.comentarios,
                'responsavel': self.responsavel,
                'arquivo_certificado': None,
                'created_at': self.created_at.isoformat() if self.created_at else None,
                'origem': 'cadastro_equipamento'
            }

        return {
            'id': self.id,
            'codigo': self.codigo,
            'nome': self.nome,
            'tipo_id': self.tipo_id,
            'tipo': self.tipo_rel.nome if self.tipo_rel else None,
            'codigo_sap': self.codigo_sap,
            'fabricante': self.fabricante,
            'modelo': self.modelo,
            'numero_serie': self.numero_serie,
            'setor': self.setor,
            'responsavel': self.responsavel,
            'tipo_afericao': self.tipo_afericao,
            'status_equipamento': self.status_equipamento,
            'frequencia_calibracao': self.frequencia_calibracao,
            'ultimo_certificado': self.ultimo_certificado,
            'ultimo_certificado_rastreavel': self.ultimo_certificado_rastreavel,
            'data_ultima_calibracao': self.data_ultima_calibracao.isoformat() if self.data_ultima_calibracao else None,
            'data_proxima_calibracao': self.data_proxima_calibracao.isoformat() if self.data_proxima_calibracao else None,
            'status_ficha_calibracao': self.status_ficha_calibracao,
            'erro_aceitavel': self.erro_aceitavel,
            'comentarios': self.comentarios,
            'ativo': self.ativo,
            'ultima_calibracao': ultima_calibracao,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Calibracao(db.Model):
    __tablename__ = 'calibracoes'

    id = db.Column(db.Integer, primary_key=True)
    equipamento_id = db.Column(db.Integer, db.ForeignKey('equipamentos.id'), nullable=False, index=True)
    data_calibracao = db.Column(db.Date, nullable=False)
    data_validade = db.Column(db.Date, nullable=False)
    laboratorio = db.Column(db.String(150))
    numero_certificado = db.Column(db.String(100))
    resultado = db.Column(db.String(20), default='pendente')
    observacoes = db.Column(db.Text)
    responsavel = db.Column(db.String(100))
    arquivo_certificado = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<Calibracao equip={self.equipamento_id} {self.data_calibracao}>'

    def to_dict(self):
        return {
            'id': self.id,
            'equipamento_id': self.equipamento_id,
            'data_calibracao': self.data_calibracao.isoformat() if self.data_calibracao else None,
            'data_validade': self.data_validade.isoformat() if self.data_validade else None,
            'laboratorio': self.laboratorio,
            'numero_certificado': self.numero_certificado,
            'resultado': self.resultado,
            'observacoes': self.observacoes,
            'responsavel': self.responsavel,
            'arquivo_certificado': self.arquivo_certificado,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
