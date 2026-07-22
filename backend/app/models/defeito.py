# models/defeito.py - Modelo de Defeito
from app.extensions import db


class Defeito(db.Model):
    __tablename__ = 'tb_defeito'
    
    id = db.Column(db.Integer, primary_key=True)
    defeito = db.Column(db.String(100), nullable=False)
    
    def to_dict(self):
        """Converter objeto para dicionário"""
        return {
            'id': self.id,
            'defeito': self.defeito
        }
