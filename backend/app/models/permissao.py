# models/permissao.py - Catálogo de permissões e vínculo usuário↔permissão
from datetime import datetime
from app.extensions import db


class Permissao(db.Model):
    """Catálogo de permissões disponíveis (módulo + ação)."""
    __tablename__ = 'permissoes'

    __table_args__ = (
        db.UniqueConstraint('modulo', 'acao', name='uq_permissao_modulo_acao'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    modulo = db.Column(db.String(50), nullable=False, index=True)
    acao = db.Column(db.String(30), nullable=False)
    descricao = db.Column(db.String(150))

    def to_dict(self):
        return {'id': self.id, 'modulo': self.modulo, 'acao': self.acao, 'descricao': self.descricao}


class UsuarioPermissao(db.Model):
    """Permissões explicitamente concedidas a um usuário."""
    __tablename__ = 'usuario_permissoes'

    __table_args__ = (
        db.UniqueConstraint('usuario_id', 'permissao_id', name='uq_usuario_permissao'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4'}
    )

    id = db.Column(db.Integer, primary_key=True)
    # Sem FOREIGN KEY no nível do banco: a tabela 'usuarios' pré-existente foi
    # criada sem InnoDB, e uma FK InnoDB -> tabela não-InnoDB falha (erro 1824).
    # A integridade referencial é tratada na aplicação (ver routes/usuarios.py).
    usuario_id = db.Column(db.Integer, nullable=False, index=True)
    permissao_id = db.Column(db.Integer, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
