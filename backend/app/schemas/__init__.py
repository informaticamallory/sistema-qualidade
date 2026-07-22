# schemas/__init__.py - Exportar schemas
from app.schemas.registro import RegistroInspecaoSchema, registro_schema, registros_schema
from app.schemas.cartao import CartaoQualidadeSchema, cartao_schema, cartoes_schema

__all__ = [
    'RegistroInspecaoSchema',
    'registro_schema',
    'registros_schema',
    'CartaoQualidadeSchema',
    'cartao_schema',
    'cartoes_schema'
]
