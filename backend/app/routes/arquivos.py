# routes/arquivos.py - Entrega as fotos gravadas em disco
#
# Sem token de propósito: <img src> não manda cabeçalho de autorização, e o
# que protege a imagem é o uuid no nome do arquivo. Mesma escolha que o
# projeto já fazia com o Cloudflare R2, cujo R2_PUBLIC_URL serve um bucket
# público. Ver o comentário em services/armazenamento.py.
import os

from flask import Blueprint, send_from_directory

# Importa o módulo, não a função: preso pelo nome no import, o caminho da
# pasta ficaria congelado na subida da aplicação.
from app.services import armazenamento
from app.utils.responses import create_response

arquivos_bp = Blueprint('arquivos', __name__)

# Cache longo: o nome tem uuid, então o conteúdo daquele endereço nunca muda.
CACHE_SEGUNDOS = 60 * 60 * 24 * 30


@arquivos_bp.route('/<path:caminho>', methods=['GET'])
def servir_arquivo(caminho):
    raiz = armazenamento.pasta_uploads()
    # A checagem de '..' no caminho vive no serviço: sem ela, um pedido como
    # /api/arquivos/../../etc/passwd sairia da pasta de uploads.
    alvo = armazenamento.caminho_dentro_da_raiz(caminho)

    if not alvo or not os.path.isfile(alvo):
        return create_response(success=False, message='Arquivo não encontrado',
                               status_code=404)

    relativo = os.path.relpath(alvo, raiz).replace(os.sep, '/')
    resposta = send_from_directory(raiz, relativo, as_attachment=False)
    resposta.headers['Cache-Control'] = f'public, max-age={CACHE_SEGUNDOS}, immutable'
    return resposta
