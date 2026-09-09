# models/inspecao_recebimento.py - Inspeção de um lote recebido e seus resultados
from datetime import datetime
from app.extensions import db

STATUS_RESULTADO = ('ok', 'nok')


class InspecaoRecebimento(db.Model):
    """Inspeção de um lote recebido, medido contra uma revisão de desenho.

    Diferença para a ficha antiga: lá uma ficha agrupava vários lotes numa
    matriz única. Aqui cada lote é uma inspeção, o que permite consultar,
    filtrar e aprovar lote a lote."""
    __tablename__ = 'inspecoes_recebimento'

    __table_args__ = (
        db.Index('idx_insp_recb_data', 'data_inspecao', 'status'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)

    material_id = db.Column(db.Integer, db.ForeignKey('materiais.id'), nullable=False, index=True)
    revisao_id = db.Column(db.Integer, db.ForeignKey('revisoes_desenho.id'), nullable=False, index=True)

    # Herdado do material ao abrir a inspeção, mas editável: o mesmo item pode
    # vir de outro fornecedor sem que isso mude o cadastro do material.
    fornecedor = db.Column(db.String(255))

    lote = db.Column(db.String(100), index=True)
    data_entrada = db.Column(db.Date)
    data_inspecao = db.Column(db.Date, index=True)
    nota_fiscal = db.Column(db.String(50))
    quantidade_total = db.Column(db.Integer, default=0)

    # Sem FOREIGN KEY para 'usuarios': aquela tabela é pré-existente e não é
    # InnoDB, e uma FK InnoDB apontando para ela falha (erro 1824) — mesmo
    # motivo documentado em models/permissao.py. O nome fica desnormalizado de
    # propósito, para o histórico não mudar se o usuário for renomeado.
    inspetor_id = db.Column(db.Integer, index=True)
    inspetor_nome = db.Column(db.String(150))

    status = db.Column(db.String(20), default='pendente', index=True)
    observacao = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    material = db.relationship('Material')
    revisao = db.relationship('RevisaoDesenho')
    lotes = db.relationship(
        'LoteInspecao',
        back_populates='inspecao',
        cascade='all, delete-orphan',
        order_by='LoteInspecao.ordem'
    )
    resultados = db.relationship(
        'ResultadoInspecao',
        back_populates='inspecao',
        cascade='all, delete-orphan',
        order_by='ResultadoInspecao.ordem'
    )

    def sincronizar_resumo_dos_lotes(self):
        """Reflete a lista de lotes nas colunas escalares da inspeção.

        Elas continuam existindo porque a listagem exibe lote e nota fiscal em
        colunas, e a busca filtra por elas. Guardam o primeiro lote, e a
        quantidade vira a soma — que é o número que interessa para o lote
        inteiro recebido."""
        primeiro = self.lotes[0] if self.lotes else None
        self.lote = primeiro.lote if primeiro else None
        self.nota_fiscal = primeiro.nota_fiscal if primeiro else None
        self.quantidade_total = sum((l.quantidade_total or 0) for l in self.lotes)

    def calcular_status(self):
        """Reprovado quando qualquer posição estiver NOK; pendente enquanto
        faltar medição. Não sobrescreve uma decisão manual de reprovar."""
        if not self.resultados:
            return 'pendente'
        if any(r.status == 'nok' for r in self.resultados):
            return 'reprovado'
        if any(not (r.valor_medido or '').strip() for r in self.resultados):
            return 'pendente'
        return 'aprovado'

    def __repr__(self):
        return f'<InspecaoRecebimento lote={self.lote} material={self.material_id}>'

    def to_dict(self, incluir_resultados=False):
        dados = {
            'id': self.id,
            'material_id': self.material_id,
            'revisao_id': self.revisao_id,
            'codigo_sap': self.material.codigo_sap if self.material else None,
            'componente': self.material.componente if self.material else None,
            'revisao_desenho': self.revisao.revisao if self.revisao else None,
            # Vem junto para a tela de inspeção mostrar o desenho ao reabrir um
            # lançamento, sem precisar de uma segunda consulta à revisão.
            'link_desenho': self.revisao.link_desenho if self.revisao else None,
            'fornecedor': self.fornecedor,
            'lote': self.lote,
            'data_entrada': self.data_entrada.isoformat() if self.data_entrada else None,
            'data_inspecao': self.data_inspecao.isoformat() if self.data_inspecao else None,
            'nota_fiscal': self.nota_fiscal,
            'quantidade_total': self.quantidade_total,
            # Lista completa, mais os escalares acima como resumo: a tela de
            # edição usa esta, a listagem usa aqueles.
            'lotes': [l.to_dict() for l in self.lotes],
            'inspetor_id': self.inspetor_id,
            'inspetor_nome': self.inspetor_nome,
            'status': self.status,
            'observacao': self.observacao,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        if incluir_resultados:
            dados['resultados'] = [r.to_dict() for r in self.resultados]
        return dados


class LoteInspecao(db.Model):
    """Um lote recebido dentro da inspeção.

    Uma entrega pode chegar partida em vários lotes ou notas fiscais, e antes
    isso não cabia: a inspeção tinha um lote, uma nota e uma quantidade.
    As colunas escalares continuam na inspeção, alimentadas a partir daqui,
    porque a listagem e a busca dependem delas."""
    __tablename__ = 'lotes_inspecao'

    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    inspecao_id = db.Column(db.Integer, db.ForeignKey('inspecoes_recebimento.id', ondelete='CASCADE'),
                            nullable=False, index=True)

    ordem = db.Column(db.Integer, default=0)
    lote = db.Column(db.String(100), index=True)
    nota_fiscal = db.Column(db.String(50))
    quantidade_total = db.Column(db.Integer, default=0)

    inspecao = db.relationship('InspecaoRecebimento', back_populates='lotes')

    def __repr__(self):
        return f'<LoteInspecao {self.lote} nf={self.nota_fiscal}>'

    def to_dict(self):
        return {
            'id': self.id,
            'inspecao_id': self.inspecao_id,
            'ordem': self.ordem,
            'lote': self.lote,
            'nota_fiscal': self.nota_fiscal,
            'quantidade_total': self.quantidade_total
        }


class ResultadoInspecao(db.Model):
    """Medição de uma posição dentro de uma inspeção.

    `posicao` e `cota_nominal` são cópias do que a revisão dizia no momento da
    inspeção, não apenas a chave estrangeira. Sem isso, editar uma cota do
    desenho reescreveria o histórico de inspeções já fechadas."""
    __tablename__ = 'resultados_inspecao'

    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    inspecao_id = db.Column(db.Integer, db.ForeignKey('inspecoes_recebimento.id', ondelete='CASCADE'),
                            nullable=False, index=True)
    posicao_revisao_id = db.Column(db.Integer, db.ForeignKey('posicoes_revisao.id'), index=True)

    ordem = db.Column(db.Integer, default=0)
    posicao = db.Column(db.String(50))
    cota_nominal = db.Column(db.String(120))
    instrumento = db.Column(db.String(120))

    # Texto, e não número: as posições de visual e funcional convivem com as
    # dimensionais na mesma lista e não têm valor numérico.
    valor_medido = db.Column(db.String(120))
    observacao = db.Column(db.Text)
    status = db.Column(db.String(10))

    inspecao = db.relationship('InspecaoRecebimento', back_populates='resultados')

    def __repr__(self):
        return f'<ResultadoInspecao pos={self.posicao} {self.status}>'

    def to_dict(self):
        return {
            'id': self.id,
            'inspecao_id': self.inspecao_id,
            'posicao_revisao_id': self.posicao_revisao_id,
            'ordem': self.ordem,
            'posicao': self.posicao,
            'cota_nominal': self.cota_nominal,
            'instrumento': self.instrumento,
            'valor_medido': self.valor_medido,
            'observacao': self.observacao,
            'status': self.status
        }
