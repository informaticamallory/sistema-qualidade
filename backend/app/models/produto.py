# models/produto.py - Modelo de Produto
from app.extensions import db


class Produto(db.Model):
    __tablename__ = 'tb_produtos'
    
    id = db.Column(db.Integer, primary_key=True)
    cod_material = db.Column(db.String(255))
    cod_ean_upc = db.Column(db.String(255), index=True)
    cod_linha = db.Column(db.String(255))
    cod_familia = db.Column(db.String(255))
    desc_material = db.Column(db.Text)
    
    def to_dict(self):
        """Converter objeto para dicionário"""
        return {
            'id': self.id,
            'cod_material': self.cod_material,
            'cod_ean_upc': self.cod_ean_upc,
            'cod_linha': self.cod_linha,
            'cod_familia': self.cod_familia,
            'desc_material': self.desc_material
        }
