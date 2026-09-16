# app/__init__.py - Factory Pattern Flask
import os
import logging
from flask import Flask
from datetime import datetime
from marshmallow import ValidationError

from app.config import config
from app.extensions import init_extensions, db
from app.routes import register_blueprints
from app.utils.responses import create_response


def create_app(config_name=None):
    """Factory para criar a aplicação Flask"""
    
    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'development')
    
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Inicializar extensões
    init_extensions(app)
    
    # Registrar blueprints
    register_blueprints(app)
    
    # Registrar handlers de erro
    register_error_handlers(app)
    
    # Registrar rota de health check
    register_health_check(app)
    
    # Configurar logging
    setup_logging(app)
    
    return app


def register_error_handlers(app):
    """Registrar handlers de erro globais"""
    
    @app.errorhandler(ValidationError)
    def handle_validation_error(e):
        return create_response(
            success=False,
            message="Dados inválidos",
            errors=e.messages,
            status_code=400
        )
    
    @app.errorhandler(404)
    def handle_not_found(e):
        return create_response(
            success=False,
            message="Recurso não encontrado",
            status_code=404
        )
    
    @app.errorhandler(500)
    def handle_internal_error(e):
        db.session.rollback()
        app.logger.error(f"Erro interno: {str(e)}")
        return create_response(
            success=False,
            message="Erro interno do servidor",
            status_code=500
        )


def register_health_check(app):
    """Registrar rota de health check"""
    
    @app.route('/api/health', methods=['GET'])
    def health_check():
        try:
            db.session.execute(db.text('SELECT 1'))
            
            return create_response(
                success=True,
                message="Servidor e banco de dados funcionando",
                data={
                    'timestamp': datetime.utcnow().isoformat(),
                    'version': '2.0.0',
                    'database': 'connected'
                }
            )
        except Exception as e:
            app.logger.error(f"Health check failed: {str(e)}")
            return create_response(
                success=False,
                message="Erro na conexão com banco de dados",
                data={
                    'timestamp': datetime.utcnow().isoformat(),
                    'database': 'disconnected',
                    'error': str(e)
                },
                status_code=503
            )


def setup_logging(app):
    """Configurar sistema de logs"""
    if not app.debug and not app.testing:
        if not os.path.exists('logs'):
            os.mkdir('logs')
        
        file_handler = logging.FileHandler('logs/sistema_mallory.log')
        file_handler.setFormatter(logging.Formatter(
            '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
        ))
        file_handler.setLevel(logging.INFO)
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('Sistema Mallory Flask iniciado')


def garantir_schema_usuarios(app):
    """Garante colunas novas em bancos existentes antes de consultar usuarios."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('usuarios'):
                return
            colunas = {col['name'] for col in inspector.get_columns('usuarios')}
            if 'fichas_permission' not in colunas:
                db.session.execute(db.text(
                    "ALTER TABLE usuarios ADD COLUMN fichas_permission VARCHAR(20) DEFAULT 'readonly'"
                ))
                db.session.commit()
            if 'must_reset_password' not in colunas:
                # DEFAULT TRUE para que usuários já existentes (com PIN de 4
                # dígitos) sejam obrigados a passar pela redefinição feita
                # por um administrador antes de logar com a nova política.
                db.session.execute(db.text(
                    "ALTER TABLE usuarios ADD COLUMN must_reset_password BOOLEAN DEFAULT TRUE"
                ))
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de usuarios: {str(e)}")


def garantir_schema_injecao(app):
    """Garante campos novos em bancos existentes de inspecao de injecao."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('registros_injecao'):
                return

            colunas = {col['name'] for col in inspector.get_columns('registros_injecao')}
            campos = {
                'semana': 'VARCHAR(10)',
                'modelo_maquina': 'VARCHAR(100)',
                'foto_peca': 'LONGTEXT',
                'foto_peca_nome': 'VARCHAR(255)'
            }
            alterou = False
            for campo, tipo in campos.items():
                if campo not in colunas:
                    db.session.execute(db.text(
                        f"ALTER TABLE registros_injecao ADD COLUMN {campo} {tipo}"
                    ))
                    alterou = True

            if alterou:
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de registros_injecao: {str(e)}")


def garantir_schema_fichas_recebimento(app):
    """Garante os campos de evidência de não conformidade das fichas."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('fichas_recebimento'):
                return

            colunas = {col['name'] for col in inspector.get_columns('fichas_recebimento')}
            campos = {
                'defeito': 'TEXT',
                'foto_peca': 'LONGTEXT',
                'foto_peca_nome': 'TEXT'
            }
            alterou = False
            for campo, tipo in campos.items():
                if campo not in colunas:
                    db.session.execute(db.text(f"ALTER TABLE fichas_recebimento ADD COLUMN {campo} {tipo}"))
                    alterou = True
            if alterou:
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de fichas_recebimento: {str(e)}")

def garantir_schema_revisoes_desenho(app):
    """Garante o campo de link do desenho nas revisões.

    create_all() cria tabela nova, mas não acrescenta coluna a tabela que já
    existe — e 'revisoes_desenho' já foi criada no deploy anterior."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('revisoes_desenho'):
                return

            colunas = {col['name'] for col in inspector.get_columns('revisoes_desenho')}
            if 'link_desenho' not in colunas:
                db.session.execute(db.text(
                    "ALTER TABLE revisoes_desenho ADD COLUMN link_desenho VARCHAR(1000)"))
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de revisoes_desenho: {str(e)}")


def garantir_lotes_das_inspecoes(app):
    """Passa as inspeções antigas para a tabela de lotes.

    Cada inspeção lançada antes desta mudança tinha um lote, uma nota e uma
    quantidade em colunas próprias. Aqui cada uma vira a primeira linha da
    lista, para o histórico continuar aparecendo na tela de edição.

    Só toca em inspeção que ainda não tem nenhuma linha, então rodar de novo
    não duplica nada."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not (inspector.has_table('inspecoes_recebimento')
                    and inspector.has_table('lotes_inspecao')):
                return

            from app.models.inspecao_recebimento import InspecaoRecebimento, LoteInspecao

            com_lote = {row[0] for row in db.session.query(LoteInspecao.inspecao_id).distinct()}
            pendentes = (InspecaoRecebimento.query
                         .filter(~InspecaoRecebimento.id.in_(com_lote) if com_lote else db.true())
                         .all())

            criados = 0
            for inspecao in pendentes:
                # Inspeção sem nenhum dos três não gera linha vazia.
                if not (inspecao.lote or inspecao.nota_fiscal or inspecao.quantidade_total):
                    continue
                db.session.add(LoteInspecao(
                    inspecao_id=inspecao.id,
                    ordem=0,
                    lote=inspecao.lote,
                    nota_fiscal=inspecao.nota_fiscal,
                    quantidade_total=inspecao.quantidade_total or 0))
                criados += 1

            if criados:
                db.session.commit()
                app.logger.info(f'Lotes migrados de inspeções antigas: {criados}')
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao migrar lotes das inspeções: {str(e)}")


def garantir_schema_equipamentos(app):
    """Garante campos da lista de calibração em bancos existentes."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('equipamentos'):
                return

            colunas = {col['name'] for col in inspector.get_columns('equipamentos')}
            campos = {
                'codigo_sap': 'VARCHAR(50)',
                'tipo_afericao': 'VARCHAR(30)',
                'status_equipamento': "VARCHAR(30) DEFAULT 'ativo'",
                'frequencia_calibracao': 'VARCHAR(30)',
                'ultimo_certificado': 'VARCHAR(100)',
                'ultimo_certificado_rastreavel': 'VARCHAR(150)',
                'data_ultima_calibracao': 'DATE',
                'data_proxima_calibracao': 'DATE',
                'status_ficha_calibracao': 'VARCHAR(30)',
                'erro_aceitavel': 'VARCHAR(50)',
                'comentarios': 'TEXT'
            }

            for campo, tipo in campos.items():
                if campo not in colunas:
                    db.session.execute(db.text(f"ALTER TABLE equipamentos ADD COLUMN {campo} {tipo}"))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de equipamentos: {str(e)}")


def garantir_schema_registros_inspecao(app):
    """Garante campos de montagem em bancos existentes."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('registros_inspecao'):
                return

            colunas = {col['name'] for col in inspector.get_columns('registros_inspecao')}
            campos = {
                'codigo_barras': 'VARCHAR(255)',
                'posto': 'VARCHAR(80)',
                'operador': 'VARCHAR(120)',
                'causa': 'TEXT',
                'correcao': 'TEXT',
                'responsavel_correcao': 'VARCHAR(120)',
                'foto_peca': 'LONGTEXT',
                'foto_peca_nome': 'VARCHAR(255)'
            }

            for campo, tipo in campos.items():
                if campo not in colunas:
                    db.session.execute(db.text(f"ALTER TABLE registros_inspecao ADD COLUMN {campo} {tipo}"))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de registros_inspecao: {str(e)}")


def garantir_schema_relatorios_recebimento(app):
    """Garante a coluna de disposição em bancos existentes.

    Substituiu os quatro campos REL/SEI/DEV/LP, que ficaram na tabela com o
    conteúdo antigo — a conversão acontece na leitura, em
    `RelatorioRecebimento.disposicao_efetiva`."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('relatorios_recebimento'):
                return

            colunas = {col['name'] for col in inspector.get_columns('relatorios_recebimento')}
            if 'disposicao' not in colunas:
                db.session.execute(db.text(
                    "ALTER TABLE relatorios_recebimento ADD COLUMN disposicao VARCHAR(30)"))
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de relatorios_recebimento: {str(e)}")


def garantir_schema_q49(app):
    """Garante o código de barras do Q49 em bancos existentes.

    create_all() não acrescenta coluna a tabela já criada, e 'q49_registros'
    existe desde o deploy anterior."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('q49_registros'):
                return

            colunas = {col['name'] for col in inspector.get_columns('q49_registros')}
            if 'codigo_barras' not in colunas:
                db.session.execute(db.text(
                    "ALTER TABLE q49_registros ADD COLUMN codigo_barras VARCHAR(255)"))
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de q49_registros: {str(e)}")


def garantir_schema_checklist_testes(app):
    """Garante campos de observação do checklist em bancos existentes."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('checklist_testes'):
                return

            colunas = {col['name'] for col in inspector.get_columns('checklist_testes')}
            campos = {
                'corrente_obs': 'TEXT',
                'potencia_obs': 'TEXT',
                'hipot_obs': 'TEXT',
                'etiquetas_obs': 'TEXT',
                'plugue_obs': 'TEXT',
                'grafismos_obs': 'TEXT',
                'embalagens_obs': 'TEXT',
                'pecas_injetadas_obs': 'TEXT',
                'montagem_obs': 'TEXT',
                'visual_obs': 'TEXT',
                'updated_at': 'DATETIME'
            }

            for campo, tipo in campos.items():
                if campo not in colunas:
                    db.session.execute(db.text(f"ALTER TABLE checklist_testes ADD COLUMN {campo} {tipo}"))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de checklist_testes: {str(e)}")


def garantir_schema_fichas_nc(app):
    """Garante campos completos da FNC em bancos existentes."""
    from sqlalchemy import inspect

    with app.app_context():
        try:
            inspector = inspect(db.engine)
            if not inspector.has_table('fichas_nc'):
                return

            colunas = {col['name'] for col in inspector.get_columns('fichas_nc')}
            campos = {
                'fonte_registro_id': 'INT',
                'numero_fnc': 'VARCHAR(80)',
                'de_departamento': 'VARCHAR(120)',
                'para_departamento': 'VARCHAR(120)',
                'nf_po': 'VARCHAR(100)',
                'num_serie': 'VARCHAR(100)',
                'quantidade': 'INT DEFAULT 0',
                'qtd_nao_conforme': 'INT DEFAULT 0',
                'qtd_inspecionadas': 'INT DEFAULT 0',
                'indice': 'DECIMAL(12,2) DEFAULT 0',
                'decisao_final': 'VARCHAR(120)',
                'observacoes': 'TEXT',
                'inspecao_resultado': 'VARCHAR(120)',
                'data_inspecao': 'DATE',
                'aprovacao_qc': 'VARCHAR(120)',
                'aprovacao_responsavel': 'VARCHAR(120)',
                'aprovacao_manager': 'VARCHAR(120)'
            }

            for campo, tipo in campos.items():
                if campo not in colunas:
                    db.session.execute(db.text(f"ALTER TABLE fichas_nc ADD COLUMN {campo} {tipo}"))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            app.logger.error(f"Erro ao atualizar schema de fichas_nc: {str(e)}")

def criar_admin_padrao(app):
    """Criar administrador padrão se não existir e popular o catálogo de permissões"""
    from app.models.usuario import Usuario
    from app.utils.permissions import seed_permissoes
    from app.utils.password_validation import gerar_senha_temporaria

    garantir_schema_usuarios(app)
    garantir_schema_injecao(app)
    garantir_schema_fichas_recebimento(app)
    garantir_schema_revisoes_desenho(app)
    garantir_lotes_das_inspecoes(app)
    garantir_schema_equipamentos(app)
    garantir_schema_registros_inspecao(app)
    garantir_schema_relatorios_recebimento(app)
    garantir_schema_q49(app)
    garantir_schema_checklist_testes(app)
    garantir_schema_fichas_nc(app)

    with app.app_context():
        # Popula a tabela 'permissoes' com o catálogo (idempotente)
        try:
            seed_permissoes()
        except Exception as e:
            app.logger.error(f"Erro ao popular catálogo de permissões: {str(e)}")

        admin = Usuario.query.filter_by(usuario='admin').first()

        if not admin:
            # Gera uma senha já compatível com a política atual: como não há
            # outro admin para fazer um reset manual, must_reset_password
            # fica False (senão o admin recém-criado ficaria trancado fora).
            senha_temporaria = gerar_senha_temporaria()

            admin = Usuario(
                nome='Administrador',
                usuario='admin',
                role='admin',
                must_reset_password=False
            )
            admin.set_senha(senha_temporaria)

            db.session.add(admin)
            db.session.commit()

            print("=" * 60)
            print("👤 ADMINISTRADOR PADRÃO CRIADO")
            print("=" * 60)
            print("Usuário: admin")
            print(f"Senha temporária: {senha_temporaria}")
            print("⚠️  IMPORTANTE: copie agora — não será exibida de novo.")
            print("   Troque a senha após o primeiro login (tela Usuários).")
            print("=" * 60)

