# schemas/injecao.py - Schema de Registro de Inspeção de Injeção
from marshmallow import Schema, fields, validate


class RegistroInjecaoSchema(Schema):
    """Schema de validação para Registro de Inspeção de Injeção"""

    id = fields.Int(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)

    # Obrigatórios
    data = fields.Date(required=True, error_messages={
        'required': 'Data é obrigatória',
        'invalid': 'Formato de data inválido'
    })
    cod = fields.Str(required=True, validate=validate.Length(min=1, max=50),
                     error_messages={'required': 'Código é obrigatório'})

    # Opcionais
    semana = fields.Str(validate=validate.Length(max=10), allow_none=True)
    turno_injecao = fields.Str(validate=validate.Length(max=10), allow_none=True)
    maquina = fields.Str(validate=validate.Length(max=50), allow_none=True)
    peca = fields.Str(validate=validate.Length(max=255), allow_none=True)
    molde = fields.Str(validate=validate.Length(max=50), allow_none=True)

    amostra_insp = fields.Int(validate=validate.Range(min=0), load_default=0)
    amostra_nc = fields.Int(validate=validate.Range(min=0), load_default=0)
    qtde_lote = fields.Int(validate=validate.Range(min=0), load_default=0)
    peso = fields.Str(validate=validate.Length(max=50), allow_none=True)

    status = fields.Str(validate=validate.OneOf(['pendente', 'aprovado', 'reprovado']),
                        load_default='pendente')
    defeito = fields.Str(validate=validate.Length(max=255), allow_none=True)

    cota1 = fields.Str(validate=validate.Length(max=50), allow_none=True)
    cota2 = fields.Str(validate=validate.Length(max=50), allow_none=True)
    cota3 = fields.Str(validate=validate.Length(max=50), allow_none=True)
    cota4 = fields.Str(validate=validate.Length(max=50), allow_none=True)

    visual = fields.Str(validate=validate.Length(max=5), allow_none=True)
    cor_padrao = fields.Str(validate=validate.Length(max=5), allow_none=True)
    encaixe = fields.Str(validate=validate.Length(max=5), allow_none=True)
    contra_peca = fields.Str(validate=validate.Length(max=5), allow_none=True)
    rebarbas = fields.Str(validate=validate.Length(max=5), allow_none=True)
    funcional = fields.Str(validate=validate.Length(max=5), allow_none=True)

    observacao = fields.Str(allow_none=True)
    inspetor = fields.Str(validate=validate.Length(max=100), allow_none=True)


# Instâncias dos schemas
injecao_schema = RegistroInjecaoSchema()
injecoes_schema = RegistroInjecaoSchema(many=True)
