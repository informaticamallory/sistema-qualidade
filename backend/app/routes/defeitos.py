# routes/defeitos.py - Rotas de defeitos
from flask import Blueprint, request, current_app

from app.extensions import db, limiter
from app.models.defeito import Defeito
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required

defeitos_bp = Blueprint('defeitos', __name__)


@defeitos_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("100 per minute")
@auth_required()
def handle_defeitos():
    """Listar e criar defeitos"""
    if request.method == 'OPTIONS':
        return '', 200
    
    # GET - Listar todos os defeitos
    if request.method == 'GET':
        try:
            defeitos = Defeito.query.order_by(Defeito.defeito).all()
            defeitos_data = [defeito.to_dict() for defeito in defeitos]
            
            return create_response(
                success=True,
                data=defeitos_data,
                message=f"Encontrados {len(defeitos_data)} defeitos"
            )
            
        except Exception as e:
            current_app.logger.error(f"Erro ao buscar defeitos: {str(e)}")
            return create_response(
                success=False,
                message="Erro ao buscar defeitos",
                status_code=500
            )
    
    # POST - Criar novo defeito
    if request.method == 'POST':
        try:
            dados = request.get_json()
            defeito_texto = dados.get('defeito', '').strip().upper()
            
            if not defeito_texto:
                return create_response(
                    success=False,
                    message='Defeito não pode ser vazio',
                    status_code=400
                )
            
            # Verificar se já existe
            defeito_existente = Defeito.query.filter(
                db.func.upper(Defeito.defeito) == defeito_texto
            ).first()
            
            if defeito_existente:
                return create_response(
                    success=False,
                    message='Este defeito já existe',
                    status_code=400
                )
            
            # Criar novo defeito
            novo_defeito = Defeito(defeito=defeito_texto)
            db.session.add(novo_defeito)
            db.session.commit()
            
            return create_response(
                success=True,
                message='Defeito adicionado com sucesso',
                data=novo_defeito.to_dict(),
                status_code=201
            )
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao criar defeito: {str(e)}")
            return create_response(
                success=False,
                message=f'Erro ao adicionar defeito: {str(e)}',
                status_code=500
            )


@defeitos_bp.route('/<int:id>', methods=['DELETE', 'OPTIONS'])
@auth_required('admin', 'supervisor')
def deletar_defeito(id):
    """Deletar defeito"""
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        defeito = Defeito.query.get(id)
        
        if not defeito:
            return create_response(
                success=False,
                message='Defeito não encontrado',
                status_code=404
            )
        
        db.session.delete(defeito)
        db.session.commit()
        
        return create_response(
            success=True,
            message='Defeito excluído com sucesso'
        )
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao deletar defeito: {str(e)}")
        return create_response(
            success=False,
            message='Erro ao excluir defeito',
            status_code=500
        )
