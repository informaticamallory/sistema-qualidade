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
    pin_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), default='inspetor')
    fichas_permission = db.Column(db.String(20), default='readonly')
    ativo = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<Usuario {self.usuario}>'

    def set_pin(self, pin):
        """Gera hash seguro do PIN (PBKDF2 com salt)"""
        self.pin_hash = generate_password_hash(pin)

    def verify_pin(self, pin):
        """Verifica o PIN. Mantém compatibilidade com hashes SHA-256
        legados e faz upgrade transparente para o hash seguro."""
        # Hash legado: SHA-256 simples (64 caracteres hexadecimais, sem prefixo)
        if self._is_legacy_hash(self.pin_hash):
            if self.pin_hash == hashlib.sha256(pin.encode()).hexdigest():
                # Re-hash com algoritmo seguro na primeira verificação correta
                self.set_pin(pin)
                try:
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                return True
            return False

        return check_password_hash(self.pin_hash, pin)

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


