# models/__init__.py - Exportar todos os modelos
from app.models.usuario import Usuario
from app.models.registro import RegistroInspecao, ChecklistTeste
from app.models.injecao import RegistroInjecao
from app.models.recebimento import FichaRecebimento, RelatorioRecebimento
from app.models.permissao import Permissao, UsuarioPermissao
from app.models.cartao import CartaoQualidade
from app.models.produto import Produto
from app.models.defeito import Defeito
from app.models.auditoria import Auditoria
from app.models.calibracao import TipoEquipamento, Equipamento, Calibracao
from app.models.q49 import Q49Registro
from app.models.resumo_bloqueio import ResumoBloqueio, ResumoBloqueioLinha
from app.models.ficha_nc import FichaNC

__all__ = [
    'Usuario',
    'RegistroInspecao',
    'ChecklistTeste',
    'RegistroInjecao',
    'FichaRecebimento',
    'RelatorioRecebimento',
    'Permissao',
    'UsuarioPermissao',
    'CartaoQualidade',
    'Produto',
    'Defeito',
    'Auditoria',
    'TipoEquipamento',
    'Equipamento',
    'Calibracao',
    'Q49Registro',
    'ResumoBloqueio',
    'ResumoBloqueioLinha',
    'FichaNC'
]
