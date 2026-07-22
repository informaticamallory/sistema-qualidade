# routes/calibracoes.py - Rotas de equipamentos, tipos e calibrações
import os
from datetime import datetime, date
from flask import Blueprint, request, current_app, send_from_directory
from werkzeug.utils import secure_filename

from app.extensions import db, limiter
from app.models.calibracao import TipoEquipamento, Equipamento, Calibracao
from app.utils.responses import create_response
from app.utils.auth_decorators import auth_required, check_permission

equipamentos_bp = Blueprint('equipamentos', __name__)
tipos_equipamento_bp = Blueprint('tipos_equipamento', __name__)
calibracoes_bp = Blueprint('calibracoes', __name__)

# Dias de antecedência para considerar uma calibração "vencendo"
DIAS_ALERTA_VENCIMENTO = 20

CAMPOS_EQUIPAMENTO_TEXTO = [
    'nome', 'codigo_sap', 'fabricante', 'modelo', 'numero_serie', 'setor',
    'responsavel', 'tipo_afericao', 'status_equipamento', 'frequencia_calibracao',
    'ultimo_certificado', 'ultimo_certificado_rastreavel', 'status_ficha_calibracao',
    'erro_aceitavel', 'comentarios'
]

CAMPOS_EQUIPAMENTO_DATA = ['data_ultima_calibracao', 'data_proxima_calibracao']

_ACOES_LISTA = {'GET': 'visualizar', 'POST': 'criar'}
_ACOES_ITEM = {'GET': 'visualizar', 'PUT': 'editar', 'DELETE': 'excluir'}
_ACOES_DELETE = {'DELETE': 'excluir'}
_ACOES_VISUALIZAR = {'GET': 'visualizar'}


def _negar_se_sem_permissao(mapa):
    acao = mapa.get(request.method)
    if acao and not check_permission('calibracao', acao):
        return create_response(success=False, message='Acesso negado: permissão insuficiente', status_code=403)
    return None


def _parse_date(valor):
    """Converte 'YYYY-MM-DD' em date (ou None)"""
    if not valor:
        return None
    if isinstance(valor, date):
        return valor
    return datetime.strptime(valor, '%Y-%m-%d').date()


def _dias_restantes(equipamento, hoje):
    """Dias até a validade da última calibração (None se nunca calibrado)"""
    ultima = equipamento.ultima_calibracao()
    validade = ultima.data_validade if ultima and ultima.data_validade else equipamento.data_proxima_calibracao
    if not validade:
        return None
    return (validade - hoje).days


def _aplicar_dados_equipamento(equipamento, dados):
    for campo in CAMPOS_EQUIPAMENTO_TEXTO:
        if campo in dados:
            setattr(equipamento, campo, dados.get(campo))

    for campo in CAMPOS_EQUIPAMENTO_DATA:
        if campo in dados:
            setattr(equipamento, campo, _parse_date(dados.get(campo)))

    if 'tipo_id' in dados:
        equipamento.tipo_id = int(dados['tipo_id']) if dados.get('tipo_id') else None

    return equipamento


# ==================== EQUIPAMENTOS ====================

@equipamentos_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@auth_required()
def handle_equipamentos():
    """Listar e criar equipamentos"""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            search = request.args.get('search', '').strip()
            ativo = request.args.get('ativo', 'true').lower() != 'false'

            query = Equipamento.query.filter_by(ativo=ativo)

            if search:
                pattern = f"%{search}%"
                query = query.filter(
                    db.or_(
                        Equipamento.codigo.like(pattern),
                        Equipamento.codigo_sap.like(pattern),
                        Equipamento.nome.like(pattern),
                        Equipamento.fabricante.like(pattern),
                        Equipamento.modelo.like(pattern),
                        Equipamento.numero_serie.like(pattern),
                        Equipamento.setor.like(pattern),
                        Equipamento.responsavel.like(pattern)
                    )
                )

            equipamentos = query.order_by(Equipamento.codigo).all()

            return create_response(
                success=True,
                data=[e.to_dict() for e in equipamentos],
                message=f"Encontrados {len(equipamentos)} equipamentos"
            )

        except Exception as e:
            current_app.logger.error(f"Erro ao buscar equipamentos: {str(e)}")
            return create_response(
                success=False,
                message="Erro ao buscar equipamentos",
                status_code=500
            )

    # POST - Criar equipamento
    try:
        dados = request.get_json() or {}

        if not dados.get('codigo') or not dados.get('nome'):
            return create_response(
                success=False,
                message='Código e nome são obrigatórios',
                status_code=400
            )

        existente = Equipamento.query.filter_by(codigo=dados['codigo']).first()
        if existente:
            return create_response(
                success=False,
                message='Já existe um equipamento com este código',
                status_code=409
            )

        novo = _aplicar_dados_equipamento(
            Equipamento(codigo=dados['codigo'], nome=dados['nome']),
            dados
        )
        db.session.add(novo)
        db.session.commit()

        return create_response(
            success=True,
            message='Equipamento criado com sucesso',
            data=novo.to_dict(),
            status_code=201
        )

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao criar equipamento: {str(e)}")
        return create_response(
            success=False,
            message='Erro ao criar equipamento',
            status_code=500
        )


@equipamentos_bp.route('/<int:id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def handle_equipamento(id):
    """Buscar, atualizar ou desativar equipamento"""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_ITEM)
    if negado:
        return negado

    equipamento = Equipamento.query.get(id)
    if not equipamento:
        return create_response(
            success=False,
            message='Equipamento não encontrado',
            status_code=404
        )

    if request.method == 'GET':
        return create_response(success=True, data=equipamento.to_dict())

    if request.method == 'PUT':
        try:
            dados = request.get_json() or {}

            if dados.get('codigo') and dados['codigo'] != equipamento.codigo:
                existente = Equipamento.query.filter_by(codigo=dados['codigo']).first()
                if existente:
                    return create_response(
                        success=False,
                        message='Já existe um equipamento com este código',
                        status_code=409
                    )
                equipamento.codigo = dados['codigo']

            _aplicar_dados_equipamento(equipamento, dados)

            db.session.commit()

            return create_response(
                success=True,
                message='Equipamento atualizado com sucesso',
                data=equipamento.to_dict()
            )

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Erro ao atualizar equipamento: {str(e)}")
            return create_response(
                success=False,
                message='Erro ao atualizar equipamento',
                status_code=500
            )

    # DELETE - Desativação lógica
    try:
        equipamento.ativo = False
        db.session.commit()
        return create_response(
            success=True,
            message='Equipamento desativado com sucesso'
        )
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao desativar equipamento: {str(e)}")
        return create_response(
            success=False,
            message='Erro ao desativar equipamento',
            status_code=500
        )


# ==================== TIPOS DE EQUIPAMENTO ====================

@tipos_equipamento_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@auth_required()
def handle_tipos():
    """Listar e criar tipos de equipamento"""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            tipos = TipoEquipamento.query.order_by(TipoEquipamento.nome).all()
            return create_response(success=True, data=[t.to_dict() for t in tipos])
        except Exception as e:
            current_app.logger.error(f"Erro ao buscar tipos: {str(e)}")
            return create_response(
                success=False,
                message='Erro ao buscar tipos',
                status_code=500
            )

    # POST
    try:
        dados = request.get_json() or {}
        nome = (dados.get('nome') or '').strip()

        if not nome:
            return create_response(
                success=False,
                message='Nome do tipo é obrigatório',
                status_code=400
            )

        existente = TipoEquipamento.query.filter(
            db.func.lower(TipoEquipamento.nome) == nome.lower()
        ).first()
        if existente:
            return create_response(
                success=False,
                message='Este tipo já existe',
                status_code=409
            )

        novo = TipoEquipamento(nome=nome)
        db.session.add(novo)
        db.session.commit()

        return create_response(
            success=True,
            message='Tipo criado com sucesso',
            data=novo.to_dict(),
            status_code=201
        )

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao criar tipo: {str(e)}")
        return create_response(
            success=False,
            message='Erro ao criar tipo',
            status_code=500
        )


@tipos_equipamento_bp.route('/<int:id>', methods=['DELETE', 'OPTIONS'])
@auth_required()
def deletar_tipo(id):
    """Excluir tipo de equipamento"""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_DELETE)
    if negado:
        return negado

    try:
        tipo = TipoEquipamento.query.get(id)
        if not tipo:
            return create_response(
                success=False,
                message='Tipo não encontrado',
                status_code=404
            )

        if tipo.equipamentos:
            return create_response(
                success=False,
                message='Tipo em uso por equipamentos — não pode ser excluído',
                status_code=409
            )

        db.session.delete(tipo)
        db.session.commit()

        return create_response(success=True, message='Tipo excluído com sucesso')

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao excluir tipo: {str(e)}")
        return create_response(
            success=False,
            message='Erro ao excluir tipo',
            status_code=500
        )


# ==================== CALIBRAÇÕES ====================

@calibracoes_bp.route('', methods=['GET', 'POST', 'OPTIONS'])
@limiter.limit("60 per minute", methods=['POST'])
@auth_required()
def handle_calibracoes():
    """Listar e registrar calibrações (JSON ou multipart com certificado PDF)"""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_LISTA)
    if negado:
        return negado

    if request.method == 'GET':
        try:
            equipamento_id = request.args.get('equipamento_id', type=int)
            query = Calibracao.query
            if equipamento_id:
                query = query.filter_by(equipamento_id=equipamento_id)

            calibracoes = query.order_by(Calibracao.data_calibracao.desc()).limit(200).all()
            return create_response(success=True, data=[c.to_dict() for c in calibracoes])

        except Exception as e:
            current_app.logger.error(f"Erro ao buscar calibrações: {str(e)}")
            return create_response(
                success=False,
                message='Erro ao buscar calibrações',
                status_code=500
            )

    # POST - aceita JSON ou multipart/form-data (com arquivo_certificado)
    try:
        is_multipart = request.content_type and 'multipart/form-data' in request.content_type
        dados = request.form if is_multipart else (request.get_json() or {})

        equipamento_id = dados.get('equipamento_id')
        data_calibracao = dados.get('data_calibracao')
        data_validade = dados.get('data_validade')

        if not equipamento_id or not data_calibracao or not data_validade:
            return create_response(
                success=False,
                message='Equipamento, data de calibração e validade são obrigatórios',
                status_code=400
            )

        equipamento = Equipamento.query.get(int(equipamento_id))
        if not equipamento:
            return create_response(
                success=False,
                message='Equipamento não encontrado',
                status_code=404
            )

        # Upload do certificado (opcional, apenas PDF)
        caminho_arquivo = None
        if is_multipart and 'arquivo_certificado' in request.files:
            arquivo = request.files['arquivo_certificado']
            if arquivo and arquivo.filename:
                if not arquivo.filename.lower().endswith('.pdf'):
                    return create_response(
                        success=False,
                        message='O certificado deve ser um arquivo PDF',
                        status_code=400
                    )
                pasta = os.path.join(current_app.root_path, '..', 'uploads', 'certificados')
                os.makedirs(pasta, exist_ok=True)
                nome_seguro = secure_filename(
                    f"{equipamento.codigo}_{datetime.now().strftime('%Y%m%d%H%M%S')}_{arquivo.filename}"
                )
                arquivo.save(os.path.join(pasta, nome_seguro))
                caminho_arquivo = f"uploads/certificados/{nome_seguro}"

        nova = Calibracao(
            equipamento_id=equipamento.id,
            data_calibracao=_parse_date(data_calibracao),
            data_validade=_parse_date(data_validade),
            laboratorio=dados.get('laboratorio'),
            numero_certificado=dados.get('numero_certificado'),
            resultado=dados.get('resultado', 'pendente'),
            observacoes=dados.get('observacoes'),
            responsavel=dados.get('responsavel'),
            arquivo_certificado=caminho_arquivo
        )
        db.session.add(nova)
        db.session.commit()

        return create_response(
            success=True,
            message='Calibração registrada com sucesso',
            data=nova.to_dict(),
            status_code=201
        )

    except ValueError:
        db.session.rollback()
        return create_response(
            success=False,
            message='Datas devem estar no formato YYYY-MM-DD',
            status_code=400
        )
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao registrar calibração: {str(e)}")
        return create_response(
            success=False,
            message='Erro ao registrar calibração',
            status_code=500
        )

@calibracoes_bp.route('/<int:id>/certificado', methods=['GET', 'OPTIONS'])
@auth_required()
def visualizar_certificado(id):
    """Abrir o certificado PDF de uma calibração."""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_VISUALIZAR)
    if negado:
        return negado

    calibracao = Calibracao.query.get(id)
    if not calibracao:
        return create_response(
            success=False,
            message='Calibração não encontrada',
            status_code=404
        )

    if not calibracao.arquivo_certificado:
        return create_response(
            success=False,
            message='Esta calibração não possui certificado PDF anexado',
            status_code=404
        )

    pasta = os.path.abspath(os.path.join(current_app.root_path, '..', 'uploads', 'certificados'))
    nome_arquivo = os.path.basename(calibracao.arquivo_certificado)
    caminho_arquivo = os.path.abspath(os.path.join(pasta, nome_arquivo))

    if os.path.commonpath([pasta, caminho_arquivo]) != pasta or not os.path.isfile(caminho_arquivo):
        return create_response(
            success=False,
            message='Arquivo do certificado não encontrado',
            status_code=404
        )

    return send_from_directory(
        pasta,
        nome_arquivo,
        mimetype='application/pdf',
        as_attachment=False,
        download_name=nome_arquivo
    )

@calibracoes_bp.route('/stats', methods=['GET', 'OPTIONS'])
@auth_required()
def calibracoes_stats():
    """Estatísticas de calibração dos equipamentos ativos"""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_VISUALIZAR)
    if negado:
        return negado

    try:
        hoje = date.today()
        equipamentos = Equipamento.query.filter_by(ativo=True).all()

        stats = {
            'total_equipamentos': len(equipamentos),
            'calibrados': 0,
            'vencendo': 0,
            'vencidos': 0,
            'nunca_calibrados': 0
        }

        for equip in equipamentos:
            dias = _dias_restantes(equip, hoje)
            if dias is None:
                stats['nunca_calibrados'] += 1
            elif dias < 0:
                stats['vencidos'] += 1
            elif dias <= DIAS_ALERTA_VENCIMENTO:
                stats['vencendo'] += 1
                stats['calibrados'] += 1
            else:
                stats['calibrados'] += 1

        return create_response(success=True, data=stats)

    except Exception as e:
        current_app.logger.error(f"Erro ao calcular estatísticas: {str(e)}")
        return create_response(
            success=False,
            message='Erro ao calcular estatísticas',
            status_code=500
        )


@calibracoes_bp.route('/alertas', methods=['GET', 'OPTIONS'])
@auth_required()
def calibracoes_alertas():
    """Equipamentos com calibração vencida ou vencendo"""
    if request.method == 'OPTIONS':
        return '', 200

    negado = _negar_se_sem_permissao(_ACOES_VISUALIZAR)
    if negado:
        return negado

    try:
        hoje = date.today()
        equipamentos = Equipamento.query.filter_by(ativo=True).all()

        alertas = []
        for equip in equipamentos:
            dias = _dias_restantes(equip, hoje)
            if dias is not None and dias <= DIAS_ALERTA_VENCIMENTO:
                alertas.append({
                    'equipamento': equip.to_dict(),
                    'dias_restantes': dias,
                    'status_alerta': 'vencida' if dias < 0 else 'vencendo'
                })

        alertas.sort(key=lambda a: a['dias_restantes'])

        return create_response(success=True, data=alertas)

    except Exception as e:
        current_app.logger.error(f"Erro ao buscar alertas: {str(e)}")
        return create_response(
            success=False,
            message='Erro ao buscar alertas',
            status_code=500
        )

