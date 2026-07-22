# routes/produtos.py - Rotas de produtos
from flask import Blueprint, request, current_app

from app.extensions import db, limiter
from app.models.produto import Produto
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required

produtos_bp = Blueprint('produtos', __name__)


@produtos_bp.route('', methods=['GET', 'OPTIONS'])
@limiter.limit("200 per minute")
@auth_required()
def listar_produtos():
    """Listar todos os produtos"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        produtos = Produto.query.all()
        produtos_data = [produto.to_dict() for produto in produtos]
        
        return create_response(
            success=True,
            data=produtos_data,
            message=f"Encontrados {len(produtos_data)} produtos"
        )
        
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar produtos: {str(e)}")
        return create_response(
            success=False,
            message=f"Erro ao buscar produtos: {str(e)}",
            status_code=500
        )


@produtos_bp.route('/<codigo>', methods=['GET', 'OPTIONS'])
@limiter.limit("100 per minute")
@auth_required()
def buscar_produto_por_codigo(codigo):
    """Busca produto por código SAP"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        codigo_normalizado = (codigo or '').strip().upper()
        produto = Produto.query.filter(
            db.func.upper(db.func.trim(Produto.cod_material)) == codigo_normalizado
        ).first()
        
        if produto:
            return create_response(
                success=True,
                data=produto.to_dict()
            )
        else:
            return create_response(
                success=False,
                message='Produto não encontrado',
                status_code=404
            )
        
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar produto: {str(e)}")
        return create_response(
            success=False,
            message=f"Erro ao buscar produto: {str(e)}",
            status_code=500
        )


@produtos_bp.route('/barcode/<codigo_barras>', methods=['GET', 'OPTIONS'])
@limiter.limit("100 per minute")
@auth_required()
def buscar_produto_por_barcode(codigo_barras):
    """Busca produto por código de barras"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        codigo_normalizado = (codigo_barras or '').strip()
        produto = Produto.query.filter(
            db.func.trim(Produto.cod_ean_upc) == codigo_normalizado
        ).first()
        
        if produto:
            return create_response(
                success=True,
                data=produto.to_dict()
            )
        else:
            return create_response(
                success=False,
                message='Produto não encontrado',
                status_code=404
            )
        
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar produto por código de barras: {str(e)}")
        return create_response(
            success=False,
            message=f"Erro ao buscar produto: {str(e)}",
            status_code=500
        )


@produtos_bp.route('/search', methods=['GET'])
@limiter.limit("100 per minute")
@auth_required()
def search_produtos():
    """Buscar produtos por termo"""
    try:
        termo = request.args.get('q', '').strip().upper()
        
        if not termo or len(termo) < 2:
            return create_response(
                success=False,
                message='Termo de busca deve ter pelo menos 2 caracteres',
                status_code=400
            )
        
        produtos = Produto.query.filter(
            db.or_(
                Produto.cod_material.like(f"{termo}%"),
                db.func.upper(Produto.desc_material).like(f"%{termo}%")
            )
        ).order_by(Produto.cod_material).limit(10).all()
        
        produtos_data = [produto.to_dict() for produto in produtos]
        
        return create_response(
            success=True,
            data=produtos_data,
            message=f"Encontrados {len(produtos_data)} produtos"
        )
        
    except Exception as e:
        current_app.logger.error(f"Erro na busca de produtos: {str(e)}")
        return create_response(
            success=False,
            message=f"Erro na busca: {str(e)}",
            status_code=500
        )
