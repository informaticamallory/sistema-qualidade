# schemas/cartao.py - Schema de Cartão de Qualidade
from marshmallow import Schema, fields, validate


class CartaoQualidadeSchema(Schema):
    """Schema de validação para Cartão de Qualidade"""
    
    id = fields.Int(dump_only=True)
    codigo_produto = fields.Str(allow_none=True)
    nome_produto = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    origem = fields.Str(required=True, validate=validate.OneOf(['nacional', 'importado', 'Nacional', 'Importado', 'NACIONAL', 'IMPORTADO']))
    setor = fields.Str(required=True, validate=validate.Length(max=50))
    turno = fields.Str(required=True, validate=validate.OneOf(['A', 'B', 'C']))
    
    qtd_conforme = fields.Int(validate=validate.Range(min=0), load_default=0)
    qtd_nao_conforme = fields.Int(validate=validate.Range(min=0), load_default=0)
    
    status = fields.Str(required=True, validate=validate.OneOf(['aprovado', 'reprovado', 'Aprovado', 'Reprovado', 'APROVADO', 'REPROVADO']))
    documento_reprovacao = fields.Str(validate=validate.Length(max=100))
    
    descricao = fields.Str()
    observacoes = fields.Str()
    
    responsavel = fields.Str(validate=validate.Length(max=100))
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)


# Instâncias dos schemas
cartao_schema = CartaoQualidadeSchema()
cartoes_schema = CartaoQualidadeSchema(many=True)
