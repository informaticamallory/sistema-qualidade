# routes/cartoes.py - Rotas de cartões de qualidade
from flask import Blueprint, request, current_app
from datetime import datetime

from app.extensions import db, limiter
from app.models.cartao import CartaoQualidade
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, permission_required, check_permission

cartoes_bp = Blueprint('cartoes', __name__)

_ACOES_LISTA = {'GET': 'visualizar', 'POST': 'criar'}
_ACOES_ITEM = {'GET': 'visualizar', 'PUT': 'editar', 'DELETE': 'excluir'}


def _negar_se_sem_permissao(mapa):
    acao = mapa.get(request.method)
    if acao and not check_permission('cartoes', acao):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    return None


@cartoes_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("100 per minute")
@auth_required()
def handle_cartoes():
    """Listar e criar cartões de qualidade"""

    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            page = request.args.get('page', 1, type=int)
            per_page = min(request.args.get('limit', 50, type=int), 100)
            search = request.args.get('search', '')
            status = request.args.get('status', '')
            
            query = CartaoQualidade.query
            
            if search:
                search_pattern = f"%{search.strip().upper()}%"
                query = query.filter(
                    db.or_(
                        db.func.upper(CartaoQualidade.codigo_produto).like(search_pattern),
                        db.func.upper(CartaoQualidade.nome_produto).like(search_pattern),
                        db.func.upper(CartaoQualidade.descricao).like(search_pattern),
                        db.func.upper(CartaoQualidade.origem).like(search_pattern),
                        db.func.upper(CartaoQualidade.setor).like(search_pattern)
                    )
                )
            
            if status:
                query = query.filter(db.func.upper(CartaoQualidade.status) == status.strip().upper())
            
            query = query.order_by(CartaoQualidade.created_at.desc())
            
            if page == 1 and not request.args.get('page'):
                cartoes = query.all()
                total = len(cartoes)
            else:
                paginated = query.paginate(page=page, per_page=per_page, error_out=False)
                cartoes = paginated.items
                total = paginated.total
            
            cartoes_data = [cartao.to_dict() for cartao in cartoes]
            
            return create_response(
                success=True,
                data=cartoes_data,
                message=f"Encontrados {total} cartões"
            )
            
        except Exception as e:
            current_app.logger.error(f"Erro ao buscar cartões: {str(e)}")
            return create_response(
                success=False,
                message=f"Erro ao buscar cartões: {str(e)}",
                status_code=500
            )
    
    if request.method == 'POST':
        try:
            dados = request.get_json()
            
            campos_obrigatorios = ['origem', 'setor', 'turno', 'status']
            for campo in campos_obrigatorios:
                if not dados.get(campo):
                    return create_response(
                        success=False,
                        message=f"Campo obrigatório ausente: {campo}",
                        status_code=400
                    )
            
            codigo_produto = dados.get('codigo_produto', '').strip()
            nome_produto = dados.get('nome_produto', '').strip()
                
            if not nome_produto:
                nome_produto = codigo_produto
            
            novo_cartao = CartaoQualidade(
                codigo_produto=codigo_produto,
                nome_produto=nome_produto,
                origem=dados['origem'].strip().upper(),
                setor=dados['setor'].strip().upper(),
                turno=dados['turno'],
                qtd_conforme=int(dados.get('qtd_conforme', 0)),
                qtd_nao_conforme=int(dados.get('qtd_nao_conforme', 0)),
                status=dados['status'].strip().upper(),
                documento_reprovacao=dados.get('documento_reprovacao', ''),
                descricao=dados.get('descricao', ''),
                observacoes=dados.get('observacoes', ''),
                responsavel=dados.get('responsavel', 'Usuario')
            )
            
            db.session.add(novo_cartao)
            db.session.commit()
            
            return create_response(
                success=True,
                data=novo_cartao.to_dict(),
                message="Cartão criado com sucesso",
                status_code=201
            )
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao criar cartão: {str(e)}")
            return create_response(
                success=False,
                message=f"Erro ao criar cartão: {str(e)}",
                status_code=400
            )


@cartoes_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@limiter.limit("50 per minute")
@auth_required()
def handle_cartao(id):
    """Buscar, atualizar ou excluir cartão específico"""

    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    try:
        cartao = CartaoQualidade.query.get(id)
        
        if not cartao:
            return create_response(
                success=False,
                message=f"Cartão com ID {id} não encontrado",
                status_code=404
            )
        
        if request.method == 'GET':
            return create_response(
                success=True,
                data=cartao.to_dict()
            )
            
        elif request.method == 'PUT':
            try:
                dados = request.get_json()
                
                campos_obrigatorios = ['nome_produto', 'origem', 'setor', 'turno', 'status']
                for campo in campos_obrigatorios:
                    if not dados.get(campo):
                        return create_response(
                            success=False,
                            message=f"Campo obrigatório ausente: {campo}",
                            status_code=400
                        )
                
                cartao.codigo_produto = dados.get('codigo_produto', cartao.codigo_produto)
                cartao.nome_produto = dados['nome_produto']
                cartao.origem = dados['origem'].strip().upper()
                cartao.setor = dados['setor'].strip().upper()
                cartao.turno = dados['turno']
                cartao.qtd_conforme = int(dados.get('qtd_conforme', 0))
                cartao.qtd_nao_conforme = int(dados.get('qtd_nao_conforme', 0))
                cartao.status = dados['status'].strip().upper()
                cartao.documento_reprovacao = dados.get('documento_reprovacao', '')
                cartao.descricao = dados.get('descricao', '')
                cartao.observacoes = dados.get('observacoes', '')
                cartao.responsavel = dados.get('responsavel', cartao.responsavel)
                cartao.updated_at = datetime.utcnow()
                
                db.session.commit()
                
                return create_response(
                    success=True,
                    message="Cartão atualizado com sucesso",
                    data=cartao.to_dict()
                )
                
            except Exception as e:
                db.session.rollback()
                return create_response(
                    success=False,
                    message=f"Erro ao atualizar cartão: {str(e)}",
                    status_code=400
                )
            
        elif request.method == 'DELETE':
            try:
                db.session.delete(cartao)
                db.session.commit()
                
                return create_response(
                    success=True,
                    message="Cartão excluído com sucesso"
                )
                
            except Exception as e:
                db.session.rollback()
                return create_response(
                    success=False,
                    message=f"Erro ao excluir cartão: {str(e)}",
                    status_code=500
                )
            
    except Exception as e:
        return create_response(
            success=False,
            message=f"Erro ao processar cartão: {str(e)}",
            status_code=500
        )


@cartoes_bp.route('/stats', methods=['GET'])
@permission_required('cartoes', 'visualizar')
def get_cartoes_stats():
    """Estatísticas dos cartões de qualidade"""
    try:
        total = CartaoQualidade.query.count()
        aprovados = CartaoQualidade.query.filter(db.func.upper(CartaoQualidade.status) == 'APROVADO').count()
        reprovados = CartaoQualidade.query.filter(db.func.upper(CartaoQualidade.status) == 'REPROVADO').count()
        
        por_setor = db.session.query(
            CartaoQualidade.setor,
            db.func.count(CartaoQualidade.id).label('total')
        ).group_by(CartaoQualidade.setor).all()
        
        stats = {
            'total': total,
            'aprovados': aprovados,
            'reprovados': reprovados,
            'taxa_aprovacao': round((aprovados / total * 100), 1) if total > 0 else 0,
            'por_setor': [{'setor': s.setor, 'total': s.total} for s in por_setor]
        }
        
        return create_response(
            success=True,
            data=stats
        )
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar estatísticas: {str(e)}")
        return create_response(
            success=False,
            message="Erro ao buscar estatísticas",
            status_code=500
        )

