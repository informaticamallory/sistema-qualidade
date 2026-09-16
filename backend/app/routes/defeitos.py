# routes/defeitos.py - Catálogo de defeitos
#
# Quem pode o quê, e por quê:
#
#   ler a lista ativa  qualquer usuário autenticado. É o que alimenta os
#                      campos de defeito da Inspeção de Montagem, da Injeção e
#                      do Relatório de Recebimento. Exigir permissão aqui
#                      esvaziaria esses campos para o inspetor.
#
#   criar              qualquer usuário autenticado. O inspetor digita um nome
#                      que ainda não existe no meio do preenchimento e segue o
#                      trabalho, sem esperar aprovação.
#
#   renomear,          módulo 'defeitos', que por padrão só o administrador
#   inativar,          tem. É a limpeza do que foi criado no calor da
#   excluir            inspeção: unificar nome repetido, tirar de circulação o
#                      que não deve mais aparecer.
from flask import Blueprint, request, current_app

from app.extensions import db, limiter
from app.models.defeito import Defeito
from app.models.recebimento import relatorio_defeitos
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission, get_current_user

defeitos_bp = Blueprint('defeitos', __name__)


def _negar_sem_gestao(acao):
    if not check_permission('defeitos', acao):
        return create_response(success=False,
                               message='Acesso negado: permissão insuficiente',
                               status_code=403)
    return None


def _em_uso(defeito_id):
    """Quantos relatórios apontam este defeito."""
    return db.session.query(relatorio_defeitos).filter(
        relatorio_defeitos.c.defeito_id == defeito_id).count()


@defeitos_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("100 per minute")
@auth_required()
def handle_defeitos():
    """Listar e criar defeitos"""
    if request.method == 'OPTIONS':
        return '', 200

    if request.method == 'GET':
        try:
            # A lista de escolha traz só os ativos. A tela de gestão pede
            # `incluir_inativos`, e para isso precisa da permissão do módulo —
            # senão qualquer um veria o que o administrador tirou de vista.
            incluir_inativos = request.args.get('incluir_inativos') in ('1', 'true', 'True')
            if incluir_inativos:
                negado = _negar_sem_gestao('visualizar')
                if negado:
                    return negado

            query = Defeito.query
            if not incluir_inativos:
                query = query.filter(Defeito.ativo.is_(True))

            defeitos = query.order_by(Defeito.defeito).all()
            dados = [d.to_dict() for d in defeitos]

            if incluir_inativos:
                # A tela de gestão mostra quantos registros usam cada defeito:
                # é o que diz se dá para excluir ou se o caminho é inativar.
                usos = dict(db.session.query(
                    relatorio_defeitos.c.defeito_id,
                    db.func.count(relatorio_defeitos.c.relatorio_id)
                ).group_by(relatorio_defeitos.c.defeito_id).all())
                for item in dados:
                    item['em_uso'] = usos.get(item['id'], 0)

            return create_response(
                success=True,
                data=dados,
                message=f"Encontrados {len(dados)} defeitos"
            )

        except Exception as e:
            current_app.logger.error(f"Erro ao buscar defeitos: {str(e)}")
            return create_response(success=False, message="Erro ao buscar defeitos",
                                   status_code=500)

    # POST - Criar novo defeito
    try:
        dados = request.get_json() or {}
        defeito_texto = (dados.get('defeito') or '').strip().upper()

        if not defeito_texto:
            return create_response(success=False, message='Defeito não pode ser vazio',
                                   status_code=400)

        existente = Defeito.query.filter(
            db.func.upper(Defeito.defeito) == defeito_texto
        ).first()

        if existente:
            # Inativo é decisão do administrador, e não se desfaz porque um
            # inspetor digitou o nome de novo. O aviso diz a quem recorrer.
            if not existente.ativo:
                return create_response(
                    success=False,
                    message='Este defeito existe, mas está inativo. Peça ao administrador para reativá-lo.',
                    data=existente.to_dict(),
                    status_code=409)
            return create_response(success=False, message='Este defeito já existe',
                                   data=existente.to_dict(), status_code=400)

        usuario = get_current_user()
        novo_defeito = Defeito(defeito=defeito_texto,
                               criado_por=(usuario.nome if usuario else None))
        db.session.add(novo_defeito)
        db.session.commit()

        return create_response(success=True, message='Defeito adicionado com sucesso',
                               data=novo_defeito.to_dict(), status_code=201)

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao criar defeito: {str(e)}")
        return create_response(success=False,
                               message=f'Erro ao adicionar defeito: {str(e)}',
                               status_code=500)


@defeitos_bp.route('/<int:id>', methods=['PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def gerenciar_defeito(id):
    """Renomear, inativar/reativar ou excluir um defeito."""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_sem_gestao('editar' if request.method == 'PUT' else 'excluir')
    if negado:
        return negado

    defeito = Defeito.query.get(id)
    if not defeito:
        return create_response(success=False, message='Defeito não encontrado',
                               status_code=404)

    if request.method == 'PUT':
        try:
            dados = request.get_json() or {}

            if 'defeito' in dados:
                novo_nome = (dados.get('defeito') or '').strip().upper()
                if not novo_nome:
                    return create_response(success=False,
                                           message='Defeito não pode ser vazio',
                                           status_code=400)

                # Renomear para um nome que já existe criaria a duplicidade que
                # esta tela serve para desfazer.
                conflito = Defeito.query.filter(
                    db.func.upper(Defeito.defeito) == novo_nome,
                    Defeito.id != defeito.id
                ).first()
                if conflito:
                    return create_response(
                        success=False,
                        message='Já existe outro defeito com este nome.',
                        data=conflito.to_dict(), status_code=400)

                defeito.defeito = novo_nome

            if 'ativo' in dados:
                defeito.ativo = bool(dados.get('ativo'))

            db.session.commit()
            return create_response(success=True, message='Defeito atualizado com sucesso',
                                   data=defeito.to_dict())
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao atualizar defeito: {str(e)}")
            return create_response(success=False, message='Erro ao atualizar defeito',
                                   status_code=500)

    try:
        # Excluir de vez só o que nunca foi usado. Com registro apontando para
        # ele, apagar levaria junto o defeito daquela inspeção — para isso
        # existe a inativação.
        usos = _em_uso(defeito.id)
        if usos:
            return create_response(
                success=False,
                message=(f'Este defeito está em {usos} registro(s) e não pode ser excluído. '
                         'Inative-o para tirá-lo da lista sem apagar o histórico.'),
                status_code=409)

        db.session.delete(defeito)
        db.session.commit()
        return create_response(success=True, message='Defeito excluído com sucesso')

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao deletar defeito: {str(e)}")
        return create_response(success=False, message='Erro ao excluir defeito',
                               status_code=500)
