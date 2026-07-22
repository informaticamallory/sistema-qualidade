# schemas/registro.py - Schema de Registro de Inspeção
from marshmallow import Schema, fields, validate, validates_schema, ValidationError


class RegistroInspecaoSchema(Schema):
    """Schema de validação para Registro de Inspeção"""

    # Campos somente leitura
    id = fields.Int(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)

    # Dados obrigatórios
    data_inspecao = fields.Date(required=True, error_messages={
        'required': 'Data de inspeção é obrigatória',
        'invalid': 'Formato de data inválido'
    })
    cod_sap = fields.Str(required=True, validate=validate.Length(min=1, max=50),
                         error_messages={'required': 'Código SAP é obrigatório'})
    modelo = fields.Str(required=True, validate=validate.Length(min=1, max=100),
                        error_messages={'required': 'Modelo é obrigatório'})
    inspetor = fields.Str(required=True, validate=validate.Length(min=1, max=100),
                          error_messages={'required': 'Inspetor é obrigatório'})

    # Campos opcionais com validação
    semana = fields.Str(validate=validate.Length(max=10), allow_none=True)
    linha = fields.Str(validate=validate.Length(max=50), allow_none=True)
    familia = fields.Str(validate=validate.Length(max=100), allow_none=True)
    descricao_sap = fields.Str(allow_none=True)
    codigo_barras = fields.Str(validate=validate.Length(max=255), allow_none=True)

    # Quantidades
    qtd_total = fields.Int(validate=validate.Range(min=0), load_default=0)
    qtd_inspecionada = fields.Int(validate=validate.Range(min=0), load_default=0)
    qtd_nc = fields.Int(validate=validate.Range(min=0), load_default=0)
    qtd_pallet = fields.Int(validate=validate.Range(min=0), load_default=0)

    # Rastreabilidade
    rastreabilidade = fields.Str(validate=validate.Length(max=100), allow_none=True)
    po = fields.Str(validate=validate.Length(max=50), allow_none=True)

    # Operação
    turno = fields.Str(validate=validate.OneOf(['A', 'B', 'C']), allow_none=True)
    linha_montagem = fields.Str(validate=validate.Length(max=20), allow_none=True)

    # Status e observações
    status = fields.Str(validate=validate.OneOf(['pendente', 'aprovado', 'reprovado']),
                        load_default='pendente')
    observacao = fields.Str(allow_none=True)

    # Não conformidade
    documento = fields.Str(validate=validate.Length(max=100), allow_none=True)
    defeito = fields.Str(validate=validate.Length(max=255), allow_none=True)
    prioridade = fields.Str(validate=validate.OneOf(['critico', 'primario', 'secundario']), allow_none=True)
    origem_problema = fields.Str(allow_none=True)

    # Registro de ocorrência
    posto = fields.Str(validate=validate.Length(max=80), allow_none=True)
    operador = fields.Str(validate=validate.Length(max=120), allow_none=True)
    causa = fields.Str(allow_none=True)
    correcao = fields.Str(allow_none=True)
    responsavelCorrecao = fields.Str(attribute='responsavel_correcao', allow_none=True)

    # Checklist salvo em tabela filha
    checklist = fields.Method('get_checklist', dump_only=True)

    def get_checklist(self, obj):
        checklist = obj.checklist_testes.first()
        return checklist.to_dict() if checklist else None

    @validates_schema
    def validate_nao_conformidade(self, data, **kwargs):
        """Validar campos de não conformidade quando status = reprovado"""
        if data.get('status') == 'reprovado':
            if not data.get('defeito'):
                raise ValidationError('Defeito é obrigatório quando status é reprovado', 'defeito')
            if not data.get('prioridade'):
                raise ValidationError('Prioridade é obrigatória quando status é reprovado', 'prioridade')

    @validates_schema
    def validate_quantidades(self, data, **kwargs):
        """Validar lógica das quantidades"""
        qtd_inspecionada = data.get('qtd_inspecionada', 0)
        qtd_nc = data.get('qtd_nc', 0)
        qtd_total = data.get('qtd_total', 0)

        if qtd_inspecionada > qtd_total:
            raise ValidationError('Quantidade inspecionada não pode ser maior que total')

        if qtd_nc > qtd_inspecionada:
            raise ValidationError('Quantidade NC não pode ser maior que inspecionada')


# Instâncias dos schemas
registro_schema = RegistroInspecaoSchema()
registros_schema = RegistroInspecaoSchema(many=True)