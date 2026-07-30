# models/usuario.py - Modelo de Usuário
from datetime import datetime
import hashlib
from werkzeug.security import generate_password_hash, check_password_hash
from app.extensions import db

# Papéis válidos no sistema
ROLES_VALIDOS = {'admin', 'supervisor', 'inspetor', 'inspetor_injecao', 'consultor'}
FICHAS_PERMISSIONS_VALIDAS = {'full', 'partial', 'readonly'}


class Usuario(db.Model):
    __tablename__ = 'usuarios'

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    usuario = db.Column(db.String(50), unique=True, nullable=False, index=True)
    # Nome da coluna mantido como pin_hash por compatibilidade com bancos
    # existentes (evita um RENAME COLUMN); hoje armazena o hash da senha.
    pin_hash = db.Column(db.String(256), nullable=False)
    # True enquanto o usuário ainda não trocou um PIN legado de 4 dígitos
    # pela nova senha forte de 8+ caracteres. Ver garantir_schema_usuarios().
    must_reset_password = db.Column(db.Boolean, default=False, nullable=False)
    role = db.Column(db.String(20), default='inspetor')
    fichas_permission = db.Column(db.String(20), default='readonly')
    ativo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Usuario {self.usuario}>'

    def set_senha(self, senha):
        """Gera hash seguro da senha (PBKDF2 com salt)"""
        self.pin_hash = generate_password_hash(senha)

    def verificar_senha(self, senha):
        """Verifica a senha. Mantém compatibilidade com hashes SHA-256
        legados (PIN antigo) e faz upgrade transparente para o hash seguro."""
        # Hash legado: SHA-256 simples (64 caracteres hexadecimais, sem prefixo)
        if self._is_legacy_hash(self.pin_hash):
            if self.pin_hash == hashlib.sha256(senha.encode()).hexdigest():
                # Re-hash com algoritmo seguro na primeira verificação correta
                self.set_senha(senha)
                try:
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                return True
            return False

        return check_password_hash(self.pin_hash, senha)

    @staticmethod
    def _is_legacy_hash(stored):
        """Detecta hash SHA-256 antigo (hex puro de 64 chars)."""
        if not stored or ':' in stored:
            return False
        if len(stored) != 64:
            return False
        try:
            int(stored, 16)
            return True
        except ValueError:
            return False

    def to_dict(self):
        """Converter objeto para dicionário"""
        return {
            'id': self.id,
            'nome': self.nome,
            'usuario': self.usuario,
            'role': self.role,
            'fichasPermission': (self.fichas_permission or 'readonly') if self.role == 'consultor' else 'full',
            'ativo': self.ativo,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


